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
