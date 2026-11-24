import { randomBytes } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listAudit } from './db/audit'
import { MIGRATIONS, schemaVersion } from './db/migrations'
import { ServiceError } from './rpc'
import { resolveVaultPaths, Vault } from './vault'

const FAST = { memoryKiB: 64, iterations: 1, parallelism: 1 }
const PASSWORD = 'une phrase de passe solide'

let directory: string
const vaults: Vault[] = []

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'fluxo-vault-'))
})

afterEach(async () => {
  for (const vault of vaults.splice(0)) vault.lock()
  await rm(directory, { recursive: true, force: true })
})

async function openVault(options: Parameters<typeof Vault.open>[2] = {}): Promise<Vault> {
  const vault = await Vault.open(resolveVaultPaths(directory), vi.fn(), { kdf: FAST, ...options })
  vaults.push(vault)
  return vault
}

/** Simule `safeStorage` : l'enveloppe de session est opaque pour le service. */
function sessionKey() {
  const key = randomBytes(32)
  return { key, copy: Uint8Array.from(key), blob: Buffer.from('opaque').toString('base64') }
}

describe('Vault — création et déverrouillage', () => {
  it('passe de « absent » à « déverrouillé » à la création (mode mot de passe)', async () => {
    const vault = await openVault()
    expect(vault.status()).toMatchObject({ state: 'absent', mode: null })
    await vault.create({ mode: 'password', password: PASSWORD })
    expect(vault.status()).toEqual({
      state: 'unlocked',
      mode: 'password',
      hasRecoveryCode: false,
      retryAfterMs: 0,
      needsNewPassword: false,
    })
    await expect(vault.create({ mode: 'password', password: PASSWORD })).rejects.toThrow(
      ServiceError,
    )
  })

  it('refuse un mot de passe trop court à la création', async () => {
    const vault = await openVault()
    await expect(vault.create({ mode: 'password', password: 'court' })).rejects.toThrow(
      ServiceError,
    )
    expect(existsSync(join(directory, 'keystore.json'))).toBe(false)
  })

  it('rouvre le coffre après redémarrage avec le mot de passe, pas avec un autre', async () => {
    const first = await openVault()
    await first.create({ mode: 'password', password: PASSWORD })
    first.database().exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('Loyer')")
    first.lock()

    const second = await openVault()
    expect(second.status().state).toBe('locked')
    expect(await second.unlock({ method: 'password', password: 'mauvais mot de passe' })).toEqual({
      ok: false,
      reason: 'wrong-credentials',
      retryAfterMs: 0,
    })
    expect(await second.unlock({ method: 'password', password: PASSWORD })).toEqual({
      ok: true,
      viaRecovery: false,
    })
    expect(second.database().prepare('SELECT v FROM t').get()).toEqual({ v: 'Loyer' })
  })

  it('mode session : la base s’ouvre avec la clé fournie par le main, effacée après usage', async () => {
    const vault = await openVault()
    const { key, copy, blob } = sessionKey()
    await vault.create({ mode: 'session', key: copy, sessionBlob: blob })
    expect(copy.every((byte) => byte === 0)).toBe(true)
    expect(await vault.sessionBlob()).toBe(blob)
    vault.lock()
    expect(vault.status()).toMatchObject({ state: 'locked', mode: 'session' })
    expect(await vault.unlock({ method: 'key', key: Uint8Array.from(randomBytes(32)) })).toEqual({
      ok: false,
      reason: 'wrong-credentials',
    })
    expect(await vault.unlock({ method: 'key', key: Uint8Array.from(key) })).toMatchObject({
      ok: true,
    })
  })

  it('la base et l’enveloppe ne contiennent ni la clé ni les données en clair', async () => {
    const vault = await openVault()
    await vault.create({ mode: 'password', password: PASSWORD })
    vault.database().exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('Salaire ACME')")
    vault.lock()
    const database = await readFile(join(directory, 'fluxo.db'))
    expect(database.subarray(0, 15).toString('latin1')).not.toBe('SQLite format 3')
    expect(database.includes(Buffer.from('Salaire ACME'))).toBe(false)
    expect(await readFile(join(directory, 'keystore.json'), 'utf8')).not.toContain(PASSWORD)
  })

  it('met de côté une base orpheline (création interrompue) au lieu de l’écraser', async () => {
    await writeFile(join(directory, 'fluxo.db'), 'reste d’une création interrompue')
    const vault = await openVault()
    expect(vault.status().state).toBe('absent')
    await vault.create({ mode: 'password', password: PASSWORD })
    expect(readdirSync(directory).some((name) => name.startsWith('fluxo.db.orphan-'))).toBe(true)
  })

  it('refuse les accès à la base quand le coffre est verrouillé', async () => {
    const vault = await openVault()
    expect(() => vault.database()).toThrow(ServiceError)
    await expect(vault.unlock({ method: 'password', password: PASSWORD })).rejects.toThrow(
      ServiceError,
    )
  })
})

describe('Vault — délais après échecs', () => {
  it('impose un délai après 3 échecs, même après redémarrage', async () => {
    const vault = await openVault()
    await vault.create({ mode: 'password', password: PASSWORD })
    vault.lock()
    for (let i = 0; i < 3; i += 1) {
      await vault.unlock({ method: 'password', password: `essai numéro ${i}` })
    }
    const outcome = await vault.unlock({ method: 'password', password: PASSWORD })
    expect(outcome).toMatchObject({ ok: false, reason: 'locked-out' })

    const restarted = await openVault()
    expect(restarted.status().retryAfterMs).toBeGreaterThan(0)
  })
})

describe('Vault — code de récupération', () => {
  it('déverrouille avec le code et impose un nouveau mot de passe', async () => {
    const vault = await openVault()
    await vault.create({ mode: 'password', password: PASSWORD })
    const created = await vault.createRecoveryCode({ currentPassword: PASSWORD })
    if (!created.ok) throw new Error('code attendu')
    expect(vault.status().hasRecoveryCode).toBe(true)
    vault.lock()

    // Saisie approximative : minuscules et espaces au lieu des tirets.
    const typed = created.code.toLowerCase().replace(/-/g, ' ')
    expect(await vault.unlock({ method: 'recovery', code: typed })).toEqual({
      ok: true,
      viaRecovery: true,
    })
    expect(vault.status().needsNewPassword).toBe(true)
    expect(await vault.changePassword({ newPassword: 'nouvelle phrase de passe' })).toEqual({
      ok: true,
    })
    expect(vault.status().needsNewPassword).toBe(false)
    vault.lock()
    expect(
      await vault.unlock({ method: 'password', password: 'nouvelle phrase de passe' }),
    ).toMatchObject({ ok: true })
  })

  it('exige le mot de passe actuel pour créer ou supprimer le code', async () => {
    const vault = await openVault()
    await vault.create({ mode: 'password', password: PASSWORD })
    expect(await vault.createRecoveryCode({})).toMatchObject({ reason: 'wrong-credentials' })
    expect(await vault.createRecoveryCode({ currentPassword: 'faux mot de passe' })).toMatchObject({
      reason: 'wrong-credentials',
    })
    expect(await vault.createRecoveryCode({ currentPassword: PASSWORD })).toMatchObject({
      ok: true,
    })
    expect(await vault.removeRecoveryCode({ currentPassword: PASSWORD })).toEqual({ ok: true })
    expect(vault.status().hasRecoveryCode).toBe(false)
  })

  it('un nouveau code invalide l’ancien', async () => {
    const vault = await openVault()
    await vault.create({ mode: 'password', password: PASSWORD })
    const first = await vault.createRecoveryCode({ currentPassword: PASSWORD })
    await vault.createRecoveryCode({ currentPassword: PASSWORD })
    vault.lock()
    if (!first.ok) throw new Error('code attendu')
    expect(await vault.unlock({ method: 'recovery', code: first.code })).toMatchObject({
      ok: false,
    })
  })
})

describe('Vault — changement de mode', () => {
  it('change le mot de passe sans re-chiffrer la base', async () => {
    const vault = await openVault()
    await vault.create({ mode: 'password', password: PASSWORD })
    vault.database().exec('CREATE TABLE t (n INTEGER); INSERT INTO t VALUES (7)')
    const before = await readFile(join(directory, 'fluxo.db'))
    expect(
      await vault.changePassword({
        currentPassword: 'pas le bon',
        newPassword: 'autre phrase longue',
      }),
    ).toMatchObject({ ok: false, reason: 'wrong-credentials' })
    expect(
      await vault.changePassword({ currentPassword: PASSWORD, newPassword: 'court' }),
    ).toMatchObject({ ok: false, reason: 'invalid-password' })
    expect(
      await vault.changePassword({ currentPassword: PASSWORD, newPassword: 'autre phrase longue' }),
    ).toEqual({ ok: true })
    expect(await readFile(join(directory, 'fluxo.db'))).toEqual(before)
    vault.lock()
    expect(await vault.unlock({ method: 'password', password: PASSWORD })).toMatchObject({
      ok: false,
    })
    expect(
      await vault.unlock({ method: 'password', password: 'autre phrase longue' }),
    ).toMatchObject({ ok: true })
    expect(vault.database().prepare('SELECT n FROM t').get()).toEqual({ n: 7 })
  })

  it('passe du mot de passe au mode session (mot de passe exigé, enveloppe retirée)', async () => {
    const vault = await openVault()
    await vault.create({ mode: 'password', password: PASSWORD })
    await expect(vault.setSessionMode({ sessionBlob: 'AAAA' })).rejects.toThrow(ServiceError)
    expect(await vault.exportKeyForSession({ currentPassword: 'faux' })).toMatchObject({
      ok: false,
    })
    const exported = await vault.exportKeyForSession({ currentPassword: PASSWORD })
    if (!exported.ok) throw new Error('clé attendue')
    expect(await vault.setSessionMode({ sessionBlob: 'AAAA' })).toEqual({ ok: true })
    vault.lock()
    expect(vault.status().mode).toBe('session')
    expect(await vault.unlock({ method: 'password', password: PASSWORD })).toMatchObject({
      ok: false,
    })
    expect(await vault.unlock({ method: 'key', key: exported.key })).toMatchObject({ ok: true })
  })

  it('passe du mode session au mot de passe', async () => {
    const vault = await openVault()
    const { copy, blob } = sessionKey()
    await vault.create({ mode: 'session', key: copy, sessionBlob: blob })
    expect(await vault.changePassword({ newPassword: PASSWORD })).toEqual({ ok: true })
    expect(await vault.sessionBlob()).toBeNull()
    vault.lock()
    expect(vault.status().mode).toBe('password')
    expect(await vault.unlock({ method: 'password', password: PASSWORD })).toMatchObject({
      ok: true,
    })
  })
})

describe('Vault — schéma et migrations', () => {
  it('crée le schéma à jour, l’identifiant du coffre et les entrées d’audit', async () => {
    const vault = await openVault()
    await vault.create({ mode: 'password', password: PASSWORD })
    const db = vault.database()
    expect(schemaVersion(db)).toBe(MIGRATIONS.length)
    const keystore = JSON.parse(await readFile(join(directory, 'keystore.json'), 'utf8')) as {
      vaultId: string
    }
    expect(db.prepare("SELECT value FROM meta WHERE key = 'vault_id'").pluck().get()).toBe(
      keystore.vaultId,
    )
    expect(listAudit(db).map((entry) => entry.action)).toEqual(['migrate', 'create'])
  })

  it('sauvegarde la base (chiffrée) avant de la migrer, puis consigne la migration', async () => {
    const first = await openVault()
    await first.create({ mode: 'password', password: PASSWORD })
    first.lock()

    const next = { version: 2, name: 'test', up: 'CREATE TABLE ajout (id TEXT) STRICT;' }
    const second = await openVault({ migrations: [...MIGRATIONS, next] })
    expect(await second.unlock({ method: 'password', password: PASSWORD })).toMatchObject({
      ok: true,
    })
    expect(schemaVersion(second.database())).toBe(2)
    const backups = readdirSync(join(directory, 'backups'))
    expect(backups).toHaveLength(1)
    expect(backups[0]).toMatch(/^pre-migration-v1-.*\.db$/)
    const header = (await readFile(join(directory, 'backups', backups[0] ?? ''))).subarray(0, 15)
    expect(header.toString('latin1')).not.toBe('SQLite format 3')
    expect(listAudit(second.database()).at(-1)).toMatchObject({
      action: 'migrate',
      after: { version: 2 },
    })
  })

  it('refuse d’ouvrir une base enregistrée par une version plus récente', async () => {
    const first = await openVault()
    await first.create({ mode: 'password', password: PASSWORD })
    first.database().pragma('user_version = 42')
    first.lock()
    const second = await openVault()
    expect(await second.unlock({ method: 'password', password: PASSWORD })).toEqual({
      ok: false,
      reason: 'vault-too-new',
    })
    expect(second.status().state).toBe('locked')
  })
})
