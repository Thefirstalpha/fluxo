import { randomBytes } from 'node:crypto'
import type {
  BackupInfo,
  BackupInfoResult,
  BackupNowResult,
  ChangePasswordInput,
  CreateVaultInput,
  CurrentPasswordInput,
  ExportResult,
  PickBackupResult,
  RecoveryCodeResult,
  RestorePreviewResult,
  RestoreSecret,
  UnlockInput,
  VaultFailure,
  VaultResult,
  VaultStatus,
} from '@shared/vault'
import type { LedgerMethod, LedgerOutput } from '@shared/ledger/api'
import type { LedgerResult } from '@shared/ledger/model'
import type { Locale } from '@shared/settings'
import type { DataServiceMethod, MethodParams, MethodResult } from '../../data/api'
import { ServiceError } from '../../data/rpc'
import { logger } from '../logger'
import type { SecureStorage } from './secure-storage'

/** Sous-ensemble du client du service de données utilisé ici (remplaçable dans les tests). */
export interface DataServiceCaller {
  call<M extends DataServiceMethod>(
    method: M,
    ...params: MethodParams<M> extends undefined ? [] : [MethodParams<M>]
  ): Promise<MethodResult<M>>
}

/** Boîtes de dialogue du système : le renderer ne fournit jamais de chemin de fichier. */
export interface VaultDialogs {
  chooseDirectory(purpose: 'backup' | 'export'): Promise<string | null>
  chooseBackupFile(): Promise<string | null>
}

const sessionUnavailable: VaultFailure = { ok: false, reason: 'session-unavailable' }
const cancelled: VaultFailure = { ok: false, reason: 'cancelled' }

/**
 * Orchestration du coffre côté process main. Le main ne manipule la clé de la base qu'en mode
 * session, le temps de l'envelopper ou de la désenvelopper avec `safeStorage` (seul le main
 * y a accès) ; il la remet aussitôt au service de données et efface sa copie.
 */
export class VaultManager {
  private readonly listeners = new Set<(status: VaultStatus) => void>()

  constructor(
    private readonly service: DataServiceCaller,
    private readonly storage: SecureStorage,
    private readonly dialogs: VaultDialogs,
    /** Appelé après « Tout effacer » (journaux locaux). */
    private readonly onErased: () => Promise<void> = () => Promise.resolve(),
  ) {}

  onStatusChange(listener: (status: VaultStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async status(): Promise<VaultStatus> {
    const service = await this.service.call('status')
    const unavailable = this.storage.unavailableReason()
    return {
      ...service,
      sessionAvailable: unavailable === null,
      sessionUnavailableReason: unavailable,
    }
  }

  /** Notifie l'interface (appelé après chaque changement d'état, et si le service s'arrête). */
  async publish(): Promise<void> {
    const status = await this.status()
    for (const listener of this.listeners) listener(status)
  }

  async create(input: CreateVaultInput, locale: Locale): Promise<VaultResult> {
    if (input.mode === 'session') {
      if (this.storage.unavailableReason()) return sessionUnavailable
      const key = randomBytes(32)
      const sessionBlob = this.wrapForSession(key)
      await this.service.call('create', { mode: 'session', key, sessionBlob, locale })
      key.fill(0)
    } else {
      await this.service.call('create', { mode: 'password', password: input.password, locale })
    }
    await this.publish()
    this.runAutoBackup()
    return { ok: true }
  }

  async unlock(input: UnlockInput): Promise<VaultResult> {
    let outcome: Awaited<MethodResult<'unlock'>>
    if (input.method === 'session') {
      const key = await this.unwrapSessionKey()
      if (!key) return { ok: false, reason: 'wrong-credentials' }
      outcome = await this.service.call('unlock', { method: 'key', key })
      key.fill(0)
    } else if (input.method === 'password') {
      outcome = await this.service.call('unlock', { method: 'password', password: input.password })
    } else {
      outcome = await this.service.call('unlock', { method: 'recovery', code: input.code })
    }
    if (!outcome.ok) {
      await this.publish()
      return outcome
    }
    // Récupération en mode session (trousseau perdu ou changé) : on ré-enveloppe la clé.
    const status = await this.service.call('status')
    if (outcome.viaRecovery && status.mode === 'session' && !this.storage.unavailableReason()) {
      await this.enableSessionMode({})
    }
    await this.publish()
    this.runAutoBackup()
    return { ok: true }
  }

  /** Mode session : déverrouillage sans saisie au lancement de l'application. */
  async unlockAtStartup(): Promise<void> {
    const status = await this.service.call('status')
    if (status.state !== 'locked' || status.mode !== 'session') return
    const result = await this.unlock({ method: 'session' })
    if (!result.ok) logger.warn('Déverrouillage automatique impossible (trousseau du système).')
  }

  async lock(reason: string): Promise<void> {
    const status = await this.service.call('status')
    if (status.state !== 'unlocked') return
    await this.service.call('lock')
    logger.info(`Coffre verrouillé (${reason}).`)
    await this.publish()
  }

  async changePassword(input: ChangePasswordInput): Promise<VaultResult> {
    const result = await this.service.call('changePassword', input)
    await this.publish()
    return result
  }

  async enableSessionMode(input: CurrentPasswordInput): Promise<VaultResult> {
    if (this.storage.unavailableReason()) return sessionUnavailable
    const exported = await this.service.call('exportKeyForSession', input)
    if (!exported.ok) {
      await this.publish()
      return exported
    }
    const key = Buffer.from(exported.key)
    exported.key.fill(0)
    try {
      const result = await this.service.call('setSessionMode', {
        sessionBlob: this.wrapForSession(key),
      })
      await this.publish()
      return result
    } finally {
      key.fill(0)
    }
  }

  async createRecoveryCode(input: CurrentPasswordInput): Promise<RecoveryCodeResult> {
    const result = await this.service.call('createRecoveryCode', input)
    await this.publish()
    return result
  }

  async removeRecoveryCode(input: CurrentPasswordInput): Promise<VaultResult> {
    const result = await this.service.call('removeRecoveryCode', input)
    await this.publish()
    return result
  }

  // ——— Registre ———————————————————————————————————————————————————————

  /** Requête du registre (entrée déjà validée par le handler IPC, revalidée par le service). */
  async ledger<M extends LedgerMethod>(
    method: M,
    input: unknown,
  ): Promise<LedgerResult<LedgerOutput<M>>> {
    try {
      const result = await this.service.call('ledger', { method, input })
      return result as LedgerResult<LedgerOutput<M>>
    } catch (error) {
      // Verrouillé entre-temps (délai d'inactivité, autre fenêtre) : résultat attendu.
      if (error instanceof ServiceError && error.code === 'VAULT_LOCKED') {
        return { ok: false, error: 'locked' }
      }
      throw error
    }
  }

  // ——— Démonstration ——————————————————————————————————————————————————

  /** Ouvre un coffre de démonstration séparé (le coffre réel est verrouillé, jamais modifié). */
  async enterDemo(locale: Locale): Promise<void> {
    await this.service.call('enterDemo', { locale })
    await this.publish()
  }

  /** Le coffre réel reste verrouillé à la sortie, comme avant l'entrée en démonstration. */
  async exitDemo(): Promise<void> {
    await this.service.call('exitDemo')
    await this.publish()
  }

  // ——— Sauvegardes, restauration, export, effacement ——————————————————

  /** Sauvegarde automatique si elle est due (sans bloquer l'appelant ; erreurs journalisées). */
  runAutoBackup(): void {
    this.service
      .call('status')
      .then((status) =>
        status.state === 'unlocked' ? this.service.call('autoBackupIfDue') : false,
      )
      .catch((error: unknown) => logger.error('Sauvegarde automatique impossible', error))
  }

  backupNow(): Promise<BackupNowResult> {
    return this.service.call('backupNow')
  }

  backupInfo(): Promise<BackupInfo> {
    return this.service.call('backupInfo')
  }

  async chooseBackupDirectory(): Promise<BackupInfoResult> {
    const directory = await this.dialogs.chooseDirectory('backup')
    if (!directory) return cancelled
    return { ok: true, info: await this.service.call('setBackupDirectory', { directory }) }
  }

  async resetBackupDirectory(): Promise<BackupInfoResult> {
    return { ok: true, info: await this.service.call('setBackupDirectory', { directory: null }) }
  }

  setAutoBackup(enabled: boolean): Promise<BackupInfo> {
    return this.service.call('setAutoBackup', { enabled })
  }

  async pickBackup(): Promise<PickBackupResult> {
    const file = await this.dialogs.chooseBackupFile()
    if (!file) return cancelled
    return this.service.call('inspectBackup', { file })
  }

  async previewRestore(input: {
    token: string
    secret?: RestoreSecret
  }): Promise<RestorePreviewResult> {
    const result = await this.service.call('previewRestore', input)
    if (!result.ok) await this.publish()
    return result
  }

  /**
   * Remplace la base par la sauvegarde. Restaurée depuis un coffre sans mot de passe utilisable,
   * elle reprend le mode session si l'utilisateur l'avait choisi (ou s'il n'avait pas de coffre) ;
   * sinon un nouveau mot de passe est demandé.
   */
  async confirmRestore(token: string): Promise<VaultResult> {
    const before = await this.service.call('status')
    const result = await this.service.call('confirmRestore', { token })
    if (result.ok) {
      const after = await this.service.call('status')
      const preferSession = before.mode === 'session' || before.state === 'absent'
      if (after.needsNewPassword && preferSession && !this.storage.unavailableReason()) {
        await this.enableSessionMode({})
      }
    }
    await this.publish()
    return result
  }

  cancelRestore(): Promise<void> {
    return this.service.call('cancelRestore')
  }

  async exportData(): Promise<ExportResult> {
    const directory = await this.dialogs.chooseDirectory('export')
    if (!directory) return cancelled
    return this.service.call('exportData', { directory })
  }

  async eraseAll(input: CurrentPasswordInput): Promise<VaultResult> {
    const result = await this.service.call('eraseAll', input)
    if (result.ok) {
      await this.onErased()
      logger.info('Coffre effacé.')
    }
    await this.publish()
    return result
  }

  private wrapForSession(key: Buffer): string {
    return this.storage.encrypt(key.toString('base64')).toString('base64')
  }

  private async unwrapSessionKey(): Promise<Buffer | null> {
    if (this.storage.unavailableReason()) return null
    const blob = await this.service.call('sessionBlob')
    if (!blob) return null
    try {
      return Buffer.from(this.storage.decrypt(Buffer.from(blob, 'base64')), 'base64')
    } catch {
      // Trousseau réinitialisé, autre compte ou autre poste : seul le code de récupération aide.
      return null
    }
  }
}
