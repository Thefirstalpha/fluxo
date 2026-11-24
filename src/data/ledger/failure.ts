import type { LedgerError } from '@shared/ledger/model'

/** Échec attendu d'une requête du registre : annule la transaction, renvoyé comme résultat. */
export class LedgerFailure extends Error {
  constructor(readonly error: LedgerError) {
    super(error)
    this.name = 'LedgerFailure'
  }
}

export function fail(error: LedgerError): never {
  throw new LedgerFailure(error)
}

/** Règles portées par la base (triggers, contraintes) → échec attendu du registre. */
const DATABASE_RULES: readonly [RegExp, LedgerError][] = [
  [/statement_account_requires_import|imported_transaction_frozen/, 'statement-account'],
  [/valuation_account_has_no_transactions/, 'valuation-account'],
  [/tracking_mode_locked/, 'tracking-mode-locked'],
  [/category_depth/, 'invalid'],
  [/UNIQUE constraint failed/, 'name-taken'],
]

export function databaseRuleError(error: unknown): LedgerError | null {
  if (!(error instanceof Error) || error.name !== 'SqliteError') return null
  for (const [pattern, ledgerError] of DATABASE_RULES) {
    if (pattern.test(error.message)) return ledgerError
  }
  return null
}
