import type { MinorUnits } from '../money'

export const RULE_LABEL_OPS = ['contains', 'starts-with', 'equals', 'regex'] as const
export type RuleLabelOp = (typeof RULE_LABEL_OPS)[number]

export const RULE_DIRECTIONS = ['any', 'expense', 'income'] as const
export type RuleDirection = (typeof RULE_DIRECTIONS)[number]

export const RULE_AMOUNT_OPS = ['any', 'eq', 'gt', 'lt', 'between'] as const
export type RuleAmountOp = (typeof RULE_AMOUNT_OPS)[number]

export interface RuleConditions {
  labelOp: RuleLabelOp
  labelValue: string
  caseSensitive?: boolean
  direction: RuleDirection
  amountOp: RuleAmountOp
  /** Montant en centimes absolus pour les comparaisons (> / < / =) ou borne min. */
  amountMin?: MinorUnits | null
  amountMax?: MinorUnits | null
  accountIds?: string[]
}

export interface RuleActions {
  categoryId?: string | null
  tagIds?: string[]
  customLabel?: string | null
  payee?: string | null
  markAsTransfer?: boolean
}

export interface RuleSummary {
  id: string
  name: string
  conditions: RuleConditions
  actions: RuleActions
  priority: number
  active: boolean
  appliedCount: number
  lastAppliedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface RulePreviewResult {
  matchCount: number
  samples: {
    id: string
    bookingDate: string
    label: string
    amount: MinorUnits
    currency: string
    accountName: string
  }[]
}

export type SuggestionSource = 'rule' | 'merchant' | 'naive-bayes'
export type SuggestionStatus = 'pending' | 'accepted' | 'rejected'

export interface CategorizationQueueItem {
  transactionId: string
  accountId: string
  accountName: string
  bookingDate: string
  amount: MinorUnits
  currency: string
  labelRaw: string
  labelDisplay: string
  cleanedLabel: string
  payee: string | null
  currentCategoryId: string | null
  currentTagIds: string[]
  suggestion: {
    categoryId: string | null
    categoryName: string | null
    tagIds: string[]
    suggestedLabel: string | null
    suggestedPayee: string | null
    source: SuggestionSource
    ruleId: string | null
    confidence: number
    reason: string
  } | null
}

export interface AutoCategorizeResult {
  evaluatedCount: number
  autoAppliedCount: number
  queuedCount: number
  durationMs: number
}

export interface ClassifierStatus {
  sampleCount: number
  categoryCount: number
  updatedAt: string | null
  threshold: number
}

export type RecurrenceFrequency = 'monthly' | 'quarterly' | 'annual'

export interface PriceIncreaseAlert {
  previousAmount: MinorUnits
  currentAmount: MinorUnits
  delta: MinorUnits
  percent: number
}

export interface RecurringSubscription {
  signature: string
  merchant: string
  accountId: string
  accountName: string
  currency: string
  frequency: RecurrenceFrequency
  expectedAmount: MinorUnits
  latestAmount: MinorUnits
  monthlyEquivalent: MinorUnits
  annualEquivalent: MinorUnits
  occurrenceCount: number
  lastDate: string
  nextExpectedDate: string
  dormant: boolean
  priceIncrease: PriceIncreaseAlert | null
  categoryId: string | null
  categoryName: string | null
}

export interface SubscriptionsOverview {
  subscriptions: RecurringSubscription[]
  totalMonthlyCost: MinorUnits
  totalAnnualCost: MinorUnits
  priceIncreaseCount: number
  dormantCount: number
  currency: string
}

export interface TransferMatchCandidate {
  id: string
  fromTransaction: {
    id: string
    accountId: string
    accountName: string
    bookingDate: string
    amount: MinorUnits
    currency: string
    label: string
  }
  toTransaction: {
    id: string
    accountId: string
    accountName: string
    bookingDate: string
    amount: MinorUnits
    currency: string
    label: string
  }
  dayDiff: number
  isSavingsTransfer: boolean
}
