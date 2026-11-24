import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  InvalidBackupError,
  readBackupDatabase,
  readBackupManifest,
  writeBackupFile,
  type BackupManifestInput,
} from './container'
import { backupsToPrune, isoWeekKey, RETENTION } from './rotation'

describe('conteneur de sauvegarde', () => {
  let directory: string
  let file: string
  const input: BackupManifestInput = {
    kind: 'manual',
    createdAt: '2026-11-24T10:00:00.000Z',
    appVersion: '0.2.0',
    vaultId: randomUUID(),
    schemaVersion: 1,
    keys: { password: null, recovery: null },
  }

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'fluxo-backup-'))
    file = join(directory, 'test.fluxo-backup')
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('relit le manifeste et la base, empreinte vérifiée', async () => {
    const database = randomBytes(8192)
    const manifest = writeBackupFile(file, input, database)
    expect(manifest.database.size).toBe(8192)
    expect(await readBackupManifest(file)).toEqual(manifest)
    const read = await readBackupDatabase(file)
    expect(read.database.equals(database)).toBe(true)
  })

  it('détecte une base altérée ou tronquée', async () => {
    writeBackupFile(file, input, randomBytes(4096))
    const bytes = await readFile(file)
    const altered = Buffer.from(bytes)
    altered[altered.length - 1] = (altered[altered.length - 1] ?? 0) ^ 1
    await writeFile(file, altered)
    await expect(readBackupDatabase(file)).rejects.toThrow(InvalidBackupError)

    await writeFile(file, bytes.subarray(0, bytes.length - 10))
    await expect(readBackupDatabase(file)).rejects.toThrow(InvalidBackupError)
  })

  it('refuse un fichier qui n’est pas une sauvegarde Fluxo', async () => {
    await writeFile(file, 'SQLite format 3\u0000…')
    await expect(readBackupManifest(file)).rejects.toThrow(InvalidBackupError)
    const json = Buffer.from('{"format":"autre"}')
    const header = Buffer.alloc(4)
    header.writeUInt32BE(json.length)
    await writeFile(file, Buffer.concat([Buffer.from('FLUXOBK1'), header, json]))
    await expect(readBackupManifest(file)).rejects.toThrow(InvalidBackupError)
  })

  it('le manifeste ne contient aucune donnée de la base', async () => {
    const database = Buffer.from('Salaire ACME 3 400 € — IBAN FR76…')
    writeBackupFile(file, input, database)
    const manifest = JSON.stringify(await readBackupManifest(file))
    expect(manifest).not.toContain('ACME')
  })
})

describe('rotation des sauvegardes automatiques', () => {
  const day = (iso: string) => ({ id: iso, createdAt: new Date(iso) })

  it('semaines ISO : le 1er janvier 2027 (vendredi) appartient à 2026-W53', () => {
    expect(isoWeekKey(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53')
    expect(isoWeekKey(new Date('2026-11-24T12:00:00Z'))).toBe('2026-W48')
  })

  it('garde 7 jours, 4 semaines et 12 mois, supprime le reste', () => {
    // Une sauvegarde par jour pendant deux ans.
    const backups = Array.from({ length: 730 }, (_, index) =>
      day(new Date(Date.UTC(2026, 10, 24) - index * 86_400_000).toISOString()),
    )
    const pruned = new Set(backupsToPrune(backups))
    const kept = backups.filter((backup) => !pruned.has(backup.id))
    expect(kept.length).toBeLessThanOrEqual(RETENTION.daily + RETENTION.weekly + RETENTION.monthly)
    // Les 7 derniers jours sont tous conservés.
    for (const backup of backups.slice(0, 7)) expect(pruned.has(backup.id)).toBe(false)
    // La plus ancienne conservée a moins d'un an.
    const oldest = Math.min(...kept.map((backup) => backup.createdAt.getTime()))
    expect(Date.UTC(2026, 10, 24) - oldest).toBeLessThan(366 * 86_400_000)
  })

  it('dans une même journée, ne garde que la plus récente', () => {
    const pruned = backupsToPrune([
      day('2026-11-24T08:00:00.000Z'),
      day('2026-11-24T20:00:00.000Z'),
    ])
    expect(pruned).toEqual(['2026-11-24T08:00:00.000Z'])
  })
})
