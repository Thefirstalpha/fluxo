import type { MinorUnits } from '../money'

export const LOAN_TYPES = ['mortgage', 'consumer', 'auto', 'student', 'other'] as const
export type LoanType = (typeof LOAN_TYPES)[number]

export const LOAN_PERIODICITIES = ['monthly', 'quarterly', 'annual'] as const
export type LoanPeriodicity = (typeof LOAN_PERIODICITIES)[number]

export const LOAN_STATUSES = ['active', 'paid_off', 'archived'] as const
export type LoanStatus = (typeof LOAN_STATUSES)[number]

export const INSTALLMENT_STATUSES = ['planned', 'paid', 'reconciled'] as const
export type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number]

export const BUDGET_MODES = ['fixed', 'income_percent', 'rolling_3m'] as const
export type BudgetMode = (typeof BUDGET_MODES)[number]

export const PLANNED_PERIODICITIES = ['once', 'monthly', 'quarterly', 'annual'] as const
export type PlannedPeriodicity = (typeof PLANNED_PERIODICITIES)[number]

export const PLANNED_ORIGINS = ['recurrence', 'loan', 'salary', 'variable_avg', 'manual'] as const
export type PlannedOrigin = (typeof PLANNED_ORIGINS)[number]

export interface ValuationEntry {
  id: string
  accountId: string
  valuationDate: string
  valueCents: MinorUnits
  note: string | null
  createdAt: string
}

export interface LoanSummary {
  id: string
  accountId: string
  accountName: string
  name: string
  loanType: LoanType
  initialCapital: MinorUnits
  nominalRateMicros: number
  taegMicros: number | null
  insuranceMonthlyCents: MinorUnits
  durationMonths: number
  periodicity: LoanPeriodicity
  startDate: string
  endDate: string
  monthlyPaymentCents: MinorUnits
  remainingPrincipalCents: MinorUnits
  totalInterestCents: MinorUnits
  totalInsuranceCents: MinorUnits
  paidInstallments: number
  totalInstallments: number
  status: LoanStatus
  fixedRateEndDate: string | null
  upcomingImportantNotice: string | null
}

export interface LoanInstallment {
  id: string
  loanId: string
  installmentNumber: number
  dueDate: string
  principalCents: MinorUnits
  interestCents: MinorUnits
  insuranceCents: MinorUnits
  totalCents: MinorUnits
  remainingPrincipalCents: MinorUnits
  status: InstallmentStatus
  transactionId: string | null
}

export interface LoanDetail {
  loan: LoanSummary
  installments: LoanInstallment[]
}

export interface EarlyRepaymentSimulation {
  extraPrincipalCents: MinorUnits
  atInstallmentNumber: number
  mode: 'reduce_duration' | 'reduce_payment'
  currentRemainingInterestCents: MinorUnits
  newRemainingInterestCents: MinorUnits
  interestSavedCents: MinorUnits
  monthsSaved: number
  newMonthlyPaymentCents: MinorUnits
  newEndDate: string
}

export interface BudgetSummary {
  id: string
  categoryId: string
  categoryName: string
  categoryColor: string | null
  mode: BudgetMode
  amountCents: MinorUnits
  percentMicros: number | null
  rollover: boolean
  alert80: boolean
  alert100: boolean
  archived: boolean
  /** Plafond effectif pour le mois affiché (incluant report éventuel). */
  effectiveLimitCents: MinorUnits
  /** Base calculée avant report (fixe, % revenus ou moyenne 3 mois). */
  baseLimitCents: MinorUnits
  rolloverCents: MinorUnits
  spentCents: MinorUnits
  remainingCents: MinorUnits
  ratioMicros: number
  alertLevel: 'ok' | 'warning_80' | 'exceeded_100'
}

export interface GoalSummary {
  id: string
  name: string
  targetCents: MinorUnits
  targetDate: string | null
  accountId: string | null
  accountName: string | null
  currency: string
  currentCents: MinorUnits
  progressMicros: number
  monthlyPaceCents: MinorUnits
  projectedDate: string | null
  archived: boolean
}

export interface NetWorthAssetItem {
  accountId: string
  name: string
  type: string
  trackingMode: string
  currency: string
  balanceCents: MinorUnits
  lastValuationDate: string | null
  staleValuation: boolean
}

export interface NetWorthPoint {
  month: string
  assetsCents: MinorUnits
  liabilitiesCents: MinorUnits
  netWorthCents: MinorUnits
}

export interface NetWorthOverview {
  currency: string
  asOfDate: string
  totalAssetsCents: MinorUnits
  totalLiabilitiesCents: MinorUnits
  netWorthCents: MinorUnits
  assets: NetWorthAssetItem[]
  loans: LoanSummary[]
  history: NetWorthPoint[]
}

export interface ForecastItem {
  id: string
  dueDate: string
  label: string
  amountCents: MinorUnits
  origin: PlannedOrigin
  accountId: string | null
  accountName: string | null
}

export interface EndOfMonthForecast {
  currency: string
  asOfDate: string
  monthEnd: string
  currentCheckingBalanceCents: MinorUnits
  upcomingIncomeCents: MinorUnits
  upcomingExpensesCents: MinorUnits
  estimatedVariableCents: MinorUnits
  projectedEndBalanceCents: MinorUnits
  projectedLowCents: MinorUnits
  projectedHighCents: MinorUnits
  disposableRemainingCents: MinorUnits
  overdraftRisk: boolean
  upcomingItems: ForecastItem[]
}

export interface ScenarioSummary {
  id: string
  name: string
  baseScenarioId: string | null
  horizonMonths: number
  accountIds: string[]
  defaultIndexationMicros: number
  savingsRateOverrides: Record<string, number>
  isBase: boolean
  itemCount: number
  createdAt: string
  updatedAt: string
}

export interface PlannedItem {
  id: string
  scenarioId: string
  accountId: string
  label: string
  categoryId: string | null
  amountCents: MinorUnits
  periodicity: PlannedPeriodicity
  startDate: string
  endDate: string | null
  indexationMicros: number
  origin: PlannedOrigin
  sourceRefId: string | null
  enabled: boolean
}

export interface ScenarioDetail {
  scenario: ScenarioSummary
  items: PlannedItem[]
}

export interface SimulationAccountBalance {
  accountId: string
  accountName: string
  balanceCents: MinorUnits
}

export interface SimulationMonthPoint {
  monthIndex: number
  month: string
  totalBalanceCents: MinorUnits
  lowBalanceCents: MinorUnits
  highBalanceCents: MinorUnits
  inflowsCents: MinorUnits
  outflowsCents: MinorUnits
  interestCents: MinorUnits
  byAccount: SimulationAccountBalance[]
}

export interface SimulationThresholdHit {
  kind: 'overdraft' | 'goal_reached'
  month: string
  label: string
  balanceCents: MinorUnits
}

export interface SimulationProjection {
  scenarioId: string
  scenarioName: string
  currency: string
  points: SimulationMonthPoint[]
  thresholds: SimulationThresholdHit[]
}
