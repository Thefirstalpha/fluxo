/**
 * Registre (M2) : énumérations et types échangés entre le service de données, le process main
 * et le renderer. Module sans dépendance (importé jusque dans le preload).
 * Voir docs/architecture/modele-de-donnees.md et l'ADR-032.
 */
import type { MinorUnits } from '../money'

export const ACCOUNT_TYPES = [
  'checking',
  'savings',
  'deferred_card',
  'cash',
  'meal_voucher',
  'investment',
  'loan',
  'other_asset',
] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export const TRACKING_MODES = ['statement', 'manual', 'valuation'] as const
export type TrackingMode = (typeof TRACKING_MODES)[number]

export const CATEGORY_KINDS = ['expense', 'income', 'savings', 'transfer'] as const
export type CategoryKind = (typeof CATEGORY_KINDS)[number]

export const TRANSACTION_STATUSES = ['pending', 'cleared', 'reconciled'] as const
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number]

export const TRANSACTION_NATURES = ['operation', 'adjustment'] as const
export type TransactionNature = (typeof TRANSACTION_NATURES)[number]

/**
 * Mode de suivi par défaut selon le type (ADR-026) : les comptes bancaires suivent leur relevé,
 * les espèces et titres-restaurant se saisissent, les placements et prêts se valorisent.
 */
export const DEFAULT_TRACKING_MODE: Readonly<Record<AccountType, TrackingMode>> = {
  checking: 'statement',
  savings: 'statement',
  deferred_card: 'statement',
  cash: 'manual',
  meal_voucher: 'manual',
  investment: 'valuation',
  loan: 'valuation',
  other_asset: 'manual',
}

/** Modes permis par type : un prêt n'est qu'un repère de solde jusqu'à son échéancier (M8). */
export function allowedTrackingModes(type: AccountType): readonly TrackingMode[] {
  return type === 'loan' ? ['valuation'] : TRACKING_MODES
}

/** Types dont un virement entrant est de l'épargne (et non un virement neutre). */
export const SAVINGS_ACCOUNT_TYPES: readonly AccountType[] = ['savings', 'investment']

/**
 * Palette validée (emplacements catégoriels du système de design, thème clair) : un compte ou
 * une catégorie ne prend qu'une de ces couleurs ; le renderer l'affiche avec la variable CSS de
 * l'emplacement, adaptée au thème.
 */
export const PALETTE = [
  '#dd2a80',
  '#e5690c',
  '#0e9b8f',
  '#dca81c',
  '#7a40da',
  '#cc272e',
  '#0977cb',
  '#278733',
] as const
export type PaletteColor = (typeof PALETTE)[number]

/** Icônes proposées (noms d'icônes Lucide, associés à leur composant par le renderer). */
export const LEDGER_ICONS = [
  'wallet',
  'landmark',
  'piggy-bank',
  'credit-card',
  'banknote',
  'utensils',
  'trending-up',
  'house',
  'car',
  'shopping-cart',
  'heart-pulse',
  'ticket',
  'repeat',
  'shopping-bag',
  'receipt',
  'briefcase',
  'gift',
  'arrow-left-right',
  'graduation-cap',
  'baby',
  'paw-print',
  'plane',
  'zap',
  'circle-help',
] as const
export type LedgerIcon = (typeof LEDGER_ICONS)[number]

// ——— Comptes ————————————————————————————————————————————————————————————

/** Champs saisis d'un compte. L'IBAN n'est jamais renvoyé en clair, sauf demande explicite. */
export interface AccountDraft {
  name: string
  type: AccountType
  trackingMode: TrackingMode
  institution: string | null
  currency: string
  openingBalance: MinorUnits
  openingDate: string | null
  iban: string | null
  color: PaletteColor | null
  icon: LedgerIcon | null
}

export interface AccountSummary {
  id: string
  name: string
  type: AccountType
  trackingMode: TrackingMode
  institution: string | null
  currency: string
  openingBalance: MinorUnits
  openingDate: string | null
  /** IBAN masqué (`FR76 •••• •••• 0189`), `null` sans IBAN. */
  ibanMasked: string | null
  color: PaletteColor | null
  icon: LedgerIcon | null
  archived: boolean
  sortOrder: number
  /** Solde à la date demandée : solde d'ouverture + Σ opérations. */
  balance: MinorUnits
  /** Part rapprochée du solde (opérations au statut « rapprochée »). */
  reconciledBalance: MinorUnits
  transactionCount: number
  lastTransactionDate: string | null
}

// ——— Opérations ——————————————————————————————————————————————————————————

/** Part d'une opération (ventilation). Σ des parts = montant de l'opération. */
export interface SplitInput {
  categoryId: string | null
  amount: MinorUnits
  note: string | null
  tagIds: string[]
}

export interface Split extends SplitInput {
  id: string
}

/** Ligne du registre (liste). */
export interface TransactionRow {
  id: string
  accountId: string
  bookingDate: string
  valueDate: string | null
  /** Montant signé dans la devise du compte (négatif : sortie). */
  amount: MinorUnits
  currency: string
  /** Contre-valeur dans la devise de référence (compte en devise étrangère, taux saisi). */
  convertedAmount: MinorUnits | null
  /** Libellé affiché : personnalisé, sinon libellé bancaire. */
  label: string
  labelRaw: string
  /** Libellé personnalisé (`null` : celui de la banque). */
  customLabel: string | null
  payee: string | null
  status: TransactionStatus
  nature: TransactionNature
  note: string | null
  favorite: boolean
  /** Opération venue d'un relevé (import) : montant, date et compte figés (ADR-026). */
  imported: boolean
  transferId: string | null
  transferAccountId: string | null
  /** Catégorie de chaque part, dans l'ordre (vide : non catégorisée). */
  categoryIds: (string | null)[]
  /** Étiquettes de toutes les parts (sans doublon). */
  tagIds: string[]
  splitCount: number
}

export interface TransactionDetail extends TransactionRow {
  splits: Split[]
}

export const TRANSACTION_SORTS = ['date-desc', 'date-asc', 'amount-desc', 'amount-asc'] as const
export type TransactionSort = (typeof TRANSACTION_SORTS)[number]

/** Valeur spéciale du filtre de catégories : opérations non catégorisées. */
export const UNCATEGORIZED = 'none'

export interface TransactionFilter {
  accountIds?: string[]
  from?: string
  to?: string
  /** Texte libre (libellés, note, tiers ; accents ignorés) ou montant (« 45,90 »). */
  search?: string
  /** Catégories (une catégorie parente inclut ses sous-catégories) ou `UNCATEGORIZED`. */
  categoryIds?: string[]
  /** Toutes les étiquettes demandées (sur une même opération). */
  tagIds?: string[]
  /** Bornes sur la valeur absolue du montant (le sens se choisit avec `direction`). */
  minAmount?: MinorUnits
  maxAmount?: MinorUnits
  direction?: 'in' | 'out'
  statuses?: TransactionStatus[]
  favorite?: boolean
}

export interface TransactionPage {
  rows: TransactionRow[]
  /** Curseur de la page suivante (`null` : fin de liste). */
  nextCursor: string | null
}

export interface TransactionSummary {
  count: number
  /** Σ des montants (devise de chaque compte : à n'additionner que pour une même devise). */
  total: MinorUnits
  inflow: MinorUnits
  outflow: MinorUnits
  currencies: string[]
}

export interface TagSummary {
  id: string
  name: string
  color: PaletteColor | null
  /** Σ des parts étiquetées (dépenses négatives). */
  total: MinorUnits
  transactionCount: number
}

export interface PayeeSummary {
  id: string
  name: string
  transactionCount: number
}

// ——— Résultats ———————————————————————————————————————————————————————————

/** Échecs attendus d'une requête du registre (les erreurs inattendues restent des exceptions). */
export const LEDGER_ERRORS = [
  'locked',
  'not-found',
  'invalid',
  'name-taken',
  'statement-account',
  'valuation-account',
  'tracking-mode-locked',
  'account-not-empty',
  'unbalanced-splits',
  'currency-mismatch',
  'category-in-use',
  'conflict',
  'nothing-to-undo',
] as const
export type LedgerError = (typeof LEDGER_ERRORS)[number]

export type LedgerResult<T> = { ok: true; value: T } | { ok: false; error: LedgerError }
