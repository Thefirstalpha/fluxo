import type { PayeeSummary, TagSummary } from '@shared/ledger/model'
import type { ParsedLedgerInputs } from '@shared/ledger/schemas'
import { uuidv7 } from '@shared/uuid'
import type { Db } from '../db/connection'
import type { ChangeSet } from './changes'
import { fail } from './failure'
import { sameName } from './names'

/**
 * Étiquettes (posées sur les parts, ADR-013) : total des parts étiquetées et nombre
 * d'opérations, pour la vue transverse aux catégories.
 */
export function listTags(db: Db): TagSummary[] {
  const rows = db
    .prepare(
      `SELECT tg.id, tg.name, tg.color, coalesce(sum(s.amount), 0) AS total,
         count(DISTINCT s.transaction_id) AS transaction_count
       FROM tag tg
       LEFT JOIN split_tag st ON st.tag_id = tg.id
       LEFT JOIN split s ON s.id = st.split_id
       GROUP BY tg.id ORDER BY tg.name COLLATE NOCASE`,
    )
    .all() as {
    id: string
    name: string
    color: TagSummary['color']
    total: number
    transaction_count: number
  }[]
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    total: row.total,
    transactionCount: row.transaction_count,
  }))
}

function requireTag(db: Db, id: string): void {
  if (db.prepare('SELECT 1 FROM tag WHERE id = ?').get(id) === undefined) fail('not-found')
}

function checkTagName(db: Db, name: string, except: string | null): void {
  const tags = db.prepare('SELECT id, name FROM tag').all() as { id: string; name: string }[]
  if (tags.some((tag) => tag.id !== except && sameName(tag.name, name))) fail('name-taken')
}

export function createTag(
  changes: ChangeSet,
  { name, color }: ParsedLedgerInputs['tagCreate'],
  now: Date,
): { id: string } {
  checkTagName(changes.db, name, null)
  const id = uuidv7()
  changes.insert('tag', { id, name, color, created_at: now.toISOString() })
  return { id }
}

export function updateTag(
  changes: ChangeSet,
  { id, patch }: ParsedLedgerInputs['tagUpdate'],
): null {
  requireTag(changes.db, id)
  const row: Record<string, string | null> = {}
  if (patch.name !== undefined) {
    checkTagName(changes.db, patch.name, id)
    row.name = patch.name
  }
  if (patch.color !== undefined) row.color = patch.color
  if (Object.keys(row).length > 0) changes.update('tag', { id }, row)
  return null
}

/** Supprime une étiquette : elle est retirée des parts qui la portaient (explicitement, pour l'annulation). */
export function deleteTag(changes: ChangeSet, { id }: ParsedLedgerInputs['tagDelete']): null {
  requireTag(changes.db, id)
  const splits = changes.db
    .prepare('SELECT split_id FROM split_tag WHERE tag_id = ?')
    .pluck()
    .all(id) as string[]
  for (const splitId of splits) changes.delete('split_tag', { split_id: splitId, tag_id: id })
  changes.delete('tag', { id })
  return null
}

/** Tiers les plus utilisés (saisie assistée), filtrés par début ou partie de nom. */
export function listPayees(db: Db, { search }: ParsedLedgerInputs['payeesList']): PayeeSummary[] {
  const pattern = search?.trim() ? `%${search.trim().replace(/[\\%_]/g, '\\$&')}%` : null
  const rows = db
    .prepare(
      `SELECT p.id, p.name, count(t.id) AS transaction_count
       FROM payee p LEFT JOIN transactions t ON t.payee_id = p.id
       WHERE @pattern IS NULL OR p.name LIKE @pattern ESCAPE '\\'
       GROUP BY p.id ORDER BY transaction_count DESC, p.name COLLATE NOCASE LIMIT 50`,
    )
    .all({ pattern }) as { id: string; name: string; transaction_count: number }[]
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    transactionCount: row.transaction_count,
  }))
}
