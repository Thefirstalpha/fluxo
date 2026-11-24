import type { AnalyticsFilter } from '@shared/analytics/model'
import { UNCATEGORIZED, type TransactionFilter } from '@shared/ledger/model'
import type { Db } from '../db/connection'
import { toCsv } from '../export'
import { filterClause } from '../ledger/queries'

export function analyticsFilterToTransactionFilter(filter: AnalyticsFilter): TransactionFilter {
  return {
    ...(filter.from ? { from: filter.from } : {}),
    ...(filter.to ? { to: filter.to } : {}),
    ...(filter.accountIds?.length ? { accountIds: filter.accountIds } : {}),
    ...(filter.categoryIds?.length ? { categoryIds: filter.categoryIds } : {}),
    ...(filter.tagIds?.length ? { tagIds: filter.tagIds } : {}),
    ...(filter.minAmount !== undefined ? { minAmount: filter.minAmount } : {}),
    ...(filter.maxAmount !== undefined ? { maxAmount: filter.maxAmount } : {}),
  }
}

interface ExportRow {
  id: string
  booking_date: string
  account_name: string
  label: string | null
  label_raw: string
  payee: string | null
  amount: number
  currency: string
  status: string
  note: string | null
  categories: string | null
  tags: string | null
}

/**
 * Génère le CSV des opérations correspondant au filtre d'analyse courant (F10).
 * Réutilise `toCsv` (RFC 4180 + neutralisation d'injection de formules).
 */
export function buildFilteredAnalyticsCsv(
  db: Db,
  filter: AnalyticsFilter,
  limit = 50_000,
): { csv: string; rowCount: number } {
  const txFilter = analyticsFilterToTransactionFilter(filter)
  const where = filterClause(db, txFilter, 'sorted')
  const transferGuard = filter.includeTransfers ? '' : 'AND t.transfer_id IS NULL'
  const categoryTransferGuard = filter.includeTransfers
    ? ''
    : `AND NOT EXISTS (SELECT 1 FROM split sx JOIN category cx ON cx.id = sx.category_id WHERE sx.transaction_id = t.id AND cx.kind = 'transfer')`

  const sql = `
    SELECT
      t.id,
      t.booking_date,
      a.name AS account_name,
      t.label,
      t.label_raw,
      p.name AS payee,
      t.amount,
      t.currency,
      t.status,
      t.note,
      (SELECT group_concat(c.name, ' | ')
       FROM split s JOIN category c ON c.id = s.category_id
       WHERE s.transaction_id = t.id) AS categories,
      (SELECT group_concat(name, ' | ')
       FROM (
         SELECT DISTINCT tg.name
         FROM split s JOIN split_tag st ON st.split_id = s.id JOIN tag tg ON tg.id = st.tag_id
         WHERE s.transaction_id = t.id
         ORDER BY tg.name
       )) AS tags
    FROM transactions t
    JOIN account a ON a.id = t.account_id
    LEFT JOIN payee p ON p.id = t.payee_id
    WHERE ${where.sql}
      AND t.nature = 'operation'
      ${transferGuard}
      ${categoryTransferGuard}
    ORDER BY t.booking_date DESC, t.id DESC
    LIMIT @limit
  `

  const rows = db.prepare(sql).all({ ...where.params, limit }) as ExportRow[]

  const formatted = rows.map((row) => ({
    date: row.booking_date,
    account: row.account_name,
    label: row.label ?? row.label_raw,
    rawLabel: row.label_raw,
    payee: row.payee ?? '',
    categories: row.categories ?? UNCATEGORIZED,
    tags: row.tags ?? '',
    amount: Number((row.amount / 100).toFixed(2)),
    currency: row.currency,
    status: row.status,
    note: row.note ?? '',
  }))

  const columns = [
    'date',
    'account',
    'label',
    'rawLabel',
    'payee',
    'categories',
    'tags',
    'amount',
    'currency',
    'status',
    'note',
  ] as const

  return { csv: toCsv(columns, formatted), rowCount: formatted.length }
}
