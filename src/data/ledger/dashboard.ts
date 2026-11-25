import type {
  CategoryKind,
  DashboardCategoryTotal,
  DashboardMonthSummary,
  DashboardSummary,
  PaletteColor,
} from '@shared/ledger/model'
import type { ParsedLedgerInputs } from '@shared/ledger/schemas'
import { addMonths, monthOf } from '@shared/months'
import type { Db } from '../db/connection'

interface DashboardRow {
  month: string
  tx_amount: number
  currency: string
  converted_amount: number | null
  transfer_id: string | null
  a_is_savings: 0 | 1
  tr_is_savings: 0 | 1
  linked_is_savings: 0 | 1 | null
  split_amount: number | null
  top_id: string | null
  top_name: string | null
  top_color: PaletteColor | null
  kind: CategoryKind | null
}

/**
 * Synthèse mensuelle du tableau de bord calculée depuis la base chiffrée :
 * - exclut les écritures d'ajustement (D11) et les virements internes neutres ;
 * - classe les virements d'épargne à part (`savings`, ADR-026 / C11) ;
 * - regroupe les sous-catégories sous leur catégorie parente de premier niveau ;
 * - tient compte des contre-valeurs (`converted_amount`) pour les comptes en devises étrangères.
 */
export function getDashboardSummary(
  db: Db,
  { currency, months = 18, endMonth }: ParsedLedgerInputs['dashboardSummary'],
  now: Date = new Date(),
): DashboardSummary {
  const hasTransactions =
    (db.prepare('SELECT EXISTS(SELECT 1 FROM transactions)').pluck().get() as number) === 1
  const resolvedEnd = endMonth ?? monthOf(now)
  const startMonth = addMonths(resolvedEnd, -(months - 1))
  const startDate = `${startMonth}-01`
  const endDate = `${resolvedEnd}-31`

  const monthKeys = Array.from({ length: months }, (_, i) => addMonths(startMonth, i))
  const byMonth = new Map<
    string,
    {
      income: number
      expenses: number
      savings: number
      categories: Map<string, DashboardCategoryTotal>
    }
  >()
  for (const month of monthKeys) {
    byMonth.set(month, { income: 0, expenses: 0, savings: 0, categories: new Map() })
  }

  const rows = db
    .prepare(
      `SELECT substr(t.booking_date, 1, 7) AS month,
         t.amount AS tx_amount,
         t.currency AS currency,
         t.converted_amount AS converted_amount,
         t.transfer_id AS transfer_id,
         (a.type IN ('savings', 'investment')) AS a_is_savings,
         (tr.id IS NOT NULL AND tr_acc.type IN ('savings', 'investment')) AS tr_is_savings,
         CASE
           WHEN c.linked_account_id IS NOT NULL AND linked_acc.id IS NOT NULL
             THEN (linked_acc.type IN ('savings', 'investment'))
           ELSE NULL
         END AS linked_is_savings,
         s.amount AS split_amount,
         coalesce(p.id, c.id) AS top_id,
         coalesce(p.name, c.name) AS top_name,
         coalesce(p.color, c.color) AS top_color,
         coalesce(p.kind, c.kind) AS kind
       FROM transactions t
       JOIN account a ON a.id = t.account_id
       LEFT JOIN transactions tr ON tr.id = t.transfer_id
       LEFT JOIN account tr_acc ON tr_acc.id = tr.account_id
       LEFT JOIN split s ON s.transaction_id = t.id
       LEFT JOIN category c ON c.id = s.category_id
       LEFT JOIN category p ON p.id = c.parent_id
       LEFT JOIN account linked_acc ON linked_acc.id = c.linked_account_id
       WHERE t.nature = 'operation'
         AND t.booking_date >= @startDate
         AND t.booking_date <= @endDate`,
    )
    .all({ startDate, endDate }) as DashboardRow[]

  const otherCurrencies = new Set<string>()

  for (const row of rows) {
    const bucket = byMonth.get(row.month)
    if (!bucket) continue

    const partRaw = row.split_amount ?? row.tx_amount
    let effective: number
    if (row.currency === currency) {
      effective = partRaw
    } else if (row.converted_amount !== null) {
      effective =
        row.split_amount === null || row.tx_amount === 0
          ? row.converted_amount
          : Math.round((partRaw * row.converted_amount) / row.tx_amount)
    } else {
      otherCurrencies.add(row.currency)
      continue
    }

    if (effective === 0) continue

    const effectiveKind: CategoryKind | null =
      row.transfer_id !== null
        ? row.kind === 'savings' && !(row.a_is_savings === 1 && row.tr_is_savings === 1)
          ? 'savings'
          : 'transfer'
        : row.linked_is_savings !== null
          ? row.a_is_savings !== row.linked_is_savings
            ? 'savings'
            : 'transfer'
          : row.kind

    if (effectiveKind === 'transfer') {
      continue
    }
    if (effectiveKind === 'savings') {
      const delta =
        row.a_is_savings === 1
          ? effective
          : row.transfer_id !== null && row.tr_is_savings === 1
            ? 0
            : -effective
      bucket.savings += delta
      continue
    }
    if (effectiveKind === 'income' || (effectiveKind === null && effective > 0)) {
      bucket.income += effective
      continue
    }

    // Dépense (catégorie 'expense' ou non catégorisée avec montant négatif).
    const magnitude = -effective
    if (magnitude <= 0) continue
    bucket.expenses += magnitude
    const key = row.top_id ?? '__uncategorized__'
    const current = bucket.categories.get(key)
    if (current) {
      current.amount += magnitude
    } else {
      bucket.categories.set(key, {
        id: row.top_id,
        name: row.top_name,
        color: row.top_color,
        amount: magnitude,
      })
    }
  }

  const summaries: DashboardMonthSummary[] = monthKeys.map((month) => {
    const bucket = byMonth.get(month)!
    return {
      month,
      income: bucket.income,
      expenses: bucket.expenses,
      savings: bucket.savings,
      categories: [...bucket.categories.values()].sort((a, b) => b.amount - a.amount),
    }
  })

  return {
    currency,
    hasTransactions,
    otherCurrencies: [...otherCurrencies].sort(),
    months: summaries,
  }
}
