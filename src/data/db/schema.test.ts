import { randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { uuidv7 } from '@shared/uuid'
import { listAudit, recordAudit } from './audit'
import { openEncryptedDatabase, type Db } from './connection'
import { findUnbalancedTransactions } from './integrity'
import {
  LATEST_SCHEMA_VERSION,
  migrate,
  MIGRATIONS,
  SchemaTooNewError,
  schemaVersion,
  type Migration,
} from './migrations'

let directory: string
let db: Db

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'fluxo-schema-'))
  db = openEncryptedDatabase(join(directory, 'fluxo.db'), randomBytes(32), { create: true })
})

afterEach(async () => {
  if (db.open) db.close()
  await rm(directory, { recursive: true, force: true })
})

const now = () => new Date().toISOString()

function insertAccount(trackingMode: 'statement' | 'manual' | 'valuation', type = 'checking') {
  const id = uuidv7()
  db.prepare(
    `INSERT INTO account (id, name, type, tracking_mode, currency, created_at, updated_at)
     VALUES (?, 'Compte', ?, ?, 'EUR', ?, ?)`,
  ).run(id, type, trackingMode, now(), now())
  return id
}

function insertBatch(accountId: string) {
  const id = uuidv7()
  db.prepare(
    `INSERT INTO import_batch (id, account_id, file_name, file_hash, format, state, created_at)
     VALUES (?, ?, 'releve.csv', ?, 'csv', 'committed', ?)`,
  ).run(id, accountId, 'a'.repeat(64), now())
  return id
}

function insertTransaction(
  accountId: string,
  fields: {
    amount?: unknown
    date?: string
    batch?: string | null
    nature?: string
    note?: string
  } = {},
) {
  const id = uuidv7()
  db.prepare(
    `INSERT INTO transactions (id, account_id, booking_date, amount, currency, label_raw,
       nature, note, import_batch_id, created_at, updated_at)
     VALUES (@id, @account, @date, @amount, 'EUR', 'CB SUPERMARCHE', @nature, @note, @batch, @now, @now)`,
  ).run({
    id,
    account: accountId,
    date: fields.date ?? '2026-11-02',
    amount: fields.amount ?? -4250,
    nature: fields.nature ?? 'operation',
    note: fields.note ?? null,
    batch: fields.batch ?? null,
    now: now(),
  })
  return id
}

describe('migrate', () => {
  it('crée le dernier schéma sur une base neuve, puis ne fait plus rien', () => {
    expect(migrate(db)).toEqual({ from: 0, to: LATEST_SCHEMA_VERSION })
    expect(schemaVersion(db)).toBe(LATEST_SCHEMA_VERSION)
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'transactions_fts_%' ORDER BY name",
      )
      .pluck()
      .all()
    expect(tables).toEqual([
      'account',
      'audit_entry',
      'categorization_suggestion',
      'category',
      'classifier_state',
      'csv_profile',
      'import_batch',
      'meta',
      'payee',
      'recurring_dismissed',
      'rule',
      'saved_filter',
      'split',
      'split_tag',
      'tag',
      'transaction_search_key',
      'transactions',
      'transactions_fts',
    ])
    expect(migrate(db)).toEqual({ from: LATEST_SCHEMA_VERSION, to: LATEST_SCHEMA_VERSION })
  })

  it('refuse une base écrite par une version plus récente', () => {
    migrate(db)
    db.pragma('user_version = 99')
    expect(() => migrate(db)).toThrow(SchemaTooNewError)
  })

  it('annule entièrement une migration en échec (base laissée à la version précédente)', () => {
    migrate(db)
    const broken: Migration = {
      version: LATEST_SCHEMA_VERSION + 1,
      name: 'migration défectueuse',
      up: 'CREATE TABLE nouvelle (id TEXT); INSERT INTO table_inexistante VALUES (1);',
    }
    const beforeMigrating = vi.fn()
    expect(() => migrate(db, { migrations: [...MIGRATIONS, broken], beforeMigrating })).toThrow()
    expect(beforeMigrating).toHaveBeenCalledWith(LATEST_SCHEMA_VERSION)
    expect(schemaVersion(db)).toBe(LATEST_SCHEMA_VERSION)
    expect(
      db.prepare("SELECT count(*) FROM sqlite_schema WHERE name = 'nouvelle'").pluck().get(),
    ).toBe(0)
  })

  it('sauvegarde seulement une base existante, avant la première migration', () => {
    const beforeMigrating = vi.fn()
    migrate(db, { beforeMigrating })
    expect(beforeMigrating).not.toHaveBeenCalled()

    const next: Migration = {
      version: LATEST_SCHEMA_VERSION + 1,
      name: 'ajout',
      up: 'CREATE TABLE ajout (id TEXT) STRICT;',
    }
    const afterEach = vi.fn()
    migrate(db, { migrations: [...MIGRATIONS, next], beforeMigrating, afterEach })
    expect(beforeMigrating).toHaveBeenCalledTimes(1)
    expect(afterEach).toHaveBeenCalledWith(next)
    expect(schemaVersion(db)).toBe(LATEST_SCHEMA_VERSION + 1)
  })

  it('migre une base v2 existante vers v3 en conservant les lots et transactions liés', () => {
    migrate(db, { migrations: MIGRATIONS.slice(0, 2) })
    expect(schemaVersion(db)).toBe(2)

    const accountId = insertAccount('statement')
    const batchId = insertBatch(accountId)
    const txId = insertTransaction(accountId, { batch: batchId, amount: -2500 })

    const beforeMigrating = vi.fn()
    const result = migrate(db, { beforeMigrating })
    expect(result).toEqual({ from: 2, to: LATEST_SCHEMA_VERSION })
    expect(beforeMigrating).toHaveBeenCalledWith(2)
    expect(schemaVersion(db)).toBe(LATEST_SCHEMA_VERSION)

    // Les lignes existantes sont préservées et les clés étrangères restent actives.
    expect(
      db.prepare('SELECT id, format FROM import_batch WHERE id = ?').get(batchId),
    ).toMatchObject({ id: batchId, format: 'csv' })
    expect(
      db.prepare('SELECT import_batch_id FROM transactions WHERE id = ?').pluck().get(txId),
    ).toBe(batchId)
    expect(() => insertTransaction(accountId, { batch: uuidv7() })).toThrow(/FOREIGN KEY/)

    // Le format mt940 et les profils CSV sont désormais acceptés.
    const mtBatch = uuidv7()
    expect(() =>
      db
        .prepare(
          `INSERT INTO import_batch (id, account_id, file_name, file_hash, format, state, created_at)
           VALUES (?, ?, 'releve.mt940', ?, 'mt940', 'committed', ?)`,
        )
        .run(mtBatch, accountId, 'b'.repeat(64), now()),
    ).not.toThrow()
  })
})

describe('schéma v1 — contraintes', () => {
  beforeEach(() => {
    migrate(db)
  })

  it('n’accepte que des montants entiers (centimes)', () => {
    const account = insertAccount('manual', 'cash')
    expect(() => insertTransaction(account, { amount: 12.5 })).toThrow()
    expect(() => insertTransaction(account, { amount: 'douze euros' })).toThrow()
    expect(() => insertTransaction(account, { amount: '12.50' })).toThrow()
    expect(() => insertTransaction(account, { amount: -1250 })).not.toThrow()
  })

  it('refuse une date impossible ou mal formée', () => {
    const account = insertAccount('manual', 'cash')
    expect(() => insertTransaction(account, { date: '2026-02-30' })).toThrow(/CHECK/)
    expect(() => insertTransaction(account, { date: '02/11/2026' })).toThrow(/CHECK/)
    expect(() => insertTransaction(account, { date: '2028-02-29' })).not.toThrow()
  })

  it('refuse une devise qui n’est pas un code ISO 4217 en majuscules', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO account (id, name, type, tracking_mode, currency, created_at, updated_at)
           VALUES (?, 'x', 'cash', 'manual', 'eur', ?, ?)`,
        )
        .run(uuidv7(), now(), now()),
    ).toThrow(/CHECK/)
  })

  it('exige une note pour une écriture d’ajustement', () => {
    const account = insertAccount('statement')
    expect(() => insertTransaction(account, { nature: 'adjustment' })).toThrow(/CHECK/)
    expect(() =>
      insertTransaction(account, { nature: 'adjustment', note: 'Relevé de mars manquant' }),
    ).not.toThrow()
  })

  it('protège les clés étrangères (pas de compte supprimé sous ses opérations)', () => {
    const account = insertAccount('manual', 'cash')
    insertTransaction(account)
    expect(() => db.prepare('DELETE FROM account WHERE id = ?').run(account)).toThrow(/FOREIGN KEY/)
  })
})

describe('schéma v1 — origine des opérations (ADR-026)', () => {
  beforeEach(() => {
    migrate(db)
  })

  it('compte à relevé : pas de saisie manuelle, seulement un import ou un ajustement', () => {
    const account = insertAccount('statement')
    expect(() => insertTransaction(account)).toThrow(/statement_account_requires_import/)
    expect(() => insertTransaction(account, { batch: insertBatch(account) })).not.toThrow()
  })

  it('compte à relevé : montant, date et compte d’une opération importée sont figés', () => {
    const account = insertAccount('statement')
    const id = insertTransaction(account, { batch: insertBatch(account) })
    expect(() => db.prepare('UPDATE transactions SET amount = 1 WHERE id = ?').run(id)).toThrow(
      /imported_transaction_frozen/,
    )
    expect(() =>
      db.prepare("UPDATE transactions SET booking_date = '2026-01-01' WHERE id = ?").run(id),
    ).toThrow(/imported_transaction_frozen/)
    // L'annotation reste libre.
    expect(() =>
      db
        .prepare("UPDATE transactions SET label = 'Courses', note = 'semaine' WHERE id = ?")
        .run(id),
    ).not.toThrow()
  })

  it('compte en saisie manuelle : écriture et modification libres', () => {
    const account = insertAccount('manual', 'cash')
    const id = insertTransaction(account)
    expect(() =>
      db.prepare('UPDATE transactions SET amount = -100 WHERE id = ?').run(id),
    ).not.toThrow()
  })

  it('compte en valorisation manuelle : aucune opération', () => {
    const account = insertAccount('valuation', 'investment')
    expect(() => insertTransaction(account)).toThrow(/valuation_account_has_no_transactions/)
  })
})

describe('audit et contrôles de cohérence', () => {
  beforeEach(() => {
    migrate(db)
  })

  it('le journal d’audit est en ajout seul', () => {
    const id = recordAudit(db, {
      entity: 'account',
      entityId: uuidv7(),
      action: 'create',
      origin: 'user',
      after: { name: 'Compte courant' },
    })
    expect(listAudit(db)).toMatchObject([
      { id, action: 'create', after: { name: 'Compte courant' } },
    ])
    expect(() => db.prepare("UPDATE audit_entry SET origin = 'ai'").run()).toThrow(/append_only/)
    expect(() => db.prepare('DELETE FROM audit_entry').run()).toThrow(/append_only/)
  })

  it('signale une transaction dont les ventilations ne font pas le compte', () => {
    const account = insertAccount('manual', 'cash')
    const balanced = insertTransaction(account, { amount: -1000 })
    const unbalanced = insertTransaction(account, { amount: -1000 })
    const addSplit = (transaction: string, amount: number, position: number) =>
      db
        .prepare('INSERT INTO split (id, transaction_id, amount, position) VALUES (?, ?, ?, ?)')
        .run(uuidv7(), transaction, amount, position)
    addSplit(balanced, -600, 0)
    addSplit(balanced, -400, 1)
    addSplit(unbalanced, -600, 0)
    expect(findUnbalancedTransactions(db)).toEqual([
      { id: unbalanced, amount: -1000, splits: -600 },
    ])
  })
})
