import type { AuditEntrySummary, HistoryStatus } from '@shared/ledger/model'
import type { ParsedLedgerInputs } from '@shared/ledger/schemas'
import type { Db } from '../db/connection'
import type { RowChange } from './changes'

export interface HistoryEntry {
  action: string
  changes: readonly RowChange[]
}

export const HISTORY_LIMIT = 50

export function statusOfHistory(
  undoStack: readonly HistoryEntry[],
  redoStack: readonly HistoryEntry[],
): HistoryStatus {
  return {
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undoAction: undoStack.at(-1)?.action ?? null,
    redoAction: redoStack.at(-1)?.action ?? null,
  }
}

export function listAuditEntries(
  db: Db,
  { entity, entityId, limit = 100 }: ParsedLedgerInputs['auditList'],
): AuditEntrySummary[] {
  const clauses: string[] = []
  const params: Record<string, string | number> = { limit }
  if (entity) {
    clauses.push('entity = @entity')
    params.entity = entity
  }
  if (entityId) {
    clauses.push('entity_id = @entityId')
    params.entityId = entityId
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = db
    .prepare(
      `SELECT id, at, entity, entity_id, action, origin, before, after FROM audit_entry
       ${where} ORDER BY id DESC LIMIT @limit`,
    )
    .all(params) as {
    id: string
    at: string
    entity: AuditEntrySummary['entity']
    entity_id: string | null
    action: string
    origin: string
    before: string | null
    after: string | null
  }[]

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
