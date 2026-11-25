import { maskIban } from '@shared/ledger/iban'
import {
  allowedTrackingModes,
  type AccountSummary,
  type AccountType,
  type LedgerIcon,
  type PaletteColor,
  type TrackingMode,
} from '@shared/ledger/model'
import type { ParsedLedgerInputs } from '@shared/ledger/schemas'
import { uuidv7 } from '@shared/uuid'
import type { Db } from '../db/connection'
import {
  cleanupLinkedCategoryOnAccountDelete,
  ensureAccountLinkedCategory,
  syncLinkedCategoryOnAccountArchive,
  syncLinkedCategoryOnAccountChange,
} from './categories'
import type { ChangeSet } from './changes'
import { fail } from './failure'

interface AccountRow {
  id: string
  name: string
  type: AccountType
  tracking_mode: TrackingMode
  institution: string | null
  currency: string
  opening_balance: number
  opening_date: string | null
  iban: string | null
  color: PaletteColor | null
  icon: LedgerIcon | null
  archived: 0 | 1
  sort_order: number
}

interface AccountListRow extends AccountRow {
  total: number
  reconciled: number
  transaction_count: number
  last_date: string | null
  latest_valuation: number | null
  loan_remaining: number | null
}

/**
 * Comptes et soldes à date. Solde = solde d'ouverture + Σ opérations jusqu'à la date ;
 * part rapprochée = solde d'ouverture + Σ opérations « rapprochées ». Un compte en
 * valorisation manuelle reflète sa dernière entrée `valuation_entry` (ou `-remaining_principal_cents`
 * s'il est associé à un crédit M8), à défaut son solde d'ouverture.
 */
export function listAccounts(
  db: Db,
  { includeArchived = false, asOf }: ParsedLedgerInputs['accountsList'],
): AccountSummary[] {
  const rows = db
    .prepare(
      `SELECT a.id, a.name, a.type, a.tracking_mode, a.institution, a.currency, a.opening_balance,
         a.opening_date, a.iban, a.color, a.icon, a.archived, a.sort_order,
         coalesce(t.total, 0) AS total, coalesce(t.reconciled, 0) AS reconciled,
         coalesce(t.count, 0) AS transaction_count, t.last_date,
         val.value_cents AS latest_valuation,
         l.remaining_principal_cents AS loan_remaining
       FROM account a
       LEFT JOIN (
         SELECT account_id, sum(amount) AS total, count(*) AS count, max(booking_date) AS last_date,
           sum(CASE WHEN status = 'reconciled' THEN amount ELSE 0 END) AS reconciled
         FROM transactions WHERE @asOf IS NULL OR booking_date <= @asOf
         GROUP BY account_id
       ) t ON t.account_id = a.id
       LEFT JOIN (
         SELECT v1.account_id, v1.value_cents
         FROM valuation_entry v1
         WHERE (@asOf IS NULL OR v1.valuation_date <= @asOf)
           AND v1.rowid = (
             SELECT v2.rowid FROM valuation_entry v2
             WHERE v2.account_id = v1.account_id AND (@asOf IS NULL OR v2.valuation_date <= @asOf)
             ORDER BY v2.valuation_date DESC, v2.created_at DESC, v2.rowid DESC
             LIMIT 1
           )
       ) val ON val.account_id = a.id
       LEFT JOIN loan l ON l.account_id = a.id AND l.status != 'archived'
       WHERE @all = 1 OR a.archived = 0
       ORDER BY a.archived, a.sort_order, a.name COLLATE NOCASE`,
    )
    .all({ asOf: asOf ?? null, all: includeArchived ? 1 : 0 }) as AccountListRow[]
  return rows.map((row) => {
    const valuationBalance =
      row.type === 'loan' && row.loan_remaining !== null
        ? -row.loan_remaining
        : row.latest_valuation !== null
          ? row.latest_valuation
          : row.opening_balance
    const balance =
      row.tracking_mode === 'valuation' ? valuationBalance : row.opening_balance + row.total
    const reconciledBalance =
      row.tracking_mode === 'valuation' ? valuationBalance : row.opening_balance + row.reconciled
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      trackingMode: row.tracking_mode,
      institution: row.institution,
      currency: row.currency,
      openingBalance: row.opening_balance,
      openingDate: row.opening_date,
      ibanMasked: row.iban ? maskIban(row.iban) : null,
      color: row.color,
      icon: row.icon,
      archived: row.archived === 1,
      sortOrder: row.sort_order,
      balance,
      reconciledBalance,
      transactionCount: row.transaction_count,
      lastTransactionDate: row.last_date,
    }
  })
}

export function getAccount(db: Db, id: string): AccountRow {
  const row = db.prepare('SELECT * FROM account WHERE id = ?').get(id) as AccountRow | undefined
  return row ?? fail('not-found')
}

function hasTransactions(db: Db, id: string): boolean {
  return db.prepare('SELECT 1 FROM transactions WHERE account_id = ? LIMIT 1').get(id) !== undefined
}

function checkTrackingMode(type: AccountType, mode: TrackingMode): void {
  if (!allowedTrackingModes(type).includes(mode)) fail('invalid')
}

export function createAccount(
  changes: ChangeSet,
  draft: ParsedLedgerInputs['accountCreate'],
  now: Date,
): { id: string } {
  checkTrackingMode(draft.type, draft.trackingMode)
  const stamp = now.toISOString()
  const last = changes.db.prepare('SELECT max(sort_order) FROM account').pluck().get() as
    number | null
  const id = uuidv7()
  changes.insert('account', {
    id,
    name: draft.name,
    type: draft.type,
    tracking_mode: draft.trackingMode,
    institution: draft.institution,
    currency: draft.currency,
    opening_balance: draft.openingBalance,
    opening_date: draft.openingDate,
    iban: draft.iban,
    color: draft.color,
    icon: draft.icon,
    sort_order: (last ?? -1) + 1,
    created_at: stamp,
    updated_at: stamp,
  })
  ensureAccountLinkedCategory(changes, { id, name: draft.name, type: draft.type, archived: 0 }, now)
  return { id }
}

export function updateAccount(
  changes: ChangeSet,
  { id, patch }: ParsedLedgerInputs['accountUpdate'],
  now: Date,
): null {
  const current = getAccount(changes.db, id)
  const type = patch.type ?? current.type
  const trackingMode = patch.trackingMode ?? current.tracking_mode
  checkTrackingMode(type, trackingMode)
  const used = hasTransactions(changes.db, id)
  // ADR-026 : le mode de suivi d'un compte ne change plus une fois des opérations enregistrées
  // (aussi garanti par un trigger) ; ses opérations sont dans sa devise.
  if (used && trackingMode !== current.tracking_mode) fail('tracking-mode-locked')
  if (used && patch.currency !== undefined && patch.currency !== current.currency) {
    fail('currency-mismatch')
  }
  const row: Record<string, string | number | null> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.type !== undefined) row.type = patch.type
  if (patch.trackingMode !== undefined) row.tracking_mode = patch.trackingMode
  if (patch.institution !== undefined) row.institution = patch.institution
  if (patch.currency !== undefined) row.currency = patch.currency
  if (patch.openingBalance !== undefined) row.opening_balance = patch.openingBalance
  if (patch.openingDate !== undefined) row.opening_date = patch.openingDate
  if (patch.iban !== undefined) row.iban = patch.iban
  if (patch.color !== undefined) row.color = patch.color
  if (patch.icon !== undefined) row.icon = patch.icon
  const stored = current as unknown as Record<string, unknown>
  if (Object.keys(row).every((column) => row[column] === stored[column])) return null
  changes.update('account', { id }, { ...row, updated_at: now.toISOString() })
  syncLinkedCategoryOnAccountChange(
    changes,
    { id: current.id, name: current.name, type: current.type, archived: current.archived },
    {
      id: current.id,
      name: patch.name ?? current.name,
      type,
      archived: current.archived,
    },
    now,
  )
  return null
}

export function setAccountArchived(
  changes: ChangeSet,
  { id, archived }: ParsedLedgerInputs['accountSetArchived'],
  now: Date,
): null {
  getAccount(changes.db, id)
  changes.update('account', { id }, { archived: archived ? 1 : 0, updated_at: now.toISOString() })
  syncLinkedCategoryOnAccountArchive(changes, id, archived, now)
  return null
}

/** Suppression réservée à un compte vide (sinon : archivage). */
export function deleteAccount(
  changes: ChangeSet,
  { id }: ParsedLedgerInputs['accountDelete'],
  now: Date,
): null {
  getAccount(changes.db, id)
  const batches = changes.db.prepare('SELECT 1 FROM import_batch WHERE account_id = ? LIMIT 1')
  if (hasTransactions(changes.db, id) || batches.get(id) !== undefined) fail('account-not-empty')
  cleanupLinkedCategoryOnAccountDelete(changes, id, now)
  changes.delete('account', { id })
  return null
}

export function revealIban(db: Db, { id }: ParsedLedgerInputs['accountRevealIban']): string | null {
  return getAccount(db, id).iban
}

export function reorderAccounts(
  changes: ChangeSet,
  { ids }: ParsedLedgerInputs['accountsReorder'],
): null {
  if (new Set(ids).size !== ids.length) fail('invalid')
  ids.forEach((id, index) => {
    getAccount(changes.db, id)
    changes.update('account', { id }, { sort_order: index })
  })
  return null
}
