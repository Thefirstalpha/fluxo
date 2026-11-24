import type { MinorUnits } from '../money'

export const STATEMENT_FORMATS = ['csv', 'ofx', 'qfx', 'qif', 'camt053', 'mt940'] as const
export type StatementFormat = (typeof STATEMENT_FORMATS)[number]

export const IMPORT_BATCH_FORMATS = [...STATEMENT_FORMATS, 'demo'] as const
export type ImportBatchFormat = (typeof IMPORT_BATCH_FORMATS)[number]

export const IMPORT_EXTENSIONS = [
  '.csv',
  '.tsv',
  '.txt',
  '.ofx',
  '.qfx',
  '.qif',
  '.xml',
  '.camt',
  '.mt940',
  '.sta',
  '.940',
] as const

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024 // 20 Mio
export const MAX_IMPORT_LINES = 200_000

export const CSV_DELIMITERS = [';', ',', '\t', '|'] as const
export type CsvDelimiter = (typeof CSV_DELIMITERS)[number]

export const CSV_DATE_FORMATS = [
  'auto',
  'DD/MM/YYYY',
  'DD/MM/YY',
  'YYYY-MM-DD',
  'DD-MM-YYYY',
  'DD.MM.YYYY',
  'MM/DD/YYYY',
  'YYYYMMDD',
] as const
export type CsvDateFormat = (typeof CSV_DATE_FORMATS)[number]

export const CSV_ENCODINGS = ['auto', 'utf-8', 'windows-1252', 'iso-8859-1'] as const
export type CsvEncoding = (typeof CSV_ENCODINGS)[number]
export type ResolvedEncoding = 'utf-8' | 'windows-1252' | 'iso-8859-1'

export type CsvColumnRef = string | number

export interface CsvColumnMapping {
  bookingDate: CsvColumnRef
  valueDate?: CsvColumnRef | null
  label: CsvColumnRef
  labelSecondary?: CsvColumnRef | null
  payee?: CsvColumnRef | null
  note?: CsvColumnRef | null
  amount?: CsvColumnRef | null
  debit?: CsvColumnRef | null
  credit?: CsvColumnRef | null
  debitCreditFlag?: CsvColumnRef | null
  balance?: CsvColumnRef | null
  currency?: CsvColumnRef | null
  status?: CsvColumnRef | null
}

export interface CsvProfileConfig {
  delimiter: CsvDelimiter
  encoding: CsvEncoding
  dateFormat: CsvDateFormat
  skipRows: number
  hasHeader: boolean
  amountMode: 'single' | 'split'
  negateAmount?: boolean
  columns: CsvColumnMapping
}

export interface CsvProfile {
  id: string
  name: string
  bank: string | null
  builtin: boolean
  config: CsvProfileConfig
}

export interface CsvInspection {
  delimiter: CsvDelimiter
  skipRows: number
  hasHeader: boolean
  headers: string[]
  sampleRows: string[][]
  suggestedProfileId: string | null
  suggestedConfig: CsvProfileConfig
}

export interface ImportWarning {
  line?: number
  code:
    | 'skipped-line'
    | 'currency-mismatch'
    | 'encoding-fallback'
    | 'date-ambiguous'
    | 'unsettled-card-notice'
  detail?: string
}

export interface ParsedTransaction {
  index: number
  bookingDate: string
  valueDate: string | null
  amount: MinorUnits
  currency: string | null
  labelRaw: string
  payee: string | null
  note: string | null
  status: 'pending' | 'cleared' | 'reconciled'
  externalId: string | null
  runningBalance: MinorUnits | null
}

export interface ParsedStatement {
  format: StatementFormat
  encoding: ResolvedEncoding
  currency: string | null
  accountHint: string | null
  accountTypeHint: 'checking' | 'savings' | 'deferred_card' | null
  periodStart: string | null
  periodEnd: string | null
  openingBalance: MinorUnits | null
  closingBalance: MinorUnits | null
  rows: ParsedTransaction[]
  skippedLines: number
  warnings: ImportWarning[]
  csvInspection?: CsvInspection
}

export type ImportMatchKind = 'new' | 'exact-duplicate' | 'fuzzy-duplicate' | 'settles-pending'
export type ImportRowAction = 'import' | 'skip'

export interface MatchedTransactionHint {
  id: string
  bookingDate: string
  amount: MinorUnits
  label: string
  status: 'pending' | 'cleared' | 'reconciled'
}

export interface ImportPreviewRow {
  index: number
  bookingDate: string
  valueDate: string | null
  amount: MinorUnits
  currency: string
  labelRaw: string
  payee: string | null
  note: string | null
  status: 'pending' | 'cleared' | 'reconciled'
  matchKind: ImportMatchKind
  defaultAction: ImportRowAction
  matchedTransaction?: MatchedTransactionHint
}

export interface OverlappingAdjustment {
  id: string
  bookingDate: string
  amount: MinorUnits
  note: string
}

export interface ImportPreviewCounts {
  total: number
  newCount: number
  exactDuplicateCount: number
  fuzzyDuplicateCount: number
  pendingCount: number
  skippedLines: number
}

export interface ImportPreview {
  previewId: string
  accountId: string
  accountCurrency: string
  accountType: string
  fileName: string
  format: StatementFormat
  encoding: ResolvedEncoding
  profile: string | null
  periodStart: string | null
  periodEnd: string | null
  openingBalance: MinorUnits | null
  closingBalance: MinorUnits | null
  projectedBalance: MinorUnits | null
  discrepancy: MinorUnits | null
  counts: ImportPreviewCounts
  overlappingAdjustments: OverlappingAdjustment[]
  warnings: ImportWarning[]
  csvInspection?: CsvInspection
  rows: ImportPreviewRow[]
}

export interface ImportRowDecision {
  index: number
  action: ImportRowAction
}

export interface ImportCommitInput {
  previewId: string
  rowDecisions?: ImportRowDecision[]
  createAdjustment?: { note: string } | null
  replaceAdjustmentIds?: string[]
  saveProfile?: { name: string; bank: string | null; config: CsvProfileConfig } | null
}

export interface ImportCommitResult {
  batchId: string
  insertedCount: number
  duplicateCount: number
  skippedCount: number
  replacedAdjustmentCount: number
  adjustmentTransactionId: string | null
  savedProfile: CsvProfile | null
}

export interface ImportBatchSummary {
  id: string
  accountId: string
  accountName: string
  fileName: string
  format: ImportBatchFormat
  profile: string | null
  periodStart: string | null
  periodEnd: string | null
  openingBalance: MinorUnits | null
  closingBalance: MinorUnits | null
  balanceDiscrepancy: MinorUnits | null
  insertedCount: number
  duplicateCount: number
  skippedCount: number
  state: 'pending' | 'committed' | 'reverted'
  createdAt: string
}

export type ImportFileFailureReason =
  | 'cancelled'
  | 'invalid-file'
  | 'file-too-large'
  | 'unsupported-extension'
  | 'too-many-lines'
  | 'parse-failed'
  | 'unsafe-xml'
  | 'timeout'
  | 'vault-locked'
  | 'valuation-account'
  | 'not-found'

export type StageImportFileResult =
  | {
      ok: true
      token: string
      fileName: string
      extension: string
      sizeBytes: number
      detectedFormat: StatementFormat
    }
  | {
      ok: false
      reason: ImportFileFailureReason
    }

export type ParseInspectResult =
  | {
      ok: true
      format: StatementFormat
      encoding: ResolvedEncoding
      csvInspection?: CsvInspection
      warnings: ImportWarning[]
    }
  | {
      ok: false
      reason: ImportFileFailureReason
      detail?: string
    }

export type ImportPreviewOutcome =
  | { ok: true; preview: ImportPreview }
  | { ok: false; reason: ImportFileFailureReason; detail?: string }
