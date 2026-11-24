import { createHash, randomBytes } from 'node:crypto'
import type {
  CsvProfile,
  ImportBatchSummary,
  ImportCommitInput,
  ImportCommitResult,
  ImportPreview,
  ImportPreviewRow,
  OverlappingAdjustment,
  ParsedStatement,
  ParsedTransaction,
} from '@shared/imports/model'
import { daysBetweenIso, labelSimilarity, normalizeImportLabel } from '@shared/imports/normalize'
import { importCommitSchema } from '@shared/imports/schemas'
import { uuidv7 } from '@shared/uuid'
import { recordAudit } from '../db/audit'
import type { Db } from '../db/connection'
import { runAutoCategorization } from '../ledger/categorize'
import { fail } from '../ledger/failure'
import { sameName } from '../ledger/names'
import { saveCsvProfile } from './profiles'

export interface PendingImportPreview {
  previewId: string
  accountId: string
  accountCurrency: string
  fileName: string
  fileHash: string
  profile: string | null
  statement: ParsedStatement
  rowHashes: string[]
  rows: ImportPreviewRow[]
  overlappingAdjustments: OverlappingAdjustment[]
}

const MAX_PENDING_PREVIEWS = 8

/**
 * Conserve en mémoire du service de données les aperçus d'import en attente de validation
 * afin que le renderer ne puisse ni altérer les montants analysés ni contourner les contrôles.
 */
export class PendingImportStore {
  private readonly entries = new Map<string, PendingImportPreview>()

  put(entry: PendingImportPreview): void {
    if (this.entries.size >= MAX_PENDING_PREVIEWS) {
      const oldest = this.entries.keys().next().value
      if (oldest) this.entries.delete(oldest)
    }
    this.entries.set(entry.previewId, entry)
  }

  get(previewId: string): PendingImportPreview | undefined {
    return this.entries.get(previewId)
  }

  delete(previewId: string): void {
    this.entries.delete(previewId)
  }

  clear(): void {
    this.entries.clear()
  }
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

export function computeRowBaseHash(accountId: string, row: ParsedTransaction): string {
  const payload = `${accountId}|${row.bookingDate}|${row.amount}|${normalizeImportLabel(row.labelRaw)}`
  return sha256Hex(payload)
}

export function computeRowExternalHash(accountId: string, externalId: string): string {
  return sha256Hex(`${accountId}|ext|${externalId}`)
}

interface ExistingTxRow {
  id: string
  booking_date: string
  amount: number
  label_raw: string
  label: string | null
  status: 'pending' | 'cleared' | 'reconciled'
  nature: 'operation' | 'adjustment'
  note: string | null
  dedup_hash: string | null
}

function displayLabel(row: ExistingTxRow): string {
  return row.label ?? row.label_raw
}

function findOrCreatePayeeId(
  db: Db,
  rawName: string | null,
  cache: Map<string, string>,
): string | null {
  const clean = rawName?.trim()
  if (!clean) return null
  const key = clean.normalize('NFC').toLocaleLowerCase('fr')
  const cached = cache.get(key)
  if (cached) return cached

  const rows = db.prepare('SELECT id, name FROM payee').all() as { id: string; name: string }[]
  const found = rows.find((row) => sameName(row.name, clean))
  if (found) {
    cache.set(key, found.id)
    return found.id
  }

  const id = uuidv7()
  const now = new Date().toISOString()
  db.prepare('INSERT INTO payee (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
    id,
    clean,
    now,
    now,
  )
  cache.set(key, id)
  return id
}

function computeBalanceProjection(
  db: Db,
  accountId: string,
  openingBalance: number,
  periodEnd: string | null,
  statementClosingBalance: number | null,
  importedRows: readonly { bookingDate: string; amount: number }[],
  removedAdjustmentAmount = 0,
): { projectedBalance: number | null; discrepancy: number | null } {
  if (statementClosingBalance === null) {
    return { projectedBalance: null, discrepancy: null }
  }
  const cutoff = periodEnd ?? '9999-12-31'
  const existingSum = db
    .prepare(
      'SELECT coalesce(sum(amount), 0) FROM transactions WHERE account_id = ? AND booking_date <= ?',
    )
    .pluck()
    .get(accountId, cutoff) as number

  let incomingSum = 0
  for (const row of importedRows) {
    if (row.bookingDate <= cutoff) incomingSum += row.amount
  }

  const projectedBalance = openingBalance + existingSum - removedAdjustmentAmount + incomingSum
  return {
    projectedBalance,
    discrepancy: statementClosingBalance - projectedBalance,
  }
}

export interface PreviewImportParams {
  accountId: string
  fileName: string
  fileHash: string
  profile: string | null
  statement: ParsedStatement
}

export function previewImport(
  db: Db,
  store: PendingImportStore,
  params: PreviewImportParams,
): ImportPreview {
  const account = db
    .prepare('SELECT id, type, tracking_mode, currency, opening_balance FROM account WHERE id = ?')
    .get(params.accountId) as
    | {
        id: string
        type: string
        tracking_mode: string
        currency: string
        opening_balance: number
      }
    | undefined

  if (!account) fail('not-found')
  if (account.tracking_mode === 'valuation') fail('valuation-account')

  const existingRows = db
    .prepare(
      `SELECT id, booking_date, amount, label_raw, label, status, nature, note, dedup_hash
       FROM transactions WHERE account_id = ?`,
    )
    .all(account.id) as ExistingTxRow[]

  const existingByHash = new Map<string, ExistingTxRow[]>()
  const existingByAmount = new Map<number, ExistingTxRow[]>()
  const adjustments: OverlappingAdjustment[] = []

  for (const row of existingRows) {
    if (row.nature === 'adjustment') {
      adjustments.push({
        id: row.id,
        bookingDate: row.booking_date,
        amount: row.amount,
        note: row.note ?? 'Ajustement',
      })
      continue
    }

    if (row.dedup_hash) {
      const bucket = existingByHash.get(row.dedup_hash)
      if (bucket) bucket.push(row)
      else existingByHash.set(row.dedup_hash, [row])
    }

    const amtBucket = existingByAmount.get(row.amount)
    if (amtBucket) amtBucket.push(row)
    else existingByAmount.set(row.amount, [row])
  }

  const seenIncomingHashes = new Map<string, number>()
  const claimedExistingIds = new Set<string>()
  const previewRows: ImportPreviewRow[] = []
  const rowHashes: string[] = []
  const warnings = [...params.statement.warnings]

  if (params.statement.currency && params.statement.currency !== account.currency) {
    warnings.push({
      code: 'currency-mismatch',
      detail: `${params.statement.currency} ≠ ${account.currency}`,
    })
  }
  if (account.type === 'deferred_card') {
    warnings.push({ code: 'unsettled-card-notice' })
  }

  let newCount = 0
  let exactDuplicateCount = 0
  let fuzzyDuplicateCount = 0
  let pendingCount = 0

  for (const row of params.statement.rows) {
    if (row.status === 'pending') pendingCount++

    const extHash = row.externalId ? computeRowExternalHash(account.id, row.externalId) : null
    const baseHash = computeRowBaseHash(account.id, row)
    const storageHash = extHash ?? baseHash
    rowHashes.push(storageHash)

    let matchKind: ImportPreviewRow['matchKind'] = 'new'
    let matchedTx: ImportPreviewRow['matchedTransaction'] | undefined

    // 1. Correspondance exacte par identifiant externe bancaire (FITID / EndToEndId / MT940 ref)
    if (extHash) {
      const extMatch = existingByHash.get(extHash)?.find((tx) => !claimedExistingIds.has(tx.id))
      if (extMatch) {
        claimedExistingIds.add(extMatch.id)
        matchKind = 'exact-duplicate'
        matchedTx = {
          id: extMatch.id,
          bookingDate: extMatch.booking_date,
          amount: extMatch.amount,
          label: displayLabel(extMatch),
          status: extMatch.status,
        }
      }
    }

    // 2. Correspondance exacte par empreinte compte+date+montant+libellé normalisé (avec multiplicité)
    if (matchKind === 'new') {
      const incomingOccurrence = seenIncomingHashes.get(baseHash) ?? 0
      seenIncomingHashes.set(baseHash, incomingOccurrence + 1)

      const hashMatches = existingByHash.get(baseHash) ?? []
      // Supporte également le rapprochement avec d'éventuelles lignes dont le dedup_hash est absent (démo/saisie)
      const implicitMatches = (existingByAmount.get(row.amount) ?? []).filter(
        (tx) =>
          tx.dedup_hash !== baseHash &&
          tx.booking_date === row.bookingDate &&
          normalizeImportLabel(tx.label_raw) === normalizeImportLabel(row.labelRaw),
      )
      const pool = [...hashMatches, ...implicitMatches]
      const candidate = pool[incomingOccurrence]
      if (candidate && !claimedExistingIds.has(candidate.id)) {
        claimedExistingIds.add(candidate.id)
        matchKind =
          candidate.status === 'pending' && row.status === 'cleared'
            ? 'settles-pending'
            : 'exact-duplicate'
        matchedTx = {
          id: candidate.id,
          bookingDate: candidate.booking_date,
          amount: candidate.amount,
          label: displayLabel(candidate),
          status: candidate.status,
        }
      }
    }

    // 3. Correspondance approchée (± 3 jours, même montant, libellé proche) ou dénouement d'une opération en attente (± 5 jours)
    if (matchKind === 'new') {
      const candidates = existingByAmount.get(row.amount) ?? []
      let best: { tx: ExistingTxRow; score: number } | null = null
      for (const tx of candidates) {
        if (claimedExistingIds.has(tx.id)) continue
        const maxDays = tx.status === 'pending' && row.status === 'cleared' ? 5 : 3
        const gap = Math.abs(daysBetweenIso(row.bookingDate, tx.booking_date))
        if (gap > maxDays) continue
        const sim = Math.max(
          labelSimilarity(row.labelRaw, tx.label_raw),
          tx.label ? labelSimilarity(row.labelRaw, tx.label) : 0,
        )
        if (sim >= 0.68 && (!best || sim > best.score)) {
          best = { tx, score: sim }
        }
      }
      if (best) {
        claimedExistingIds.add(best.tx.id)
        matchKind =
          best.tx.status === 'pending' && row.status === 'cleared'
            ? 'settles-pending'
            : 'fuzzy-duplicate'
        matchedTx = {
          id: best.tx.id,
          bookingDate: best.tx.booking_date,
          amount: best.tx.amount,
          label: displayLabel(best.tx),
          status: best.tx.status,
        }
      }
    }

    const defaultAction: ImportPreviewRow['defaultAction'] = matchKind === 'new' ? 'import' : 'skip'

    if (matchKind === 'new') newCount++
    else if (matchKind === 'exact-duplicate') exactDuplicateCount++
    else fuzzyDuplicateCount++

    previewRows.push({
      index: row.index,
      bookingDate: row.bookingDate,
      valueDate: row.valueDate,
      amount: row.amount,
      currency: account.currency,
      labelRaw: row.labelRaw,
      payee: row.payee,
      note: row.note,
      status: row.status,
      matchKind,
      defaultAction,
      matchedTransaction: matchedTx,
    })
  }

  const rowsToImport = previewRows.filter((r) => r.defaultAction === 'import')
  const { projectedBalance, discrepancy } = computeBalanceProjection(
    db,
    account.id,
    account.opening_balance,
    params.statement.periodEnd,
    params.statement.closingBalance,
    rowsToImport,
  )

  const previewId = randomBytes(16).toString('hex')
  store.put({
    previewId,
    accountId: account.id,
    accountCurrency: account.currency,
    fileName: params.fileName,
    fileHash: params.fileHash,
    profile: params.profile,
    statement: params.statement,
    rowHashes,
    rows: previewRows,
    overlappingAdjustments: adjustments,
  })

  return {
    previewId,
    accountId: account.id,
    accountCurrency: account.currency,
    accountType: account.type,
    fileName: params.fileName,
    format: params.statement.format,
    encoding: params.statement.encoding,
    profile: params.profile,
    periodStart: params.statement.periodStart,
    periodEnd: params.statement.periodEnd,
    openingBalance: params.statement.openingBalance,
    closingBalance: params.statement.closingBalance,
    projectedBalance,
    discrepancy,
    counts: {
      total: previewRows.length,
      newCount,
      exactDuplicateCount,
      fuzzyDuplicateCount,
      pendingCount,
      skippedLines: params.statement.skippedLines,
    },
    overlappingAdjustments: adjustments,
    warnings,
    csvInspection: params.statement.csvInspection,
    rows: previewRows,
  }
}

export function commitImport(
  db: Db,
  store: PendingImportStore,
  rawInput: ImportCommitInput,
): ImportCommitResult {
  const input = importCommitSchema.parse(rawInput)
  const pending = store.get(input.previewId)
  if (!pending) fail('not-found')

  const decisions = new Map<number, 'import' | 'skip'>()
  for (const d of input.rowDecisions ?? []) {
    decisions.set(d.index, d.action)
  }

  const cutoffDate = pending.statement.periodEnd ?? '9999-12-31'
  const replaceIds = [...new Set(input.replaceAdjustmentIds ?? [])]
  const adjustmentMap = new Map(pending.overlappingAdjustments.map((a) => [a.id, a]))
  let removedAdjustmentAmount = 0
  for (const id of replaceIds) {
    const adj = adjustmentMap.get(id)
    if (!adj) fail('invalid')
    if (adj.bookingDate <= cutoffDate) {
      removedAdjustmentAmount += adj.amount
    }
  }

  const account = db
    .prepare('SELECT opening_balance FROM account WHERE id = ?')
    .get(pending.accountId) as { opening_balance: number } | undefined
  if (!account) fail('not-found')

  const rowsToInsert: { row: ImportPreviewRow; hash: string }[] = []
  const settlePendingIds: string[] = []
  let duplicateCount = 0
  let skippedCount = pending.statement.skippedLines

  for (let i = 0; i < pending.rows.length; i++) {
    const row = pending.rows[i]!
    const action = decisions.get(row.index) ?? row.defaultAction
    if (action === 'import') {
      rowsToInsert.push({ row, hash: pending.rowHashes[i]! })
    } else {
      if (row.matchKind === 'settles-pending' && row.matchedTransaction) {
        settlePendingIds.push(row.matchedTransaction.id)
      }
      if (row.matchKind !== 'new') duplicateCount++
      skippedCount++
    }
  }

  const { discrepancy } = computeBalanceProjection(
    db,
    pending.accountId,
    account.opening_balance,
    pending.statement.periodEnd,
    pending.statement.closingBalance,
    rowsToInsert.map((entry) => entry.row),
    removedAdjustmentAmount,
  )

  const insertedTxIds: string[] = []
  const result = db
    .transaction(() => {
      const now = new Date().toISOString()

      // 1. Suppression des écritures d'ajustement désormais remplacées par le relevé importé (D11)
      for (const adjId of replaceIds) {
        const adj = adjustmentMap.get(adjId)!
        db.prepare('DELETE FROM split WHERE transaction_id = ?').run(adjId)
        db.prepare('DELETE FROM transactions WHERE id = ?').run(adjId)
        recordAudit(db, {
          entity: 'transaction',
          entityId: adjId,
          action: 'delete',
          origin: 'user',
          before: {
            nature: 'adjustment',
            amount: adj.amount,
            bookingDate: adj.bookingDate,
            note: adj.note,
          },
        })
      }

      // 2. Dénouement des opérations précédemment en attente confirmées par ce relevé
      const settleStmt = db.prepare(
        "UPDATE transactions SET status = 'cleared', updated_at = ? WHERE id = ? AND status = 'pending'",
      )
      for (const txId of settlePendingIds) {
        settleStmt.run(now, txId)
      }

      // 3. Création du lot d'import
      const batchId = uuidv7()
      db.prepare(
        `INSERT INTO import_batch (
         id, account_id, file_name, file_hash, format, profile,
         period_start, period_end, opening_balance, closing_balance, balance_discrepancy,
         inserted_count, duplicate_count, skipped_count, state, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'committed', ?)`,
      ).run(
        batchId,
        pending.accountId,
        pending.fileName,
        pending.fileHash,
        pending.statement.format,
        pending.profile,
        pending.statement.periodStart,
        pending.statement.periodEnd,
        pending.statement.openingBalance,
        pending.statement.closingBalance,
        discrepancy,
        rowsToInsert.length,
        duplicateCount,
        skippedCount,
        now,
      )

      // 4. Insertion des opérations retenues
      const insertTx = db.prepare(
        `INSERT INTO transactions (
         id, account_id, payee_id, booking_date, value_date, amount, currency,
         label_raw, note, status, nature, import_batch_id, dedup_hash, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'operation', ?, ?, ?, ?)`,
      )
      const payeeCache = new Map<string, string>()
      for (const { row, hash } of rowsToInsert) {
        const txId = uuidv7()
        insertedTxIds.push(txId)
        const payeeId = findOrCreatePayeeId(db, row.payee, payeeCache)
        insertTx.run(
          txId,
          pending.accountId,
          payeeId,
          row.bookingDate,
          row.valueDate,
          row.amount,
          pending.accountCurrency,
          row.labelRaw,
          row.note,
          row.status,
          batchId,
          hash,
          now,
          now,
        )
      }

      // 5. Création facultative d'une écriture d'ajustement pour combler un écart résiduel (D11)
      let adjustmentTransactionId: string | null = null
      if (input.createAdjustment && discrepancy !== null && discrepancy !== 0) {
        adjustmentTransactionId = uuidv7()
        const adjustmentDate = pending.statement.periodEnd ?? now.slice(0, 10)
        db.prepare(
          `INSERT INTO transactions (
           id, account_id, booking_date, amount, currency,
           label_raw, note, status, nature, import_batch_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 'Ajustement de solde', ?, 'reconciled', 'adjustment', NULL, ?, ?)`,
        ).run(
          adjustmentTransactionId,
          pending.accountId,
          adjustmentDate,
          discrepancy,
          pending.accountCurrency,
          input.createAdjustment.note,
          now,
          now,
        )
        recordAudit(db, {
          entity: 'transaction',
          entityId: adjustmentTransactionId,
          action: 'create',
          origin: 'user',
          after: {
            accountId: pending.accountId,
            nature: 'adjustment',
            amount: discrepancy,
            bookingDate: adjustmentDate,
            note: input.createAdjustment.note,
          },
        })
      }

      // 6. Enregistrement facultatif du profil CSV utilisé
      let savedProfile: CsvProfile | null = null
      if (input.saveProfile) {
        savedProfile = saveCsvProfile(db, input.saveProfile)
      }

      recordAudit(db, {
        entity: 'import_batch',
        entityId: batchId,
        action: 'create',
        origin: 'user',
        after: {
          accountId: pending.accountId,
          fileName: pending.fileName,
          format: pending.statement.format,
          insertedCount: rowsToInsert.length,
          duplicateCount,
          balanceDiscrepancy: discrepancy,
        },
      })

      return {
        batchId,
        insertedCount: rowsToInsert.length,
        duplicateCount,
        skippedCount,
        replacedAdjustmentCount: replaceIds.length,
        adjustmentTransactionId,
        savedProfile,
      }
    })
    .immediate()

  store.delete(input.previewId)
  if (insertedTxIds.length > 0) {
    runAutoCategorization(db, { transactionIds: insertedTxIds })
  }
  return result
}

interface ImportBatchRow {
  id: string
  account_id: string
  account_name: string
  file_name: string
  format: ImportBatchSummary['format']
  profile: string | null
  period_start: string | null
  period_end: string | null
  opening_balance: number | null
  closing_balance: number | null
  balance_discrepancy: number | null
  inserted_count: number
  duplicate_count: number
  skipped_count: number
  state: ImportBatchSummary['state']
  created_at: string
}

export function listImportBatches(
  db: Db,
  { accountId, limit = 50 }: { accountId?: string; limit?: number },
): ImportBatchSummary[] {
  const rows = db
    .prepare(
      `SELECT b.id, b.account_id, a.name AS account_name, b.file_name, b.format, b.profile,
         b.period_start, b.period_end, b.opening_balance, b.closing_balance, b.balance_discrepancy,
         b.inserted_count, b.duplicate_count, b.skipped_count, b.state, b.created_at
       FROM import_batch b
       JOIN account a ON a.id = b.account_id
       WHERE (@accountId IS NULL OR b.account_id = @accountId)
       ORDER BY b.created_at DESC, b.rowid DESC
       LIMIT @limit`,
    )
    .all({ accountId: accountId ?? null, limit }) as ImportBatchRow[]

  return rows.map((row) => ({
    id: row.id,
    accountId: row.account_id,
    accountName: row.account_name,
    fileName: row.file_name,
    format: row.format,
    profile: row.profile,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    openingBalance: row.opening_balance,
    closingBalance: row.closing_balance,
    balanceDiscrepancy: row.balance_discrepancy,
    insertedCount: row.inserted_count,
    duplicateCount: row.duplicate_count,
    skippedCount: row.skipped_count,
    state: row.state,
    createdAt: row.created_at,
  }))
}

export function revertImportBatch(
  db: Db,
  batchId: string,
): { batchId: string; removedCount: number } {
  const batch = db
    .prepare(
      'SELECT id, account_id, file_name, state, inserted_count FROM import_batch WHERE id = ?',
    )
    .get(batchId) as
    | {
        id: string
        account_id: string
        file_name: string
        state: ImportBatchSummary['state']
        inserted_count: number
      }
    | undefined

  if (!batch) fail('not-found')
  if (batch.state !== 'committed') fail('invalid')

  const removedCount = db
    .transaction(() => {
      const txIds = db
        .prepare('SELECT id FROM transactions WHERE import_batch_id = ?')
        .pluck()
        .all(batchId) as string[]

      const unlinkCounterpart = db.prepare(
        'UPDATE transactions SET transfer_id = NULL WHERE transfer_id = ?',
      )
      const unlinkSelf = db.prepare('UPDATE transactions SET transfer_id = NULL WHERE id = ?')
      const delSplitTags = db.prepare(
        'DELETE FROM split_tag WHERE split_id IN (SELECT id FROM split WHERE transaction_id = ?)',
      )
      const delSplits = db.prepare('DELETE FROM split WHERE transaction_id = ?')

      for (const txId of txIds) {
        unlinkCounterpart.run(txId)
        unlinkSelf.run(txId)
        delSplitTags.run(txId)
        delSplits.run(txId)
      }

      db.prepare('DELETE FROM transactions WHERE import_batch_id = ?').run(batchId)
      db.prepare("UPDATE import_batch SET state = 'reverted' WHERE id = ?").run(batchId)

      recordAudit(db, {
        entity: 'import_batch',
        entityId: batchId,
        action: 'revert',
        origin: 'user',
        before: {
          state: 'committed',
          fileName: batch.file_name,
          insertedCount: batch.inserted_count,
        },
        after: { state: 'reverted', removedCount: txIds.length },
      })
      return txIds.length
    })
    .immediate()

  return { batchId, removedCount }
}
