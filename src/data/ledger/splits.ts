import type { SplitInput } from '@shared/ledger/model'
import { uuidv7 } from '@shared/uuid'
import type { Db } from '../db/connection'
import type { ChangeSet } from './changes'
import { fail } from './failure'

interface SplitRow {
  id: string
  category_id: string | null
  amount: number
  note: string | null
  position: number
}

export function readSplits(db: Db, transactionId: string): SplitInput[] {
  const splits = db
    .prepare(
      'SELECT id, category_id, amount, note, position FROM split WHERE transaction_id = ? ORDER BY position',
    )
    .all(transactionId) as SplitRow[]
  const tags = db.prepare('SELECT tag_id FROM split_tag WHERE split_id = ? ORDER BY tag_id').pluck()
  return splits.map((split) => ({
    categoryId: split.category_id,
    amount: split.amount,
    note: split.note,
    tagIds: tags.all(split.id) as string[],
  }))
}

/** Une seule part sans catégorie, sans note ni étiquette : équivaut à « non ventilée ». */
function isBlank(splits: readonly SplitInput[]): boolean {
  const [only] = splits
  return (
    splits.length === 1 &&
    only !== undefined &&
    only.categoryId === null &&
    only.note === null &&
    only.tagIds.length === 0
  )
}

function checkReferences(db: Db, splits: readonly SplitInput[]): void {
  const category = db.prepare('SELECT archived FROM category WHERE id = ?').pluck()
  const tag = db.prepare('SELECT 1 FROM tag WHERE id = ?').pluck()
  for (const split of splits) {
    if (split.categoryId !== null) {
      const archived = category.get(split.categoryId) as number | undefined
      if (archived === undefined) fail('not-found')
      if (archived === 1) fail('invalid')
    }
    if (new Set(split.tagIds).size !== split.tagIds.length) fail('invalid')
    for (const id of split.tagIds) if (tag.get(id) === undefined) fail('not-found')
  }
}

/**
 * Remplace la ventilation d'une opération. Invariant financier : Σ des parts = montant
 * (vérifié ici, SQLite n'ayant pas de contrainte différée), chaque part non nulle.
 * Les lignes sont supprimées et recréées explicitement (pas de cascade) pour que l'annulation
 * les restaure à l'identique.
 */
export function writeSplits(
  changes: ChangeSet,
  transactionId: string,
  amount: number,
  splits: readonly SplitInput[],
): void {
  const normalized = isBlank(splits) ? [] : splits
  if (normalized.length > 0) {
    if (normalized.some((split) => split.amount === 0)) fail('invalid')
    const total = normalized.reduce((sum, split) => sum + split.amount, 0)
    if (total !== amount) fail('unbalanced-splits')
    checkReferences(changes.db, normalized)
  }
  if (sameSplits(readSplits(changes.db, transactionId), normalized)) return

  const existing = changes.db
    .prepare('SELECT id FROM split WHERE transaction_id = ?')
    .pluck()
    .all(transactionId) as string[]
  const tagsOf = changes.db.prepare('SELECT tag_id FROM split_tag WHERE split_id = ?').pluck()
  for (const splitId of existing) {
    for (const tagId of tagsOf.all(splitId) as string[]) {
      changes.delete('split_tag', { split_id: splitId, tag_id: tagId })
    }
    changes.delete('split', { id: splitId })
  }
  normalized.forEach((split, position) => {
    const id = uuidv7()
    changes.insert('split', {
      id,
      transaction_id: transactionId,
      category_id: split.categoryId,
      amount: split.amount,
      note: split.note,
      position,
    })
    for (const tagId of split.tagIds) changes.insert('split_tag', { split_id: id, tag_id: tagId })
  })
}

function sameSplits(a: readonly SplitInput[], b: readonly SplitInput[]): boolean {
  if (a.length !== b.length) return false
  return a.every((split, index) => {
    const other = b[index]
    return (
      other !== undefined &&
      split.categoryId === other.categoryId &&
      split.amount === other.amount &&
      split.note === other.note &&
      [...split.tagIds].sort().join() === [...other.tagIds].sort().join()
    )
  })
}
