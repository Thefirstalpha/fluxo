import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3-multiple-ciphers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  checkDatabase,
  closeDatabase,
  CorruptDatabaseError,
  openEncryptedDatabase,
  WrongKeyError,
  type Db,
} from './connection'

let directory: string
let file: string
const opened: Db[] = []

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'fluxo-db-'))
  file = join(directory, 'fluxo.db')
})

afterEach(async () => {
  for (const db of opened.splice(0)) if (db.open) db.close()
  await rm(directory, { recursive: true, force: true })
})

function open(key: Uint8Array, create = false): Db {
  const db = openEncryptedDatabase(file, key, { create })
  opened.push(db)
  return db
}

describe('openEncryptedDatabase', () => {
  it('chiffre le fichier : un SQLite standard ne peut pas le lire', async () => {
    const key = randomBytes(32)
    const db = open(key, true)
    db.exec("CREATE TABLE secret (label TEXT); INSERT INTO secret VALUES ('Salaire ACME')")
    closeDatabase(db)

    const bytes = await readFile(file)
    expect(bytes.subarray(0, 15).toString('latin1')).not.toBe('SQLite format 3')
    expect(bytes.includes(Buffer.from('Salaire ACME'))).toBe(false)

    // Sans clé (SQLite « standard ») : refus.
    const plain = new Database(file, { fileMustExist: true })
    opened.push(plain)
    expect(() => plain.prepare('SELECT * FROM secret').all()).toThrow(/not a database/)
  })

  it('relit les données avec la bonne clé et refuse une mauvaise clé', () => {
    const key = randomBytes(32)
    const db = open(key, true)
    db.exec('CREATE TABLE t (n INTEGER); INSERT INTO t VALUES (42)')
    closeDatabase(db)

    expect(() => open(randomBytes(32))).toThrow(WrongKeyError)
    expect(open(key).prepare('SELECT n FROM t').get()).toEqual({ n: 42 })
  })

  it('applique les réglages de sûreté (WAL, clés étrangères, effacement sécurisé)', () => {
    const db = open(randomBytes(32), true)
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(db.pragma('secure_delete', { simple: true })).toBe(1)
    expect(db.pragma('synchronous', { simple: true })).toBe(2)
    expect(db.pragma('cipher', { simple: true })).toBe('sqlcipher')
    expect(checkDatabase(db)).toBe(true)
    expect(checkDatabase(db, 'full')).toBe(true)
  })

  it('signale une base dont la structure est endommagée', async () => {
    const key = randomBytes(32)
    const db = open(key, true)
    db.exec('CREATE TABLE t (n INTEGER); CREATE INDEX t_n ON t (n)')
    db.exec(
      'WITH RECURSIVE s(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM s WHERE i < 2000) INSERT INTO t SELECT i FROM s',
    )
    closeDatabase(db)
    // Une page chiffrée altérée échoue à la vérification HMAC : lecture refusée.
    const bytes = await readFile(file)
    const page = 4096 * 3 + 100
    bytes[page] = (bytes[page] ?? 0) ^ 0xff
    await writeFile(file, bytes)
    expect(() => open(key)).toThrow(CorruptDatabaseError)
  })

  it('refuse une clé de mauvaise longueur et un fichier absent sans création', () => {
    expect(() => open(randomBytes(16), true)).toThrow(/Longueur/)
    expect(() => open(randomBytes(32), false)).toThrow()
  })
})
