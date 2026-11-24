import { z } from 'zod'
import {
  CSV_DATE_FORMATS,
  CSV_DELIMITERS,
  CSV_ENCODINGS,
  STATEMENT_FORMATS,
  type CsvProfileConfig,
  type ImportCommitInput,
} from './model'

const uuidSchema = z.string().regex(/^[0-9a-f-]{36}$/)
export const importTokenSchema = z.string().regex(/^[0-9a-f]{32}$/)
export const previewIdSchema = z.string().regex(/^[0-9a-f]{32}$/)

const columnRefSchema = z.union([
  z.string().trim().min(1).max(120),
  z.number().int().min(0).max(200),
])
const optionalColumnRefSchema = columnRefSchema.nullish()

export const csvColumnMappingSchema = z.strictObject({
  bookingDate: columnRefSchema,
  valueDate: optionalColumnRefSchema,
  label: columnRefSchema,
  labelSecondary: optionalColumnRefSchema,
  payee: optionalColumnRefSchema,
  note: optionalColumnRefSchema,
  amount: optionalColumnRefSchema,
  debit: optionalColumnRefSchema,
  credit: optionalColumnRefSchema,
  debitCreditFlag: optionalColumnRefSchema,
  balance: optionalColumnRefSchema,
  currency: optionalColumnRefSchema,
  status: optionalColumnRefSchema,
})

export const csvProfileConfigSchema: z.ZodType<CsvProfileConfig> = z.strictObject({
  delimiter: z.enum(CSV_DELIMITERS),
  encoding: z.enum(CSV_ENCODINGS),
  dateFormat: z.enum(CSV_DATE_FORMATS),
  skipRows: z.number().int().min(0).max(100),
  hasHeader: z.boolean(),
  amountMode: z.enum(['single', 'split']),
  negateAmount: z.boolean().optional(),
  columns: csvColumnMappingSchema,
})

/** Format JSON partageable pour les profils CSV communautaires. */
export const csvProfileShareJsonSchema = z.strictObject({
  schema: z.literal('fluxo-csv-profile-v1').optional(),
  name: z.string().trim().min(1).max(80),
  bank: z.string().trim().min(1).max(80).nullable().optional(),
  config: csvProfileConfigSchema,
})

export const csvProfileSaveSchema = z.strictObject({
  id: uuidSchema.optional(),
  name: z.string().trim().min(1).max(80),
  bank: z.string().trim().min(1).max(80).nullable(),
  config: csvProfileConfigSchema,
})

export const importInspectSchema = z.strictObject({
  token: importTokenSchema,
  csvConfig: csvProfileConfigSchema.optional(),
})

export const importParseRequestSchema = z.strictObject({
  token: importTokenSchema,
  accountId: uuidSchema,
  csvConfig: csvProfileConfigSchema.optional(),
  profileName: z.string().trim().min(1).max(80).nullable().optional(),
  forcedFormat: z.enum(STATEMENT_FORMATS).optional(),
})

export const importCommitSchema: z.ZodType<ImportCommitInput> = z.strictObject({
  previewId: previewIdSchema,
  rowDecisions: z
    .array(
      z.strictObject({
        index: z.number().int().min(0).max(200_000),
        action: z.enum(['import', 'skip']),
      }),
    )
    .max(200_000)
    .optional(),
  createAdjustment: z
    .strictObject({
      note: z.string().trim().min(1).max(400),
    })
    .nullable()
    .optional(),
  replaceAdjustmentIds: z.array(uuidSchema).max(50).optional(),
  saveProfile: z
    .strictObject({
      name: z.string().trim().min(1).max(80),
      bank: z.string().trim().min(1).max(80).nullable(),
      config: csvProfileConfigSchema,
    })
    .nullable()
    .optional(),
})

export const importBatchesListSchema = z.strictObject({
  accountId: uuidSchema.optional(),
  limit: z.number().int().min(1).max(200).optional(),
})

export const importRevertSchema = z.strictObject({
  batchId: uuidSchema,
})

export const csvProfileDeleteSchema = z.strictObject({
  id: uuidSchema,
})
