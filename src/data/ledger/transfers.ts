import { SAVINGS_ACCOUNT_TYPES, type CategoryKind } from '@shared/ledger/model'
import type { ParsedLedgerInputs } from '@shared/ledger/schemas'
import { uuidv7 } from '@shared/uuid'
import type { Db } from '../db/connection'
import { getAccount } from './accounts'
import type { ChangeSet } from './changes'
import { fail } from './failure'
import { readSplits, writeSplits } from './splits'
import { getTransaction, requireManual, type TransactionDbRow } from './transactions'

/**
 * Virements internes : deux opérations liées (`transfer_id` réciproque) de montants opposés,
 * sur deux comptes distincts de même devise. Ils sont classés dans une catégorie de type
 * **épargne** si l'un des comptes est un compte d'épargne ou de placement (et pas l'autre),
 * sinon **virement** (neutre) : ni dépense, ni revenu.
 */
export function transferKind(db: Db, accountA: string, accountB: string): CategoryKind {
  const savings = (id: string) => SAVINGS_ACCOUNT_TYPES.includes(getAccount(db, id).type)
  return savings(accountA) !== savings(accountB) ? 'savings' : 'transfer'
}

/** Première catégorie active de premier niveau du type voulu (pack : « Épargne », « Virements internes »). */
function categoryOfKind(db: Db, kind: CategoryKind): string | null {
  const id = db
    .prepare(
      `SELECT id FROM category WHERE kind = ? AND parent_id IS NULL AND archived = 0
       ORDER BY sort_order, name LIMIT 1`,
    )
    .pluck()
    .get(kind) as string | undefined
  return id ?? null
}

function linkedCategoryForAccount(db: Db, accountId: string): string | null {
  const id = db
    .prepare('SELECT id FROM category WHERE linked_account_id = ? AND archived = 0 LIMIT 1')
    .pluck()
    .get(accountId) as string | undefined
  return id ?? null
}

function counterpartCategoryFor(
  db: Db,
  targetAccountId: string,
  kind: CategoryKind,
): string | null {
  return linkedCategoryForAccount(db, targetAccountId) ?? categoryOfKind(db, kind)
}

/** Classe une opération de virement, sauf si elle est déjà ventilée sur plusieurs parts ou déjà dans un type compatible. */
function classify(
  changes: ChangeSet,
  transaction: TransactionDbRow,
  categoryId: string | null,
  expectedKind?: CategoryKind,
): void {
  if (categoryId === null) return
  const splits = readSplits(changes.db, transaction.id)
  if (splits.length > 1) return
  const base = splits[0] ?? { categoryId: null, note: null, tagIds: [] }
  if (base.categoryId !== null && expectedKind) {
    const existingKind = changes.db
      .prepare('SELECT kind FROM category WHERE id = ?')
      .pluck()
      .get(base.categoryId) as CategoryKind | undefined
    if (existingKind === expectedKind) return
  }
  writeSplits(changes, transaction.id, transaction.amount, [
    { ...base, categoryId, amount: transaction.amount },
  ])
}

function link(changes: ChangeSet, a: TransactionDbRow, b: TransactionDbRow, now: Date): void {
  if (a.id === b.id || a.account_id === b.account_id) fail('invalid')
  if (a.transfer_id !== null || b.transfer_id !== null) fail('invalid')
  if (a.currency !== b.currency) fail('currency-mismatch')
  if (a.amount + b.amount !== 0 || a.amount === 0) fail('invalid')
  const stamp = now.toISOString()
  changes.update('transactions', { id: a.id }, { transfer_id: b.id, updated_at: stamp })
  changes.update('transactions', { id: b.id }, { transfer_id: a.id, updated_at: stamp })
  const kind = transferKind(changes.db, a.account_id, b.account_id)
  const fallbackCategory = categoryOfKind(changes.db, kind)
  classify(
    changes,
    getTransaction(changes.db, a.id),
    linkedCategoryForAccount(changes.db, b.account_id) ?? fallbackCategory,
    kind,
  )
  classify(
    changes,
    getTransaction(changes.db, b.id),
    linkedCategoryForAccount(changes.db, a.account_id) ?? fallbackCategory,
    kind,
  )
}

function findMatchingCounterpartRow(
  db: Db,
  source: TransactionDbRow,
  targetAccountId: string,
): TransactionDbRow | null {
  return (
    (db
      .prepare(
        `SELECT * FROM transactions
         WHERE account_id = @targetAccountId
           AND currency = @currency
           AND nature = 'operation'
           AND transfer_id IS NULL
           AND amount = @oppositeAmount
           AND abs(julianday(booking_date) - julianday(@bookingDate)) <= 3
           AND id <> @sourceId
         ORDER BY abs(julianday(booking_date) - julianday(@bookingDate)) ASC, id ASC
         LIMIT 1`,
      )
      .get({
        targetAccountId,
        currency: source.currency,
        oppositeAmount: -source.amount,
        bookingDate: source.booking_date,
        sourceId: source.id,
      }) as TransactionDbRow | undefined) ?? null
  )
}

function mirrorCounterpartCategory(
  db: Db,
  sourceAccountId: string,
  kind: CategoryKind,
): string | null {
  return counterpartCategoryFor(db, sourceAccountId, kind)
}

/**
 * Lorsqu'une opération non liée est classée dans une catégorie associée à un compte cible
 * (ex. « Épargne › Transfert ↔ Livret A ») :
 * - relie automatiquement à l'opération opposée existante sur ce compte (± 3 jours), OU
 * - si le compte cible est en suivi manuel (`ADR-026`), crée et relie l'opération miroir.
 */
export function reconcileLinkedCategoryTransfer(
  changes: ChangeSet,
  transactionId: string,
  now: Date,
): { matchedId: string | null; createdCounterpartId: string | null } {
  const db = changes.db
  const source = getTransaction(db, transactionId)
  if (source.nature !== 'operation' || source.transfer_id !== null || source.amount === 0) {
    return { matchedId: null, createdCounterpartId: null }
  }
  const splits = readSplits(db, transactionId)
  if (splits.length !== 1) return { matchedId: null, createdCounterpartId: null }
  const categoryId = splits[0]?.categoryId
  if (!categoryId) return { matchedId: null, createdCounterpartId: null }

  const cat = db
    .prepare('SELECT linked_account_id, archived FROM category WHERE id = ?')
    .get(categoryId) as { linked_account_id: string | null; archived: 0 | 1 } | undefined
  if (!cat?.linked_account_id) return { matchedId: null, createdCounterpartId: null }

  const target = db.prepare('SELECT * FROM account WHERE id = ?').get(cat.linked_account_id) as
    { id: string; currency: string; tracking_mode: string; archived: 0 | 1 } | undefined
  if (
    !target ||
    target.archived === 1 ||
    target.id === source.account_id ||
    target.currency !== source.currency
  ) {
    return { matchedId: null, createdCounterpartId: null }
  }

  const stamp = now.toISOString()
  const existingMatch = findMatchingCounterpartRow(db, source, target.id)
  if (existingMatch) {
    changes.update(
      'transactions',
      { id: source.id },
      { transfer_id: existingMatch.id, updated_at: stamp },
    )
    changes.update(
      'transactions',
      { id: existingMatch.id },
      { transfer_id: source.id, updated_at: stamp },
    )
    const kind = transferKind(db, source.account_id, target.id)
    classify(
      changes,
      getTransaction(db, existingMatch.id),
      mirrorCounterpartCategory(db, source.account_id, kind),
      kind,
    )
    db.prepare(
      `UPDATE categorization_suggestion SET status = 'accepted', updated_at = ?
       WHERE transaction_id IN (?, ?) AND status = 'pending'`,
    ).run(stamp, source.id, existingMatch.id)
    return { matchedId: existingMatch.id, createdCounterpartId: null }
  }

  if (target.tracking_mode !== 'manual') {
    return { matchedId: null, createdCounterpartId: null }
  }

  const created = insertOperation(
    changes,
    {
      accountId: target.id,
      date: source.booking_date,
      amount: -source.amount,
      label: source.label ?? source.label_raw,
      currency: target.currency,
      status: source.status,
    },
    now,
  )
  changes.update('transactions', { id: source.id }, { transfer_id: created.id, updated_at: stamp })
  changes.update('transactions', { id: created.id }, { transfer_id: source.id, updated_at: stamp })
  const kind = transferKind(db, source.account_id, target.id)
  classify(changes, created, mirrorCounterpartCategory(db, source.account_id, kind), kind)
  return { matchedId: null, createdCounterpartId: created.id }
}

/**
 * Variante SQL directe utilisée dans les traitements par lot (auto-catégorisation et import)
 * pour relier les opérations classées avec catégorie liée sans créer d'audit individuel par ligne.
 */
export function reconcileLinkedCategoryTransferOnDb(
  db: Db,
  transactionId: string,
  now: Date,
): { matchedId: string | null; createdCounterpartId: string | null } {
  const source = db.prepare('SELECT * FROM transactions WHERE id = ?').get(transactionId) as
    TransactionDbRow | undefined
  if (
    !source ||
    source.nature !== 'operation' ||
    source.transfer_id !== null ||
    source.amount === 0
  ) {
    return { matchedId: null, createdCounterpartId: null }
  }
  const splits = db
    .prepare(
      'SELECT id, category_id, amount, note FROM split WHERE transaction_id = ? ORDER BY position',
    )
    .all(transactionId) as {
    id: string
    category_id: string | null
    amount: number
    note: string | null
  }[]
  if (splits.length !== 1) return { matchedId: null, createdCounterpartId: null }
  const categoryId = splits[0]?.category_id
  if (!categoryId) return { matchedId: null, createdCounterpartId: null }

  const cat = db.prepare('SELECT linked_account_id FROM category WHERE id = ?').get(categoryId) as
    { linked_account_id: string | null } | undefined
  if (!cat?.linked_account_id) return { matchedId: null, createdCounterpartId: null }

  const target = db
    .prepare('SELECT id, currency, tracking_mode, archived FROM account WHERE id = ?')
    .get(cat.linked_account_id) as
    { id: string; currency: string; tracking_mode: string; archived: 0 | 1 } | undefined
  if (
    !target ||
    target.archived === 1 ||
    target.id === source.account_id ||
    target.currency !== source.currency
  ) {
    return { matchedId: null, createdCounterpartId: null }
  }

  const stamp = now.toISOString()
  const existingMatch = findMatchingCounterpartRow(db, source, target.id)
  const linkSql = db.prepare('UPDATE transactions SET transfer_id = ?, updated_at = ? WHERE id = ?')
  const acceptSugSql = db.prepare(
    `UPDATE categorization_suggestion SET status = 'accepted', updated_at = ?
     WHERE transaction_id = ? AND status = 'pending'`,
  )
  const ensureSplitCategory = (
    targetTx: TransactionDbRow,
    catId: string | null,
    expectedKind: CategoryKind,
  ) => {
    if (!catId) return
    const cur = db
      .prepare(
        'SELECT s.id, s.category_id, c.kind FROM split s LEFT JOIN category c ON c.id = s.category_id WHERE s.transaction_id = ?',
      )
      .all(targetTx.id) as { id: string; category_id: string | null; kind: CategoryKind | null }[]
    if (cur.length > 1) return
    if (cur.length === 1) {
      if (cur[0]!.kind === expectedKind) return
      db.prepare('UPDATE split SET category_id = ? WHERE id = ?').run(catId, cur[0]!.id)
    } else {
      db.prepare(
        'INSERT INTO split (id, transaction_id, category_id, amount, note, position) VALUES (?, ?, ?, ?, NULL, 0)',
      ).run(uuidv7(), targetTx.id, catId, targetTx.amount)
    }
  }

  const kind = transferKind(db, source.account_id, target.id)
  const counterCatId = mirrorCounterpartCategory(db, source.account_id, kind)

  if (existingMatch) {
    linkSql.run(existingMatch.id, stamp, source.id)
    linkSql.run(source.id, stamp, existingMatch.id)
    ensureSplitCategory(existingMatch, counterCatId, kind)
    acceptSugSql.run(stamp, source.id)
    acceptSugSql.run(stamp, existingMatch.id)
    return { matchedId: existingMatch.id, createdCounterpartId: null }
  }

  if (target.tracking_mode !== 'manual') {
    return { matchedId: null, createdCounterpartId: null }
  }

  const counterId = uuidv7()
  db.prepare(
    `INSERT INTO transactions (id, account_id, booking_date, amount, currency, label_raw, status, transfer_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    counterId,
    target.id,
    source.booking_date,
    -source.amount,
    target.currency,
    source.label ?? source.label_raw,
    source.status,
    source.id,
    stamp,
    stamp,
  )
  linkSql.run(counterId, stamp, source.id)
  if (counterCatId) {
    db.prepare(
      'INSERT INTO split (id, transaction_id, category_id, amount, note, position) VALUES (?, ?, ?, ?, NULL, 0)',
    ).run(uuidv7(), counterId, counterCatId, -source.amount)
  }
  acceptSugSql.run(stamp, source.id)
  return { matchedId: null, createdCounterpartId: counterId }
}

/** Rapproche après un import les opérations existantes déjà classées vers le compte importé. */
export function reconcileImportedAccountTransfers(
  db: Db,
  importedAccountId: string,
  insertedTxIds: readonly string[],
  now: Date,
): number {
  if (insertedTxIds.length === 0) return 0
  const pendingSourceIds = db
    .prepare(
      `SELECT t.id
       FROM transactions t
       JOIN split s ON s.transaction_id = t.id
       JOIN category c ON c.id = s.category_id
       WHERE c.linked_account_id = ?
         AND t.account_id <> ?
         AND t.transfer_id IS NULL
         AND t.nature = 'operation'
         AND (SELECT count(*) FROM split sx WHERE sx.transaction_id = t.id) = 1
       ORDER BY t.booking_date ASC, t.id ASC`,
    )
    .pluck()
    .all(importedAccountId, importedAccountId) as string[]

  let linkedCount = 0
  const insertedSet = new Set(insertedTxIds)
  if (pendingSourceIds.length === 0 && insertedTxIds.length === 0) return 0

  db.transaction(() => {
    for (const sourceId of pendingSourceIds) {
      const res = reconcileLinkedCategoryTransferOnDb(db, sourceId, now)
      if (res.matchedId && insertedSet.has(res.matchedId)) linkedCount += 1
    }
    for (const insertedId of insertedTxIds) {
      const res = reconcileLinkedCategoryTransferOnDb(db, insertedId, now)
      if (res.matchedId || res.createdCounterpartId) linkedCount += 1
    }
  }).immediate()
  return linkedCount
}

function insertOperation(
  changes: ChangeSet,
  fields: {
    accountId: string
    date: string
    amount: number
    label: string
    currency: string
    status?: TransactionDbRow['status']
  },
  now: Date,
): TransactionDbRow {
  const id = uuidv7()
  const stamp = now.toISOString()
  changes.insert('transactions', {
    id,
    account_id: fields.accountId,
    booking_date: fields.date,
    amount: fields.amount,
    currency: fields.currency,
    label_raw: fields.label,
    status: fields.status ?? 'cleared',
    created_at: stamp,
    updated_at: stamp,
  })
  return getTransaction(changes.db, id)
}

/** Virement entre deux comptes en saisie manuelle (ex. espèces → titres-restaurant). */
export function createTransfer(
  changes: ChangeSet,
  input: ParsedLedgerInputs['transferCreate'],
  now: Date,
): { fromId: string; toId: string } {
  const from = getAccount(changes.db, input.fromAccountId)
  const to = getAccount(changes.db, input.toAccountId)
  requireManual(from.tracking_mode)
  requireManual(to.tracking_mode)
  if (from.id === to.id) fail('invalid')
  if (from.currency !== to.currency) fail('currency-mismatch')
  const common = { date: input.bookingDate, label: input.label, currency: from.currency }
  const out = insertOperation(
    changes,
    { ...common, accountId: from.id, amount: -input.amount },
    now,
  )
  const into = insertOperation(changes, { ...common, accountId: to.id, amount: input.amount }, now)
  link(changes, out, into, now)
  return { fromId: out.id, toId: into.id }
}

/**
 * Contrepartie d'une opération sur un compte en saisie manuelle : un retrait au distributeur
 * importé du compte courant crée l'entrée d'espèces correspondante, liée.
 */
export function createCounterpart(
  changes: ChangeSet,
  { transactionId, accountId }: ParsedLedgerInputs['transferCounterpart'],
  now: Date,
): { id: string } {
  const source = getTransaction(changes.db, transactionId)
  const target = getAccount(changes.db, accountId)
  requireManual(target.tracking_mode)
  if (target.currency !== source.currency) fail('currency-mismatch')
  if (source.transfer_id !== null || target.id === source.account_id) fail('invalid')
  const created = insertOperation(
    changes,
    {
      accountId: target.id,
      date: source.booking_date,
      amount: -source.amount,
      label: source.label ?? source.label_raw,
      currency: target.currency,
    },
    now,
  )
  link(changes, source, created, now)
  return { id: created.id }
}

/** Relie deux opérations existantes (ex. sortie du compte courant et entrée sur le livret). */
export function linkTransfer(
  changes: ChangeSet,
  { ids: [first, second] }: ParsedLedgerInputs['transferLink'],
  now: Date,
): null {
  link(changes, getTransaction(changes.db, first), getTransaction(changes.db, second), now)
  return null
}

/** Défait un virement : les deux opérations restent, non liées (leur catégorie est conservée). */
export function unlinkTransfer(
  changes: ChangeSet,
  { id }: ParsedLedgerInputs['transferUnlink'],
  now: Date,
): null {
  const transaction = getTransaction(changes.db, id)
  if (transaction.transfer_id === null) return null
  const stamp = now.toISOString()
  changes.update(
    'transactions',
    { id: transaction.transfer_id },
    { transfer_id: null, updated_at: stamp },
  )
  changes.update('transactions', { id }, { transfer_id: null, updated_at: stamp })
  return null
}
