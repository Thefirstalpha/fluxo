import type { MinorUnits } from '../money'

export interface AnalyticsFilter {
  from?: string
  to?: string
  accountIds?: string[]
  categoryIds?: string[]
  tagIds?: string[]
  minAmount?: MinorUnits
  maxAmount?: MinorUnits
  includeTransfers?: boolean
  currency: string
  focusMonth?: string
}

export interface AnalyticsMonthPoint {
  month: string
  income: MinorUnits
  expenses: MinorUnits
  savings: MinorUnits
  net: MinorUnits
  ma3Expense: MinorUnits | null
  ma6Expense: MinorUnits | null
  ma12Expense: MinorUnits | null
}

export interface AnalyticsCategoryItem {
  categoryId: string | null
  parentId: string | null
  name: string
  color: string
  amount: MinorUnits
  share: number
  transactionCount: number
}

export interface AnalyticsCategoryEvolutionSeries {
  categoryId: string | null
  name: string
  color: string
  isOther: boolean
  totalsByMonth: MinorUnits[]
  total: MinorUnits
}

export interface AnalyticsSankeyNode {
  name: string
  kind: 'income' | 'budget' | 'expense' | 'savings' | 'surplus'
  categoryId?: string | null
}

export interface AnalyticsSankeyLink {
  source: string
  target: string
  value: MinorUnits
}

export interface AnalyticsCalendarDay {
  date: string
  outflow: MinorUnits
  inflow: MinorUnits
  txCount: number
}

export interface AnalyticsHistogramBucket {
  key: string
  min: MinorUnits
  max: MinorUnits | null
  count: number
  total: MinorUnits
}

export interface AnalyticsMerchantTotal {
  name: string
  total: MinorUnits
  transactionCount: number
}

export interface AnalyticsLargestExpense {
  id: string
  bookingDate: string
  label: string
  amount: MinorUnits
  currency: string
  accountName: string
  categoryName: string | null
}

export interface AnalyticsInsight {
  kind: 'category-increase' | 'category-decrease' | 'top-category' | 'savings-rate' | 'no-data'
  categoryName?: string
  delta?: MinorUnits
  percent?: number | null
  rate?: number
}

export type AnomalyKind = 'unusual-expense' | 'duplicate-charge' | 'bank-fees'

export interface AnalyticsAnomaly {
  id: string
  kind: AnomalyKind
  date: string
  title: string
  accountName: string
  amount: MinorUnits
  currency: string
  referenceAmount?: MinorUnits
  ratio?: number
  count?: number
  transactionIds: string[]
}

export interface AnalyticsMonthComparison {
  referenceMonth: string
  incomeDiff: MinorUnits
  expenseDiff: MinorUnits
  expensePct: number | null
  savingsDiff: MinorUnits
}

export interface AnalyticsMonthlySynthesis {
  month: string
  availableMonths: string[]
  income: MinorUnits
  expenses: MinorUnits
  savings: MinorUnits
  net: MinorUnits
  savingsRate: number
  transactionCount: number
  vsPrevMonth: AnalyticsMonthComparison | null
  vsLastYear: AnalyticsMonthComparison | null
  topCategories: AnalyticsCategoryItem[]
  topMerchants: AnalyticsMerchantTotal[]
  largestExpenses: AnalyticsLargestExpense[]
  recurringInMonth: {
    merchant: string
    amount: MinorUnits
    frequency: 'monthly' | 'quarterly' | 'annual'
  }[]
  payslipSummary: {
    count: number
    totalIncome: MinorUnits
  } | null
  insights: AnalyticsInsight[]
}

export interface AnalyticsOverview {
  filterRange: {
    from: string
    to: string
    focusMonth: string
  }
  hasTransactions: boolean
  otherCurrencies: string[]
  kpis: {
    income: MinorUnits
    expenses: MinorUnits
    savings: MinorUnits
    net: MinorUnits
    savingsRate: number
    transactionCount: number
  }
  monthlySeries: AnalyticsMonthPoint[]
  categoryEvolution: {
    months: string[]
    series: AnalyticsCategoryEvolutionSeries[]
  }
  categoryBreakdown: AnalyticsCategoryItem[]
  sankey: {
    nodes: AnalyticsSankeyNode[]
    links: AnalyticsSankeyLink[]
  }
  calendarHeatmap: {
    year: string
    days: AnalyticsCalendarDay[]
    maxOutflow: MinorUnits
  }
  amountHistogram: AnalyticsHistogramBucket[]
  monthlySynthesis: AnalyticsMonthlySynthesis
  anomalies: AnalyticsAnomaly[]
}

export interface AnalyticsExportOutcome {
  ok: boolean
  canceled?: boolean
  fileName?: string
  rowCount?: number
  error?: string
}
