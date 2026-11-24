import type { Db } from '../db/connection'
import { recordAudit, type AuditInput } from '../db/audit'
import { maskIban } from '@shared/ledger/iban'

/**
 * Écritures du registre : toute modification passe par un `ChangeSet`, qui garde l'image
 * **avant/après** de chaque ligne touchée. Ces images alimentent le journal d'audit et
 * l'annulation (appliquer l'inverse, dans l'ordre inverse) — voir l'ADR-032.
 *
 * Les tables et colonnes sont celles de cette liste et du schéma réel (`PRAGMA table_info`) :
 * aucun nom ne vient d'une entrée extérieure.
 */
export const TRACKED_TABLES = {
  account: { key: ['id'], entity: 'account' },
  category: { key: ['id'], entity: 'category' },
  payee: { key: ['id'], entity: 'payee' },
  tag: { key: ['id'], entity: 'tag' },
  transactions: { key: ['id'], entity: 'transaction' },
  split: { key: ['id'], entity: 'split' },
  split_tag: { key: ['split_id', 'tag_id'], entity: 'split' },
  saved_filter: { key: ['id'], entity: null },
} as const satisfies Record<string, { key: readonly string[]; entity: AuditInput['entity'] | null }>

export type TrackedTable = keyof typeof TRACKED_TABLES
export type SqlValue = string | number | null
export type Row = Record<string, SqlValue>

export interface RowChange {
  table: TrackedTable
  key: Row
  /** `null` : la ligne n'existait pas (création). */
  before: Row | null
  /** `null` : la ligne a été supprimée. */
  after: Row | null
}

/** Au-delà, une écriture en masse produit une seule entrée d'audit (résumé). */
const AUDIT_DETAIL_LIMIT = 25

const columnCache = new WeakMap<Db, Map<TrackedTable, readonly string[]>>()

function columnsOf(db: Db, table: TrackedTable): readonly string[] {
  let cache = columnCache.get(db)
  if (!cache) {
    cache = new Map()
    columnCache.set(db, cache)
  }
  let columns = cache.get(table)
  if (!columns) {
    columns = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
      (column) => column.name,
    )
    cache.set(table, columns)
  }
  return columns
}

function checkColumns(db: Db, table: TrackedTable, names: readonly string[]): void {
  const known = columnsOf(db, table)
  for (const name of names) {
    if (!known.includes(name)) throw new Error(`Colonne inconnue : ${table}.${name}`)
  }
}

function keyOf(table: TrackedTable, row: Row): Row {
  const key: Row = {}
  for (const column of TRACKED_TABLES[table].key) key[column] = row[column] ?? null
  return key
}

const where = (table: TrackedTable) =>
  TRACKED_TABLES[table].key.map((column) => `${column} = @k_${column}`).join(' AND ')

function keyParams(key: Row): Row {
  const params: Row = {}
  for (const [column, value] of Object.entries(key)) params[`k_${column}`] = value
  return params
}

function sameRow(a: Row | null | undefined, b: Row | null | undefined): boolean {
  if (!a || !b) return !a && !b
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) if (a[key] !== b[key]) return false
  return true
}

export class ChangeSet {
  readonly changes: RowChange[] = []

  constructor(readonly db: Db) {}

  get(table: TrackedTable, key: Row): Row | undefined {
    return this.db.prepare(`SELECT * FROM ${table} WHERE ${where(table)}`).get(keyParams(key)) as
      Row | undefined
  }

  insert(table: TrackedTable, row: Row): void {
    const columns = Object.keys(row)
    checkColumns(this.db, table, columns)
    this.db
      .prepare(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((c) => `@${c}`).join(', ')})`,
      )
      .run(row)
    const key = keyOf(table, row)
    this.changes.push({ table, key, before: null, after: this.get(table, key) ?? null })
  }

  /** Met à jour les colonnes données ; ne consigne rien si la ligne est inchangée. */
  update(table: TrackedTable, key: Row, patch: Row): boolean {
    const before = this.get(table, key)
    if (!before) throw new Error(`Ligne absente : ${table}`)
    const columns = Object.keys(patch).filter((column) => patch[column] !== before[column])
    if (columns.length === 0) return false
    checkColumns(this.db, table, columns)
    const values: Row = { ...keyParams(key) }
    for (const column of columns) values[`v_${column}`] = patch[column] ?? null
    this.db
      .prepare(
        `UPDATE ${table} SET ${columns.map((c) => `${c} = @v_${c}`).join(', ')} WHERE ${where(table)}`,
      )
      .run(values)
    this.changes.push({ table, key, before, after: this.get(table, key) ?? null })
    return true
  }

  delete(table: TrackedTable, key: Row): Row | null {
    const before = this.get(table, key)
    if (!before) return null
    this.db.prepare(`DELETE FROM ${table} WHERE ${where(table)}`).run(keyParams(key))
    this.changes.push({ table, key, before, after: null })
    return before
  }

  /**
   * Applique l'inverse de `changes` (de la dernière à la première). Refuse (`false`, rien
   * n'est écrit par l'appelant qui annule sa transaction) si une ligne a changé depuis.
   */
  revert(changes: readonly RowChange[]): boolean {
    for (const change of [...changes].reverse()) {
      if (!sameRow(this.get(change.table, change.key) ?? null, change.after)) return false
      if (change.before === null) this.delete(change.table, change.key)
      else if (change.after === null) this.insert(change.table, change.before)
      else this.update(change.table, change.key, change.before)
    }
    return true
  }
}

/** Image d'une ligne pour le journal : l'IBAN n'y figure que masqué. */
function auditImage(table: TrackedTable, row: Row | null): Row | undefined {
  if (!row) return undefined
  if (table === 'account' && typeof row.iban === 'string') {
    return { ...row, iban: maskIban(row.iban) }
  }
  return row
}

/** Journal d'audit d'un jeu de modifications : une entrée par ligne, ou un résumé en masse. */
export function auditChanges(
  db: Db,
  changes: readonly RowChange[],
  {
    origin,
    action,
    now,
    auditAction,
  }: { origin: AuditInput['origin']; action: string; now: Date; auditAction?: 'revert' },
): void {
  const audited = changes.filter((change) => TRACKED_TABLES[change.table].entity !== null)
  if (audited.length === 0) return
  if (audited.length > AUDIT_DETAIL_LIMIT) {
    const first = audited[0]
    const entity = first ? TRACKED_TABLES[first.table].entity : null
    recordAudit(
      db,
      {
        entity: entity ?? 'vault',
        entityId: null,
        action: auditAction ?? 'update',
        origin,
        after: { action, rows: audited.length },
      },
      now,
    )
    return
  }
  for (const change of audited) {
    const entity = TRACKED_TABLES[change.table].entity
    if (!entity) continue
    const entityId = change.key.id ?? change.key.split_id ?? null
    recordAudit(
      db,
      {
        entity,
        entityId: typeof entityId === 'string' ? entityId : null,
        action:
          auditAction ??
          (change.before === null ? 'create' : change.after === null ? 'delete' : 'update'),
        origin,
        before: auditImage(change.table, change.before),
        after: auditImage(change.table, change.after),
      },
      now,
    )
  }
}
