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
import {
  archiveCategory,
  createCategory,
  deleteCategory,
  listCategories,
  mergeCategory,
  updateCategory,
} from './categories'
import { auditChanges, ChangeSet } from './changes'
import { databaseRuleError, LedgerFailure } from './failure'
import { getTransactionDetail, listTransactions, summarizeTransactions } from './queries'
import { createTag, deleteTag, listPayees, listTags, updateTag } from './tags'
import {
  categorizeTransactions,
  createTransaction,
  deleteTransactions,
  setSplits,
  setStatus,
  tagTransactions,
  updateTransaction,
} from './transactions'
import { createCounterpart, createTransfer, linkTransfer, unlinkTransfer } from './transfers'

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

      transactionsList: (input) => listTransactions(db, input),
      transactionsSummary: (input) => summarizeTransactions(db, input),
      transactionGet: (input) => getTransactionDetail(db, input),
      transactionCreate: (input) =>
        write('transaction-create', (changes) => createTransaction(changes, input, this.now())),
      transactionUpdate: (input) =>
        write('transaction-update', (changes) => updateTransaction(changes, input, this.now())),
      transactionsDelete: (input) =>
        write('transaction-delete', (changes) => deleteTransactions(changes, input, this.now())),
      transactionSetSplits: (input) =>
        write('transaction-splits', (changes) => setSplits(changes, input, this.now())),
      transactionsCategorize: (input) =>
        write('transaction-categorize', (changes) =>
          categorizeTransactions(changes, input, this.now()),
        ),
      transactionsTag: (input) =>
        write('transaction-tag', (changes) => tagTransactions(changes, input, this.now())),
      transactionsSetStatus: (input) =>
        write('transaction-status', (changes) => setStatus(changes, input, this.now())),

      transferCreate: (input) =>
        write('transfer-create', (changes) => createTransfer(changes, input, this.now())),
      transferCounterpart: (input) =>
        write('transfer-counterpart', (changes) => createCounterpart(changes, input, this.now())),
      transferLink: (input) =>
        write('transfer-link', (changes) => linkTransfer(changes, input, this.now())),
      transferUnlink: (input) =>
        write('transfer-unlink', (changes) => unlinkTransfer(changes, input, this.now())),

      tagsList: () => listTags(db),
      tagCreate: (input) => write('tag-create', (changes) => createTag(changes, input, this.now())),
      tagUpdate: (input) => write('tag-update', (changes) => updateTag(changes, input)),
      tagDelete: (input) => write('tag-delete', (changes) => deleteTag(changes, input)),
      payeesList: (input) => listPayees(db, input),

      categoriesList: (input) => listCategories(db, input),
      categoryCreate: (input) =>
        write('category-create', (changes) => createCategory(changes, input, this.now())),
      categoryUpdate: (input) =>
        write('category-update', (changes) => updateCategory(changes, input, this.now())),
      categoryMerge: (input) =>
        write('category-merge', (changes) => mergeCategory(changes, input, this.now())),
      categoryArchive: (input) =>
        write('category-archive', (changes) => archiveCategory(changes, input, this.now())),
      categoryDelete: (input) =>
        write('category-delete', (changes) => deleteCategory(changes, input, this.now())),
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
