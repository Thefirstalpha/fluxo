/**
 * Schémas d'entrée des requêtes du registre, appliqués DEUX fois : par le process main (le
 * renderer est non fiable) et par le service de données (défense en profondeur).
 * Les règles métier (somme des ventilations, compte à relevé…) sont vérifiées par le service.
 */
import { z } from 'zod'
import { analyticsFilterSchema } from '../analytics/schemas'
import { ruleConditionsSchema, ruleSaveSchema } from '../categorization/schemas'
import type { LedgerMethod } from './api'
import { isValidIban, normalizeIban } from './iban'
import {
  ACCOUNT_TYPES,
  AUDIT_ENTITIES,
  CATEGORY_KINDS,
  LEDGER_ICONS,
  PALETTE,
  TRACKING_MODES,
  TRANSACTION_SORTS,
  TRANSACTION_STATUSES,
  UNCATEGORIZED,
} from './model'

/** Montant maximal accepté (en centimes) : 10 milliards, bien en deçà des entiers sûrs. */
export const MAX_AMOUNT = 1_000_000_000_000

export const idSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)

/** Date calendaire `AAAA-MM-JJ` existante (le 31 février est refusé). */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  })

export const amountSchema = z.int().min(-MAX_AMOUNT).max(MAX_AMOUNT)

/** Texte saisi : espaces de bord retirés, longueur bornée ; vide → `null` si facultatif. */
const requiredText = (max: number) => z.string().trim().min(1).max(max)
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value ? value : null))

export const currencySchema = z.string().regex(/^[A-Z]{3}$/)

const ibanSchema = z
  .string()
  .max(60)
  .nullable()
  .transform((value) => (value ? normalizeIban(value) : null))
  .refine((value) => value === null || isValidIban(value), { message: 'iban' })

const accountDraftSchema = z.strictObject({
  name: requiredText(200),
  type: z.enum(ACCOUNT_TYPES),
  trackingMode: z.enum(TRACKING_MODES),
  institution: optionalText(200),
  currency: currencySchema,
  openingBalance: amountSchema,
  openingDate: isoDateSchema.nullable(),
  iban: ibanSchema,
  color: z.enum(PALETTE).nullable(),
  icon: z.enum(LEDGER_ICONS).nullable(),
})

const byId = z.strictObject({ id: idSchema })

/** Lots d'identifiants (édition en masse) : bornés. */
const ids = (max = 5_000) => z.array(idSchema).min(1).max(max)

const splitSchema = z.strictObject({
  categoryId: idSchema.nullable(),
  amount: amountSchema,
  note: optionalText(2000),
  tagIds: z.array(idSchema).max(50),
})

const filterSchema = z.strictObject({
  accountIds: z.array(idSchema).max(500).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  search: z.string().max(200).optional(),
  categoryIds: z
    .array(z.union([idSchema, z.literal(UNCATEGORIZED)]))
    .max(500)
    .optional(),
  tagIds: z.array(idSchema).max(50).optional(),
  minAmount: amountSchema.optional(),
  maxAmount: amountSchema.optional(),
  direction: z.enum(['in', 'out']).optional(),
  statuses: z.array(z.enum(TRANSACTION_STATUSES)).max(3).optional(),
  favorite: z.boolean().optional(),
})

const transactionFields = {
  bookingDate: isoDateSchema,
  valueDate: isoDateSchema.nullable(),
  amount: amountSchema,
  convertedAmount: amountSchema.nullable(),
  payee: optionalText(200),
  note: optionalText(2000),
  status: z.enum(TRANSACTION_STATUSES),
}

const tagDraft = z.strictObject({ name: requiredText(60), color: z.enum(PALETTE).nullable() })

export const LEDGER_INPUTS = {
  accountsList: z.strictObject({
    includeArchived: z.boolean().optional(),
    /** Soldes à cette date (incluse) ; par défaut, toutes les opérations. */
    asOf: isoDateSchema.optional(),
  }),
  accountCreate: accountDraftSchema,
  accountUpdate: z.strictObject({ id: idSchema, patch: accountDraftSchema.partial() }),
  accountSetArchived: z.strictObject({ id: idSchema, archived: z.boolean() }),
  accountDelete: byId,
  accountRevealIban: byId,
  accountsReorder: z.strictObject({ ids: z.array(idSchema).min(1).max(500) }),

  transactionsList: z.strictObject({
    filter: filterSchema,
    sort: z.enum(TRANSACTION_SORTS).optional(),
    cursor: z.string().max(200).nullable().optional(),
    limit: z.int().min(1).max(1_000).optional(),
  }),
  transactionsSummary: z.strictObject({ filter: filterSchema }),
  transactionGet: byId,
  /** Saisie (comptes en saisie manuelle uniquement, ADR-026). */
  transactionCreate: z.strictObject({
    accountId: idSchema,
    label: requiredText(500),
    ...transactionFields,
    splits: z.array(splitSchema).max(100).optional(),
  }),
  /**
   * Modification. Sur une opération importée, seules les annotations changent (libellé
   * personnalisé, tiers, note, statut, favori, contre-valeur) ; `labelRaw`, montant, dates et
   * compte sont réservés aux opérations saisies.
   */
  transactionUpdate: z.strictObject({
    id: idSchema,
    patch: z
      .strictObject({
        accountId: idSchema,
        labelRaw: requiredText(500),
        customLabel: optionalText(500),
        favorite: z.boolean(),
        ...transactionFields,
      })
      .partial(),
  }),
  transactionsDelete: z.strictObject({ ids: ids(1_000) }),
  transactionSetSplits: z.strictObject({ id: idSchema, splits: z.array(splitSchema).max(100) }),
  transactionsCategorize: z.strictObject({ ids: ids(), categoryId: idSchema.nullable() }),
  transactionsTag: z.strictObject({
    ids: ids(),
    add: z.array(idSchema).max(50),
    remove: z.array(idSchema).max(50),
  }),
  transactionsSetStatus: z.strictObject({ ids: ids(), status: z.enum(TRANSACTION_STATUSES) }),

  /** Virement entre deux comptes en saisie manuelle : deux opérations liées. */
  transferCreate: z.strictObject({
    fromAccountId: idSchema,
    toAccountId: idSchema,
    bookingDate: isoDateSchema,
    amount: amountSchema.refine((value) => value > 0),
    label: requiredText(500),
  }),
  /** Contrepartie d'une opération (souvent importée) sur un compte en saisie manuelle. */
  transferCounterpart: z.strictObject({ transactionId: idSchema, accountId: idSchema }),
  /** Relie deux opérations existantes de montants opposés (ex. deux relevés). */
  transferLink: z.strictObject({ ids: z.tuple([idSchema, idSchema]) }),
  transferUnlink: byId,

  tagsList: z.strictObject({}),
  tagCreate: tagDraft,
  tagUpdate: z.strictObject({ id: idSchema, patch: tagDraft.partial() }),
  tagDelete: byId,
  payeesList: z.strictObject({ search: z.string().max(200).optional() }),

  categoriesList: z.strictObject({ includeArchived: z.boolean().optional() }),
  /** Une sous-catégorie prend le type de son parent ; une catégorie de premier niveau le choisit. */
  categoryCreate: z.strictObject({
    name: requiredText(100),
    parentId: idSchema.nullable(),
    kind: z.enum(CATEGORY_KINDS).optional(),
    icon: z.enum(LEDGER_ICONS).nullable(),
    color: z.enum(PALETTE).nullable(),
    linkedAccountId: idSchema.nullable().optional(),
  }),
  categoryUpdate: z.strictObject({
    id: idSchema,
    patch: z
      .strictObject({
        name: requiredText(100),
        parentId: idSchema.nullable(),
        kind: z.enum(CATEGORY_KINDS),
        icon: z.enum(LEDGER_ICONS).nullable(),
        color: z.enum(PALETTE).nullable(),
        linkedAccountId: idSchema.nullable(),
      })
      .partial(),
  }),
  categoryMerge: z.strictObject({ sourceId: idSchema, targetId: idSchema }),
  categoryArchive: z.strictObject({
    id: idSchema,
    archived: z.boolean(),
    reassignTo: idSchema.nullable().optional(),
  }),
  categoryDelete: byId,

  savedFiltersList: z.strictObject({}),
  savedFilterSave: z.strictObject({
    id: idSchema.optional(),
    name: requiredText(100),
    filter: filterSchema,
  }),
  savedFilterDelete: byId,
  auditList: z.strictObject({
    entity: z.enum(AUDIT_ENTITIES).optional(),
    entityId: idSchema.optional(),
    limit: z.int().min(1).max(200).optional(),
  }),
  ledgerHistoryStatus: z.strictObject({}),
  ledgerUndo: z.strictObject({}),
  ledgerRedo: z.strictObject({}),
  dashboardSummary: z.strictObject({
    currency: currencySchema,
    months: z.int().min(1).max(36).optional(),
    endMonth: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional(),
  }),
  rulesList: z.strictObject({}),
  rulePreview: ruleConditionsSchema,
  ruleSave: ruleSaveSchema,
  ruleDelete: byId,
  ruleApply: z.strictObject({
    ruleId: idSchema.optional(),
    onlyUncategorized: z.boolean().optional(),
  }),
  ruleCreateFromTransaction: z.strictObject({
    transactionId: idSchema,
    name: requiredText(120),
    pattern: requiredText(180),
    categoryId: idSchema.nullable().optional(),
    tagIds: z.array(idSchema).max(20).optional(),
    customLabel: requiredText(200).nullable().optional(),
    applyRetroactively: z.boolean().optional(),
  }),
  categorizationQueueList: z.strictObject({
    limit: z.int().min(1).max(500).optional(),
  }),
  categorizeAutoRun: z.strictObject({
    transactionIds: z.array(idSchema).max(20_000).optional(),
  }),
  classifierStatus: z.strictObject({}),
  classifierRetrain: z.strictObject({}),
  categorizationThresholdSet: z.strictObject({
    threshold: z.number().min(0.5).max(0.99),
  }),
  categorizationAccept: z.strictObject({
    transactionId: idSchema,
    categoryId: idSchema.nullable(),
    tagIds: z.array(idSchema).max(20).optional(),
    customLabel: requiredText(200).nullable().optional(),
  }),
  categorizationReject: z.strictObject({
    transactionId: idSchema,
  }),
  subscriptionsOverview: z.strictObject({
    currency: currencySchema,
  }),
  subscriptionDismissAlert: z.strictObject({
    signature: requiredText(300),
    lastKnownAmount: amountSchema.nullable(),
  }),
  transferCandidatesList: z.strictObject({}),
  analyticsOverview: analyticsFilterSchema,
  analyticsAnomalies: analyticsFilterSchema,
  analyticsCsvData: analyticsFilterSchema,
} as const satisfies Record<LedgerMethod, z.ZodType>

export type LedgerInputs = { [M in keyof typeof LEDGER_INPUTS]: z.input<(typeof LEDGER_INPUTS)[M]> }
export type ParsedLedgerInputs = {
  [M in keyof typeof LEDGER_INPUTS]: z.output<(typeof LEDGER_INPUTS)[M]>
}
