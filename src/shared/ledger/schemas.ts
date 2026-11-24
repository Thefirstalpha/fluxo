/**
 * Schémas d'entrée des requêtes du registre, appliqués DEUX fois : par le process main (le
 * renderer est non fiable) et par le service de données (défense en profondeur).
 * Les règles métier (somme des ventilations, compte à relevé…) sont vérifiées par le service.
 */
import { z } from 'zod'
import type { LedgerMethod } from './api'
import { isValidIban, normalizeIban } from './iban'
import { ACCOUNT_TYPES, LEDGER_ICONS, PALETTE, TRACKING_MODES } from './model'

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
} as const satisfies Record<LedgerMethod, z.ZodType>

export type LedgerInputs = { [M in keyof typeof LEDGER_INPUTS]: z.input<(typeof LEDGER_INPUTS)[M]> }
export type ParsedLedgerInputs = {
  [M in keyof typeof LEDGER_INPUTS]: z.output<(typeof LEDGER_INPUTS)[M]>
}
