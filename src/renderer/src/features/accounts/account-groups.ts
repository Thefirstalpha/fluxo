import type { AccountSummary, AccountType, LedgerIcon } from '@shared/ledger/model'
import type { MinorUnits } from '@shared/money'

export const ACCOUNT_GROUPS = ['daily', 'savings', 'manual', 'assets', 'loans'] as const
export type AccountGroup = (typeof ACCOUNT_GROUPS)[number]

export const GROUP_OF: Readonly<Record<AccountType, AccountGroup>> = {
  checking: 'daily',
  deferred_card: 'daily',
  savings: 'savings',
  cash: 'manual',
  meal_voucher: 'manual',
  investment: 'assets',
  other_asset: 'assets',
  loan: 'loans',
}

/** Comptes actifs par groupe d'affichage (l'ordre choisi par l'utilisateur est conservé). */
export function groupAccounts(
  accounts: readonly AccountSummary[],
): { group: AccountGroup; accounts: AccountSummary[] }[] {
  return ACCOUNT_GROUPS.map((group) => ({
    group,
    accounts: accounts.filter((account) => !account.archived && GROUP_OF[account.type] === group),
  })).filter((entry) => entry.accounts.length > 0)
}

export interface AccountTotals {
  /** Courants, cartes, espèces, titres-restaurant. */
  cash: MinorUnits
  /** Épargne, placements, autres actifs. */
  savings: MinorUnits
  /** Prêts (négatif : capital restant dû). */
  loans: MinorUnits
  /** Devises des comptes actifs exclus des totaux (autre que la devise de référence). */
  otherCurrencies: string[]
}

/** Totaux des comptes actifs dans la devise de référence (pas de conversion implicite). */
export function accountTotals(
  accounts: readonly AccountSummary[],
  currency: string,
): AccountTotals {
  const totals: AccountTotals = { cash: 0, savings: 0, loans: 0, otherCurrencies: [] }
  const others = new Set<string>()
  for (const account of accounts) {
    if (account.archived) continue
    if (account.currency !== currency) {
      others.add(account.currency)
      continue
    }
    const group = GROUP_OF[account.type]
    if (group === 'loans') totals.loans += account.balance
    else if (group === 'savings' || group === 'assets') totals.savings += account.balance
    else totals.cash += account.balance
  }
  totals.otherCurrencies = [...others].sort()
  return totals
}

/** Montant en centimes → texte éditable sans séparateur de milliers (« 1250,00 »). */
export function amountToInput(amount: MinorUnits, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(amount / 100)
}

export const DEFAULT_ACCOUNT_ICON: Readonly<Record<AccountType, LedgerIcon>> = {
  checking: 'landmark',
  savings: 'piggy-bank',
  deferred_card: 'credit-card',
  cash: 'banknote',
  meal_voucher: 'utensils',
  investment: 'trending-up',
  loan: 'house',
  other_asset: 'wallet',
}
