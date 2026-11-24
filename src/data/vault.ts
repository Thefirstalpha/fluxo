import { randomBytes, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { isAbsolute, join } from 'node:path'
import {
  checkPassword,
  formatRecoveryCode,
  normalizeRecoveryCode,
  type BackupInfo,
  type BackupKind,
  type BackupNowResult,
  type ChangePasswordInput,
  type CurrentPasswordInput,
  type ExportResult,
  type PickBackupResult,
  type RecoveryCodeResult,
  type RestorePreviewResult,
  type RestoreSecret,
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
  BACKUP_EXTENSION,
  InvalidBackupError,
  readBackupDatabase,
  readBackupManifest,
  writeBackupFile,
  type BackupManifest,
} from './backup/container'
import { backupsToPrune } from './backup/rotation'
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
  checkDatabase,
  closeDatabase,
  CorruptDatabaseError,
  DATABASE_KEY_BYTES,
  openEncryptedDatabase,
  WrongKeyError,
  type Db,
} from './db/connection'
import { recordAudit } from './db/audit'
import {
  LATEST_SCHEMA_VERSION,
  migrate,
  MIGRATIONS,
  SchemaTooNewError,
  schemaVersion,
  type Migration,
} from './db/migrations'
import { exportDatabase } from './export'
import { seedCategoryPack } from './ledger/category-seed'
import { Ledger } from './ledger/ledger'
import { Lockout } from './lockout'
import { ServiceError } from './rpc'
import type { ServiceLogger } from './server'

export interface VaultPaths {
  directory: string
  database: string
  keystore: string
  lockout: string
  backups: string
}

export function resolveVaultPaths(directory: string): VaultPaths {
  return {
    directory,
    database: join(directory, 'fluxo.db'),
    keystore: join(directory, 'keystore.json'),
    lockout: join(directory, 'lockout.json'),
    backups: join(directory, 'backups'),
  }
}

export interface VaultOptions {
  /** Paramètres Argon2id des nouvelles enveloppes (réduits dans les tests). */
  kdf?: KdfParams
  now?: () => Date
  /** Migrations appliquées à l'ouverture (remplaçables dans les tests de montée de version). */
  migrations?: readonly Migration[]
  /** Version de l'application, inscrite dans les sauvegardes et les exports. */
  appVersion?: string
}

/** Intervalle des sauvegardes automatiques. */
export const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000

interface PendingRestore {
  token: string
  file: string
  manifest: BackupManifest
  sameVault: boolean
  /** Renseignés après l'aperçu : clé de la sauvegarde et copie extraite, vérifiée. */
  key: Buffer | null
  extracted: string | null
  secret: 'current' | RestoreSecret['method'] | null
}

function readMeta(db: Db, key: string): string | null {
  const value: unknown = db.prepare('SELECT value FROM meta WHERE key = ?').pluck().get(key)
  return typeof value === 'string' ? value : null
}

function writeMeta(db: Db, key: string, value: string | null): void {
  if (value === null) db.prepare('DELETE FROM meta WHERE key = ?').run(key)
  else {
    db.prepare(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    ).run(key, value)
  }
}

function isFileSystemError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
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
  private readonly migrations: readonly Migration[]
  private readonly appVersion: string
  private pendingRestore: PendingRestore | null = null
  private ledgerInstance: Ledger | null = null

  private constructor(
    readonly paths: VaultPaths,
    private readonly lockout: Lockout,
    private readonly log: ServiceLogger,
    options: VaultOptions,
  ) {
    this.kdf = options.kdf ?? DEFAULT_KDF
    this.now = options.now ?? (() => new Date())
    this.migrations = options.migrations ?? MIGRATIONS
    this.appVersion = options.appVersion ?? '0.0.0'
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

  status(): Omit<ServiceStatus, 'demo'> {
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

  /** Registre de la base ouverte (recréé après un verrouillage ou une restauration). */
  ledger(): Ledger {
    const db = this.database()
    if (this.ledgerInstance?.db !== db) this.ledgerInstance = new Ledger(db, this.now)
    return this.ledgerInstance
  }

  // ——— Création —————————————————————————————————————————————————————

  async create(params: CreateParams): Promise<Omit<ServiceStatus, 'demo'>> {
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
      this.prepareSchema(db, keystore)
      db.transaction(() => {
        const insert = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)')
        insert.run('vault_id', vaultId)
        insert.run('created_at', keystore.createdAt)
        const categories = seedCategoryPack(db, params.locale ?? 'fr-FR', this.now())
        recordAudit(
          db,
          {
            entity: 'category',
            entityId: null,
            action: 'seed',
            origin: 'system',
            after: { pack: 'fr', categories: categories.size },
          },
          this.now(),
        )
        recordAudit(
          db,
          {
            entity: 'vault',
            entityId: vaultId,
            action: 'create',
            origin: 'user',
            after: { mode: params.mode },
          },
          this.now(),
        )
      })()
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
    try {
      this.prepareSchema(db, keystore)
    } catch (error) {
      closeDatabase(db)
      key.fill(0)
      if (error instanceof SchemaTooNewError) return failure('vault-too-new')
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

  /**
   * Amène la base au dernier schéma. Une base existante est d'abord copiée (chiffrée, même clé)
   * dans `backups/` ; chaque migration est consignée dans l'audit.
   */
  private prepareSchema(db: Db, keystore: Keystore): void {
    const vaultId = keystore.vaultId
    const result = migrate(db, {
      migrations: this.migrations,
      beforeMigrating: (from) => {
        this.writeBackup('pre-migration', db, keystore)
        this.log('info', `Sauvegarde avant migration (schéma v${from}).`)
      },
      afterEach: (migration) => {
        recordAudit(
          db,
          {
            entity: 'vault',
            entityId: vaultId,
            action: 'migrate',
            origin: 'system',
            after: { version: migration.version, name: migration.name },
          },
          this.now(),
        )
      },
    })
    if (result.to !== result.from) this.log('info', `Schéma v${result.from} → v${result.to}.`)
  }

  private adopt(db: Db, key: Buffer, viaRecovery: boolean): void {
    this.db = db
    this.key = key
    this.viaRecovery = viaRecovery
  }

  lock(): Omit<ServiceStatus, 'demo'> {
    if (this.db) {
      closeDatabase(this.db)
      this.db = null
      this.log('info', 'Coffre verrouillé.')
    }
    this.key?.fill(0)
    this.key = null
    this.ledgerInstance = null
    this.viaRecovery = false
    this.sessionExportPending = false
    this.clearPendingRestore()
    return this.status()
  }

  // ——— Gestion des clés (coffre déverrouillé) ——————————————————————————

  private unlocked(): { db: Db; keystore: Keystore; key: Buffer } {
    if (!this.db || !this.key || !this.keystore) throw new ServiceError('VAULT_LOCKED')
    return { db: this.db, keystore: this.keystore, key: this.key }
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

  // ——— Sauvegardes ————————————————————————————————————————————————————

  /** Dossier choisi par l'utilisateur, ou dossier par défaut s'il est indisponible (clé USB retirée…). */
  private backupDirectory(db: Db): string {
    const custom = readMeta(db, 'backup_directory')
    if (custom) {
      try {
        mkdirSync(custom, { recursive: true })
        return custom
      } catch {
        this.log('warn', 'Dossier de sauvegarde indisponible : dossier par défaut utilisé.')
      }
    }
    mkdirSync(this.paths.backups, { recursive: true, mode: 0o700 })
    return this.paths.backups
  }

  /** Copie chiffrée (`VACUUM INTO`, même clé) emballée avec son manifeste. */
  private writeBackup(
    kind: BackupKind,
    db: Db,
    keystore: Keystore,
  ): { file: string; manifest: BackupManifest } {
    const directory = this.backupDirectory(db)
    const now = this.now()
    const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').replace('.', '-')
    const base = join(directory, `Fluxo-${stamp.slice(0, 19)}-${kind}`)
    const temporary = `${base}.tmp.db`
    db.prepare('VACUUM INTO ?').run(temporary)
    try {
      const file = `${base}${BACKUP_EXTENSION}`
      const manifest = writeBackupFile(
        file,
        {
          kind,
          createdAt: now.toISOString(),
          appVersion: this.appVersion,
          vaultId: keystore.vaultId,
          schemaVersion: schemaVersion(db),
          keys: { password: keystore.password, recovery: keystore.recovery },
        },
        readFileSync(temporary),
      )
      return { file, manifest }
    } finally {
      rmSync(temporary, { force: true })
    }
  }

  private async listBackups(
    directory: string,
  ): Promise<{ file: string; manifest: BackupManifest }[]> {
    if (!existsSync(directory)) return []
    const backups: { file: string; manifest: BackupManifest }[] = []
    for (const name of readdirSync(directory)) {
      if (!name.endsWith(BACKUP_EXTENSION)) continue
      const file = join(directory, name)
      try {
        backups.push({ file, manifest: await readBackupManifest(file) })
      } catch {
        // Fichier étranger ou endommagé : ignoré, jamais supprimé.
      }
    }
    return backups
  }

  async backupNow(): Promise<BackupNowResult> {
    const { db, keystore } = this.unlocked()
    const { manifest } = this.writeBackup('manual', db, keystore)
    this.log('info', 'Sauvegarde manuelle créée.')
    return Promise.resolve({ ok: true, createdAt: manifest.createdAt })
  }

  /** Sauvegarde automatique si la dernière date de plus de 24 h, puis rotation (7 j, 4 sem., 12 mois). */
  async autoBackupIfDue(): Promise<boolean> {
    if (!this.db || !this.keystore) return false
    const db = this.db
    const keystore = this.keystore
    if (readMeta(db, 'backup_auto') === '0') return false
    const automatic = (await this.listBackups(this.backupDirectory(db))).filter(
      (backup) =>
        backup.manifest.kind === 'automatic' && backup.manifest.vaultId === keystore.vaultId,
    )
    const last = Math.max(0, ...automatic.map((backup) => Date.parse(backup.manifest.createdAt)))
    if (this.now().getTime() - last < AUTO_BACKUP_INTERVAL_MS) return false

    automatic.push(this.writeBackup('automatic', db, keystore))
    const pruned = backupsToPrune(
      automatic.map((backup) => ({
        id: backup.file,
        createdAt: new Date(backup.manifest.createdAt),
      })),
    )
    for (const file of pruned) rmSync(file, { force: true })
    this.log('info', `Sauvegarde automatique créée (${pruned.length} ancienne(s) supprimée(s)).`)
    return true
  }

  async backupInfo(): Promise<BackupInfo> {
    const { db, keystore } = this.unlocked()
    const directory = this.backupDirectory(db)
    const backups = (await this.listBackups(directory)).filter(
      (backup) => backup.manifest.vaultId === keystore.vaultId,
    )
    const automatic = backups
      .filter((backup) => backup.manifest.kind === 'automatic')
      .map((backup) => backup.manifest.createdAt)
      .sort()
    return {
      directory,
      isDefault: directory === this.paths.backups,
      auto: readMeta(db, 'backup_auto') !== '0',
      lastAutomaticAt: automatic.at(-1) ?? null,
      count: backups.length,
      portable: Boolean(keystore.password ?? keystore.recovery),
    }
  }

  /** Le chemin vient d'une boîte de dialogue du process main, jamais du renderer. */
  async setBackupDirectory({ directory }: { directory: string | null }): Promise<BackupInfo> {
    const { db } = this.unlocked()
    if (directory !== null) {
      if (!isAbsolute(directory)) throw new ServiceError('INVALID_REQUEST')
      mkdirSync(directory, { recursive: true })
    }
    writeMeta(db, 'backup_directory', directory)
    return this.backupInfo()
  }

  async setAutoBackup({ enabled }: { enabled: boolean }): Promise<BackupInfo> {
    const { db } = this.unlocked()
    writeMeta(db, 'backup_auto', enabled ? '1' : '0')
    return this.backupInfo()
  }

  // ——— Restauration —————————————————————————————————————————————————

  /**
   * Étape 1 : lecture du manifeste. Autorisée sans coffre (nouvel ordinateur) ou coffre ouvert ;
   * jamais coffre verrouillé (on ne remplace pas des données qu'on ne peut pas d'abord sauvegarder).
   */
  async inspectBackup({ file }: { file: string }): Promise<PickBackupResult> {
    if (this.keystore && !this.db) throw new ServiceError('VAULT_LOCKED')
    this.clearPendingRestore()
    let manifest: BackupManifest
    try {
      manifest = await readBackupManifest(file)
    } catch (error) {
      if (error instanceof InvalidBackupError || isFileSystemError(error)) {
        return failure('invalid-backup')
      }
      throw error
    }
    if (manifest.schemaVersion > LATEST_SCHEMA_VERSION) return failure('vault-too-new')
    const sameVault = Boolean(this.db && this.keystore?.vaultId === manifest.vaultId)
    const methods: ('password' | 'recovery')[] = []
    if (manifest.keys.password) methods.push('password')
    if (manifest.keys.recovery) methods.push('recovery')
    // Sauvegarde d'un coffre en mode session sans code : seule la clé de ce coffre l'ouvre.
    if (!sameVault && methods.length === 0) return failure('not-allowed')

    const token = randomBytes(16).toString('hex')
    this.pendingRestore = {
      token,
      file,
      manifest,
      sameVault,
      key: null,
      extracted: null,
      secret: null,
    }
    return {
      ok: true,
      token,
      summary: {
        createdAt: manifest.createdAt,
        kind: manifest.kind,
        appVersion: manifest.appVersion,
        sameVault,
        methods,
      },
    }
  }

  private pendingFor(token: string): PendingRestore {
    if (!this.pendingRestore || this.pendingRestore.token !== token) {
      throw new ServiceError('NOT_ALLOWED')
    }
    return this.pendingRestore
  }

  /** Étape 2 : clé, empreinte, intégrité complète et aperçu (rien n'est encore remplacé). */
  async previewRestore({
    token,
    secret,
  }: {
    token: string
    secret?: RestoreSecret
  }): Promise<RestorePreviewResult> {
    const pending = this.pendingFor(token)
    const { manifest } = pending
    let key: Buffer | null
    if (pending.sameVault && this.key) {
      key = Buffer.from(this.key)
    } else {
      if (!secret) return failure('wrong-credentials')
      const waiting = this.lockout.remaining()
      if (waiting > 0) return failure('locked-out', waiting)
      const slot = secret.method === 'password' ? manifest.keys.password : manifest.keys.recovery
      const value =
        secret.method === 'recovery' ? normalizeRecoveryCode(secret.value) : secret.value
      key = slot && value ? await unwrapKey(slot, value, secret.method, manifest.vaultId) : null
      if (!key) return failure('wrong-credentials', await this.lockout.recordFailure())
      await this.lockout.reset()
    }

    const extracted = join(this.paths.directory, 'restore.tmp.db')
    this.removeExtracted(extracted)
    try {
      const { database } = await readBackupDatabase(pending.file)
      writeFileSync(extracted, database, { mode: 0o600 })
      const db = openEncryptedDatabase(extracted, key, { create: false })
      try {
        if (!checkDatabase(db, 'full')) throw new InvalidBackupError('intégrité')
        const stats = db
          .prepare(
            `SELECT (SELECT count(*) FROM account) AS accounts,
                    (SELECT count(*) FROM transactions) AS transactions,
                    (SELECT min(booking_date) FROM transactions) AS firstDate,
                    (SELECT max(booking_date) FROM transactions) AS lastDate`,
          )
          .get() as {
          accounts: number
          transactions: number
          firstDate: string | null
          lastDate: string | null
        }
        pending.key = key
        pending.extracted = extracted
        pending.secret = pending.sameVault ? 'current' : (secret?.method ?? null)
        return { ok: true, preview: { createdAt: manifest.createdAt, ...stats } }
      } finally {
        closeDatabase(db)
      }
    } catch (error) {
      key.fill(0)
      this.removeExtracted(extracted)
      if (
        error instanceof InvalidBackupError ||
        error instanceof WrongKeyError ||
        error instanceof CorruptDatabaseError ||
        isFileSystemError(error)
      ) {
        return failure('invalid-backup')
      }
      throw error
    }
  }

  /** Étape 3 : sauvegarde de l'existant, remplacement de la base, ouverture et migration. */
  async confirmRestore({ token }: { token: string }): Promise<VaultResult> {
    const pending = this.pendingFor(token)
    const { key, extracted, manifest } = pending
    if (!key || !extracted) throw new ServiceError('NOT_ALLOWED')
    pending.key = null
    this.pendingRestore = null

    if (this.db && this.keystore) this.writeBackup('pre-restore', this.db, this.keystore)
    if (this.db) closeDatabase(this.db)
    this.db = null
    this.key?.fill(0)
    this.key = null

    for (const suffix of ['-wal', '-shm'])
      rmSync(`${this.paths.database}${suffix}`, { force: true })
    renameSync(extracted, this.paths.database)
    this.removeExtracted(extracted)

    const sameVault = this.keystore?.vaultId === manifest.vaultId
    const keystore: Keystore =
      sameVault && this.keystore
        ? this.keystore
        : {
            format: 'fluxo-keystore',
            version: 1,
            vaultId: manifest.vaultId,
            createdAt: this.now().toISOString(),
            mode: 'password',
            session: null,
            password: manifest.keys.password,
            recovery: manifest.keys.recovery,
          }
    await writeKeystore(this.paths.keystore, keystore)
    this.keystore = keystore

    const db = openEncryptedDatabase(this.paths.database, key, { create: false })
    this.prepareSchema(db, keystore)
    recordAudit(
      db,
      {
        entity: 'vault',
        entityId: keystore.vaultId,
        action: 'restore',
        origin: 'user',
        after: { backupCreatedAt: manifest.createdAt, kind: manifest.kind },
      },
      this.now(),
    )
    // Restauré avec le code, ou depuis un coffre « session » sans mot de passe : nouveau secret exigé.
    const mustChoose = !sameVault && (pending.secret === 'recovery' || !keystore.password)
    this.adopt(db, key, mustChoose)
    this.log('info', 'Sauvegarde restaurée.')
    return { ok: true }
  }

  cancelRestore(): void {
    this.clearPendingRestore()
  }

  private clearPendingRestore(): void {
    const pending = this.pendingRestore
    if (!pending) return
    pending.key?.fill(0)
    if (pending.extracted) this.removeExtracted(pending.extracted)
    this.pendingRestore = null
  }

  private removeExtracted(file: string): void {
    for (const suffix of ['', '-wal', '-shm']) rmSync(`${file}${suffix}`, { force: true })
  }

  // ——— Export et effacement ——————————————————————————————————————————

  /** Export en clair (JSON + CSV) dans un dossier choisi par une boîte de dialogue du main. */
  exportData({ directory }: { directory: string }): ExportResult {
    const { db } = this.unlocked()
    if (!isAbsolute(directory)) throw new ServiceError('INVALID_REQUEST')
    const result = exportDatabase(db, directory, { now: this.now(), appVersion: this.appVersion })
    this.log('info', `Export réalisé (${result.rows} lignes).`)
    return { ok: true, ...result }
  }

  /**
   * Efface le coffre : base, enveloppe, compteur d'échecs, sauvegardes du dossier par défaut et
   * fichiers `Fluxo-*.fluxo-backup` du dossier choisi. Mot de passe actuel exigé.
   */
  async eraseAll(params: CurrentPasswordInput): Promise<VaultResult> {
    const { db } = this.unlocked()
    const denied = await this.authorize(params)
    if (denied) return denied
    const custom = readMeta(db, 'backup_directory')
    this.lock()
    for (const name of readdirSync(this.paths.directory)) {
      if (
        name.startsWith('fluxo.db') ||
        name.startsWith('keystore.json') ||
        name.startsWith('lockout.json') ||
        name.startsWith('restore.tmp.db')
      ) {
        rmSync(join(this.paths.directory, name), { force: true })
      }
    }
    rmSync(this.paths.backups, { recursive: true, force: true })
    if (custom && existsSync(custom)) {
      for (const name of readdirSync(custom)) {
        if (name.startsWith('Fluxo-') && name.endsWith(BACKUP_EXTENSION)) {
          rmSync(join(custom, name), { force: true })
        }
      }
    }
    this.keystore = null
    await this.lockout.reset()
    this.log('info', 'Coffre effacé à la demande de l’utilisateur.')
    return { ok: true }
  }
}
