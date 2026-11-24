import type { SavedFilter, TransactionFilter } from '@shared/ledger/model'
import type { ParsedLedgerInputs } from '@shared/ledger/schemas'
import { uuidv7 } from '@shared/uuid'
import type { Db } from '../db/connection'
import type { ChangeSet } from './changes'
import { fail } from './failure'
import { sameName } from './names'

interface SavedFilterRow {
  id: string
  name: string
  filter: string
  sort_order: number
}

export function listSavedFilters(db: Db): SavedFilter[] {
  const rows = db
    .prepare('SELECT id, name, filter, sort_order FROM saved_filter ORDER BY sort_order, name')
    .all() as SavedFilterRow[]
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    filter: JSON.parse(row.filter) as TransactionFilter,
    sortOrder: row.sort_order,
  }))
}

export function saveSavedFilter(
  changes: ChangeSet,
  { id, name, filter }: ParsedLedgerInputs['savedFilterSave'],
  now: Date,
): { id: string } {
  const existing = changes.db.prepare('SELECT id, name FROM saved_filter').all() as {
    id: string
    name: string
  }[]
  if (existing.some((row) => row.id !== id && sameName(row.name, name))) fail('name-taken')

  const stamp = now.toISOString()
  const json = JSON.stringify(filter)
  if (id) {
    if (!changes.get('saved_filter', { id })) fail('not-found')
    changes.update('saved_filter', { id }, { name, filter: json, updated_at: stamp })
    return { id }
  }

  const nextId = uuidv7()
  const nextOrder =
    ((changes.db
      .prepare('SELECT coalesce(max(sort_order), -1) FROM saved_filter')
      .pluck()
      .get() as number) ?? -1) + 1
  changes.insert('saved_filter', {
    id: nextId,
    name,
    filter: json,
    sort_order: nextOrder,
    created_at: stamp,
    updated_at: stamp,
  })
  return { id: nextId }
}

export function deleteSavedFilter(
  changes: ChangeSet,
  { id }: ParsedLedgerInputs['savedFilterDelete'],
): null {
  if (!changes.delete('saved_filter', { id })) fail('not-found')
  return null
}
