/**
 * Contrat du registre : une méthode = un canal IPC = une fonction du preload (`window.fluxo.ledger`).
 * Module sans zod (le preload l'importe) : les schémas d'entrée vivent dans `schemas.ts`.
 */
import type { AccountSummary, LedgerResult } from './model'
import type { LedgerInputs } from './schemas'

/** Résultat de chaque méthode. */
export interface LedgerOutputs {
  accountsList: AccountSummary[]
  accountCreate: { id: string }
  accountUpdate: null
  accountSetArchived: null
  accountDelete: null
  /** IBAN en clair (copie), ou `null` si le compte n'en a pas. */
  accountRevealIban: string | null
  accountsReorder: null
}

export type LedgerMethod = keyof LedgerOutputs
export type LedgerInput<M extends LedgerMethod> = LedgerInputs[M]
export type LedgerOutput<M extends LedgerMethod> = LedgerOutputs[M]

/** Liste exhaustive des méthodes (vérifiée à la compilation dans les deux sens). */
export const LEDGER_METHODS = [
  'accountsList',
  'accountCreate',
  'accountUpdate',
  'accountSetArchived',
  'accountDelete',
  'accountRevealIban',
  'accountsReorder',
] as const satisfies readonly LedgerMethod[]

type Missing = Exclude<LedgerMethod, (typeof LEDGER_METHODS)[number]>
// Si une méthode est ajoutée à `LedgerOutputs` sans figurer ici, cette ligne ne compile plus.
const exhaustive: Missing extends never ? true : Missing = true
void exhaustive

/** Méthodes en lecture seule : elles n'invalident pas le cache du renderer. */
export const LEDGER_QUERIES: ReadonlySet<LedgerMethod> = new Set<LedgerMethod>([
  'accountsList',
  'accountRevealIban',
])

export function ledgerChannel(method: LedgerMethod): string {
  return `fluxo:ledger:${method}`
}

/** API exposée au renderer : une fonction par méthode. */
export type LedgerClient = {
  readonly [M in LedgerMethod]: (input: LedgerInput<M>) => Promise<LedgerResult<LedgerOutput<M>>>
}
