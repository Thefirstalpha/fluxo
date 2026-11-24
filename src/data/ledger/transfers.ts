import { SAVINGS_ACCOUNT_TYPES, type CategoryKind } from '@shared/ledger/model'
import type { ParsedLedgerInputs } from '@shared/ledger/schemas'
import { uuidv7 } from '@shared/uuid'
import type { Db } from '../db/connection'
import { getAccount } from './accounts'
import type { ChangeSet } from './changes'
import { fail } from './failure'
import { readSplits, writeSplits } from './splits'
import { getTransaction, requireManual, type TransactionDbRow } from './transactions'

/**
 * Virements internes : deux opérations liées (`transfer_id` réciproque) de montants opposés,
 * sur deux comptes distincts de même devise. Ils sont classés dans une catégorie de type
 * **épargne** si l'un des comptes est un compte d'épargne ou de placement (et pas l'autre),
 * sinon **virement** (neutre) : ni dépense, ni revenu.
 */
export function transferKind(db: Db, accountA: string, accountB: string): CategoryKind {
  const savings = (id: string) => SAVINGS_ACCOUNT_TYPES.includes(getAccount(db, id).type)
  return savings(accountA) !== savings(accountB) ? 'savings' : 'transfer'
}

/** Première catégorie active de premier niveau du type voulu (pack : « Épargne », « Virements internes »). */
function categoryOfKind(db: Db, kind: CategoryKind): string | null {
  const id = db
    .prepare(
      `SELECT id FROM category WHERE kind = ? AND parent_id IS NULL AND archived = 0
       ORDER BY sort_order, name LIMIT 1`,
    )
    .pluck()
    .get(kind) as string | undefined
  return id ?? null
}

/** Classe une opération de virement, sauf si elle est déjà ventilée sur plusieurs parts. */
function classify(
  changes: ChangeSet,
  transaction: TransactionDbRow,
  categoryId: string | null,
): void {
  if (categoryId === null) return
  const splits = readSplits(changes.db, transaction.id)
  if (splits.length > 1) return
  const base = splits[0] ?? { categoryId: null, note: null, tagIds: [] }
  writeSplits(changes, transaction.id, transaction.amount, [
    { ...base, categoryId, amount: transaction.amount },
  ])
}

function link(changes: ChangeSet, a: TransactionDbRow, b: TransactionDbRow, now: Date): void {
  if (a.id === b.id || a.account_id === b.account_id) fail('invalid')
  if (a.transfer_id !== null || b.transfer_id !== null) fail('invalid')
  if (a.currency !== b.currency) fail('currency-mismatch')
  if (a.amount + b.amount !== 0 || a.amount === 0) fail('invalid')
  const stamp = now.toISOString()
  changes.update('transactions', { id: a.id }, { transfer_id: b.id, updated_at: stamp })
  changes.update('transactions', { id: b.id }, { transfer_id: a.id, updated_at: stamp })
  const category = categoryOfKind(changes.db, transferKind(changes.db, a.account_id, b.account_id))
  classify(changes, getTransaction(changes.db, a.id), category)
  classify(changes, getTransaction(changes.db, b.id), category)
}

function insertOperation(
  changes: ChangeSet,
  fields: { accountId: string; date: string; amount: number; label: string; currency: string },
  now: Date,
): TransactionDbRow {
  const id = uuidv7()
  const stamp = now.toISOString()
  changes.insert('transactions', {
    id,
    account_id: fields.accountId,
    booking_date: fields.date,
    amount: fields.amount,
    currency: fields.currency,
    label_raw: fields.label,
    status: 'cleared',
    created_at: stamp,
    updated_at: stamp,
  })
  return getTransaction(changes.db, id)
}

/** Virement entre deux comptes en saisie manuelle (ex. espèces → titres-restaurant). */
export function createTransfer(
  changes: ChangeSet,
  input: ParsedLedgerInputs['transferCreate'],
  now: Date,
): { fromId: string; toId: string } {
  const from = getAccount(changes.db, input.fromAccountId)
  const to = getAccount(changes.db, input.toAccountId)
  requireManual(from.tracking_mode)
  requireManual(to.tracking_mode)
  if (from.id === to.id) fail('invalid')
  if (from.currency !== to.currency) fail('currency-mismatch')
  const common = { date: input.bookingDate, label: input.label, currency: from.currency }
  const out = insertOperation(
    changes,
    { ...common, accountId: from.id, amount: -input.amount },
    now,
  )
  const into = insertOperation(changes, { ...common, accountId: to.id, amount: input.amount }, now)
  link(changes, out, into, now)
  return { fromId: out.id, toId: into.id }
}

/**
 * Contrepartie d'une opération sur un compte en saisie manuelle : un retrait au distributeur
 * importé du compte courant crée l'entrée d'espèces correspondante, liée.
 */
export function createCounterpart(
  changes: ChangeSet,
  { transactionId, accountId }: ParsedLedgerInputs['transferCounterpart'],
  now: Date,
): { id: string } {
  const source = getTransaction(changes.db, transactionId)
  const target = getAccount(changes.db, accountId)
  requireManual(target.tracking_mode)
  if (target.currency !== source.currency) fail('currency-mismatch')
  if (source.transfer_id !== null || target.id === source.account_id) fail('invalid')
  const created = insertOperation(
    changes,
    {
      accountId: target.id,
      date: source.booking_date,
      amount: -source.amount,
      label: source.label ?? source.label_raw,
      currency: target.currency,
    },
    now,
  )
  link(changes, source, created, now)
  return { id: created.id }
}

/** Relie deux opérations existantes (ex. sortie du compte courant et entrée sur le livret). */
export function linkTransfer(
  changes: ChangeSet,
  { ids: [first, second] }: ParsedLedgerInputs['transferLink'],
  now: Date,
): null {
  link(changes, getTransaction(changes.db, first), getTransaction(changes.db, second), now)
  return null
}

/** Défait un virement : les deux opérations restent, non liées (leur catégorie est conservée). */
export function unlinkTransfer(
  changes: ChangeSet,
  { id }: ParsedLedgerInputs['transferUnlink'],
  now: Date,
): null {
  const transaction = getTransaction(changes.db, id)
  if (transaction.transfer_id === null) return null
  const stamp = now.toISOString()
  changes.update(
    'transactions',
    { id: transaction.transfer_id },
    { transfer_id: null, updated_at: stamp },
  )
  changes.update('transactions', { id }, { transfer_id: null, updated_at: stamp })
  return null
}
