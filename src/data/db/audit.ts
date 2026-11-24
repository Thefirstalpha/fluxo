import { uuidv7 } from '@shared/uuid'
import type { Db } from './connection'
import type { AUDIT_ACTIONS, AUDIT_ENTITIES, AUDIT_ORIGINS } from './schema-v1'

export interface AuditInput {
  entity: (typeof AUDIT_ENTITIES)[number]
  entityId: string | null
  action: (typeof AUDIT_ACTIONS)[number]
  /** Qui est à l'origine de l'écriture : saisie, import, règle, IA, système. */
  origin: (typeof AUDIT_ORIGINS)[number]
  before?: unknown
  after?: unknown
}

export interface AuditEntry {
  id: string
  at: string
  entity: AuditInput['entity']
  entityId: string | null
  action: AuditInput['action']
  origin: AuditInput['origin']
  before: unknown
  after: unknown
}

interface AuditRow {
  id: string
  at: string
  entity: AuditInput['entity']
  entity_id: string | null
  action: AuditInput['action']
  origin: AuditInput['origin']
  before: string | null
  after: string | null
}

/**
 * Journal d'audit (dans la base chiffrée, en ajout seul — garanti par des triggers).
 * Les écritures en masse (démonstration, import) produisent une entrée par lot, pas par ligne.
 */
export function recordAudit(db: Db, input: AuditInput, now: Date = new Date()): string {
  const id = uuidv7()
  db.prepare(
    `INSERT INTO audit_entry (id, at, entity, entity_id, action, origin, before, after)
     VALUES (@id, @at, @entity, @entityId, @action, @origin, @before, @after)`,
  ).run({
    id,
    at: now.toISOString(),
    entity: input.entity,
    entityId: input.entityId,
    action: input.action,
    origin: input.origin,
    before: input.before === undefined ? null : JSON.stringify(input.before),
    after: input.after === undefined ? null : JSON.stringify(input.after),
  })
  return id
}

/** Entrées d'audit, de la plus ancienne à la plus récente (UUIDv7 triés). */
export function listAudit(db: Db, filter: { entity?: AuditInput['entity'] } = {}): AuditEntry[] {
  const rows = db
    .prepare(
      `SELECT id, at, entity, entity_id, action, origin, before, after FROM audit_entry
       WHERE @entity IS NULL OR entity = @entity ORDER BY id`,
    )
    .all({ entity: filter.entity ?? null }) as AuditRow[]
  return rows.map((row) => ({
    id: row.id,
    at: row.at,
    entity: row.entity,
    entityId: row.entity_id,
    action: row.action,
    origin: row.origin,
    before: row.before === null ? null : (JSON.parse(row.before) as unknown),
    after: row.after === null ? null : (JSON.parse(row.after) as unknown),
  }))
}
