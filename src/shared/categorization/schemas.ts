import { z } from 'zod'
import {
  RULE_AMOUNT_OPS,
  RULE_DIRECTIONS,
  RULE_LABEL_OPS,
  type RuleActions,
  type RuleConditions,
} from './model'
import { validateSafeRegex } from './regex'

const uuidSchema = z.string().regex(/^[0-9a-f-]{36}$/)

export const ruleConditionsSchema: z.ZodType<RuleConditions> = z
  .strictObject({
    labelOp: z.enum(RULE_LABEL_OPS),
    labelValue: z.string().trim().min(1).max(180),
    caseSensitive: z.boolean().optional(),
    direction: z.enum(RULE_DIRECTIONS),
    amountOp: z.enum(RULE_AMOUNT_OPS),
    amountMin: z.number().int().min(0).nullable().optional(),
    amountMax: z.number().int().min(0).nullable().optional(),
    accountIds: z.array(uuidSchema).max(50).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.labelOp === 'regex') {
      const check = validateSafeRegex(val.labelValue, val.caseSensitive)
      if (!check.ok) {
        ctx.addIssue({ code: 'custom', message: check.error, path: ['labelValue'] })
      }
    }
  })

export const ruleActionsSchema: z.ZodType<RuleActions> = z
  .strictObject({
    categoryId: uuidSchema.nullable().optional(),
    tagIds: z.array(uuidSchema).max(20).optional(),
    customLabel: z.string().trim().min(1).max(200).nullable().optional(),
    payee: z.string().trim().min(1).max(120).nullable().optional(),
    markAsTransfer: z.boolean().optional(),
  })
  .refine(
    (val) =>
      val.categoryId !== undefined ||
      (val.tagIds !== undefined && val.tagIds.length > 0) ||
      Boolean(val.customLabel) ||
      Boolean(val.payee) ||
      val.markAsTransfer === true,
    { message: 'Une règle doit définir au moins une action' },
  )

export const ruleSaveSchema = z.strictObject({
  id: uuidSchema.optional(),
  name: z.string().trim().min(1).max(120),
  conditions: ruleConditionsSchema,
  actions: ruleActionsSchema,
  priority: z.number().int().min(0).max(10_000).optional(),
  active: z.boolean().optional(),
})
