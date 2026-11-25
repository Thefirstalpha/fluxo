/**
 * Contrat du registre : une méthode = un canal IPC = une fonction du preload (`window.fluxo.ledger`).
 * Module sans zod (le preload l'importe) : les schémas d'entrée vivent dans `schemas.ts`.
 */
import type { AnalyticsAnomaly, AnalyticsOverview } from '../analytics/model'
import type {
  AutoCategorizeResult,
  CategorizationQueueItem,
  ClassifierStatus,
  RulePreviewResult,
  RuleSummary,
  SubscriptionsOverview,
  TransferMatchCandidate,
} from '../categorization/model'
import type {
  BudgetSummary,
  EarlyRepaymentSimulation,
  EndOfMonthForecast,
  GoalSummary,
  LoanDetail,
  LoanSummary,
  NetWorthOverview,
  ScenarioDetail,
  ScenarioSummary,
  SimulationProjection,
  ValuationEntry,
} from '../planning/model'
import type {
  ContractSummary,
  EmployerSummary,
  PayslipDetail,
  PayslipDuplicateDraft,
  PayslipListItem,
  PayslipTransferCandidate,
  SalaryDashboardOverview,
} from '../payslip'
import type {
  AccountSummary,
  AuditEntrySummary,
  CategorySummary,
  DashboardSummary,
  HistoryStatus,
  LedgerResult,
  PayeeSummary,
  SavedFilter,
  TagSummary,
  TransactionDetail,
  TransactionPage,
  TransactionSummary,
} from './model'
import type { LedgerInputs } from './schemas'

/** Résultat de chaque méthode. */
export interface LedgerOutputs {
  accountsList: AccountSummary[]
  accountCreate: { id: string }
  accountUpdate: null
  accountSetArchived: null
  accountDelete: null
  /** IBAN en clair (copie), ou `null` si le compte n'en a pas. */
  accountRevealIban: string | null
  accountsReorder: null
  transactionsList: TransactionPage
  transactionsSummary: TransactionSummary
  transactionGet: TransactionDetail
  transactionCreate: { id: string }
  transactionUpdate: null
  transactionsDelete: { count: number }
  transactionSetSplits: null
  /** `skipped` : opérations ventilées sur plusieurs catégories, laissées telles quelles. */
  transactionsCategorize: { updated: number; skipped: number }
  transactionsTag: { updated: number }
  transactionsSetStatus: { updated: number }
  transferCreate: { fromId: string; toId: string }
  transferCounterpart: { id: string }
  transferLink: null
  transferUnlink: null
  tagsList: TagSummary[]
  tagCreate: { id: string }
  tagUpdate: null
  tagDelete: null
  payeesList: PayeeSummary[]
  categoriesList: CategorySummary[]
  categoryCreate: { id: string }
  categoryUpdate: null
  /** Nombre de parts réaffectées. */
  categoryMerge: { reassigned: number }
  categoryArchive: { reassigned: number }
  categoryDelete: null
  savedFiltersList: SavedFilter[]
  savedFilterSave: { id: string }
  savedFilterDelete: null
  auditList: AuditEntrySummary[]
  ledgerHistoryStatus: HistoryStatus
  ledgerUndo: { action: string }
  ledgerRedo: { action: string }
  dashboardSummary: DashboardSummary
  rulesList: RuleSummary[]
  rulePreview: RulePreviewResult
  ruleSave: RuleSummary
  ruleDelete: null
  ruleApply: { appliedCount: number }
  ruleCreateFromTransaction: RuleSummary
  categorizationQueueList: CategorizationQueueItem[]
  categorizeAutoRun: AutoCategorizeResult
  classifierStatus: ClassifierStatus
  classifierRetrain: ClassifierStatus
  categorizationThresholdSet: { threshold: number }
  categorizationAccept: null
  categorizationReject: null
  categorizationReset: {
    clearedTransactions: number
    clearedSuggestions: number
    clearedModelSamples: number
  }
  subscriptionsOverview: SubscriptionsOverview
  subscriptionDismissAlert: null
  transferCandidatesList: TransferMatchCandidate[]
  analyticsOverview: AnalyticsOverview
  analyticsAnomalies: AnalyticsAnomaly[]
  analyticsCsvData: { csv: string; rowCount: number }
  employersList: EmployerSummary[]
  employerCreate: { id: string }
  employerUpdate: null
  employerDelete: null
  employerRevealAddress: string | null
  contractsList: ContractSummary[]
  contractCreate: { id: string }
  contractUpdate: null
  contractDelete: null
  contractRevealNir: string | null
  payslipsList: PayslipListItem[]
  payslipGet: PayslipDetail
  payslipSave: PayslipDetail
  payslipDelete: null
  payslipDuplicatePrevious: PayslipDuplicateDraft
  payslipRevealSensitive: { nir: string | null; address: string | null }
  payslipTransferCandidates: PayslipTransferCandidate[]
  payslipLinkTransaction: PayslipDetail
  salaryDashboard: SalaryDashboardOverview
  valuationsList: ValuationEntry[]
  valuationAdd: { id: string }
  valuationDelete: null
  netWorthOverview: NetWorthOverview
  loansList: LoanSummary[]
  loanGet: LoanDetail
  loanCreate: { id: string; accountId: string }
  loanUpdate: null
  loanDelete: null
  loanLinkInstallment: null
  loanSimulateEarlyRepayment: EarlyRepaymentSimulation
  budgetsList: BudgetSummary[]
  budgetSave: { id: string }
  budgetDelete: null
  goalsList: GoalSummary[]
  goalSave: { id: string }
  goalDelete: null
  forecastOverview: EndOfMonthForecast
  scenariosList: ScenarioSummary[]
  scenarioGet: ScenarioDetail
  scenarioGenerateBase: ScenarioDetail
  scenarioCloneVariant: ScenarioDetail
  scenarioUpdate: null
  scenarioDelete: null
  plannedItemSave: { id: string }
  plannedItemDelete: null
  scenarioSimulate: SimulationProjection
}

export type LedgerMethod = keyof LedgerOutputs
export type LedgerInput<M extends LedgerMethod> = LedgerInputs[M]
export type LedgerOutput<M extends LedgerMethod> = LedgerOutputs[M]

/** Liste exhaustive des méthodes (vérifiée à la compilation dans les deux sens). */
export const LEDGER_METHODS = [
  'accountsList',
  'accountCreate',
  'accountUpdate',
  'accountSetArchived',
  'accountDelete',
  'accountRevealIban',
  'accountsReorder',
  'transactionsList',
  'transactionsSummary',
  'transactionGet',
  'transactionCreate',
  'transactionUpdate',
  'transactionsDelete',
  'transactionSetSplits',
  'transactionsCategorize',
  'transactionsTag',
  'transactionsSetStatus',
  'transferCreate',
  'transferCounterpart',
  'transferLink',
  'transferUnlink',
  'tagsList',
  'tagCreate',
  'tagUpdate',
  'tagDelete',
  'payeesList',
  'categoriesList',
  'categoryCreate',
  'categoryUpdate',
  'categoryMerge',
  'categoryArchive',
  'categoryDelete',
  'savedFiltersList',
  'savedFilterSave',
  'savedFilterDelete',
  'auditList',
  'ledgerHistoryStatus',
  'ledgerUndo',
  'ledgerRedo',
  'dashboardSummary',
  'rulesList',
  'rulePreview',
  'ruleSave',
  'ruleDelete',
  'ruleApply',
  'ruleCreateFromTransaction',
  'categorizationQueueList',
  'categorizeAutoRun',
  'classifierStatus',
  'classifierRetrain',
  'categorizationThresholdSet',
  'categorizationAccept',
  'categorizationReject',
  'categorizationReset',
  'subscriptionsOverview',
  'subscriptionDismissAlert',
  'transferCandidatesList',
  'analyticsOverview',
  'analyticsAnomalies',
  'analyticsCsvData',
  'employersList',
  'employerCreate',
  'employerUpdate',
  'employerDelete',
  'employerRevealAddress',
  'contractsList',
  'contractCreate',
  'contractUpdate',
  'contractDelete',
  'contractRevealNir',
  'payslipsList',
  'payslipGet',
  'payslipSave',
  'payslipDelete',
  'payslipDuplicatePrevious',
  'payslipRevealSensitive',
  'payslipTransferCandidates',
  'payslipLinkTransaction',
  'salaryDashboard',
  'valuationsList',
  'valuationAdd',
  'valuationDelete',
  'netWorthOverview',
  'loansList',
  'loanGet',
  'loanCreate',
  'loanUpdate',
  'loanDelete',
  'loanLinkInstallment',
  'loanSimulateEarlyRepayment',
  'budgetsList',
  'budgetSave',
  'budgetDelete',
  'goalsList',
  'goalSave',
  'goalDelete',
  'forecastOverview',
  'scenariosList',
  'scenarioGet',
  'scenarioGenerateBase',
  'scenarioCloneVariant',
  'scenarioUpdate',
  'scenarioDelete',
  'plannedItemSave',
  'plannedItemDelete',
  'scenarioSimulate',
] as const satisfies readonly LedgerMethod[]

type Missing = Exclude<LedgerMethod, (typeof LEDGER_METHODS)[number]>
// Si une méthode est ajoutée à `LedgerOutputs` sans figurer ici, cette ligne ne compile plus.
const exhaustive: Missing extends never ? true : Missing = true
void exhaustive

/** Méthodes en lecture seule : elles n'invalident pas le cache du renderer. */
export const LEDGER_QUERIES: ReadonlySet<LedgerMethod> = new Set<LedgerMethod>([
  'accountsList',
  'accountRevealIban',
  'transactionsList',
  'transactionsSummary',
  'transactionGet',
  'tagsList',
  'payeesList',
  'categoriesList',
  'savedFiltersList',
  'auditList',
  'ledgerHistoryStatus',
  'dashboardSummary',
  'rulesList',
  'rulePreview',
  'categorizationQueueList',
  'classifierStatus',
  'subscriptionsOverview',
  'transferCandidatesList',
  'analyticsOverview',
  'analyticsAnomalies',
  'analyticsCsvData',
  'employersList',
  'employerRevealAddress',
  'contractsList',
  'contractRevealNir',
  'payslipsList',
  'payslipGet',
  'payslipDuplicatePrevious',
  'payslipRevealSensitive',
  'payslipTransferCandidates',
  'salaryDashboard',
  'valuationsList',
  'netWorthOverview',
  'loansList',
  'loanGet',
  'loanSimulateEarlyRepayment',
  'budgetsList',
  'goalsList',
  'forecastOverview',
  'scenariosList',
  'scenarioGet',
  'scenarioSimulate',
])

export function ledgerChannel(method: LedgerMethod): string {
  return `fluxo:ledger:${method}`
}

/** API exposée au renderer : une fonction par méthode. */
export type LedgerClient = {
  readonly [M in LedgerMethod]: (input: LedgerInput<M>) => Promise<LedgerResult<LedgerOutput<M>>>
}
