import type {
  AnalyticsAnomaly,
  AnalyticsCalendarDay,
  AnalyticsCategoryEvolutionSeries,
  AnalyticsCategoryItem,
  AnalyticsFilter,
  AnalyticsHistogramBucket,
  AnalyticsInsight,
  AnalyticsLargestExpense,
  AnalyticsMonthComparison,
  AnalyticsMonthlySynthesis,
  AnalyticsMonthPoint,
  AnalyticsOverview,
  AnalyticsSankeyLink,
  AnalyticsSankeyNode,
} from '@shared/analytics/model'
import { canonicalTransactionLabel, cleanTransactionLabel } from '@shared/categorization/normalize'
import { type CategoryKind, UNCATEGORIZED } from '@shared/ledger/model'
import type { MinorUnits } from '@shared/money'
import { addMonths, monthOf } from '@shared/months'
import type { Db } from '../db/connection'
import { resolvePackCategoryMap } from '../ledger/categorize'
import { filterClause } from '../ledger/queries'
import { ensureFreshMonthlyAggregates, UNCATEGORIZED_AGG_KEY } from './aggregates'
import { detectAnalyticsAnomalies, type AnomalyTxInput } from './anomalies'
import { analyticsFilterToTransactionFilter } from './export-csv'

const SERIES_PALETTE = [
  '#dd2a80',
  '#e5690c',
  '#0e9b8f',
  '#dca81c',
  '#7a40da',
  '#cc272e',
  '#0977cb',
  '#278733',
] as const

const MAX_EVOLUTION_CATEGORIES = 7 // + 1 série « Autres » = 8 max (chart design rule)

const HISTOGRAM_BINS: readonly { key: string; min: MinorUnits; max: MinorUnits | null }[] = [
  { key: 'xs', min: 0, max: 10_00 },
  { key: 'sm', min: 10_00, max: 25_00 },
  { key: 'md', min: 25_00, max: 50_00 },
  { key: 'lg', min: 50_00, max: 100_00 },
  { key: 'xl', min: 100_00, max: 250_00 },
  { key: 'xxl', min: 250_00, max: 500_00 },
  { key: 'max', min: 500_00, max: null },
]

interface CategoryMeta {
  id: string
  parentId: string | null
  name: string
  kind: CategoryKind
  color: string | null
  linkedAccountIsSavings: boolean | null
  key: string | null
}

function loadCategoryMap(db: Db): {
  byId: Map<string, CategoryMeta>
  childrenByParent: Map<string, string[]>
  packMap: Map<string, string>
} {
  const packMap = resolvePackCategoryMap(db)
  const keyById = new Map<string, string>()
  for (const [key, id] of packMap.entries()) keyById.set(id, key)

  const rows = db
    .prepare(
      `SELECT c.id, c.parent_id, c.name, c.kind, c.color,
              CASE
                WHEN c.linked_account_id IS NOT NULL AND a.id IS NOT NULL
                  THEN (a.type IN ('savings', 'investment'))
                ELSE NULL
              END AS linked_is_savings
       FROM category c
       LEFT JOIN account a ON a.id = c.linked_account_id`,
    )
    .all() as {
    id: string
    parent_id: string | null
    name: string
    kind: CategoryKind
    color: string | null
    linked_is_savings: 0 | 1 | null
  }[]
  const byId = new Map<string, CategoryMeta>()
  const childrenByParent = new Map<string, string[]>()
  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      parentId: row.parent_id,
      name: row.name,
      kind: row.kind,
      color: row.color,
      linkedAccountIsSavings: row.linked_is_savings === null ? null : row.linked_is_savings === 1,
      key: keyById.get(row.id) ?? null,
    })
    if (row.parent_id) {
      const list = childrenByParent.get(row.parent_id) ?? []
      list.push(row.id)
      childrenByParent.set(row.parent_id, list)
    }
  }
  return { byId, childrenByParent, packMap }
}

function isMonthStart(isoDate: string | undefined): boolean {
  return !isoDate || isoDate.endsWith('-01')
}

function lastDayOfMonth(month: string): number {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

function isMonthEnd(isoDate: string | undefined): boolean {
  if (!isoDate) return true
  const day = Number(isoDate.slice(8, 10))
  return day >= lastDayOfMonth(isoDate.slice(0, 7))
}

function expandCategorySelection(
  requested: readonly string[] | undefined,
  childrenByParent: ReadonlyMap<string, string[]>,
): Set<string> | null {
  if (!requested || requested.length === 0) return null
  const out = new Set<string>()
  for (const id of requested) {
    if (id === UNCATEGORIZED) {
      out.add(UNCATEGORIZED_AGG_KEY)
    } else {
      out.add(id)
      const kids = childrenByParent.get(id)
      if (kids) {
        for (const kid of kids) out.add(kid)
      }
    }
  }
  return out
}

function listMonthSpan(fromMonth: string, toMonth: string): string[] {
  if (fromMonth > toMonth) return [toMonth]
  const months: string[] = []
  let cur = fromMonth
  // Plafond défensif à 240 mois (20 ans).
  for (let i = 0; i < 240; i++) {
    months.push(cur)
    if (cur === toMonth) break
    cur = addMonths(cur, 1)
  }
  return months
}

function buildFilterGuardsSql(
  db: Db,
  filter: AnalyticsFilter,
  overrideFrom: string,
  overrideTo: string,
): { sql: string; params: Record<string, string | number | null> } {
  const txFilter = analyticsFilterToTransactionFilter({
    ...filter,
    from: overrideFrom,
    to: overrideTo,
  })
  const where = filterClause(db, txFilter, 'aggregate')
  const transferGuard = filter.includeTransfers
    ? ''
    : `AND NOT EXISTS (
         SELECT 1 FROM split sx
         JOIN category cx ON cx.id = sx.category_id
         JOIN account ax ON ax.id = t.account_id
         LEFT JOIN account lx ON lx.id = cx.linked_account_id
         WHERE sx.transaction_id = t.id AND (
           CASE
             WHEN cx.linked_account_id IS NOT NULL AND lx.id IS NOT NULL AND t.transfer_id IS NULL
               THEN (ax.type IN ('savings', 'investment')) = (lx.type IN ('savings', 'investment'))
             ELSE cx.kind = 'transfer'
           END
         )
       )
       AND (t.transfer_id IS NULL OR EXISTS (
         SELECT 1 FROM split sx JOIN category cx ON cx.id = sx.category_id
         WHERE sx.transaction_id = t.id AND cx.kind = 'savings'
       ))`
  return {
    sql: `${where.sql} AND t.nature = 'operation' ${transferGuard}`,
    params: where.params,
  }
}

interface MonthTotals {
  income: number
  expenses: number
  savings: number
  incomeByCat: Map<string, number>
  expensesByCat: Map<string, number>
}

function ensureMonthBucket(map: Map<string, MonthTotals>, month: string): MonthTotals {
  let hit = map.get(month)
  if (!hit) {
    hit = { income: 0, expenses: 0, savings: 0, incomeByCat: new Map(), expensesByCat: new Map() }
    map.set(month, hit)
  }
  return hit
}

function resolveEffectiveAmount(
  partRaw: number,
  txAmount: number,
  txCurrency: string,
  convertedAmount: number | null,
  splitAmount: number | null,
  targetCurrency: string,
  otherCurrencies: Set<string>,
): number | null {
  if (txCurrency === targetCurrency) return partRaw
  if (convertedAmount !== null) {
    return splitAmount === null || txAmount === 0
      ? convertedAmount
      : Math.round((partRaw * convertedAmount) / txAmount)
  }
  otherCurrencies.add(txCurrency)
  return null
}

function resolveDisplayGroup(
  catId: string,
  byId: ReadonlyMap<string, CategoryMeta>,
  drillSingleParentId: string | null,
): { groupId: string | null; parentId: string | null; name: string; color: string | null } {
  if (catId === UNCATEGORIZED_AGG_KEY) {
    return { groupId: null, parentId: null, name: UNCATEGORIZED, color: null }
  }
  const cat = byId.get(catId)
  if (!cat) {
    return { groupId: catId, parentId: null, name: UNCATEGORIZED, color: null }
  }
  if (
    drillSingleParentId &&
    (cat.parentId === drillSingleParentId || cat.id === drillSingleParentId)
  ) {
    return { groupId: cat.id, parentId: cat.parentId, name: cat.name, color: cat.color }
  }
  const top = cat.parentId ? (byId.get(cat.parentId) ?? cat) : cat
  return { groupId: top.id, parentId: top.parentId, name: top.name, color: top.color }
}

/**
 * Moteur principal d'analyse multi-critères (M5) :
 * - exploite `monthly_category_aggregate` lorsque la requête porte sur des mois entiers sans filtre
 *   de montant ni d'étiquette (quelques millisecondes à 50 000 opérations) ;
 * - bascule sur les écritures filtrées dès qu'un filtre fin (étiquettes, bornes de montant, dates
 *   en milieu de mois) est actif pour conserver une cohérence arithmétique stricte.
 */
export function getAnalyticsOverview(
  db: Db,
  filter: AnalyticsFilter,
  now: Date = new Date(),
): AnalyticsOverview {
  ensureFreshMonthlyAggregates(db)

  const { byId, childrenByParent, packMap } = loadCategoryMap(db)
  const bounds = db
    .prepare('SELECT min(month) AS minM, max(month) AS maxM FROM monthly_category_aggregate')
    .get() as { minM: string | null; maxM: string | null }

  const hasTransactions = bounds.minM !== null && bounds.maxM !== null
  const todayMonth = monthOf(now)
  const minAvailMonth = bounds.minM ?? todayMonth
  const maxAvailMonth = bounds.maxM ?? todayMonth

  const resolvedFrom = filter.from ?? `${minAvailMonth}-01`
  const resolvedTo =
    filter.to ?? `${maxAvailMonth}-${String(lastDayOfMonth(maxAvailMonth)).padStart(2, '0')}`
  const startMonth = resolvedFrom.slice(0, 7)
  const endMonth = resolvedTo.slice(0, 7)

  const focusMonth =
    filter.focusMonth && filter.focusMonth >= startMonth && filter.focusMonth <= endMonth
      ? filter.focusMonth
      : endMonth

  const drillSingleParentId =
    filter.categoryIds?.length === 1 &&
    filter.categoryIds[0] !== UNCATEGORIZED &&
    (childrenByParent.get(filter.categoryIds[0]!)?.length ?? 0) > 0
      ? filter.categoryIds[0]!
      : null

  const expandedCategories = expandCategorySelection(filter.categoryIds, childrenByParent)
  const useAggregate =
    isMonthStart(filter.from) &&
    isMonthEnd(filter.to) &&
    (!filter.tagIds || filter.tagIds.length === 0) &&
    filter.minAmount === undefined &&
    filter.maxAmount === undefined

  const trailingStartMonth = addMonths(startMonth, -11)
  const extraMonths = new Set<string>([
    ...listMonthSpan(trailingStartMonth, endMonth),
    addMonths(focusMonth, -1),
    addMonths(focusMonth, -12),
  ])
  const earliestNeededMonth = [...extraMonths].sort()[0] ?? trailingStartMonth

  const monthlyMap = new Map<string, MonthTotals>()
  const otherCurrencies = new Set<string>()
  const periodCategoryExpenses = new Map<string, number>()
  const periodCategoryTxCounts = new Map<string, number>()
  const focusCategoryExpenses = new Map<string, number>()

  let periodTxCount: number

  if (useAggregate) {
    const accountFilter = filter.accountIds?.length
      ? `AND account_id IN (${filter.accountIds.map(() => '?').join(', ')})`
      : ''
    const accountParams = filter.accountIds ?? []

    const aggRows = db
      .prepare(
        `SELECT month, account_id, category_id, currency,
                income, expenses, savings, transfer_in, transfer_out,
                income_conv, expenses_conv, savings_conv, transfer_in_conv, transfer_out_conv,
                unconverted, tx_count
         FROM monthly_category_aggregate
         WHERE month >= ? AND month <= ? ${accountFilter}`,
      )
      .all(
        earliestNeededMonth,
        endMonth > focusMonth ? endMonth : focusMonth,
        ...accountParams,
      ) as {
      month: string
      account_id: string
      category_id: string
      currency: string
      income: number
      expenses: number
      savings: number
      transfer_in: number
      transfer_out: number
      income_conv: number
      expenses_conv: number
      savings_conv: number
      transfer_in_conv: number
      transfer_out_conv: number
      unconverted: number
      tx_count: number
    }[]

    for (const row of aggRows) {
      if (expandedCategories && !expandedCategories.has(row.category_id)) continue
      const isNative = row.currency === filter.currency
      if (!isNative && row.unconverted === 1) {
        if (row.month >= startMonth && row.month <= endMonth) otherCurrencies.add(row.currency)
        continue
      }

      const incBase = isNative ? row.income : row.income_conv
      const expBase = isNative ? row.expenses : row.expenses_conv
      const savBase = isNative ? row.savings : row.savings_conv
      const trIn = filter.includeTransfers ? (isNative ? row.transfer_in : row.transfer_in_conv) : 0
      const trOut = filter.includeTransfers
        ? isNative
          ? row.transfer_out
          : row.transfer_out_conv
        : 0

      const inc = incBase + trIn
      const exp = expBase + trOut

      const mBucket = ensureMonthBucket(monthlyMap, row.month)
      mBucket.income += inc
      mBucket.expenses += exp
      mBucket.savings += savBase

      if (inc > 0) {
        const grp = resolveDisplayGroup(row.category_id, byId, drillSingleParentId)
        const key = grp.groupId ?? UNCATEGORIZED_AGG_KEY
        mBucket.incomeByCat.set(key, (mBucket.incomeByCat.get(key) ?? 0) + inc)
      }
      if (exp > 0) {
        const grp = resolveDisplayGroup(row.category_id, byId, drillSingleParentId)
        const key = grp.groupId ?? UNCATEGORIZED_AGG_KEY
        mBucket.expensesByCat.set(key, (mBucket.expensesByCat.get(key) ?? 0) + exp)

        if (row.month >= startMonth && row.month <= endMonth) {
          periodCategoryExpenses.set(key, (periodCategoryExpenses.get(key) ?? 0) + exp)
          periodCategoryTxCounts.set(key, (periodCategoryTxCounts.get(key) ?? 0) + row.tx_count)
        }
        if (row.month === focusMonth) {
          focusCategoryExpenses.set(key, (focusCategoryExpenses.get(key) ?? 0) + exp)
        }
      }
    }

    const guards = buildFilterGuardsSql(db, filter, resolvedFrom, resolvedTo)
    periodTxCount = db
      .prepare(`SELECT count(*) FROM transactions t WHERE ${guards.sql}`)
      .pluck()
      .get(guards.params) as number
  } else {
    const minDateNeeded = `${earliestNeededMonth}-01`
    const maxDateNeeded =
      endMonth >= focusMonth
        ? resolvedTo
        : `${focusMonth}-${String(lastDayOfMonth(focusMonth)).padStart(2, '0')}`
    const guards = buildFilterGuardsSql(db, filter, minDateNeeded, maxDateNeeded)

    const rows = db
      .prepare(
        `SELECT t.id AS tx_id, substr(t.booking_date, 1, 7) AS month, t.booking_date,
                t.amount AS tx_amount, t.currency, t.converted_amount, t.transfer_id,
                (a.type IN ('savings', 'investment')) AS a_is_savings,
                (tr.id IS NOT NULL AND tr_acc.type IN ('savings', 'investment')) AS tr_is_savings,
                s.category_id AS raw_cat_id, s.amount AS split_amount
         FROM transactions t
         JOIN account a ON a.id = t.account_id
         LEFT JOIN transactions tr ON tr.id = t.transfer_id
         LEFT JOIN account tr_acc ON tr_acc.id = tr.account_id
         LEFT JOIN split s ON s.transaction_id = t.id
         WHERE ${guards.sql}`,
      )
      .all(guards.params) as {
      tx_id: string
      month: string
      booking_date: string
      tx_amount: number
      currency: string
      converted_amount: number | null
      transfer_id: string | null
      a_is_savings: 0 | 1
      tr_is_savings: 0 | 1
      raw_cat_id: string | null
      split_amount: number | null
    }[]

    const periodSeenTx = new Set<string>()
    const catSeenTx = new Map<string, Set<string>>()

    for (const row of rows) {
      const catId = row.raw_cat_id ?? UNCATEGORIZED_AGG_KEY
      if (expandedCategories && !expandedCategories.has(catId)) continue
      const inSelectedRange = row.booking_date >= resolvedFrom && row.booking_date <= resolvedTo

      const partRaw = row.split_amount ?? row.tx_amount
      const eff = resolveEffectiveAmount(
        partRaw,
        row.tx_amount,
        row.currency,
        row.converted_amount,
        row.split_amount,
        filter.currency,
        otherCurrencies,
      )
      if (eff === null || eff === 0) continue

      const catMeta = row.raw_cat_id ? byId.get(row.raw_cat_id) : undefined
      const rawKind = catMeta?.kind ?? null
      const effectiveKind: CategoryKind | null =
        row.transfer_id !== null
          ? rawKind === 'savings' && !(row.a_is_savings === 1 && row.tr_is_savings === 1)
            ? 'savings'
            : 'transfer'
          : catMeta && catMeta.linkedAccountIsSavings !== null
            ? (row.a_is_savings === 1) !== catMeta.linkedAccountIsSavings
              ? 'savings'
              : 'transfer'
            : rawKind
      const isTransfer = effectiveKind === 'transfer'
      if (isTransfer && !filter.includeTransfers) continue

      if (inSelectedRange) periodSeenTx.add(row.tx_id)

      const mBucket = ensureMonthBucket(monthlyMap, row.month)
      const grp = resolveDisplayGroup(catId, byId, drillSingleParentId)
      const key = grp.groupId ?? UNCATEGORIZED_AGG_KEY

      if (effectiveKind === 'savings') {
        const delta =
          row.a_is_savings === 1
            ? eff
            : row.transfer_id !== null && row.tr_is_savings === 1
              ? 0
              : -eff
        mBucket.savings += delta
        continue
      }

      if (
        effectiveKind === 'income' ||
        (effectiveKind === null && eff > 0 && row.transfer_id === null) ||
        (isTransfer && eff > 0)
      ) {
        if (eff > 0) {
          mBucket.income += eff
          mBucket.incomeByCat.set(key, (mBucket.incomeByCat.get(key) ?? 0) + eff)
        }
        continue
      }

      const exp = -eff
      if (exp > 0) {
        mBucket.expenses += exp
        mBucket.expensesByCat.set(key, (mBucket.expensesByCat.get(key) ?? 0) + exp)
        if (inSelectedRange) {
          periodCategoryExpenses.set(key, (periodCategoryExpenses.get(key) ?? 0) + exp)
          let txSet = catSeenTx.get(key)
          if (!txSet) {
            txSet = new Set()
            catSeenTx.set(key, txSet)
          }
          txSet.add(row.tx_id)
        }
        if (row.month === focusMonth) {
          focusCategoryExpenses.set(key, (focusCategoryExpenses.get(key) ?? 0) + exp)
        }
      }
    }

    periodTxCount = periodSeenTx.size
    for (const [k, s] of catSeenTx.entries()) periodCategoryTxCounts.set(k, s.size)
  }

  // Série mensuelle + moyennes glissantes 3 / 6 / 12 mois
  const fullSpanMonths = listMonthSpan(trailingStartMonth, endMonth)
  const rawMonthly = fullSpanMonths.map((m) => {
    const b = monthlyMap.get(m)
    return {
      month: m,
      income: b?.income ?? 0,
      expenses: b?.expenses ?? 0,
      savings: b?.savings ?? 0,
    }
  })

  const trailingOffset = Math.max(
    0,
    rawMonthly.findIndex((x) => x.month === startMonth),
  )
  const monthlySeries: AnalyticsMonthPoint[] = []
  let totalIncome = 0
  let totalExpenses = 0
  let totalSavings = 0

  const rollingAvg = (idx: number, win: number): MinorUnits | null => {
    if (idx + 1 < win) return null
    let sum = 0
    for (let i = idx - win + 1; i <= idx; i++) sum += rawMonthly[i]!.expenses
    return Math.round(sum / win)
  }

  for (let i = trailingOffset; i < rawMonthly.length; i++) {
    const item = rawMonthly[i]!
    totalIncome += item.income
    totalExpenses += item.expenses
    totalSavings += item.savings
    monthlySeries.push({
      month: item.month,
      income: item.income,
      expenses: item.expenses,
      savings: item.savings,
      net: item.income - item.expenses,
      ma3Expense: rollingAvg(i, 3),
      ma6Expense: rollingAvg(i, 6),
      ma12Expense: rollingAvg(i, 12),
    })
  }

  // Ventilation par catégorie + série d'évolution (plafonnée à 8 séries dont « Autres »)
  const buildCategoryItems = (
    totalsMap: ReadonlyMap<string, number>,
    totalDenominator: number,
  ): AnalyticsCategoryItem[] =>
    [...totalsMap.entries()]
      .filter(([, amt]) => amt > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([key, amount], index) => {
        const grp = resolveDisplayGroup(key, byId, drillSingleParentId)
        return {
          categoryId: grp.groupId,
          parentId: grp.parentId,
          name: grp.name,
          color: grp.color ?? SERIES_PALETTE[index % SERIES_PALETTE.length]!,
          amount,
          share: totalDenominator > 0 ? amount / totalDenominator : 0,
          transactionCount: periodCategoryTxCounts.get(key) ?? 0,
        }
      })

  const categoryBreakdown = buildCategoryItems(periodCategoryExpenses, totalExpenses)

  const evoMonths = monthlySeries.map((m) => m.month)
  const topKeys = [...periodCategoryExpenses.entries()]
    .filter(([, amt]) => amt > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_EVOLUTION_CATEGORIES)
    .map(([key]) => key)
  const topKeySet = new Set(topKeys)

  const evolutionSeries: AnalyticsCategoryEvolutionSeries[] = topKeys.map((key, idx) => {
    const grp = resolveDisplayGroup(key, byId, drillSingleParentId)
    const totalsByMonth = evoMonths.map((m) => monthlyMap.get(m)?.expensesByCat.get(key) ?? 0)
    return {
      categoryId: grp.groupId,
      name: grp.name,
      color: grp.color ?? SERIES_PALETTE[idx % SERIES_PALETTE.length]!,
      isOther: false,
      totalsByMonth,
      total: periodCategoryExpenses.get(key) ?? 0,
    }
  })

  const otherMonthly = evoMonths.map((m) => {
    const map = monthlyMap.get(m)?.expensesByCat
    if (!map) return 0
    let sum = 0
    for (const [k, v] of map.entries()) {
      if (!topKeySet.has(k)) sum += v
    }
    return sum
  })
  const otherTotal = otherMonthly.reduce((a, b) => a + b, 0)
  if (otherTotal > 0) {
    evolutionSeries.push({
      categoryId: '__other__',
      name: '__other__',
      color: SERIES_PALETTE[7],
      isOther: true,
      totalsByMonth: otherMonthly,
      total: otherTotal,
    })
  }

  // Sankey revenus -> budget -> dépenses + épargne + solde restant
  const periodIncomeByCat = new Map<string, number>()
  for (const m of evoMonths) {
    const map = monthlyMap.get(m)?.incomeByCat
    if (!map) continue
    for (const [k, v] of map.entries()) {
      periodIncomeByCat.set(k, (periodIncomeByCat.get(k) ?? 0) + v)
    }
  }
  const sankeyNodes: AnalyticsSankeyNode[] = []
  const sankeyLinks: AnalyticsSankeyLink[] = []
  if (totalIncome > 0 || totalExpenses > 0) {
    sankeyNodes.push({ name: 'budget', kind: 'budget' })
    const sortedIncomes = [...periodIncomeByCat.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
    const topIncomes = sortedIncomes.slice(0, 5)
    let otherIncome = 0
    for (let i = 5; i < sortedIncomes.length; i++) otherIncome += sortedIncomes[i]![1]

    for (const [key, val] of topIncomes) {
      const grp = resolveDisplayGroup(key, byId, drillSingleParentId)
      const nodeName = `in:${grp.groupId ?? 'none'}`
      sankeyNodes.push({ name: nodeName, kind: 'income', categoryId: grp.groupId })
      sankeyLinks.push({ source: nodeName, target: 'budget', value: val })
    }
    if (otherIncome > 0) {
      sankeyNodes.push({ name: 'in:other', kind: 'income' })
      sankeyLinks.push({ source: 'in:other', target: 'budget', value: otherIncome })
    }

    for (const serie of evolutionSeries) {
      if (serie.total <= 0) continue
      const nodeName = `out:${serie.categoryId ?? 'none'}`
      sankeyNodes.push({ name: nodeName, kind: 'expense', categoryId: serie.categoryId })
      sankeyLinks.push({ source: 'budget', target: nodeName, value: serie.total })
    }
    if (totalSavings > 0) {
      sankeyNodes.push({ name: 'out:savings', kind: 'savings' })
      sankeyLinks.push({ source: 'budget', target: 'out:savings', value: totalSavings })
    }
    const surplus = totalIncome - totalExpenses - Math.max(0, totalSavings)
    if (surplus > 0) {
      sankeyNodes.push({ name: 'out:surplus', kind: 'surplus' })
      sankeyLinks.push({ source: 'budget', target: 'out:surplus', value: surplus })
    }
  }

  // Calendrier des dépenses (année du mois focus, bornée par le filtre)
  const focusYear = focusMonth.slice(0, 4)
  const calFrom = `${focusYear}-01-01` > resolvedFrom ? `${focusYear}-01-01` : resolvedFrom
  const calTo = `${focusYear}-12-31` < resolvedTo ? `${focusYear}-12-31` : resolvedTo
  const calGuards = buildFilterGuardsSql(db, filter, calFrom, calTo)

  const calRows = db
    .prepare(
      `SELECT t.booking_date, t.amount, t.currency, t.converted_amount
       FROM transactions t
       WHERE ${calGuards.sql} AND t.booking_date >= @calStart AND t.booking_date <= @calEnd`,
    )
    .all({ ...calGuards.params, calStart: calFrom, calEnd: calTo }) as {
    booking_date: string
    amount: number
    currency: string
    converted_amount: number | null
  }[]
  const dayMap = new Map<string, AnalyticsCalendarDay>()
  let maxOutflow = 0
  for (const r of calRows) {
    const eff =
      r.currency === filter.currency
        ? r.amount
        : r.converted_amount !== null
          ? r.converted_amount
          : null
    if (eff === null) continue
    let d = dayMap.get(r.booking_date)
    if (!d) {
      d = { date: r.booking_date, outflow: 0, inflow: 0, txCount: 0 }
      dayMap.set(r.booking_date, d)
    }
    d.txCount += 1
    if (eff < 0) {
      d.outflow += -eff
      if (d.outflow > maxOutflow) maxOutflow = d.outflow
    } else if (eff > 0) {
      d.inflow += eff
    }
  }

  // Histogramme de distribution des montants + synthèse du mois focus (top marchands, plus grosses dépenses)
  const periodGuards = buildFilterGuardsSql(db, filter, resolvedFrom, resolvedTo)
  const periodExpenseRows = db
    .prepare(
      `SELECT t.id, t.booking_date, coalesce(t.label, t.label_raw) AS label, t.label_raw,
              p.name AS payee_name, a.name AS account_name, t.amount, t.currency, t.converted_amount
       FROM transactions t
       JOIN account a ON a.id = t.account_id
       LEFT JOIN payee p ON p.id = t.payee_id
       WHERE ${periodGuards.sql} AND t.amount < 0`,
    )
    .all(periodGuards.params) as {
    id: string
    booking_date: string
    label: string
    label_raw: string
    payee_name: string | null
    account_name: string
    amount: number
    currency: string
    converted_amount: number | null
  }[]

  const histogram: AnalyticsHistogramBucket[] = HISTOGRAM_BINS.map((b) => ({
    key: b.key,
    min: b.min,
    max: b.max,
    count: 0,
    total: 0,
  }))
  const focusMerchants = new Map<string, { name: string; total: number; count: number }>()
  const focusLargest: AnalyticsLargestExpense[] = []
  const displayCache = new Map<string, string>()

  const getMerchantName = (row: {
    label: string
    label_raw: string
    payee_name: string | null
  }) => {
    if (row.payee_name) return row.payee_name
    if (row.label !== row.label_raw) return row.label
    let hit = displayCache.get(row.label_raw)
    if (hit === undefined) {
      hit = cleanTransactionLabel(row.label_raw).display || row.label_raw
      if (displayCache.size < 4096) displayCache.set(row.label_raw, hit)
    }
    return hit
  }

  for (const row of periodExpenseRows) {
    const abs =
      row.currency === filter.currency
        ? -row.amount
        : row.converted_amount !== null
          ? Math.abs(row.converted_amount)
          : null
    if (abs === null || abs <= 0) continue

    for (const bin of histogram) {
      if (abs >= bin.min && (bin.max === null || abs < bin.max)) {
        bin.count += 1
        bin.total += abs
        break
      }
    }

    if (row.booking_date.startsWith(focusMonth)) {
      const mName = getMerchantName(row)
      const mKey = mName.toLowerCase()
      const existing = focusMerchants.get(mKey)
      if (existing) {
        existing.total += abs
        existing.count += 1
      } else {
        focusMerchants.set(mKey, { name: mName, total: abs, count: 1 })
      }
      focusLargest.push({
        id: row.id,
        bookingDate: row.booking_date,
        label: row.label,
        amount: abs,
        currency: filter.currency,
        accountName: row.account_name,
        categoryName: null,
      })
    }
  }

  focusLargest.sort((a, b) => b.amount - a.amount)
  const top10Largest = focusLargest.slice(0, 10)
  if (top10Largest.length > 0) {
    const catNameStmt = db.prepare(
      `SELECT c.name FROM split s JOIN category c ON c.id = s.category_id
       WHERE s.transaction_id = ? ORDER BY s.position LIMIT 1`,
    )
    for (const item of top10Largest) {
      item.categoryName = (catNameStmt.pluck().get(item.id) as string | undefined) ?? null
    }
  }

  // Synthèse mensuelle détaillée + comparaisons M-1 et N-1 + faits marquants
  const focusData = monthlyMap.get(focusMonth) ?? {
    income: 0,
    expenses: 0,
    savings: 0,
    incomeByCat: new Map(),
    expensesByCat: new Map(),
  }
  const prevMonthKey = addMonths(focusMonth, -1)
  const lastYearKey = addMonths(focusMonth, -12)

  const buildComparison = (refKey: string): AnalyticsMonthComparison | null => {
    const ref = monthlyMap.get(refKey)
    if (!ref && refKey < minAvailMonth) return null
    const refIncome = ref?.income ?? 0
    const refExp = ref?.expenses ?? 0
    const refSav = ref?.savings ?? 0
    if (refIncome === 0 && refExp === 0 && refSav === 0 && refKey < minAvailMonth) return null
    const expenseDiff = focusData.expenses - refExp
    return {
      referenceMonth: refKey,
      incomeDiff: focusData.income - refIncome,
      expenseDiff,
      expensePct: refExp > 0 ? Math.round(((focusData.expenses - refExp) / refExp) * 100) : null,
      savingsDiff: focusData.savings - refSav,
    }
  }

  const vsPrevMonth = buildComparison(prevMonthKey)
  const vsLastYear = buildComparison(lastYearKey)

  const focusTopCategories = buildCategoryItems(focusCategoryExpenses, focusData.expenses).slice(
    0,
    8,
  )

  const insights: AnalyticsInsight[] = []
  const prevData = monthlyMap.get(prevMonthKey)
  if (focusData.income === 0 && focusData.expenses === 0) {
    insights.push({ kind: 'no-data' })
  } else {
    let bestSwing: {
      kind: 'category-increase' | 'category-decrease'
      name: string
      delta: number
      pct: number | null
    } | null = null
    if (prevData) {
      for (const item of focusTopCategories) {
        const key = item.categoryId ?? UNCATEGORIZED_AGG_KEY
        const prevAmt = prevData.expensesByCat.get(key) ?? 0
        const diff = item.amount - prevAmt
        if (Math.abs(diff) < 20_00) continue
        const pct = prevAmt > 0 ? Math.round((diff / prevAmt) * 100) : null
        if (!bestSwing || Math.abs(diff) > Math.abs(bestSwing.delta)) {
          bestSwing = {
            kind: diff > 0 ? 'category-increase' : 'category-decrease',
            name: item.name,
            delta: Math.abs(diff),
            pct: pct !== null ? Math.abs(pct) : null,
          }
        }
      }
    }
    if (bestSwing) {
      insights.push({
        kind: bestSwing.kind,
        categoryName: bestSwing.name,
        delta: bestSwing.delta,
        percent: bestSwing.pct,
      })
    }
    const topCat = focusTopCategories[0]
    if (topCat) {
      insights.push({
        kind: 'top-category',
        categoryName: topCat.name,
        delta: topCat.amount,
        percent: Math.round(topCat.share * 100),
      })
    }
    if (focusData.income > 0) {
      const rate = (focusData.income - focusData.expenses) / focusData.income
      insights.push({
        kind: 'savings-rate',
        rate: Math.round(rate * 100),
      })
    }
  }

  // Salaires nets du mois (lien vers Salaires M6)
  const salaryCategoryId = packMap.get('salary.net') ?? null
  let payslipSummary: AnalyticsMonthlySynthesis['payslipSummary'] = null
  if (salaryCategoryId) {
    const salRow = db
      .prepare(
        `SELECT COUNT(DISTINCT t.id) AS cnt, coalesce(SUM(s.amount), 0) AS total
         FROM split s JOIN transactions t ON t.id = s.transaction_id
         WHERE s.category_id = ? AND t.booking_date BETWEEN ? AND ? AND t.currency = ?`,
      )
      .get(
        salaryCategoryId,
        `${focusMonth}-01`,
        `${focusMonth}-${String(lastDayOfMonth(focusMonth)).padStart(2, '0')}`,
        filter.currency,
      ) as { cnt: number; total: number }
    if (salRow.cnt > 0 && salRow.total > 0) {
      payslipSummary = { count: salRow.cnt, totalIncome: salRow.total }
    }
  }

  // Récurrences rapides observées dans le mois focus (sous-catégories ou marchands vus dans focusMonth + M-1/M-3)
  const recCatIds = [...packMap.entries()]
    .filter(
      ([key]) =>
        key === 'subscriptions' ||
        key.startsWith('subscriptions.') ||
        key === 'housing.rent' ||
        key === 'housing.energy' ||
        key === 'housing.water' ||
        key === 'housing.insurance' ||
        key === 'health.insurance',
    )
    .map(([, id]) => id)
  const lookbackStart = `${addMonths(focusMonth, -3)}-01`
  const focusEnd = `${focusMonth}-${String(lastDayOfMonth(focusMonth)).padStart(2, '0')}`
  const recRows =
    recCatIds.length === 0
      ? []
      : (db
          .prepare(
            `SELECT t.booking_date, t.amount, coalesce(p.name, t.label, t.label_raw) AS merchant_label
             FROM transactions t
             LEFT JOIN payee p ON p.id = t.payee_id
             WHERE t.nature = 'operation' AND t.transfer_id IS NULL
               AND t.currency = ? AND t.amount < 0
               AND t.booking_date BETWEEN ? AND ?
               AND EXISTS (
                 SELECT 1 FROM split s WHERE s.transaction_id = t.id
                   AND s.category_id IN (${recCatIds.map(() => '?').join(', ')})
               )
             ORDER BY t.booking_date DESC LIMIT 200`,
          )
          .all(filter.currency, lookbackStart, focusEnd, ...recCatIds) as {
          booking_date: string
          amount: number
          merchant_label: string
        }[])

  const recByMerchant = new Map<string, { amount: number; count: number; inFocus: boolean }>()
  for (const r of recRows) {
    const display = cleanTransactionLabel(r.merchant_label).display || r.merchant_label
    const k = display.toLowerCase()
    const item = recByMerchant.get(k)
    const inFocus = r.booking_date.startsWith(focusMonth)
    if (item) {
      item.count += 1
      if (inFocus) {
        item.inFocus = true
        item.amount = -r.amount
      }
    } else {
      recByMerchant.set(k, { amount: -r.amount, count: 1, inFocus })
    }
  }
  const recurringInMonth = [...recByMerchant.entries()]
    .filter(([, v]) => v.inFocus && v.count >= 2)
    .map(([k, v]) => ({
      merchant: k.replace(/\b\w/g, (ch) => ch.toUpperCase()),
      amount: v.amount,
      frequency: 'monthly' as const,
    }))
    .slice(0, 12)

  const focusTxCount = db
    .prepare(
      `SELECT count(*) FROM transactions t
       WHERE ${buildFilterGuardsSql(db, filter, `${focusMonth}-01`, focusEnd).sql}`,
    )
    .pluck()
    .get(buildFilterGuardsSql(db, filter, `${focusMonth}-01`, focusEnd).params) as number

  const availableMonths = [...listMonthSpan(minAvailMonth, maxAvailMonth)].reverse()

  return {
    filterRange: { from: resolvedFrom, to: resolvedTo, focusMonth },
    hasTransactions,
    otherCurrencies: [...otherCurrencies].sort(),
    kpis: {
      income: totalIncome,
      expenses: totalExpenses,
      savings: totalSavings,
      net: totalIncome - totalExpenses,
      savingsRate: totalIncome > 0 ? (totalIncome - totalExpenses) / totalIncome : 0,
      transactionCount: periodTxCount,
    },
    monthlySeries,
    categoryEvolution: {
      months: evoMonths,
      series: evolutionSeries,
    },
    categoryBreakdown,
    sankey: {
      nodes: sankeyNodes,
      links: sankeyLinks,
    },
    calendarHeatmap: {
      year: focusYear,
      days: [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
      maxOutflow,
    },
    amountHistogram: histogram,
    monthlySynthesis: {
      month: focusMonth,
      availableMonths,
      income: focusData.income,
      expenses: focusData.expenses,
      savings: focusData.savings,
      net: focusData.income - focusData.expenses,
      savingsRate:
        focusData.income > 0 ? (focusData.income - focusData.expenses) / focusData.income : 0,
      transactionCount: focusTxCount,
      vsPrevMonth,
      vsLastYear,
      topCategories: focusTopCategories,
      topMerchants: [...focusMerchants.values()]
        .sort((a, b) => b.total - a.total)
        .slice(0, 10)
        .map((m) => ({ name: m.name, total: m.total, transactionCount: m.count })),
      largestExpenses: top10Largest,
      recurringInMonth,
      payslipSummary,
      insights,
    },
    anomalies: [],
  }
}

/** Détection dédiée des anomalies (F12) sur la fenêtre filtrée. */
export function getAnalyticsAnomaliesForFilter(
  db: Db,
  filter: AnalyticsFilter,
  now: Date = new Date(),
): AnalyticsAnomaly[] {
  const { byId } = loadCategoryMap(db)
  const bounds = db
    .prepare(
      "SELECT min(booking_date) AS minD, max(booking_date) AS maxD FROM transactions WHERE nature = 'operation'",
    )
    .get() as { minD: string | null; maxD: string | null }
  if (!bounds.minD || !bounds.maxD) return []

  const today = now.toISOString().slice(0, 10)
  const resolvedTo = filter.to ?? bounds.maxD ?? today
  // Fenêtre d'évaluation bornée aux 12 derniers mois du filtre si illimitée pour rester < 50 ms à 50k ops.
  const defaultFrom = `${addMonths(resolvedTo.slice(0, 7), -11)}-01`
  const resolvedFrom = filter.from && filter.from > defaultFrom ? filter.from : defaultFrom

  const historyFrom = `${addMonths(resolvedFrom.slice(0, 7), -12)}-01`
  const guards = buildFilterGuardsSql(db, filter, historyFrom, resolvedTo)

  const rows = db
    .prepare(
      `SELECT t.id, t.account_id, a.name AS account_name, t.booking_date, t.amount, t.currency,
              t.converted_amount, coalesce(t.label, t.label_raw) AS label, t.label_raw,
              p.name AS payee_name, t.transfer_id
       FROM transactions t
       JOIN account a ON a.id = t.account_id
       LEFT JOIN payee p ON p.id = t.payee_id
       WHERE ${guards.sql} AND t.amount < 0
       ORDER BY t.booking_date DESC
       LIMIT 15000`,
    )
    .all(guards.params) as {
    id: string
    account_id: string
    account_name: string
    booking_date: string
    amount: number
    currency: string
    converted_amount: number | null
    label: string
    label_raw: string
    payee_name: string | null
    transfer_id: string | null
  }[]

  const catStmt = db.prepare('SELECT category_id FROM split WHERE transaction_id = ?').pluck()
  const canonicalCache = new Map<string, string>()
  const baselines = new Map<string, MinorUnits[]>()
  const windowInputs: AnomalyTxInput[] = []

  const getKey = (payeeName: string | null, labelRaw: string): string => {
    if (payeeName) return `payee:${payeeName.trim().toLowerCase()}`
    let hit = canonicalCache.get(labelRaw)
    if (hit === undefined) {
      hit = canonicalTransactionLabel(labelRaw)
      if (canonicalCache.size < 4096) canonicalCache.set(labelRaw, hit)
    }
    return `label:${hit}`
  }

  for (const r of rows) {
    if (r.currency !== filter.currency && r.converted_amount === null) continue
    const signedAmt = r.currency === filter.currency ? r.amount : -Math.abs(r.converted_amount!)
    const key = getKey(r.payee_name, r.label_raw)
    const hist = baselines.get(key)
    if (hist) hist.push(-signedAmt)
    else baselines.set(key, [-signedAmt])

    if (r.booking_date >= resolvedFrom && r.booking_date <= resolvedTo) {
      const catIds = catStmt.all(r.id) as (string | null)[]
      const categoryKeys = catIds
        .map((id) => (id ? byId.get(id)?.key : null))
        .filter((k): k is string => Boolean(k))
      windowInputs.push({
        id: r.id,
        accountId: r.account_id,
        accountName: r.account_name,
        bookingDate: r.booking_date,
        amount: signedAmt,
        currency: filter.currency,
        label: r.label,
        labelRaw: r.label_raw,
        payee: r.payee_name,
        transferId: r.transfer_id,
        categoryKeys,
      })
    }
  }

  return detectAnalyticsAnomalies(windowInputs, baselines)
}
