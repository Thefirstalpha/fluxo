import type { SplitInput, TrackingMode, TransactionStatus } from '@shared/ledger/model'
import type { ParsedLedgerInputs } from '@shared/ledger/schemas'
import { uuidv7 } from '@shared/uuid'
import type { Db } from '../db/connection'
import { getAccount } from './accounts'
import type { ChangeSet, Row } from './changes'
import { fail } from './failure'
import { sameName } from './names'
import { readSplits, writeSplits } from './splits'

export interface TransactionDbRow {
  id: string
  account_id: string
  booking_date: string
  value_date: string | null
  amount: number
  currency: string
  converted_amount: number | null
  label_raw: string
  label: string | null
  payee_id: string | null
  status: TransactionStatus
  nature: 'operation' | 'adjustment'
  note: string | null
  favorite: 0 | 1
  import_batch_id: string | null
  transfer_id: string | null
}

export function getTransaction(db: Db, id: string): TransactionDbRow {
  const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as
    TransactionDbRow | undefined
  return row ?? fail('not-found')
}

/** ADR-026 : on ne saisit, ne modifie (montant, date, compte) et ne supprime que sur un compte manuel. */
export function requireManual(mode: TrackingMode): void {
  if (mode === 'statement') fail('statement-account')
  if (mode === 'valuation') fail('valuation-account')
}

/** Opération modifiable dans sa substance : saisie (pas importée) sur un compte manuel. */
export function isEditable(db: Db, transaction: TransactionDbRow): boolean {
  return (
    transaction.import_batch_id === null &&
    getAccount(db, transaction.account_id).tracking_mode === 'manual'
  )
}

/** Tiers par son nom (sans distinction de casse), créé au besoin. */
export function resolvePayee(changes: ChangeSet, name: string | null, now: Date): string | null {
  if (name === null) return null
  const payees = changes.db.prepare('SELECT id, name FROM payee ORDER BY id').all() as {
    id: string
    name: string
  }[]
  const existing = payees.find((payee) => sameName(payee.name, name))
  if (existing) return existing.id
  const id = uuidv7()
  const stamp = now.toISOString()
  changes.insert('payee', { id, name, created_at: stamp, updated_at: stamp })
  return id
}

export function createTransaction(
  changes: ChangeSet,
  input: ParsedLedgerInputs['transactionCreate'],
  now: Date,
): { id: string } {
  const account = getAccount(changes.db, input.accountId)
  requireManual(account.tracking_mode)
  if (account.archived === 1) fail('invalid')
  const id = uuidv7()
  const stamp = now.toISOString()
  changes.insert('transactions', {
    id,
    account_id: account.id,
    booking_date: input.bookingDate,
    value_date: input.valueDate,
    amount: input.amount,
    currency: account.currency,
    converted_amount: input.convertedAmount,
    label_raw: input.label,
    label: null,
    payee_id: resolvePayee(changes, input.payee, now),
    status: input.status,
    note: input.note,
    created_at: stamp,
    updated_at: stamp,
  })
  if (input.splits) writeSplits(changes, id, input.amount, input.splits)
  return { id }
}

export function updateTransaction(
  changes: ChangeSet,
  { id, patch }: ParsedLedgerInputs['transactionUpdate'],
  now: Date,
  /** Faux pour la contrepartie d'un virement (qui ne doit pas répercuter à son tour). */
  followTransfer = true,
): null {
  const db = changes.db
  const current = getTransaction(db, id)
  const editable = isEditable(db, current)
  const row: Row = {}
  const set = (column: keyof TransactionDbRow, value: string | number | null | undefined) => {
    if (value !== undefined && value !== current[column]) row[column] = value
  }

  // Substance de l'opération : réservée aux opérations saisies (ADR-026).
  set('account_id', patch.accountId)
  set('booking_date', patch.bookingDate)
  set('value_date', patch.valueDate)
  set('amount', patch.amount)
  set('label_raw', patch.labelRaw)
  const substantive = ['account_id', 'booking_date', 'value_date', 'amount', 'label_raw']
  if (!editable && substantive.some((column) => column in row)) fail('statement-account')

  if (row.account_id !== undefined) {
    const target = getAccount(db, String(row.account_id))
    requireManual(target.tracking_mode)
    if (target.currency !== current.currency) fail('currency-mismatch')
    if (current.transfer_id !== null) fail('invalid')
  }

  // Annotations : libres sur toute opération.
  set('label', patch.customLabel)
  set('note', patch.note)
  set('status', patch.status)
  set('converted_amount', patch.convertedAmount)
  if (patch.favorite !== undefined) set('favorite', patch.favorite ? 1 : 0)
  if (patch.payee !== undefined) set('payee_id', resolvePayee(changes, patch.payee, now))
  if (Object.keys(row).length === 0) return null

  const amount = typeof row.amount === 'number' ? row.amount : null
  if (amount !== null) {
    // Une seule part suit le nouveau montant ; une ventilation multiple doit être refaite.
    const splits = readSplits(db, id)
    if (splits.length > 1) fail('unbalanced-splits')
    const [only] = splits
    if (only) writeSplits(changes, id, amount, [{ ...only, amount }])
    // Virement : la contrepartie suit, si elle est elle-même modifiable.
    if (current.transfer_id !== null && followTransfer) {
      const counterpart = getTransaction(db, current.transfer_id)
      if (!isEditable(db, counterpart)) fail('statement-account')
      updateTransaction(changes, { id: counterpart.id, patch: { amount: -amount } }, now, false)
    }
  }
  changes.update('transactions', { id }, { ...row, updated_at: now.toISOString() })
  return null
}

/** Supprime des opérations saisies (jamais une opération importée), ventilations comprises. */
export function deleteTransactions(
  changes: ChangeSet,
  { ids }: ParsedLedgerInputs['transactionsDelete'],
  now: Date,
): { count: number } {
  const db = changes.db
  const unique = [...new Set(ids)]
  const rows = unique.map((id) => getTransaction(db, id))
  for (const row of rows) if (!isEditable(db, row)) fail('statement-account')
  const deleting = new Set(unique)
  // Liens de virement défaits AVANT toute suppression (sinon la clé étrangère les effacerait
  // sans trace et l'annulation ne les restaurerait pas). La contrepartie reste, déliée.
  for (const row of rows) {
    if (row.transfer_id === null) continue
    changes.update('transactions', { id: row.id }, { transfer_id: null })
    if (!deleting.has(row.transfer_id)) {
      changes.update(
        'transactions',
        { id: row.transfer_id },
        { transfer_id: null, updated_at: now.toISOString() },
      )
    }
  }
  for (const row of rows) {
    writeSplits(changes, row.id, row.amount, [])
    changes.delete('transactions', { id: row.id })
  }
  return { count: rows.length }
}

export function setSplits(
  changes: ChangeSet,
  { id, splits }: ParsedLedgerInputs['transactionSetSplits'],
  now: Date,
): null {
  const current = getTransaction(changes.db, id)
  const before = changes.changes.length
  writeSplits(changes, id, current.amount, splits)
  if (changes.changes.length > before) touch(changes, id, now)
  return null
}

function touch(changes: ChangeSet, id: string, now: Date): void {
  changes.update('transactions', { id }, { updated_at: now.toISOString() })
}

/**
 * Catégorise en masse. Une opération ventilée sur plusieurs parts est laissée telle quelle
 * (on ne détruit pas une ventilation par une action en masse) ; sa note et ses étiquettes
 * sont conservées sinon.
 */
export function categorizeTransactions(
  changes: ChangeSet,
  { ids, categoryId }: ParsedLedgerInputs['transactionsCategorize'],
  now: Date,
): { updated: number; skipped: number } {
  let updated = 0
  let skipped = 0
  for (const id of new Set(ids)) {
    const current = getTransaction(changes.db, id)
    const splits = readSplits(changes.db, id)
    if (splits.length > 1) {
      skipped += 1
      continue
    }
    const base: SplitInput = splits[0] ?? { categoryId: null, amount: 0, note: null, tagIds: [] }
    const before = changes.changes.length
    writeSplits(changes, id, current.amount, [{ ...base, categoryId, amount: current.amount }])
    if (changes.changes.length > before) {
      touch(changes, id, now)
      updated += 1
    }
  }
  return { updated, skipped }
}

/** Pose ou retire des étiquettes sur toutes les parts des opérations données. */
export function tagTransactions(
  changes: ChangeSet,
  { ids, add, remove }: ParsedLedgerInputs['transactionsTag'],
  now: Date,
): { updated: number } {
  const removed = new Set(remove)
  let updated = 0
  for (const id of new Set(ids)) {
    const current = getTransaction(changes.db, id)
    const splits = readSplits(changes.db, id)
    const parts: SplitInput[] = splits.length
      ? splits
      : [{ categoryId: null, amount: current.amount, note: null, tagIds: [] }]
    const next = parts.map((split) => ({
      ...split,
      tagIds: [...new Set([...split.tagIds.filter((tag) => !removed.has(tag)), ...add])],
    }))
    const before = changes.changes.length
    writeSplits(changes, id, current.amount, next)
    if (changes.changes.length > before) {
      touch(changes, id, now)
      updated += 1
    }
  }
  return { updated }
}

export function setStatus(
  changes: ChangeSet,
  { ids, status }: ParsedLedgerInputs['transactionsSetStatus'],
  now: Date,
): { updated: number } {
  let updated = 0
  for (const id of new Set(ids)) {
    const current = getTransaction(changes.db, id)
    if (current.status === status) continue
    changes.update('transactions', { id }, { status, updated_at: now.toISOString() })
    updated += 1
  }
  return { updated }
}
