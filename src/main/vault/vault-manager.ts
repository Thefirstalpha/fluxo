import { randomBytes } from 'node:crypto'
import type {
  ChangePasswordInput,
  CreateVaultInput,
  CurrentPasswordInput,
  RecoveryCodeResult,
  UnlockInput,
  VaultFailure,
  VaultResult,
  VaultStatus,
} from '@shared/vault'
import type { DataServiceMethod, MethodParams, MethodResult } from '../../data/api'
import { logger } from '../logger'
import type { SecureStorage } from './secure-storage'

/** Sous-ensemble du client du service de données utilisé ici (remplaçable dans les tests). */
export interface DataServiceCaller {
  call<M extends DataServiceMethod>(
    method: M,
    ...params: MethodParams<M> extends undefined ? [] : [MethodParams<M>]
  ): Promise<MethodResult<M>>
}

const sessionUnavailable: VaultFailure = { ok: false, reason: 'session-unavailable' }

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
      demo: false,
      sessionAvailable: unavailable === null,
      sessionUnavailableReason: unavailable,
    }
  }

  /** Notifie l'interface (appelé après chaque changement d'état, et si le service s'arrête). */
  async publish(): Promise<void> {
    const status = await this.status()
    for (const listener of this.listeners) listener(status)
  }

  async create(input: CreateVaultInput): Promise<VaultResult> {
    if (input.mode === 'session') {
      if (this.storage.unavailableReason()) return sessionUnavailable
      const key = randomBytes(32)
      const sessionBlob = this.wrapForSession(key)
      await this.service.call('create', { mode: 'session', key, sessionBlob })
      key.fill(0)
    } else {
      await this.service.call('create', { mode: 'password', password: input.password })
    }
    await this.publish()
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
