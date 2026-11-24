import type { LedgerMethod, LedgerOutputs } from '@shared/ledger/api'
import type { LedgerResult } from '@shared/ledger/model'
import { LEDGER_INPUTS, type ParsedLedgerInputs } from '@shared/ledger/schemas'
import type { Db } from '../db/connection'
import {
  createAccount,
  deleteAccount,
  listAccounts,
  reorderAccounts,
  revealIban,
  setAccountArchived,
  updateAccount,
} from './accounts'
import { auditChanges, ChangeSet } from './changes'
import { databaseRuleError, LedgerFailure } from './failure'

type Handlers = { [M in LedgerMethod]: (input: ParsedLedgerInputs[M]) => LedgerOutputs[M] }

/**
 * Registre d'un coffre ouvert : requêtes et écritures validées. Chaque écriture s'exécute dans
 * une transaction, via un `ChangeSet` (audit, annulation) ; un échec attendu l'annule et
 * devient un résultat `{ ok: false }`.
 */
export class Ledger {
  private readonly handlers: Handlers

  constructor(
    readonly db: Db,
    private readonly now: () => Date = () => new Date(),
  ) {
    const write = this.write.bind(this)
    this.handlers = {
      accountsList: (input) => listAccounts(db, input),
      accountCreate: (input) =>
        write('account-create', (changes) => createAccount(changes, input, this.now())),
      accountUpdate: (input) =>
        write('account-update', (changes) => updateAccount(changes, input, this.now())),
      accountSetArchived: (input) =>
        write('account-archive', (changes) => setAccountArchived(changes, input, this.now())),
      accountDelete: (input) => write('account-delete', (changes) => deleteAccount(changes, input)),
      accountRevealIban: (input) => revealIban(db, input),
      accountsReorder: (input) =>
        write('account-reorder', (changes) => reorderAccounts(changes, input)),
    }
  }

  /** Point d'entrée unique : revalide l'entrée (défense en profondeur), puis exécute. */
  run<M extends LedgerMethod>(method: M, input: unknown): LedgerResult<LedgerOutputs[M]> {
    const parsed = LEDGER_INPUTS[method].safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid' }
    const handler = this.handlers[method] as (input: unknown) => LedgerOutputs[M]
    try {
      return { ok: true, value: handler(parsed.data) }
    } catch (error) {
      if (error instanceof LedgerFailure) return { ok: false, error: error.error }
      const rule = databaseRuleError(error)
      if (rule) return { ok: false, error: rule }
      throw error
    }
  }

  private write<T>(action: string, apply: (changes: ChangeSet) => T): T {
    return this.db.transaction(() => {
      const changes = new ChangeSet(this.db)
      const result = apply(changes)
      auditChanges(this.db, changes.changes, { origin: 'user', action, now: this.now() })
      return result
    })()
  }
}
