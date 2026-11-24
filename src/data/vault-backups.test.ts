import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { uuidv7 } from '@shared/uuid'
import { listAudit } from './db/audit'
import { ServiceError } from './rpc'
import { resolveVaultPaths, Vault, type VaultOptions } from './vault'

const FAST = { memoryKiB: 64, iterations: 1, parallelism: 1 }
const PASSWORD = 'une phrase de passe solide'

let root: string
const vaults: Vault[] = []

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'fluxo-backups-'))
})

afterEach(async () => {
  for (const vault of vaults.splice(0)) vault.lock()
  await rm(root, { recursive: true, force: true })
})

async function openVault(name = 'poste-a', options: VaultOptions = {}): Promise<Vault> {
  const vault = await Vault.open(resolveVaultPaths(join(root, name)), vi.fn(), {
    kdf: FAST,
    appVersion: '0.2.0-test',
    ...options,
  })
  vaults.push(vault)
  return vault
}

/** Compte en saisie manuelle + une opération (aucune donnée réelle). */
function addCashOperation(vault: Vault, label = 'Boulangerie', amount = -480) {
  const db = vault.database()
  const now = new Date().toISOString()
  let account = db.prepare('SELECT id FROM account LIMIT 1').pluck().get() as string | undefined
  if (!account) {
    account = uuidv7()
    db.prepare(
      `INSERT INTO account (id, name, type, tracking_mode, currency, created_at, updated_at)
       VALUES (?, 'Espèces', 'cash', 'manual', 'EUR', ?, ?)`,
    ).run(account, now, now)
  }
  db.prepare(
    `INSERT INTO transactions (id, account_id, booking_date, amount, currency, label_raw, created_at, updated_at)
     VALUES (?, ?, '2026-11-20', ?, 'EUR', ?, ?, ?)`,
  ).run(uuidv7(), account, amount, label, now, now)
}

const countOperations = (vault: Vault) =>
  vault.database().prepare('SELECT count(*) FROM transactions').pluck().get()

function backupFiles(vault: Vault) {
  const directory = vault.paths.backups
  return existsSync(directory)
    ? readdirSync(directory).filter((n) => n.endsWith('.fluxo-backup'))
    : []
}

describe('sauvegardes', () => {
  it('sauvegarde manuelle : fichier chiffré, décompte, portabilité', async () => {
    const vault = await openVault()
    await vault.create({ mode: 'password', password: PASSWORD })
    addCashOperation(vault)
    expect(await vault.backupNow()).toMatchObject({ ok: true })
    const [file] = backupFiles(vault)
    expect(file).toMatch(/-manual\.fluxo-backup$/)
    const bytes = readFileSync(join(vault.paths.backups, file ?? ''))
    expect(bytes.includes(Buffer.from('Boulangerie'))).toBe(false)
    expect(await vault.backupInfo()).toMatchObject({
      isDefault: true,
      auto: true,
      count: 1,
      portable: true,
      lastAutomaticAt: null,
    })
  })

  it('mode session sans code de récupération : sauvegardes non portables', async () => {
    const vault = await openVault()
    await vault.create({ mode: 'session', key: new Uint8Array(32).fill(7), sessionBlob: 'AAAA' })
    expect((await vault.backupInfo()).portable).toBe(false)
    await vault.createRecoveryCode({})
    expect((await vault.backupInfo()).portable).toBe(true)
  })

  it('automatique : au plus une par 24 h, puis rotation sur la durée', async () => {
    let now = new Date('2026-01-01T09:00:00.000Z')
    const vault = await openVault('poste-a', { now: () => now })
    await vault.create({ mode: 'password', password: PASSWORD })
    expect(await vault.autoBackupIfDue()).toBe(true)
    expect(await vault.autoBackupIfDue()).toBe(false)
    now = new Date(now.getTime() + 23 * 3_600_000)
    expect(await vault.autoBackupIfDue()).toBe(false)
    // Trois mois de lancements quotidiens.
    for (let day = 0; day < 90; day += 1) {
      now = new Date(now.getTime() + 24 * 3_600_000)
      await vault.autoBackupIfDue()
    }
    const files = backupFiles(vault)
    expect(files.length).toBeLessThanOrEqual(7 + 4 + 12)
    expect(files.length).toBeGreaterThanOrEqual(7)
    expect((await vault.backupInfo()).lastAutomaticAt).toBe(now.toISOString())
  }, 15_000)

  it('sauvegarde automatique désactivable', async () => {
    const vault = await openVault()
    await vault.create({ mode: 'password', password: PASSWORD })
    await vault.setAutoBackup({ enabled: false })
    expect(await vault.autoBackupIfDue()).toBe(false)
    expect((await vault.backupInfo()).auto).toBe(false)
  })

  it('dossier choisi : absolu obligatoire, repli sur le dossier par défaut s’il disparaît', async () => {
    const vault = await openVault()
    await vault.create({ mode: 'password', password: PASSWORD })
    await expect(vault.setBackupDirectory({ directory: 'relatif' })).rejects.toThrow(ServiceError)
    const custom = join(root, 'cle-usb')
    expect(await vault.setBackupDirectory({ directory: custom })).toMatchObject({
      directory: custom,
      isDefault: false,
    })
    await vault.backupNow()
    expect(readdirSync(custom)).toHaveLength(1)
    expect((await vault.setBackupDirectory({ directory: null })).isDefault).toBe(true)
  })
})

describe('restauration', () => {
  it('même coffre : revient à l’état sauvegardé, après une copie de l’état actuel', async () => {
    const vault = await openVault()
    await vault.create({ mode: 'password', password: PASSWORD })
    addCashOperation(vault)
    await vault.backupNow()
    const [file] = backupFiles(vault)
    addCashOperation(vault, 'Cinéma', -1200)
    expect(countOperations(vault)).toBe(2)

    const picked = await vault.inspectBackup({ file: join(vault.paths.backups, file ?? '') })
    if (!picked.ok) throw new Error('sauvegarde attendue')
    expect(picked.summary).toMatchObject({ sameVault: true, kind: 'manual' })
    const preview = await vault.previewRestore({ token: picked.token })
    expect(preview).toMatchObject({
      ok: true,
      preview: { accounts: 1, transactions: 1, firstDate: '2026-11-20', lastDate: '2026-11-20' },
    })
    expect(await vault.confirmRestore({ token: picked.token })).toEqual({ ok: true })

    expect(countOperations(vault)).toBe(1)
    expect(backupFiles(vault).some((name) => name.endsWith('-pre-restore.fluxo-backup'))).toBe(true)
    expect(listAudit(vault.database()).at(-1)).toMatchObject({ action: 'restore' })
    expect(vault.status()).toMatchObject({ state: 'unlocked', needsNewPassword: false })
  })

  it('nouvel ordinateur : mot de passe de la sauvegarde exigé, puis coffre restauré', async () => {
    const source = await openVault('poste-a')
    await source.create({ mode: 'password', password: PASSWORD })
    addCashOperation(source)
    await source.backupNow()
    const file = join(source.paths.backups, backupFiles(source)[0] ?? '')

    const target = await openVault('poste-b')
    expect(target.status().state).toBe('absent')
    const picked = await target.inspectBackup({ file })
    if (!picked.ok) throw new Error('sauvegarde attendue')
    expect(picked.summary).toMatchObject({ sameVault: false, methods: ['password'] })
    expect(await target.previewRestore({ token: picked.token })).toMatchObject({ ok: false })
    expect(
      await target.previewRestore({
        token: picked.token,
        secret: { method: 'password', value: 'pas le bon' },
      }),
    ).toMatchObject({ ok: false, reason: 'wrong-credentials' })
    expect(
      await target.previewRestore({
        token: picked.token,
        secret: { method: 'password', value: PASSWORD },
      }),
    ).toMatchObject({ ok: true, preview: { transactions: 1 } })
    expect(await target.confirmRestore({ token: picked.token })).toEqual({ ok: true })
    expect(countOperations(target)).toBe(1)
    expect(target.status()).toMatchObject({ state: 'unlocked', mode: 'password' })
    target.lock()
    expect(await target.unlock({ method: 'password', password: PASSWORD })).toMatchObject({
      ok: true,
    })
  })

  it('nouvel ordinateur avec le code de récupération : nouveau mot de passe exigé', async () => {
    const source = await openVault('poste-a')
    await source.create({ mode: 'session', key: new Uint8Array(32).fill(3), sessionBlob: 'AAAA' })
    const recovery = await source.createRecoveryCode({})
    if (!recovery.ok) throw new Error('code attendu')
    await source.backupNow()
    const file = join(source.paths.backups, backupFiles(source)[0] ?? '')

    const target = await openVault('poste-b')
    const picked = await target.inspectBackup({ file })
    if (!picked.ok) throw new Error('sauvegarde attendue')
    expect(picked.summary.methods).toEqual(['recovery'])
    await target.previewRestore({
      token: picked.token,
      secret: { method: 'recovery', value: recovery.code },
    })
    expect(await target.confirmRestore({ token: picked.token })).toEqual({ ok: true })
    expect(target.status()).toMatchObject({ state: 'unlocked', needsNewPassword: true })
  })

  it('refuse une sauvegarde altérée sans rien remplacer', async () => {
    const vault = await openVault()
    await vault.create({ mode: 'password', password: PASSWORD })
    addCashOperation(vault)
    await vault.backupNow()
    const file = join(vault.paths.backups, backupFiles(vault)[0] ?? '')
    const bytes = readFileSync(file)
    bytes[bytes.length - 100] = (bytes[bytes.length - 100] ?? 0) ^ 0xff
    writeFileSync(file, bytes)

    const picked = await vault.inspectBackup({ file })
    if (!picked.ok) throw new Error('manifeste lisible attendu')
    expect(await vault.previewRestore({ token: picked.token })).toEqual({
      ok: false,
      reason: 'invalid-backup',
    })
    await expect(vault.confirmRestore({ token: picked.token })).rejects.toThrow(ServiceError)
    expect(countOperations(vault)).toBe(1)
  })

  it('refuse un fichier quelconque, et toute restauration coffre verrouillé', async () => {
    const vault = await openVault()
    await vault.create({ mode: 'password', password: PASSWORD })
    const other = join(root, 'photo.jpg')
    writeFileSync(other, 'pas une sauvegarde')
    expect(await vault.inspectBackup({ file: other })).toEqual({
      ok: false,
      reason: 'invalid-backup',
    })
    vault.lock()
    await expect(vault.inspectBackup({ file: other })).rejects.toThrow(ServiceError)
  })

  it('une sauvegarde « session » sans code ne s’ouvre pas sur un autre coffre', async () => {
    const source = await openVault('poste-a')
    await source.create({ mode: 'session', key: new Uint8Array(32).fill(9), sessionBlob: 'AAAA' })
    await source.backupNow()
    const file = join(source.paths.backups, backupFiles(source)[0] ?? '')
    const target = await openVault('poste-b')
    expect(await target.inspectBackup({ file })).toEqual({ ok: false, reason: 'not-allowed' })
  })
})

describe('export et effacement', () => {
  it('exporte toutes les tables en JSON et CSV, formules neutralisées', async () => {
    const vault = await openVault()
    await vault.create({ mode: 'password', password: PASSWORD })
    addCashOperation(vault, '=HYPERLINK("http://exemple.invalid")')
    const destination = join(root, 'exports')
    mkdirSync(destination)
    const result = vault.exportData({ directory: destination })
    if (!result.ok) throw new Error('export attendu')
    const folder = join(destination, result.folderName)
    const files = readdirSync(folder).sort()
    expect(files).toContain('fluxo.json')
    expect(files).toContain('transactions.csv')
    const csv = readFileSync(join(folder, 'transactions.csv'), 'utf8')
    expect(csv).toContain(`"'=HYPERLINK(""http://exemple.invalid"")"`)
    expect(csv).toContain(',-480,')
    const json = JSON.parse(readFileSync(join(folder, 'fluxo.json'), 'utf8')) as {
      format: string
      tables: { transactions: { amount: number }[] }
    }
    expect(json.format).toBe('fluxo-export')
    expect(json.tables.transactions[0]?.amount).toBe(-480)
  })

  it('efface base, enveloppe et sauvegardes, mot de passe exigé', async () => {
    const vault = await openVault()
    await vault.create({ mode: 'password', password: PASSWORD })
    await vault.backupNow()
    expect(await vault.eraseAll({ currentPassword: 'faux' })).toMatchObject({ ok: false })
    expect(await vault.eraseAll({ currentPassword: PASSWORD })).toEqual({ ok: true })
    expect(vault.status().state).toBe('absent')
    expect(readdirSync(vault.paths.directory)).toEqual([])
    await vault.create({ mode: 'password', password: PASSWORD })
    expect(countOperations(vault)).toBe(0)
  })
})
