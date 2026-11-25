import {
  isSavingsAccountType,
  linkedTransferCategoryName,
  type AccountType,
  type CategoryKind,
  type CategorySummary,
  type LedgerIcon,
  type PaletteColor,
} from '@shared/ledger/model'
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
  linked_account_id: string | null
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
         c.linked_account_id,
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
    linkedAccountId: row.linked_account_id,
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

function validateLinkedAccount(
  db: Db,
  linkedAccountId: string | null | undefined,
  parentId: string | null,
  kind: CategoryKind,
  exceptCategoryId: string | null,
): string | null {
  if (!linkedAccountId) return null
  if (parentId === null || (kind !== 'savings' && kind !== 'transfer')) fail('invalid')
  const account = db.prepare('SELECT id, type FROM account WHERE id = ?').get(linkedAccountId) as
    { id: string; type: AccountType } | undefined
  if (!account) fail('not-found')
  if (account.type === 'loan') fail('invalid')
  const duplicate = db
    .prepare('SELECT id FROM category WHERE linked_account_id = ?')
    .pluck()
    .get(linkedAccountId) as string | undefined
  if (duplicate && duplicate !== exceptCategoryId) fail('invalid')
  return linkedAccountId
}

function detectVaultLanguage(db: Db): 'fr' | 'en' {
  const savingsName = db
    .prepare(
      "SELECT name FROM category WHERE kind = 'savings' AND parent_id IS NULL ORDER BY sort_order, name LIMIT 1",
    )
    .pluck()
    .get() as string | undefined
  return savingsName?.trim().toLowerCase() === 'savings' ? 'en' : 'fr'
}

function findUniqueSiblingName(
  db: Db,
  baseName: string,
  parentId: string | null,
  exceptId: string | null = null,
): string {
  const siblings = db
    .prepare('SELECT id, name FROM category WHERE parent_id IS ?')
    .all(parentId) as { id: string; name: string }[]
  const taken = (candidate: string) =>
    siblings.some((sibling) => sibling.id !== exceptId && sameName(sibling.name, candidate))
  if (!taken(baseName)) return baseName
  for (let i = 2; i <= 99; i += 1) {
    const suffix = ` (${i})`
    const candidate = `${baseName.slice(0, 100 - suffix.length)}${suffix}`
    if (!taken(candidate)) return candidate
  }
  return baseName
}

function topParentOfKind(db: Db, kind: CategoryKind): CategoryRow | undefined {
  return (
    (db
      .prepare(
        `SELECT * FROM category WHERE kind = ? AND parent_id IS NULL AND archived = 0
         ORDER BY sort_order, name LIMIT 1`,
      )
      .get(kind) as CategoryRow | undefined) ??
    (db
      .prepare(
        `SELECT * FROM category WHERE kind = ? AND parent_id IS NULL
         ORDER BY sort_order, name LIMIT 1`,
      )
      .get(kind) as CategoryRow | undefined)
  )
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
  const linkedAccountId = validateLinkedAccount(
    changes.db,
    input.linkedAccountId,
    parent?.id ?? null,
    kind,
    null,
  )
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
    linked_account_id: linkedAccountId,
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
  const effectiveKind = (row.kind as CategoryKind | undefined) ?? current.kind
  const targetLinked =
    patch.linkedAccountId !== undefined ? patch.linkedAccountId : current.linked_account_id
  const validatedLinked = validateLinkedAccount(db, targetLinked, parentId, effectiveKind, id)
  if (patch.linkedAccountId !== undefined) row.linked_account_id = validatedLinked
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

/** Crée automatiquement la sous-catégorie « Épargne › Transfert ↔ <Compte> » pour un compte d'épargne. */
export function ensureAccountLinkedCategory(
  changes: ChangeSet,
  account: { id: string; name: string; type: AccountType; archived: 0 | 1 },
  now: Date,
): string | null {
  if (!isSavingsAccountType(account.type)) return null
  const db = changes.db
  const existing = db
    .prepare('SELECT id FROM category WHERE linked_account_id = ?')
    .pluck()
    .get(account.id) as string | undefined
  if (existing) return existing
  const parent = topParentOfKind(db, 'savings')
  if (!parent) return null
  const lang = detectVaultLanguage(db)
  const name = findUniqueSiblingName(db, linkedTransferCategoryName(account.name, lang), parent.id)
  const id = uuidv7()
  const stamp = now.toISOString()
  changes.insert('category', {
    id,
    parent_id: parent.id,
    name,
    kind: parent.kind,
    icon: null,
    color: null,
    linked_account_id: account.id,
    archived: account.archived === 1 || parent.archived === 1 ? 1 : 0,
    sort_order: nextOrder(db, parent.id),
    created_at: stamp,
    updated_at: stamp,
  })
  return id
}

/** Maintient le nom et le rattachement de la catégorie liée quand le compte évolue. */
export function syncLinkedCategoryOnAccountChange(
  changes: ChangeSet,
  previous: { id: string; name: string; type: AccountType; archived: 0 | 1 },
  next: { id: string; name: string; type: AccountType; archived: 0 | 1 },
  now: Date,
): void {
  const db = changes.db
  const existing = db.prepare('SELECT * FROM category WHERE linked_account_id = ?').get(next.id) as
    CategoryRow | undefined
  if (!existing) {
    if (isSavingsAccountType(next.type)) ensureAccountLinkedCategory(changes, next, now)
    return
  }
  const patch: Row = {}
  const stamp = now.toISOString()
  const lang = detectVaultLanguage(db)
  const oldFr = linkedTransferCategoryName(previous.name, 'fr')
  const oldEn = linkedTransferCategoryName(previous.name, 'en')
  const autoNamed = existing.name === oldFr || existing.name === oldEn
  if (
    !isSavingsAccountType(previous.type) &&
    isSavingsAccountType(next.type) &&
    existing.kind !== 'savings'
  ) {
    const parent = topParentOfKind(db, 'savings')
    if (parent && !parent.archived) {
      patch.parent_id = parent.id
      patch.kind = parent.kind
      patch.sort_order = nextOrder(db, parent.id)
    }
  }
  const targetParent = (patch.parent_id as string | undefined) ?? existing.parent_id
  if (previous.name !== next.name && autoNamed) {
    patch.name = findUniqueSiblingName(
      db,
      linkedTransferCategoryName(next.name, lang),
      targetParent,
      existing.id,
    )
  } else if (patch.parent_id !== undefined) {
    patch.name = findUniqueSiblingName(db, existing.name, targetParent, existing.id)
  }
  if (Object.keys(patch).length > 0) {
    changes.update('category', { id: existing.id }, { ...patch, updated_at: stamp })
  }
}

export function syncLinkedCategoryOnAccountArchive(
  changes: ChangeSet,
  accountId: string,
  archived: boolean,
  now: Date,
): void {
  const db = changes.db
  const existing = db
    .prepare('SELECT * FROM category WHERE linked_account_id = ?')
    .get(accountId) as CategoryRow | undefined
  if (!existing) return
  if (
    !archived &&
    existing.parent_id !== null &&
    getCategory(db, existing.parent_id).archived === 1
  ) {
    return
  }
  const target: 0 | 1 = archived ? 1 : 0
  if (existing.archived === target) return
  changes.update(
    'category',
    { id: existing.id },
    { archived: target, updated_at: now.toISOString() },
  )
}

export function cleanupLinkedCategoryOnAccountDelete(
  changes: ChangeSet,
  accountId: string,
  now: Date,
): void {
  const db = changes.db
  const existing = db
    .prepare('SELECT * FROM category WHERE linked_account_id = ?')
    .get(accountId) as CategoryRow | undefined
  if (!existing) return
  const stamp = now.toISOString()
  const used =
    db.prepare('SELECT 1 FROM split WHERE category_id = ? LIMIT 1').get(existing.id) !==
      undefined ||
    db.prepare('SELECT 1 FROM category WHERE parent_id = ? LIMIT 1').get(existing.id) !== undefined
  if (used) {
    changes.update('category', { id: existing.id }, { linked_account_id: null, updated_at: stamp })
    return
  }
  clearPayeeDefaults(changes, [existing.id], null, stamp)
  changes.delete('category', { id: existing.id })
}

/** Backfill idempotent hors `ChangeSet` (migration v6 sur coffres existants ou démonstration). */
export function backfillSavingsLinkedCategories(db: Db, now: Date): void {
  const savingsAccounts = db
    .prepare(
      `SELECT a.id, a.name, a.type, a.archived
       FROM account a
       LEFT JOIN category c ON c.linked_account_id = a.id
       WHERE a.type IN ('savings', 'investment') AND c.id IS NULL
       ORDER BY a.sort_order, a.name`,
    )
    .all() as { id: string; name: string; type: AccountType; archived: 0 | 1 }[]
  if (savingsAccounts.length === 0) return
  const parent = topParentOfKind(db, 'savings')
  if (!parent) return
  const lang = detectVaultLanguage(db)
  const stamp = now.toISOString()
  const insert = db.prepare(
    `INSERT INTO category (
       id, parent_id, name, kind, icon, color, linked_account_id, archived, sort_order, created_at, updated_at
     ) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)`,
  )
  db.transaction(() => {
    for (const acc of savingsAccounts) {
      const name = findUniqueSiblingName(db, linkedTransferCategoryName(acc.name, lang), parent.id)
      const order = nextOrder(db, parent.id)
      insert.run(
        uuidv7(),
        parent.id,
        name,
        parent.kind,
        acc.id,
        acc.archived === 1 || parent.archived === 1 ? 1 : 0,
        order,
        stamp,
        stamp,
      )
    }
  })()
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
