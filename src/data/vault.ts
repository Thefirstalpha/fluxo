import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import {
  checkPassword,
  formatRecoveryCode,
  normalizeRecoveryCode,
  type ChangePasswordInput,
  type CurrentPasswordInput,
  type RecoveryCodeResult,
  type VaultFailure,
  type VaultResult,
} from '@shared/vault'
import type {
  CreateParams,
  ExportKeyOutcome,
  ServiceStatus,
  UnlockOutcome,
  UnlockParams,
} from './api'
import {
  DEFAULT_KDF,
  readKeystore,
  unwrapKey,
  wrapKey,
  writeKeystore,
  type KdfParams,
  type Keystore,
} from './crypto/keystore'
import {
  closeDatabase,
  CorruptDatabaseError,
  DATABASE_KEY_BYTES,
  openEncryptedDatabase,
  WrongKeyError,
  type Db,
} from './db/connection'
import { Lockout } from './lockout'
import { ServiceError } from './rpc'
import type { ServiceLogger } from './server'

export interface VaultPaths {
  directory: string
  database: string
  keystore: string
  lockout: string
}

export function resolveVaultPaths(directory: string): VaultPaths {
  return {
    directory,
    database: join(directory, 'fluxo.db'),
    keystore: join(directory, 'keystore.json'),
    lockout: join(directory, 'lockout.json'),
  }
}

export interface VaultOptions {
  /** Paramètres Argon2id des nouvelles enveloppes (réduits dans les tests). */
  kdf?: KdfParams
  now?: () => Date
}

const failure = (reason: VaultFailure['reason'], retryAfterMs?: number): VaultFailure =>
  retryAfterMs === undefined ? { ok: false, reason } : { ok: false, reason, retryAfterMs }

/**
 * Coffre : la base chiffrée et son enveloppe de clé. Seul ce processus détient la clé en clair,
 * le temps où le coffre est déverrouillé ; le verrouillage ferme la base et efface la clé.
 */
export class Vault {
  private db: Db | null = null
  private key: Buffer | null = null
  private keystore: Keystore | null = null
  private viaRecovery = false
  private sessionExportPending = false
  private readonly kdf: KdfParams
  private readonly now: () => Date

  private constructor(
    readonly paths: VaultPaths,
    private readonly lockout: Lockout,
    private readonly log: ServiceLogger,
    options: VaultOptions,
  ) {
    this.kdf = options.kdf ?? DEFAULT_KDF
    this.now = options.now ?? (() => new Date())
  }

  static async open(
    paths: VaultPaths,
    log: ServiceLogger,
    options: VaultOptions = {},
  ): Promise<Vault> {
    mkdirSync(paths.directory, { recursive: true, mode: 0o700 })
    const vault = new Vault(paths, await Lockout.load(paths.lockout), log, options)
    if (existsSync(paths.keystore)) vault.keystore = await readKeystore(paths.keystore)
    return vault
  }

  // ——— État ————————————————————————————————————————————————————————

  status(): ServiceStatus {
    const keystore = this.keystore
    return {
      state: this.db ? 'unlocked' : keystore ? 'locked' : 'absent',
      mode: keystore?.mode ?? null,
      hasRecoveryCode: Boolean(keystore?.recovery),
      retryAfterMs: this.db ? 0 : this.lockout.remaining(),
      needsNewPassword: Boolean(this.db && this.viaRecovery && keystore?.mode === 'password'),
    }
  }

  sessionBlob(): Promise<string | null> {
    return Promise.resolve(this.keystore?.session?.blob ?? null)
  }

  /** Base ouverte (lots suivants : schéma, sauvegardes…). */
  database(): Db {
    if (!this.db) throw new ServiceError('VAULT_LOCKED')
    return this.db
  }

  // ——— Création —————————————————————————————————————————————————————

  async create(params: CreateParams): Promise<ServiceStatus> {
    if (this.keystore) throw new ServiceError('VAULT_EXISTS')
    if (params.mode === 'password' && checkPassword(params.password)) {
      throw new ServiceError('INVALID_REQUEST')
    }
    this.setAsideOrphanDatabase()

    const vaultId = randomUUID()
    const key =
      params.mode === 'session' ? Buffer.from(params.key) : randomBytes(DATABASE_KEY_BYTES)
    if (params.mode === 'session') params.key.fill(0)
    const keystore: Keystore = {
      format: 'fluxo-keystore',
      version: 1,
      vaultId,
      createdAt: this.now().toISOString(),
      mode: params.mode,
      session: params.mode === 'session' ? { blob: params.sessionBlob } : null,
      password:
        params.mode === 'password'
          ? await wrapKey(key, params.password, 'password', vaultId, this.kdf)
          : null,
      recovery: null,
    }

    // La base d'abord, l'enveloppe ensuite : sans enveloppe, une base reste « absente »
    // (et sera mise de côté à la prochaine création), jamais l'inverse.
    const db = openEncryptedDatabase(this.paths.database, key, { create: true })
    try {
      await writeKeystore(this.paths.keystore, keystore)
    } catch (error) {
      closeDatabase(db)
      key.fill(0)
      throw error
    }
    this.keystore = keystore
    this.adopt(db, key, false)
    this.log('info', `Coffre créé (mode ${params.mode}).`)
    return this.status()
  }

  /** Une base sans enveloppe vient d'une création interrompue : mise de côté, jamais supprimée. */
  private setAsideOrphanDatabase(): void {
    for (const suffix of ['', '-wal', '-shm']) {
      const file = `${this.paths.database}${suffix}`
      if (existsSync(file)) renameSync(file, `${file}.orphan-${Date.now()}`)
    }
  }

  // ——— Déverrouillage ————————————————————————————————————————————————

  async unlock(params: UnlockParams): Promise<UnlockOutcome> {
    const keystore = this.keystore
    if (!keystore) throw new ServiceError('VAULT_ABSENT')
    if (this.db) return { ok: true, viaRecovery: this.viaRecovery }

    let key: Buffer | null
    if (params.method === 'key') {
      key = Buffer.from(params.key)
      params.key.fill(0)
    } else {
      const waiting = this.lockout.remaining()
      if (waiting > 0) return failure('locked-out', waiting)
      key = await this.unwrapWithSecret(keystore, params)
      if (!key) return failure('wrong-credentials', await this.lockout.recordFailure())
    }

    let db: Db
    try {
      db = openEncryptedDatabase(this.paths.database, key, { create: false })
    } catch (error) {
      key.fill(0)
      if (error instanceof WrongKeyError) {
        this.log('warn', 'Clé refusée par la base.')
        return failure('wrong-credentials')
      }
      if (error instanceof CorruptDatabaseError) return failure('vault-corrupt')
      throw error
    }
    await this.lockout.reset()
    const viaRecovery = params.method === 'recovery'
    this.adopt(db, key, viaRecovery)
    this.log(
      'info',
      viaRecovery ? 'Coffre déverrouillé (code de récupération).' : 'Coffre déverrouillé.',
    )
    return { ok: true, viaRecovery }
  }

  private async unwrapWithSecret(
    keystore: Keystore,
    params: Exclude<UnlockParams, { method: 'key' }>,
  ): Promise<Buffer | null> {
    if (params.method === 'password') {
      if (!keystore.password) return null
      return unwrapKey(keystore.password, params.password, 'password', keystore.vaultId)
    }
    const code = normalizeRecoveryCode(params.code)
    if (!code || !keystore.recovery) return null
    return unwrapKey(keystore.recovery, code, 'recovery', keystore.vaultId)
  }

  private adopt(db: Db, key: Buffer, viaRecovery: boolean): void {
    this.db = db
    this.key = key
    this.viaRecovery = viaRecovery
  }

  lock(): ServiceStatus {
    if (this.db) {
      closeDatabase(this.db)
      this.db = null
      this.log('info', 'Coffre verrouillé.')
    }
    this.key?.fill(0)
    this.key = null
    this.viaRecovery = false
    this.sessionExportPending = false
    return this.status()
  }

  // ——— Gestion des clés (coffre déverrouillé) ——————————————————————————

  private unlocked(): { keystore: Keystore; key: Buffer } {
    if (!this.db || !this.key || !this.keystore) throw new ServiceError('VAULT_LOCKED')
    return { keystore: this.keystore, key: this.key }
  }

  /**
   * Autorise une action sensible : en mode mot de passe, le mot de passe actuel est exigé
   * (sauf juste après un déverrouillage par le code de récupération). Même délais qu'au déverrouillage.
   */
  private async authorize({ currentPassword }: CurrentPasswordInput): Promise<VaultFailure | null> {
    const { keystore } = this.unlocked()
    if (keystore.mode === 'session' || this.viaRecovery) return null
    const waiting = this.lockout.remaining()
    if (waiting > 0) return failure('locked-out', waiting)
    const key =
      currentPassword !== undefined && keystore.password
        ? await unwrapKey(keystore.password, currentPassword, 'password', keystore.vaultId)
        : null
    if (!key) return failure('wrong-credentials', await this.lockout.recordFailure())
    key.fill(0)
    await this.lockout.reset()
    return null
  }

  private async saveKeystore(next: Keystore): Promise<void> {
    await writeKeystore(this.paths.keystore, next)
    this.keystore = next
  }

  /** Définit ou change le mot de passe maître ; en mode session, passe en mode mot de passe. */
  async changePassword(params: ChangePasswordInput): Promise<VaultResult> {
    const { keystore, key } = this.unlocked()
    if (checkPassword(params.newPassword)) return failure('invalid-password')
    const denied = await this.authorize(params)
    if (denied) return denied
    await this.saveKeystore({
      ...keystore,
      mode: 'password',
      session: null,
      password: await wrapKey(key, params.newPassword, 'password', keystore.vaultId, this.kdf),
    })
    this.viaRecovery = false
    this.log('info', 'Mot de passe maître enregistré (clé ré-enveloppée, base inchangée).')
    return { ok: true }
  }

  async exportKeyForSession(params: CurrentPasswordInput): Promise<ExportKeyOutcome> {
    const { key } = this.unlocked()
    const denied = await this.authorize(params)
    if (denied) return denied
    this.sessionExportPending = true
    return { ok: true, key: Uint8Array.from(key) }
  }

  async setSessionMode({ sessionBlob }: { sessionBlob: string }): Promise<VaultResult> {
    const { keystore } = this.unlocked()
    if (!this.sessionExportPending) throw new ServiceError('NOT_ALLOWED')
    this.sessionExportPending = false
    await this.saveKeystore({
      ...keystore,
      mode: 'session',
      session: { blob: sessionBlob },
      password: null,
    })
    this.viaRecovery = false
    this.log('info', 'Mode session activé (clé protégée par le trousseau du système).')
    return { ok: true }
  }

  async createRecoveryCode(params: CurrentPasswordInput): Promise<RecoveryCodeResult> {
    const { keystore, key } = this.unlocked()
    const denied = await this.authorize(params)
    if (denied) return denied
    const code = formatRecoveryCode(randomBytes(20))
    const canonical = normalizeRecoveryCode(code)
    if (!canonical) throw new Error('Code de récupération invalide')
    await this.saveKeystore({
      ...keystore,
      recovery: await wrapKey(key, canonical, 'recovery', keystore.vaultId, this.kdf),
    })
    this.log('info', 'Code de récupération créé (l’ancien, s’il existait, ne fonctionne plus).')
    return { ok: true, code }
  }

  async removeRecoveryCode(params: CurrentPasswordInput): Promise<VaultResult> {
    const { keystore } = this.unlocked()
    const denied = await this.authorize(params)
    if (denied) return denied
    await this.saveKeystore({ ...keystore, recovery: null })
    this.log('info', 'Code de récupération supprimé.')
    return { ok: true }
  }
}
