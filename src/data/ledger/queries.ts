import {
  UNCATEGORIZED,
  type Split,
  type TransactionDetail,
  type TransactionFilter,
  type TransactionPage,
  type TransactionRow,
  type TransactionSort,
  type TransactionSummary,
} from '@shared/ledger/model'
import type { SuggestionSource } from '@shared/categorization/model'
import type { ParsedLedgerInputs } from '@shared/ledger/schemas'
import { parseAmount } from '@shared/money'
import type { Db } from '../db/connection'
import { fail } from './failure'

type Params = Record<string, string | number | null>

/** Requête FTS5 sûre : chaque mot devient un terme entre guillemets, en préfixe, tous requis. */
export function ftsQuery(search: string): string | null {
  const words = search.match(/[\p{L}\p{N}]+/gu) ?? []
  if (words.length === 0) return null
  return words
    .slice(0, 12)
    .map((word) => `"${word}"*`)
    .join(' ')
}

/** Un texte qui est un montant (« 45,90 », « -12 ») cherche aussi les opérations de ce montant. */
function searchedAmount(search: string): number | null {
  if (!/\d/.test(search) || /[\p{L}]{2,}/u.test(search)) return null
  const amount = parseAmount(search)
  return amount === null ? null : Math.abs(amount)
}

/**
 * Clause WHERE d'un filtre (alias `t` pour `transactions`), paramètres nommés.
 * `+t.id IN (…)` : le `+` empêche SQLite de partir de la sous-requête (des milliers de
 * recherches par identifiant, puis un tri) ; il parcourt l'index de tri (date, montant) et teste
 * l'appartenance à l'ensemble — 3 ms au lieu de 100 ms à 50 000 opérations. La recherche plein
 * texte, très sélective, garde la forme sans `+`.
 */
export function filterClause(
  db: Db,
  filter: TransactionFilter,
  /** `sorted` : liste triée (le `+` s'applique) ; `aggregate` : synthèse sans tri (sans `+`). */
  purpose: 'sorted' | 'aggregate' = 'sorted',
): { sql: string; params: Params } {
  const member = purpose === 'sorted' ? '+t.id' : 't.id'
  const clauses: string[] = []
  const params: Params = {}
  const list = (prefix: string, values: readonly (string | number)[]) =>
    values
      .map((value, index) => {
        params[`${prefix}${index}`] = value
        return `@${prefix}${index}`
      })
      .join(', ')

  if (filter.accountIds?.length) clauses.push(`t.account_id IN (${list('a', filter.accountIds)})`)
  if (filter.from) {
    clauses.push('t.booking_date >= @from')
    params.from = filter.from
  }
  if (filter.to) {
    clauses.push('t.booking_date <= @to')
    params.to = filter.to
  }
  const search = filter.search?.trim()
  if (search) {
    const fts = ftsQuery(search)
    const amount = searchedAmount(search)
    const parts: string[] = []
    if (fts) {
      params.fts = fts
      parts.push(`t.id IN (SELECT k.transaction_id FROM transactions_fts f
        JOIN transaction_search_key k ON k.search_id = f.rowid WHERE transactions_fts MATCH @fts)`)
    }
    if (amount !== null) {
      params.searchAmount = amount
      parts.push('abs(t.amount) = @searchAmount')
    }
    clauses.push(parts.length ? `(${parts.join(' OR ')})` : '0')
  }
  if (filter.categoryIds?.length) {
    const ids = filter.categoryIds.filter((id) => id !== UNCATEGORIZED)
    const parts: string[] = []
    if (ids.length) {
      // Une catégorie parente inclut ses sous-catégories.
      const expanded = db
        .prepare(
          `SELECT id FROM category WHERE id IN (SELECT value FROM json_each(?))
           OR parent_id IN (SELECT value FROM json_each(?))`,
        )
        .pluck()
        .all(JSON.stringify(ids), JSON.stringify(ids)) as string[]
      parts.push(
        `${member} IN (SELECT s.transaction_id FROM split s WHERE s.category_id IN (${list('c', expanded.length ? expanded : [''])}))`,
      )
    }
    if (filter.categoryIds.includes(UNCATEGORIZED)) {
      parts.push(`(${member} NOT IN (SELECT s.transaction_id FROM split s)
        OR ${member} IN (SELECT s.transaction_id FROM split s WHERE s.category_id IS NULL))`)
    }
    clauses.push(`(${parts.join(' OR ')})`)
  }
  filter.tagIds?.forEach((tagId, index) => {
    params[`tag${index}`] = tagId
    clauses.push(`${member} IN (SELECT s.transaction_id FROM split_tag st
      JOIN split s ON s.id = st.split_id WHERE st.tag_id = @tag${index})`)
  })
  if (filter.minAmount !== undefined) {
    clauses.push('abs(t.amount) >= @minAmount')
    params.minAmount = filter.minAmount
  }
  if (filter.maxAmount !== undefined) {
    clauses.push('abs(t.amount) <= @maxAmount')
    params.maxAmount = filter.maxAmount
  }
  if (filter.direction) clauses.push(filter.direction === 'in' ? 't.amount > 0' : 't.amount < 0')
  if (filter.statuses?.length) clauses.push(`t.status IN (${list('st', filter.statuses)})`)
  if (filter.favorite !== undefined) clauses.push(`t.favorite = ${filter.favorite ? 1 : 0}`)
  return { sql: clauses.length ? clauses.join(' AND ') : '1', params }
}

const ORDER: Readonly<Record<TransactionSort, { column: string; direction: 'ASC' | 'DESC' }>> = {
  'date-desc': { column: 't.booking_date', direction: 'DESC' },
  'date-asc': { column: 't.booking_date', direction: 'ASC' },
  'amount-desc': { column: 't.amount', direction: 'DESC' },
  'amount-asc': { column: 't.amount', direction: 'ASC' },
}

interface ListRow {
  id: string
  account_id: string
  booking_date: string
  value_date: string | null
  amount: number
  currency: string
  converted_amount: number | null
  label_raw: string
  label: string | null
  payee: string | null
  status: TransactionRow['status']
  nature: TransactionRow['nature']
  note: string | null
  favorite: 0 | 1
  import_batch_id: string | null
  transfer_id: string | null
  transfer_account_id: string | null
}

const SELECT_ROWS = `SELECT t.id, t.account_id, t.booking_date, t.value_date, t.amount, t.currency,
    t.converted_amount, t.label_raw, t.label, p.name AS payee, t.status, t.nature, t.note,
    t.favorite, t.import_batch_id, t.transfer_id, tr.account_id AS transfer_account_id
  FROM transactions t
  LEFT JOIN payee p ON p.id = t.payee_id
  LEFT JOIN transactions tr ON tr.id = t.transfer_id`

/** Curseur `valeur~id` : la page suivante commence strictement après cette ligne. */
function parseCursor(
  sort: TransactionSort,
  cursor: string,
): { value: string | number; id: string } {
  const separator = cursor.lastIndexOf('~')
  const value = cursor.slice(0, separator)
  const id = cursor.slice(separator + 1)
  if (separator < 0 || !/^[0-9a-f-]{36}$/.test(id)) fail('invalid')
  if (sort.startsWith('date')) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('invalid')
    return { value, id }
  }
  if (!/^-?\d+$/.test(value)) fail('invalid')
  return { value: Number(value), id }
}

export function listTransactions(
  db: Db,
  { filter, sort = 'date-desc', cursor, limit = 200 }: ParsedLedgerInputs['transactionsList'],
): TransactionPage {
  const where = filterClause(db, filter)
  const order = ORDER[sort]
  const comparison = order.direction === 'DESC' ? '<' : '>'
  let cursorSql = ''
  if (cursor) {
    const { value, id } = parseCursor(sort, cursor)
    where.params.cursorValue = value
    where.params.cursorId = id
    cursorSql = ` AND (${order.column} ${comparison} @cursorValue OR (${order.column} = @cursorValue AND t.id ${comparison} @cursorId))`
  }
  where.params.limit = limit + 1
  const rows = db
    .prepare(
      `${SELECT_ROWS} WHERE ${where.sql}${cursorSql}
       ORDER BY ${order.column} ${order.direction}, t.id ${order.direction} LIMIT @limit`,
    )
    .all(where.params) as ListRow[]
  const page = rows.slice(0, limit)
  const last = page.at(-1)
  const nextCursor =
    rows.length > limit && last
      ? `${sort.startsWith('date') ? last.booking_date : last.amount}~${last.id}`
      : null
  return { rows: withSplits(db, page), nextCursor }
}

/** Catégories et étiquettes des lignes d'une page, en deux requêtes (pas une par ligne). */
function withSplits(db: Db, rows: readonly ListRow[]): TransactionRow[] {
  const ids = JSON.stringify(rows.map((row) => row.id))
  const splits = db
    .prepare(
      `SELECT transaction_id, category_id FROM split
       WHERE transaction_id IN (SELECT value FROM json_each(?)) ORDER BY transaction_id, position`,
    )
    .all(ids) as { transaction_id: string; category_id: string | null }[]
  const tags = db
    .prepare(
      `SELECT DISTINCT s.transaction_id, st.tag_id FROM split s JOIN split_tag st ON st.split_id = s.id
       WHERE s.transaction_id IN (SELECT value FROM json_each(?)) ORDER BY st.tag_id`,
    )
    .all(ids) as { transaction_id: string; tag_id: string }[]
  const categoriesOf = new Map<string, (string | null)[]>()
  for (const split of splits) {
    const list = categoriesOf.get(split.transaction_id) ?? []
    list.push(split.category_id)
    categoriesOf.set(split.transaction_id, list)
  }
  const tagsOf = new Map<string, string[]>()
  for (const tag of tags) {
    const list = tagsOf.get(tag.transaction_id) ?? []
    list.push(tag.tag_id)
    tagsOf.set(tag.transaction_id, list)
  }
  return rows.map((row) => {
    const categoryIds = categoriesOf.get(row.id) ?? []
    return {
      id: row.id,
      accountId: row.account_id,
      bookingDate: row.booking_date,
      valueDate: row.value_date,
      amount: row.amount,
      currency: row.currency,
      convertedAmount: row.converted_amount,
      label: row.label ?? row.label_raw,
      labelRaw: row.label_raw,
      customLabel: row.label,
      payee: row.payee,
      status: row.status,
      nature: row.nature,
      note: row.note,
      favorite: row.favorite === 1,
      imported: row.import_batch_id !== null,
      transferId: row.transfer_id,
      transferAccountId: row.transfer_account_id,
      categoryIds,
      tagIds: tagsOf.get(row.id) ?? [],
      splitCount: categoryIds.length,
    }
  })
}

export function summarizeTransactions(
  db: Db,
  { filter }: ParsedLedgerInputs['transactionsSummary'],
): TransactionSummary {
  const where = filterClause(db, filter, 'aggregate')
  const row = db
    .prepare(
      `SELECT count(*) AS count, coalesce(sum(t.amount), 0) AS total,
         coalesce(sum(CASE WHEN t.amount > 0 THEN t.amount END), 0) AS inflow,
         coalesce(sum(CASE WHEN t.amount < 0 THEN t.amount END), 0) AS outflow,
         group_concat(DISTINCT t.currency) AS currencies
       FROM transactions t WHERE ${where.sql}`,
    )
    .get(where.params) as {
    count: number
    total: number
    inflow: number
    outflow: number
    currencies: string | null
  }
  return {
    count: row.count,
    total: row.total,
    inflow: row.inflow,
    outflow: row.outflow,
    currencies: row.currencies ? row.currencies.split(',').sort() : [],
  }
}

export function getTransactionDetail(
  db: Db,
  { id }: ParsedLedgerInputs['transactionGet'],
): TransactionDetail {
  const row = db.prepare(`${SELECT_ROWS} WHERE t.id = ?`).get(id) as ListRow | undefined
  if (!row) fail('not-found')
  const [base] = withSplits(db, [row])
  if (!base) fail('not-found')
  const splits = db
    .prepare(
      'SELECT id, category_id, amount, note FROM split WHERE transaction_id = ? ORDER BY position',
    )
    .all(id) as { id: string; category_id: string | null; amount: number; note: string | null }[]
  const tagsOf = db
    .prepare('SELECT tag_id FROM split_tag WHERE split_id = ? ORDER BY tag_id')
    .pluck()
  const detail: Split[] = splits.map((split) => ({
    id: split.id,
    categoryId: split.category_id,
    amount: split.amount,
    note: split.note,
    tagIds: tagsOf.all(split.id) as string[],
  }))
  const explanation = db
    .prepare(
      'SELECT source, confidence, reason FROM categorization_suggestion WHERE transaction_id = ?',
    )
    .get(id) as { source: SuggestionSource; confidence: number; reason: string } | undefined
  return { ...base, splits: detail, categorizationExplanation: explanation ?? null }
}
