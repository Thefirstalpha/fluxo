import type { MinorUnits } from '../money'
import type { ContractType, ExecutiveStatus, PayslipLineInput } from '../payslip'

/** Formats MIME pris en charge par la boîte de dépôt documentaire (M7). */
export const DOCUMENT_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const
export type DocumentMimeType = (typeof DOCUMENT_MIME_TYPES)[number]

export const DOCUMENT_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg'] as const

/** Bornes de sûreté ADR-017 / M7 : jamais de fichier arbitrairement grand ni PDF bombe. */
export const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024
export const MAX_DOCUMENT_PAGES = 600

export const DOCUMENT_KINDS = ['payslip', 'statement', 'other'] as const
export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

export const DOCUMENT_STATUSES = [
  'pending',
  'extracted',
  'needs_review',
  'committed',
  'rejected',
] as const
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number]

export const DOCUMENT_EXTRACTION_METHODS = [
  'pdf-text',
  'ocr',
  'ai-local',
  'ai-google',
  'ai-claude',
  'manual',
] as const
export type DocumentExtractionMethod = (typeof DOCUMENT_EXTRACTION_METHODS)[number]

export const DOCUMENT_LINKED_TYPES = ['payslip', 'import_batch'] as const
export type DocumentLinkedEntityType = (typeof DOCUMENT_LINKED_TYPES)[number]

export const AI_PROVIDERS = ['none', 'local', 'google', 'anthropic'] as const
export type AiProviderId = (typeof AI_PROVIDERS)[number]

export const AI_LOCAL_MODES = ['embedded', 'ollama'] as const
export type AiLocalMode = (typeof AI_LOCAL_MODES)[number]

export const AI_PURPOSES = ['payslip', 'statement', 'categorization', 'insights'] as const
export type AiPurpose = (typeof AI_PURPOSES)[number]

export const AI_SEND_STATUSES = ['sent', 'refused', 'error', 'dry-run'] as const
export type AiSendStatus = (typeof AI_SEND_STATUSES)[number]

export const OCR_LANGUAGES = ['fra', 'eng'] as const
export type OcrLanguage = (typeof OCR_LANGUAGES)[number]

export const ANTHROPIC_MODELS = ['claude-sonnet-4-5', 'claude-haiku-4-5'] as const
export type AnthropicModelId = (typeof ANTHROPIC_MODELS)[number]

export const GOOGLE_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.5-flash-lite',
] as const
export type GoogleModelId = (typeof GOOGLE_MODELS)[number]

/** Coordonnées normalisées (0..1) sur une page, origine en haut à gauche. */
export interface DocumentBox {
  x: number
  y: number
  width: number
  height: number
}

export interface ExtractedTextItem {
  text: string
  box: DocumentBox
}

export interface ExtractedPage {
  pageNumber: number
  width: number
  height: number
  text: string
  items: ExtractedTextItem[]
}

export interface SourceZone {
  page: number
  box: DocumentBox
  snippet: string
}

export interface FieldConfidenceZone {
  confidence: number
  sourceZone: SourceZone | null
}

export interface ExtractedPayslipDraft {
  kind: 'payslip'
  employerName: string | null
  employerSiret: string | null
  contractTitle: string | null
  contractType: ContractType | null
  executiveStatus: ExecutiveStatus | null
  collectiveAgreement: string | null
  contractStartDate: string | null
  contractEndDate: string | null
  isFinalSettlement: boolean
  period: string | null
  paymentDate: string | null
  currency: string
  baseHoursHundredths: number | null
  hourlyRate: MinorUnits | null
  baseSalary: MinorUnits
  gross: MinorUnits
  employeeContributions: MinorUnits
  employerContributions: MinorUnits
  netBeforeTax: MinorUnits
  taxableNet: MinorUnits
  socialNet: MinorUnits | null
  withholdingRateMicros: number
  withholdingPersonalized: boolean
  withholdingBase: MinorUnits | null
  withholdingTax: MinorUnits
  otherAdjustments: MinorUnits
  netPaid: MinorUnits
  ytdGross: MinorUnits | null
  ytdTaxableNet: MinorUnits | null
  ytdWithholding: MinorUnits | null
  ytdHoursHundredths: number | null
  lines: PayslipLineInput[]
  fieldZones: Record<string, FieldConfidenceZone>
  missingFields: string[]
  overallConfidence: number
  needsAiAssist: boolean
}

export interface ExtractedStatementRow {
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
  confidence: number
  sourceZone: SourceZone | null
}

export interface ExtractedStatementDraft {
  kind: 'statement'
  currency: string
  accountHint: string | null
  periodStart: string | null
  periodEnd: string | null
  openingBalance: MinorUnits | null
  closingBalance: MinorUnits | null
  rows: ExtractedStatementRow[]
  balanceDiscrepancy: MinorUnits | null
  overallConfidence: number
  needsAiAssist: boolean
}

export interface ExtractedOtherDraft {
  kind: 'other'
  title: string | null
  detectedDate: string | null
  detectedAmount: MinorUnits | null
  currency: string | null
  overallConfidence: number
  needsAiAssist: boolean
}

export type ExtractedDocumentDraft =
  ExtractedPayslipDraft | ExtractedStatementDraft | ExtractedOtherDraft

export interface DocumentListItem {
  id: string
  kind: DocumentKind
  fileName: string
  mimeType: DocumentMimeType
  sha256: string
  pageCount: number
  status: DocumentStatus
  extractionMethod: DocumentExtractionMethod
  confidence: number
  linkedEntityType: DocumentLinkedEntityType | null
  linkedEntityId: string | null
  createdAt: string
  updatedAt: string
}

export interface DocumentDetail extends DocumentListItem {
  draft: ExtractedDocumentDraft | null
  pages: ExtractedPage[]
  hasOriginalBytes: boolean
  previewImageDataUrl: string | null
}

export interface RedactionCount {
  category: 'nir' | 'iban' | 'card' | 'email' | 'siret' | 'name' | 'address' | 'phone'
  count: number
}

export interface AiSendLogEntry {
  id: string
  provider: AiProviderId
  model: string
  purpose: AiPurpose
  documentId: string | null
  inputTokens: number
  outputTokens: number
  costMicroUsd: number
  payloadSha256: string
  redactions: RedactionCount[]
  status: AiSendStatus
  createdAt: string
}

export interface OcrLanguageStatus {
  language: OcrLanguage
  installed: boolean
  sizeBytes: number
  expectedBytes: number
  sha256: string
}

export interface AiConfigPublic {
  provider: AiProviderId
  anthropicModel: AnthropicModelId
  hasAnthropicKey: boolean
  googleModel: GoogleModelId
  hasGoogleKey: boolean
  autoAnalyzeDocuments: boolean
  localMode: AiLocalMode
  localEndpoint: string
  localModel: string
  monthlyCapMicroUsd: number
  spentThisMonthMicroUsd: number
  ocrLanguages: Record<OcrLanguage, OcrLanguageStatus>
}

export interface AiConfigPatch {
  provider?: AiProviderId
  anthropicModel?: AnthropicModelId
  googleModel?: GoogleModelId
  autoAnalyzeDocuments?: boolean
  localMode?: AiLocalMode
  localEndpoint?: string
  localModel?: string
  monthlyCapMicroUsd?: number
}

export interface AiInsightsResult {
  summary: string
  highlights: string[]
  warnings: string[]
  suggestions: string[]
}

export type AiInsightsOutcome =
  | {
      ok: true
      insights: AiInsightsResult
      logEntry: AiSendLogEntry
    }
  | {
      ok: false
      reason:
        | 'disabled'
        | 'consent-required'
        | 'cap-exceeded'
        | 'missing-key'
        | 'network-error'
        | 'refusal'
        | 'invalid-output'
        | 'empty'
    }

export interface AiSendPreview {
  token: string
  provider: AiProviderId
  model: string
  purpose: AiPurpose
  destinationLabel: string
  anonymizedPayload: string
  redactions: RedactionCount[]
  estimatedInputTokens: number
  estimatedOutputTokens: number
  estimatedCostMicroUsd: number
  spentThisMonthMicroUsd: number
  monthlyCapMicroUsd: number
  exceedsCap: boolean
  documentId: string | null
}

export type DocumentStageOutcome =
  | {
      ok: true
      document: DocumentDetail
      duplicateOf: DocumentListItem | null
      ocrMissingLanguage: OcrLanguage | null
    }
  | {
      ok: false
      reason:
        | 'cancelled'
        | 'not-found'
        | 'invalid-file'
        | 'too-large'
        | 'too-many-pages'
        | 'vault-locked'
        | 'parse-failed'
    }

export interface DocumentCommitPayslipInput {
  documentId: string
  contractId: string | null
  employerName?: string
  employerSiret?: string | null
  contractTitle?: string
  contractStartDate?: string | null
  contractEndDate?: string | null
  draft: ExtractedPayslipDraft
  linkTransactionId?: string | null
  notes?: string | null
}

export interface DocumentCommitStatementInput {
  documentId: string
  accountId: string
  draft: ExtractedStatementDraft
}

export interface DocumentBatchPayslipCommitOutcome {
  committedCount: number
  createdEmployers: number
  createdContracts: number
  updatedContracts: number
  skippedCount: number
  failedIds: string[]
  results: DocumentCommitOutcome[]
}

export type DocumentCommitOutcome =
  | {
      ok: true
      document: DocumentListItem
      linkedEntityType: DocumentLinkedEntityType
      linkedEntityId: string
      importedInserted?: number
    }
  | {
      ok: false
      reason: 'not-found' | 'invalid' | 'vault-locked' | 'commit-failed'
    }

export interface AiCategorizeSuggestionItem {
  transactionId: string
  categoryId: string | null
  suggestedLabel: string | null
  confidence: number
  reason: string
}

export type AiAssistOutcome =
  | {
      ok: true
      document: DocumentDetail
      logEntry: AiSendLogEntry
    }
  | {
      ok: false
      reason:
        | 'disabled'
        | 'consent-required'
        | 'cap-exceeded'
        | 'missing-key'
        | 'network-error'
        | 'refusal'
        | 'invalid-output'
        | 'not-found'
    }

export type AiCategorizeApplyOutcome =
  | {
      ok: true
      appliedCount: number
      logEntry: AiSendLogEntry
    }
  | {
      ok: false
      reason:
        | 'disabled'
        | 'consent-required'
        | 'cap-exceeded'
        | 'missing-key'
        | 'network-error'
        | 'refusal'
        | 'invalid-output'
        | 'empty'
    }

export type OcrDownloadOutcome =
  | { ok: true; status: OcrLanguageStatus }
  | { ok: false; reason: 'checksum-mismatch' | 'download-failed' | 'cancelled' }

export type DocumentOriginalExportOutcome =
  | { ok: true; fileName: string }
  | { ok: false; reason: 'cancelled' | 'no-original' | 'vault-locked' }

/** Normalise une raison sociale ou un intitulé de contrat pour la déduplication. */
export function normalizeCompanyName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}
