import { z } from 'zod'
import { CONTRACT_TYPES, EXECUTIVE_STATUSES } from '../payslip'
import {
  AI_LOCAL_MODES,
  AI_PROVIDERS,
  ANTHROPIC_MODELS,
  DOCUMENT_KINDS,
  GOOGLE_MODELS,
  OCR_LANGUAGES,
  type AiConfigPatch,
  type DocumentCommitPayslipInput,
  type DocumentCommitStatementInput,
  type ExtractedDocumentDraft,
  type ExtractedPayslipDraft,
  type ExtractedStatementDraft,
} from './model'

const idSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)

const documentBoxSchema = z.strictObject({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
})

const sourceZoneSchema = z.strictObject({
  page: z.number().int().min(1).max(600),
  box: documentBoxSchema,
  snippet: z.string().max(400),
})

const fieldConfidenceZoneSchema = z.strictObject({
  confidence: z.number().min(0).max(1),
  sourceZone: sourceZoneSchema.nullable(),
})

const payslipLineInputSchema = z.strictObject({
  section: z.enum(['variable', 'absence', 'contribution', 'after_tax']),
  itemKind: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(200),
  quantityHundredths: z.number().int().nullable(),
  baseAmount: z.number().int().nullable(),
  employeeRateMicros: z.number().int().min(0).max(1_000_000).nullable(),
  employeeAmount: z.number().int(),
  employerRateMicros: z.number().int().min(0).max(1_000_000).nullable(),
  employerAmount: z.number().int(),
  taxable: z.boolean(),
})

export const extractedPayslipDraftSchema = z.strictObject({
  kind: z.literal('payslip'),
  employerName: z.string().max(200).nullable(),
  employerSiret: z.string().max(20).nullable(),
  contractTitle: z
    .string()
    .max(200)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  contractType: z
    .enum(CONTRACT_TYPES)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  executiveStatus: z
    .enum(EXECUTIVE_STATUSES)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  collectiveAgreement: z
    .string()
    .max(200)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  contractStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  contractEndDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  isFinalSettlement: z
    .boolean()
    .optional()
    .transform((v) => v ?? false),
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .nullable(),
  paymentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  baseHoursHundredths: z.number().int().min(0).nullable(),
  hourlyRate: z.number().int().min(0).nullable(),
  baseSalary: z.number().int().min(0),
  gross: z.number().int().min(0),
  employeeContributions: z.number().int().min(0),
  employerContributions: z.number().int().min(0),
  netBeforeTax: z.number().int(),
  taxableNet: z.number().int(),
  socialNet: z.number().int().min(0).nullable(),
  withholdingRateMicros: z.number().int().min(0).max(1_000_000),
  withholdingPersonalized: z.boolean(),
  withholdingBase: z.number().int().min(0).nullable(),
  withholdingTax: z.number().int().min(0),
  otherAdjustments: z.number().int(),
  netPaid: z.number().int(),
  ytdGross: z.number().int().min(0).nullable(),
  ytdTaxableNet: z.number().int().min(0).nullable(),
  ytdWithholding: z.number().int().min(0).nullable(),
  ytdHoursHundredths: z.number().int().min(0).nullable(),
  lines: z.array(payslipLineInputSchema).max(200),
  fieldZones: z.record(z.string(), fieldConfidenceZoneSchema),
  missingFields: z.array(z.string().max(60)).max(50),
  overallConfidence: z.number().min(0).max(1),
  needsAiAssist: z.boolean(),
}) satisfies z.ZodType<ExtractedPayslipDraft>

const extractedStatementRowSchema = z.strictObject({
  index: z.number().int().min(0),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  valueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  amount: z.number().int(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  labelRaw: z.string().max(500),
  payee: z.string().max(200).nullable(),
  note: z.string().max(500).nullable(),
  status: z.enum(['pending', 'cleared', 'reconciled']),
  externalId: z.string().max(120).nullable(),
  runningBalance: z.number().int().nullable(),
  confidence: z.number().min(0).max(1),
  sourceZone: sourceZoneSchema.nullable(),
})

export const extractedStatementDraftSchema = z.strictObject({
  kind: z.literal('statement'),
  currency: z.string().regex(/^[A-Z]{3}$/),
  accountHint: z.string().max(120).nullable(),
  periodStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  periodEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  openingBalance: z.number().int().nullable(),
  closingBalance: z.number().int().nullable(),
  rows: z.array(extractedStatementRowSchema).max(10_000),
  balanceDiscrepancy: z.number().int().nullable(),
  overallConfidence: z.number().min(0).max(1),
  needsAiAssist: z.boolean(),
}) satisfies z.ZodType<ExtractedStatementDraft>

export const extractedOtherDraftSchema = z.strictObject({
  kind: z.literal('other'),
  title: z.string().max(200).nullable(),
  detectedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  detectedAmount: z.number().int().nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  overallConfidence: z.number().min(0).max(1),
  needsAiAssist: z.boolean(),
})

export const extractedDocumentDraftSchema = z.discriminatedUnion('kind', [
  extractedPayslipDraftSchema,
  extractedStatementDraftSchema,
  extractedOtherDraftSchema,
]) satisfies z.ZodType<ExtractedDocumentDraft>

/** Vérifie qu'une URL locale autorisée cible uniquement la boucle locale (`127.0.0.1` / `localhost`). */
export function isLoopbackEndpoint(raw: string): boolean {
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    const host = parsed.hostname.toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
  } catch {
    return false
  }
}

export const aiConfigPatchSchema = z.strictObject({
  provider: z.enum(AI_PROVIDERS).optional(),
  anthropicModel: z.enum(ANTHROPIC_MODELS).optional(),
  googleModel: z.enum(GOOGLE_MODELS).optional(),
  autoAnalyzeDocuments: z.boolean().optional(),
  localMode: z.enum(AI_LOCAL_MODES).optional(),
  localEndpoint: z
    .string()
    .trim()
    .max(200)
    .refine(isLoopbackEndpoint, { message: 'loopback-required' })
    .optional(),
  localModel: z.string().trim().min(1).max(120).optional(),
  monthlyCapMicroUsd: z.number().int().min(0).max(500_000_000).optional(),
}) satisfies z.ZodType<AiConfigPatch>

export const documentIdSchema = z.strictObject({
  documentId: idSchema,
})

export const documentRunExtractionSchema = z.strictObject({
  documentId: idSchema,
  kindOverride: z.enum(DOCUMENT_KINDS).optional(),
  ocrLanguage: z.enum(OCR_LANGUAGES).optional(),
})

export const documentUpdateDraftSchema = z.strictObject({
  documentId: idSchema,
  draft: extractedDocumentDraftSchema,
})

export const documentStagePathsSchema = z.strictObject({
  paths: z.array(z.string().min(1).max(4096)).min(1).max(200),
})

export const documentCommitPayslipSchema = z.strictObject({
  documentId: idSchema,
  contractId: idSchema.nullable(),
  employerName: z.string().trim().max(200).optional(),
  employerSiret: z.string().trim().max(20).nullable().optional(),
  contractTitle: z.string().trim().max(200).optional(),
  contractStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  contractEndDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  draft: extractedPayslipDraftSchema,
  linkTransactionId: idSchema.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
}) satisfies z.ZodType<DocumentCommitPayslipInput>

export const documentCommitPayslipBatchSchema = z.strictObject({
  documentIds: z.array(idSchema).min(1).max(200),
})

export const documentCommitStatementSchema = z.strictObject({
  documentId: idSchema,
  accountId: idSchema,
  draft: extractedStatementDraftSchema,
}) satisfies z.ZodType<DocumentCommitStatementInput>

export const aiPreviewAssistSchema = z.strictObject({
  documentId: idSchema,
})

export const aiExecuteAssistSchema = z.strictObject({
  documentId: idSchema,
  previewToken: z.string().regex(/^[0-9a-f]{32}$/),
  consentConfirmed: z.literal(true),
})

export const aiPreviewCategorizeSchema = z.strictObject({
  transactionIds: z.array(idSchema).min(1).max(40),
})

export const aiExecuteCategorizeSchema = z.strictObject({
  previewToken: z.string().regex(/^[0-9a-f]{32}$/),
  consentConfirmed: z.literal(true),
})

export const ocrLanguageSchema = z.strictObject({
  language: z.enum(OCR_LANGUAGES),
})

export const anthropicApiKeySchema = z.strictObject({
  apiKey: z.string().trim().min(12).max(256),
  provider: z.enum(['anthropic', 'google']).optional(),
})

export const aiProviderTargetSchema = z.strictObject({
  provider: z.enum(['anthropic', 'google']).optional(),
})

export const aiPreviewInsightsSchema = z.strictObject({
  scope: z.enum(['analytics', 'planning']),
})

export const aiInsightsStructuredOutputSchema = z.strictObject({
  summary: z.string().max(1200),
  highlights: z.array(z.string().max(400)).max(6),
  warnings: z.array(z.string().max(400)).max(6),
  suggestions: z.array(z.string().max(400)).max(6),
})

/** Schéma JSON structuré demandé à Claude / Ollama pour compléter un bulletin de paie. */
export const aiPayslipStructuredOutputSchema = z.strictObject({
  employerName: z.string().nullable(),
  contractTitle: z.string().nullable().optional(),
  contractStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  contractEndDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  isFinalSettlement: z.boolean().optional(),
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .nullable(),
  paymentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  baseSalaryCents: z.number().int().min(0),
  grossCents: z.number().int().min(0),
  employeeContributionsCents: z.number().int().min(0),
  employerContributionsCents: z.number().int().min(0),
  netBeforeTaxCents: z.number().int(),
  taxableNetCents: z.number().int(),
  socialNetCents: z.number().int().min(0).nullable(),
  withholdingTaxCents: z.number().int().min(0),
  withholdingRateMicros: z.number().int().min(0).max(1_000_000),
  otherAdjustmentsCents: z.number().int(),
  netPaidCents: z.number().int(),
  confidence: z.number().min(0).max(1),
})

/** Schéma JSON structuré demandé à Claude / Ollama pour compléter un relevé bancaire PDF. */
export const aiStatementStructuredOutputSchema = z.strictObject({
  currency: z.string().regex(/^[A-Z]{3}$/),
  periodStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  periodEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  openingBalanceCents: z.number().int().nullable(),
  closingBalanceCents: z.number().int().nullable(),
  rows: z.array(
    z.strictObject({
      bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      amountCents: z.number().int(),
      labelRaw: z.string().min(1).max(300),
      payee: z.string().max(120).nullable(),
    }),
  ),
  confidence: z.number().min(0).max(1),
})

/** Schéma JSON structuré demandé à Claude / Ollama pour suggérer des catégories. */
export const aiCategorizationStructuredOutputSchema = z.strictObject({
  suggestions: z.array(
    z.strictObject({
      index: z.number().int().min(0),
      categoryId: z.string().nullable(),
      suggestedLabel: z.string().max(120).nullable(),
      confidence: z.number().min(0).max(1),
      reason: z.string().max(240),
    }),
  ),
})
