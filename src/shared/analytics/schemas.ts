import { z } from 'zod'

const uuidSchema = z.string().regex(/^[0-9a-f-]{36}$/)
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
const currencySchema = z.string().regex(/^[A-Z]{3}$/)

export const analyticsFilterSchema = z.strictObject({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  accountIds: z.array(uuidSchema).max(100).optional(),
  categoryIds: z
    .array(z.union([uuidSchema, z.literal('none')]))
    .max(200)
    .optional(),
  tagIds: z.array(uuidSchema).max(100).optional(),
  minAmount: z.number().int().min(0).optional(),
  maxAmount: z.number().int().min(0).optional(),
  includeTransfers: z.boolean().optional(),
  currency: currencySchema,
  focusMonth: monthSchema.optional(),
})

export const exportAnalyticsCsvSchema = z.strictObject({
  filter: analyticsFilterSchema,
})

export const exportAnalyticsImageSchema = z.strictObject({
  format: z.enum(['png', 'svg']),
  defaultName: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z0-9_-]+$/),
  data: z.string().min(16).max(6_000_000),
})

export const exportAnalyticsPdfSchema = z.strictObject({
  filter: analyticsFilterSchema,
})
