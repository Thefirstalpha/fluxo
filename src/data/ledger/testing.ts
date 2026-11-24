/**
 * Outils de test du registre : base chiffrée temporaire au dernier schéma, pack de catégories,
 * horloge fixe. Importé uniquement par les tests.
 */
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LedgerInput, LedgerMethod, LedgerOutput } from '@shared/ledger/api'
import { uuidv7 } from '@shared/uuid'
import { closeDatabase, openEncryptedDatabase, type Db } from '../db/connection'
import { migrate } from '../db/migrations'
import { seedCategoryPack } from './category-seed'
import { Ledger } from './ledger'

export const TEST_NOW = new Date('2026-11-24T10:00:00.000Z')

export interface TestLedger {
  db: Db
  ledger: Ledger
  categories: Map<string, string>
  /** Appel qui échoue si le résultat n'est pas `ok` (raccourci des tests). */
  ok<M extends LedgerMethod>(method: M, input: LedgerInput<M>): LedgerOutput<M>
  close(): void
}

export function openTestLedger(): TestLedger {
  const directory = mkdtempSync(join(tmpdir(), 'fluxo-ledger-'))
  const db = openEncryptedDatabase(join(directory, 'fluxo.db'), randomBytes(32), { create: true })
  migrate(db)
  const categories = db.transaction(() => seedCategoryPack(db, 'fr-FR', TEST_NOW))()
  const ledger = new Ledger(db, () => TEST_NOW)
  return {
    db,
    ledger,
    categories,
    ok(method, input) {
      const result = ledger.run(method, input)
      if (!result.ok) throw new Error(`${method} : ${result.error}`)
      return result.value
    },
    close() {
      closeDatabase(db)
      rmSync(directory, { recursive: true, force: true })
    },
  }
}

export const ACCOUNT_DEFAULTS = {
  institution: null,
  currency: 'EUR',
  openingBalance: 0,
  openingDate: null,
  iban: null,
  color: null,
  icon: null,
} as const

/** Opération importée (lot « démo ») sur un compte à relevé, comme le fera l'import (M3). */
export function insertImported(
  db: Db,
  accountId: string,
  { date, amount, label = 'OPERATION' }: { date: string; amount: number; label?: string },
): string {
  let batch = db
    .prepare("SELECT id FROM import_batch WHERE account_id = ? AND format = 'demo'")
    .pluck()
    .get(accountId) as string | undefined
  const stamp = TEST_NOW.toISOString()
  if (!batch) {
    batch = uuidv7()
    db.prepare(
      `INSERT INTO import_batch (id, account_id, file_name, file_hash, format, state, created_at)
       VALUES (?, ?, 'test', ?, 'demo', 'committed', ?)`,
    ).run(batch, accountId, '0'.repeat(64), stamp)
  }
  const id = uuidv7()
  db.prepare(
    `INSERT INTO transactions (id, account_id, booking_date, amount, currency, label_raw,
       import_batch_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'EUR', ?, ?, ?, ?)`,
  ).run(id, accountId, date, amount, label, batch, stamp, stamp)
  return id
}
