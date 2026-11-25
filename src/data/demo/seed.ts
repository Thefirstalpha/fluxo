import { createHash } from 'node:crypto'
import {
  DEMO_ACCOUNT_NAMES,
  type DemoAccountKey,
  type DemoCategoryId,
  type DemoLedger,
} from '@shared/demo/demo-ledger'
import { CATEGORY_PACK_FR } from '@shared/ledger/category-pack'
import type { LedgerIcon, PaletteColor } from '@shared/ledger/model'
import type { Locale } from '@shared/settings'
import { uuidv7 } from '@shared/uuid'
import { recordAudit } from '../db/audit'
import type { Db } from '../db/connection'
import { backfillSavingsLinkedCategories } from '../ledger/categories'

const DEMO_ACCOUNT_LOOK: Readonly<
  Record<DemoAccountKey, { color: PaletteColor; icon: LedgerIcon }>
> = {
  checking: { color: '#0977cb', icon: 'landmark' },
  savings: { color: '#0e9b8f', icon: 'piggy-bank' },
  cash: { color: '#dca81c', icon: 'banknote' },
}

function topLevelCategories(db: Db, locale: Locale): Map<DemoCategoryId, string> {
  const rows = db.prepare('SELECT id, name FROM category WHERE parent_id IS NULL').all() as {
    id: string
    name: string
  }[]
  const byName = new Map(rows.map((row) => [row.name, row.id]))
  const categories = new Map<DemoCategoryId, string>()
  for (const category of CATEGORY_PACK_FR) {
    const id = byName.get(category.names[locale])
    if (id) categories.set(category.key as DemoCategoryId, id)
  }
  return categories
}

/**
 * Remplit un coffre (de démonstration uniquement) avec le grand livre déterministe : comptes,
 * lots « démo » pour les comptes à relevé (ADR-026), opérations ventilées, virements
 * d'épargne liés. Les catégories sont celles du pack France, créé avec le coffre : une
 * opération est classée dans la catégorie de premier niveau de même clé. Une seule entrée
 * d'audit (`seed`) pour l'ensemble.
 */
export function seedDemoVault(
  db: Db,
  ledger: DemoLedger,
  { locale, now }: { locale: Locale; now: Date },
): { accounts: number; transactions: number } {
  const stamp = now.toISOString()
  const firstDate = ledger.transactions[0]?.date ?? stamp.slice(0, 10)
  const lastDate = ledger.transactions.at(-1)?.date ?? firstDate

  db.transaction(() => {
    const categories = topLevelCategories(db, locale)
    const accounts = new Map<DemoAccountKey, { id: string; batch: string | null }>()
    const insertAccount = db.prepare(
      `INSERT INTO account (id, name, type, tracking_mode, currency, opening_balance, opening_date,
         color, icon, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'EUR', ?, ?, ?, ?, ?, ?, ?)`,
    )
    const insertBatch = db.prepare(
      `INSERT INTO import_batch (id, account_id, file_name, file_hash, format, period_start,
         period_end, inserted_count, state, created_at)
       VALUES (?, ?, ?, ?, 'demo', ?, ?, ?, 'committed', ?)`,
    )
    ledger.accounts.forEach((account, index) => {
      const id = uuidv7()
      insertAccount.run(
        id,
        DEMO_ACCOUNT_NAMES[locale][account.key],
        account.type,
        account.trackingMode,
        account.openingBalance,
        firstDate,
        DEMO_ACCOUNT_LOOK[account.key].color,
        DEMO_ACCOUNT_LOOK[account.key].icon,
        index,
        stamp,
        stamp,
      )
      let batch: string | null = null
      if (account.trackingMode === 'statement') {
        batch = uuidv7()
        const count = ledger.transactions.filter((t) => t.account === account.key).length
        const hash = createHash('sha256').update(`fluxo-demo:${account.key}`).digest('hex')
        insertBatch.run(batch, id, 'demonstration', hash, firstDate, lastDate, count, stamp)
      }
      accounts.set(account.key, { id, batch })
    })

    const insertTransaction = db.prepare(
      `INSERT INTO transactions (id, account_id, booking_date, amount, currency, label_raw,
         status, import_batch_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'EUR', ?, 'cleared', ?, ?, ?)`,
    )
    const insertSplit = db.prepare(
      'INSERT INTO split (id, transaction_id, category_id, amount, position) VALUES (?, ?, ?, ?, 0)',
    )
    const linkTransfer = db.prepare('UPDATE transactions SET transfer_id = ? WHERE id = ?')
    const pendingTransfer = new Map<DemoCategoryId, string>()
    for (const transaction of ledger.transactions) {
      const account = accounts.get(transaction.account)
      const category = categories.get(transaction.category)
      if (!account || !category) throw new Error('Grand livre de démonstration incohérent')
      const id = uuidv7()
      insertTransaction.run(
        id,
        account.id,
        transaction.date,
        transaction.amount,
        transaction.label,
        account.batch,
        stamp,
        stamp,
      )
      insertSplit.run(uuidv7(), id, category, transaction.amount)
      // Les deux écritures d'un virement (épargne, retrait d'espèces) se suivent : on les relie.
      if (transaction.category === 'savings' || transaction.category === 'transfer') {
        const pending = pendingTransfer.get(transaction.category)
        if (pending) {
          linkTransfer.run(id, pending)
          linkTransfer.run(pending, id)
          pendingTransfer.delete(transaction.category)
        } else {
          pendingTransfer.set(transaction.category, id)
        }
      }
    }
    backfillSavingsLinkedCategories(db, now)
    recordAudit(
      db,
      {
        entity: 'vault',
        entityId: null,
        action: 'seed',
        origin: 'system',
        after: { accounts: ledger.accounts.length, transactions: ledger.transactions.length },
      },
      now,
    )
  })()
  return { accounts: ledger.accounts.length, transactions: ledger.transactions.length }
}
