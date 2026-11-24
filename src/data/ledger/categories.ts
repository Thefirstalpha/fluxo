import type { CategoryKind, CategorySummary, LedgerIcon, PaletteColor } from '@shared/ledger/model'
import type { ParsedLedgerInputs } from '@shared/ledger/schemas'
import { uuidv7 } from '@shared/uuid'
import type { Db } from '../db/connection'
import type { ChangeSet, Row } from './changes'
import { fail } from './failure'
import { sameName } from './names'

interface CategoryRow {
  id: string
  parent_id: string | null
  name: string
  kind: CategoryKind
  icon: LedgerIcon | null
  color: PaletteColor | null
  sort_order: number
  archived: 0 | 1
}

export function getCategory(db: Db, id: string): CategoryRow {
  const row = db.prepare('SELECT * FROM category WHERE id = ?').get(id) as CategoryRow | undefined
  return row ?? fail('not-found')
}

/**
 * Catégories (liste à plat, triée : parents par type et ordre, enfants à la suite), avec le
 * nombre d'opérations et le total de leurs parts (propres à la catégorie, sans ses enfants).
 */
export function listCategories(
  db: Db,
  { includeArchived = false }: ParsedLedgerInputs['categoriesList'],
): CategorySummary[] {
  const rows = db
    .prepare(
      `SELECT c.id, c.parent_id, c.name, c.kind, c.icon, c.color, c.sort_order, c.archived,
         coalesce(u.total, 0) AS total, coalesce(u.count, 0) AS count
       FROM category c
       LEFT JOIN (
         SELECT category_id, sum(amount) AS total, count(DISTINCT transaction_id) AS count
         FROM split WHERE category_id IS NOT NULL GROUP BY category_id
       ) u ON u.category_id = c.id
       LEFT JOIN category p ON p.id = c.parent_id
       WHERE @all = 1 OR (c.archived = 0 AND coalesce(p.archived, 0) = 0)
       ORDER BY coalesce(p.sort_order, c.sort_order), coalesce(p.name, c.name) COLLATE NOCASE,
         coalesce(p.id, c.id), c.parent_id IS NOT NULL, c.sort_order, c.name COLLATE NOCASE`,
    )
    .all({ all: includeArchived ? 1 : 0 }) as (CategoryRow & { total: number; count: number })[]
  return rows.map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    kind: row.kind,
    icon: row.icon,
    color: row.color,
    sortOrder: row.sort_order,
    archived: row.archived === 1,
    transactionCount: row.count,
    total: row.total,
  }))
}

/** Noms uniques entre catégories sœurs (sans distinction de casse, accents compris). */
function checkName(db: Db, name: string, parentId: string | null, except: string | null): void {
  const siblings = db
    .prepare('SELECT id, name FROM category WHERE parent_id IS ?')
    .all(parentId) as { id: string; name: string }[]
  if (siblings.some((sibling) => sibling.id !== except && sameName(sibling.name, name))) {
    fail('name-taken')
  }
}

function nextOrder(db: Db, parentId: string | null): number {
  const last = db
    .prepare('SELECT max(sort_order) FROM category WHERE parent_id IS ?')
    .pluck()
    .get(parentId) as number | null
  return (last ?? -1) + 1
}

/** Parent possible : actif, de premier niveau. Le type d'une sous-catégorie est celui du parent. */
function checkParent(db: Db, parentId: string): CategoryRow {
  const parent = getCategory(db, parentId)
  if (parent.parent_id !== null || parent.archived === 1) fail('invalid')
  return parent
}

export function createCategory(
  changes: ChangeSet,
  input: ParsedLedgerInputs['categoryCreate'],
  now: Date,
): { id: string } {
  const parent = input.parentId ? checkParent(changes.db, input.parentId) : null
  const kind = parent ? parent.kind : input.kind
  if (!kind) fail('invalid')
  checkName(changes.db, input.name, parent?.id ?? null, null)
  const id = uuidv7()
  const stamp = now.toISOString()
  changes.insert('category', {
    id,
    parent_id: parent?.id ?? null,
    name: input.name,
    kind,
    icon: input.icon,
    color: input.color,
    sort_order: nextOrder(changes.db, parent?.id ?? null),
    created_at: stamp,
    updated_at: stamp,
  })
  return { id }
}

/** Renomme, change l'apparence, le type (premier niveau : ses sous-catégories suivent) ou le parent. */
export function updateCategory(
  changes: ChangeSet,
  { id, patch }: ParsedLedgerInputs['categoryUpdate'],
  now: Date,
): null {
  const db = changes.db
  const current = getCategory(db, id)
  const stamp = now.toISOString()
  const row: Row = {}
  let parentId = current.parent_id
  if (patch.parentId !== undefined && patch.parentId !== current.parent_id) {
    if (patch.parentId === id) fail('invalid')
    if (patch.parentId !== null) {
      const parent = checkParent(db, patch.parentId)
      // Les deux niveaux sont aussi garantis par un trigger ; le type suit le nouveau parent.
      const hasChildren = db.prepare('SELECT 1 FROM category WHERE parent_id = ?').get(id)
      if (hasChildren !== undefined) fail('invalid')
      if (patch.kind !== undefined && patch.kind !== parent.kind) fail('invalid')
      row.kind = parent.kind
    }
    row.parent_id = patch.parentId
    row.sort_order = nextOrder(db, patch.parentId)
    parentId = patch.parentId
  }
  if (patch.kind !== undefined && row.kind === undefined && patch.kind !== current.kind) {
    if (current.parent_id !== null && parentId === current.parent_id) fail('invalid')
    row.kind = patch.kind
  }
  if (patch.name !== undefined) row.name = patch.name
  if (patch.icon !== undefined) row.icon = patch.icon
  if (patch.color !== undefined) row.color = patch.color
  const name = typeof row.name === 'string' ? row.name : current.name
  if (row.name !== undefined || row.parent_id !== undefined) checkName(db, name, parentId, id)

  const stored = current as unknown as Record<string, unknown>
  if (Object.keys(row).every((column) => row[column] === stored[column])) return null
  changes.update('category', { id }, { ...row, updated_at: stamp })
  if (typeof row.kind === 'string' && parentId === null) {
    for (const child of childrenOf(db, id)) {
      changes.update('category', { id: child }, { kind: row.kind, updated_at: stamp })
    }
  }
  return null
}

function childrenOf(db: Db, id: string): string[] {
  return db.prepare('SELECT id FROM category WHERE parent_id = ?').pluck().all(id) as string[]
}

/** Réaffecte toutes les parts d'une catégorie (et de ses sous-catégories si demandé). */
function reassign(changes: ChangeSet, from: readonly string[], to: string | null): number {
  const db = changes.db
  const splits = db
    .prepare('SELECT id FROM split WHERE category_id IN (SELECT value FROM json_each(?))')
    .pluck()
    .all(JSON.stringify(from)) as string[]
  for (const split of splits) changes.update('split', { id: split }, { category_id: to })
  return splits.length
}

function checkTarget(db: Db, source: CategoryRow, targetId: string): CategoryRow {
  if (targetId === source.id) fail('invalid')
  const target = getCategory(db, targetId)
  if (target.archived === 1 || target.kind !== source.kind) fail('invalid')
  if (target.parent_id === source.id) fail('invalid')
  return target
}

/**
 * Fusionne une catégorie dans une autre (même type) : ses parts sont réaffectées, puis elle
 * est supprimée. Une catégorie parente fusionnée dans une autre de premier niveau lui confie
 * ses sous-catégories ; dans une sous-catégorie, ses sous-catégories y sont fusionnées aussi.
 */
export function mergeCategory(
  changes: ChangeSet,
  { sourceId, targetId }: ParsedLedgerInputs['categoryMerge'],
  now: Date,
): { reassigned: number } {
  const db = changes.db
  const source = getCategory(db, sourceId)
  const target = checkTarget(db, source, targetId)
  const children = childrenOf(db, source.id)
  const stamp = now.toISOString()
  let reassigned = 0
  if (target.parent_id === null) {
    for (const child of children) {
      const name = getCategory(db, child).name
      const siblings = db
        .prepare('SELECT id, name FROM category WHERE parent_id = ?')
        .all(target.id) as { id: string; name: string }[]
      const clash = siblings.find((sibling) => sameName(sibling.name, name))?.id
      if (clash) {
        // Même nom chez la cible : les deux sous-catégories n'en font qu'une.
        reassigned += reassign(changes, [child], clash)
        changes.delete('category', { id: child })
      } else {
        changes.update(
          'category',
          { id: child },
          { parent_id: target.id, sort_order: nextOrder(db, target.id), updated_at: stamp },
        )
      }
    }
  } else {
    reassigned += reassign(changes, children, target.id)
    for (const child of children) changes.delete('category', { id: child })
  }
  reassigned += reassign(changes, [source.id], target.id)
  clearPayeeDefaults(changes, [source.id], target.id, stamp)
  changes.delete('category', { id: source.id })
  return { reassigned }
}

function clearPayeeDefaults(
  changes: ChangeSet,
  ids: readonly string[],
  replacement: string | null,
  stamp: string,
): void {
  const payees = changes.db
    .prepare('SELECT id FROM payee WHERE default_category_id IN (SELECT value FROM json_each(?))')
    .pluck()
    .all(JSON.stringify(ids)) as string[]
  for (const payee of payees) {
    changes.update('payee', { id: payee }, { default_category_id: replacement, updated_at: stamp })
  }
}

/**
 * Archive (ou réactive) une catégorie et ses sous-catégories. Archivée, elle reste sur les
 * opérations passées mais ne se choisit plus ; `reassignTo` déplace d'abord ses parts.
 */
export function archiveCategory(
  changes: ChangeSet,
  { id, archived, reassignTo }: ParsedLedgerInputs['categoryArchive'],
  now: Date,
): { reassigned: number } {
  const db = changes.db
  const current = getCategory(db, id)
  const stamp = now.toISOString()
  const family = [id, ...childrenOf(db, id)]
  if (!archived) {
    if (current.parent_id !== null && getCategory(db, current.parent_id).archived === 1) {
      fail('invalid')
    }
    for (const member of family) {
      changes.update('category', { id: member }, { archived: 0, updated_at: stamp })
    }
    return { reassigned: 0 }
  }
  let reassigned = 0
  if (reassignTo) {
    const target = checkTarget(db, current, reassignTo)
    if (family.includes(target.id)) fail('invalid')
    reassigned = reassign(changes, family, target.id)
  }
  for (const member of family) {
    changes.update('category', { id: member }, { archived: 1, updated_at: stamp })
  }
  return { reassigned }
}

/** Suppression réservée à une catégorie inutilisée (ni parts, ni sous-catégories, ni règles). */
export function deleteCategory(
  changes: ChangeSet,
  { id }: ParsedLedgerInputs['categoryDelete'],
  now: Date,
): null {
  const db = changes.db
  getCategory(db, id)
  const used =
    db.prepare('SELECT 1 FROM split WHERE category_id = ? LIMIT 1').get(id) !== undefined ||
    db.prepare('SELECT 1 FROM category WHERE parent_id = ? LIMIT 1').get(id) !== undefined
  if (used) fail('category-in-use')
  clearPayeeDefaults(changes, [id], null, now.toISOString())
  changes.delete('category', { id })
  return null
}
