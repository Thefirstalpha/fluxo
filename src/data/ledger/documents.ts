import type {
  AiProviderId,
  AiPurpose,
  AiSendLogEntry,
  AiSendStatus,
  DocumentDetail,
  DocumentExtractionMethod,
  DocumentKind,
  DocumentLinkedEntityType,
  DocumentListItem,
  DocumentMimeType,
  DocumentStatus,
  ExtractedDocumentDraft,
  RedactionCount,
} from '@shared/documents/model'
import { extractedDocumentDraftSchema } from '@shared/documents/schemas'
import { uuidv7 } from '@shared/uuid'
import { recordAudit } from '../db/audit'
import type { Db } from '../db/connection'
import type { ChangeSet } from './changes'
import { fail } from './failure'

interface DocumentRow {
  id: string
  kind: DocumentKind
  file_name: string
  mime_type: DocumentMimeType
  sha256: string
  page_count: number
  status: DocumentStatus
  extraction_method: DocumentExtractionMethod
  confidence: number
  extracted_json: string | null
  linked_entity_type: DocumentLinkedEntityType | null
  linked_entity_id: string | null
  created_at: string
  updated_at: string
}

interface AiSendLogRow {
  id: string
  provider: AiProviderId
  model: string
  purpose: AiPurpose
  document_id: string | null
  input_tokens: number
  output_tokens: number
  cost_micro_usd: number
  payload_sha256: string
  redaction_summary_json: string
  status: AiSendStatus
  created_at: string
}

function toListItem(row: DocumentRow): DocumentListItem {
  return {
    id: row.id,
    kind: row.kind,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sha256: row.sha256,
    pageCount: row.page_count,
    status: row.status,
    extractionMethod: row.extraction_method,
    confidence: row.confidence,
    linkedEntityType: row.linked_entity_type,
    linkedEntityId: row.linked_entity_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseDraft(raw: string | null): ExtractedDocumentDraft | null {
  if (!raw) return null
  try {
    const parsed = extractedDocumentDraftSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function listDocuments(
  db: Db,
  filter: { status?: DocumentStatus; limit?: number } = {},
): DocumentListItem[] {
  const limit = filter.limit ?? 100
  const rows = filter.status
    ? (db
        .prepare(
          `SELECT id, kind, file_name, mime_type, sha256, page_count, status, extraction_method,
                  confidence, extracted_json, linked_entity_type, linked_entity_id, created_at, updated_at
           FROM document WHERE status = ? ORDER BY created_at DESC LIMIT ?`,
        )
        .all(filter.status, limit) as DocumentRow[])
    : (db
        .prepare(
          `SELECT id, kind, file_name, mime_type, sha256, page_count, status, extraction_method,
                  confidence, extracted_json, linked_entity_type, linked_entity_id, created_at, updated_at
           FROM document ORDER BY created_at DESC LIMIT ?`,
        )
        .all(limit) as DocumentRow[])
  return rows.map(toListItem)
}

export function findDocumentBySha256(db: Db, sha256: string): DocumentListItem | null {
  const row = db
    .prepare(
      `SELECT id, kind, file_name, mime_type, sha256, page_count, status, extraction_method,
              confidence, extracted_json, linked_entity_type, linked_entity_id, created_at, updated_at
       FROM document WHERE sha256 = ?`,
    )
    .get(sha256) as DocumentRow | undefined
  return row ? toListItem(row) : null
}

export function getDocumentDetail(db: Db, id: string): DocumentDetail | null {
  const row = db
    .prepare(
      `SELECT id, kind, file_name, mime_type, sha256, page_count, status, extraction_method,
              confidence, extracted_json, linked_entity_type, linked_entity_id, created_at, updated_at
       FROM document WHERE id = ?`,
    )
    .get(id) as DocumentRow | undefined
  if (!row) return null
  return {
    ...toListItem(row),
    draft: parseDraft(row.extracted_json),
    pages: [],
    hasOriginalBytes: false,
    previewImageDataUrl: null,
  }
}

export function upsertDocument(
  changes: ChangeSet,
  input: {
    id?: string
    kind: DocumentKind
    fileName: string
    mimeType: DocumentMimeType
    sha256: string
    pageCount: number
    status: DocumentStatus
    extractionMethod: DocumentExtractionMethod
    confidence: number
    draft: ExtractedDocumentDraft | null
    linkedEntityType?: DocumentLinkedEntityType | null
    linkedEntityId?: string | null
  },
  now: Date,
): DocumentListItem {
  const stamp = now.toISOString()
  const existing = changes.db
    .prepare('SELECT id FROM document WHERE id = ? OR sha256 = ?')
    .get(input.id ?? '', input.sha256) as { id: string } | undefined

  const extractedJson = input.draft ? JSON.stringify(input.draft) : null
  if (existing) {
    changes.update(
      'document',
      { id: existing.id },
      {
        kind: input.kind,
        file_name: input.fileName,
        mime_type: input.mimeType,
        page_count: input.pageCount,
        status: input.status,
        extraction_method: input.extractionMethod,
        confidence: input.confidence,
        extracted_json: extractedJson,
        ...(input.linkedEntityType !== undefined
          ? { linked_entity_type: input.linkedEntityType }
          : {}),
        ...(input.linkedEntityId !== undefined ? { linked_entity_id: input.linkedEntityId } : {}),
        updated_at: stamp,
      },
    )
    const updated = changes.db
      .prepare('SELECT * FROM document WHERE id = ?')
      .get(existing.id) as DocumentRow
    return toListItem(updated)
  }

  const id = input.id ?? uuidv7()
  changes.insert('document', {
    id,
    kind: input.kind,
    file_name: input.fileName,
    mime_type: input.mimeType,
    sha256: input.sha256,
    page_count: input.pageCount,
    status: input.status,
    extraction_method: input.extractionMethod,
    confidence: input.confidence,
    extracted_json: extractedJson,
    linked_entity_type: input.linkedEntityType ?? null,
    linked_entity_id: input.linkedEntityId ?? null,
    created_at: stamp,
    updated_at: stamp,
  })
  const inserted = changes.db.prepare('SELECT * FROM document WHERE id = ?').get(id) as DocumentRow
  return toListItem(inserted)
}

export function updateDocumentDraft(
  changes: ChangeSet,
  id: string,
  draft: ExtractedDocumentDraft,
  now: Date,
): DocumentListItem {
  const row = changes.db.prepare('SELECT * FROM document WHERE id = ?').get(id) as
    DocumentRow | undefined
  if (!row) fail('not-found')

  const stamp = now.toISOString()
  changes.update(
    'document',
    { id },
    {
      kind: draft.kind,
      extracted_json: JSON.stringify(draft),
      confidence: draft.overallConfidence,
      status: draft.needsAiAssist ? 'needs_review' : 'extracted',
      updated_at: stamp,
    },
  )
  const updated = changes.db.prepare('SELECT * FROM document WHERE id = ?').get(id) as DocumentRow
  return toListItem(updated)
}

export function markDocumentCommitted(
  changes: ChangeSet,
  input: {
    id: string
    linkedEntityType: DocumentLinkedEntityType
    linkedEntityId: string
    draft?: ExtractedDocumentDraft | null
  },
  now: Date,
): DocumentListItem {
  const row = changes.db.prepare('SELECT * FROM document WHERE id = ?').get(input.id) as
    DocumentRow | undefined
  if (!row) fail('not-found')
  const stamp = now.toISOString()
  changes.update(
    'document',
    { id: input.id },
    {
      status: 'committed',
      linked_entity_type: input.linkedEntityType,
      linked_entity_id: input.linkedEntityId,
      ...(input.draft !== undefined
        ? { extracted_json: input.draft ? JSON.stringify(input.draft) : null }
        : {}),
      updated_at: stamp,
    },
  )
  const updated = changes.db
    .prepare('SELECT * FROM document WHERE id = ?')
    .get(input.id) as DocumentRow
  return toListItem(updated)
}

export function markDocumentRejected(changes: ChangeSet, id: string, now: Date): DocumentListItem {
  const row = changes.db.prepare('SELECT * FROM document WHERE id = ?').get(id) as
    DocumentRow | undefined
  if (!row) fail('not-found')
  const stamp = now.toISOString()
  changes.update('document', { id }, { status: 'rejected', updated_at: stamp })
  const updated = changes.db.prepare('SELECT * FROM document WHERE id = ?').get(id) as DocumentRow
  return toListItem(updated)
}

export function deleteDocumentRecord(changes: ChangeSet, id: string): null {
  const row = changes.db.prepare('SELECT id FROM document WHERE id = ?').get(id) as
    { id: string } | undefined
  if (!row) fail('not-found')
  changes.delete('document', { id })
  return null
}

export function recordAiSendLog(
  db: Db,
  input: {
    provider: AiProviderId
    model: string
    purpose: AiPurpose
    documentId: string | null
    inputTokens: number
    outputTokens: number
    costMicroUsd: number
    payloadSha256: string
    redactions: RedactionCount[]
    status: AiSendStatus
  },
  now: Date,
): AiSendLogEntry {
  const id = uuidv7()
  const stamp = now.toISOString()
  const redactionJson = JSON.stringify(input.redactions)

  db.prepare(
    `INSERT INTO ai_send_log (
       id, provider, model, purpose, document_id,
       input_tokens, output_tokens, cost_micro_usd, payload_sha256,
       redaction_summary_json, status, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.provider,
    input.model,
    input.purpose,
    input.documentId,
    input.inputTokens,
    input.outputTokens,
    input.costMicroUsd,
    input.payloadSha256,
    redactionJson,
    input.status,
    stamp,
  )

  recordAudit(
    db,
    {
      entity: 'ai_send_log',
      entityId: id,
      action: 'create',
      origin: 'ai',
      after: {
        provider: input.provider,
        model: input.model,
        purpose: input.purpose,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        costMicroUsd: input.costMicroUsd,
        status: input.status,
      },
    },
    now,
  )

  return {
    id,
    provider: input.provider,
    model: input.model,
    purpose: input.purpose,
    documentId: input.documentId,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    costMicroUsd: input.costMicroUsd,
    payloadSha256: input.payloadSha256,
    redactions: input.redactions,
    status: input.status,
    createdAt: stamp,
  }
}

export function listAiSendLogs(db: Db, limit = 50): AiSendLogEntry[] {
  const rows = db
    .prepare(
      `SELECT id, provider, model, purpose, document_id,
              input_tokens, output_tokens, cost_micro_usd, payload_sha256,
              redaction_summary_json, status, created_at
       FROM ai_send_log ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as AiSendLogRow[]

  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    model: row.model,
    purpose: row.purpose,
    documentId: row.document_id,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    costMicroUsd: row.cost_micro_usd,
    payloadSha256: row.payload_sha256,
    redactions: JSON.parse(row.redaction_summary_json) as RedactionCount[],
    status: row.status,
    createdAt: row.created_at,
  }))
}

export function getAiMonthlySpendMicroUsd(db: Db, now: Date): number {
  const prefix = now.toISOString().slice(0, 7)
  const total = db
    .prepare(
      `SELECT coalesce(sum(cost_micro_usd), 0)
       FROM ai_send_log
       WHERE status = 'sent' AND created_at LIKE ?`,
    )
    .pluck()
    .get(`${prefix}%`) as number
  return total ?? 0
}

export function saveAiCategorizationSuggestions(
  db: Db,
  items: readonly {
    transactionId: string
    categoryId: string | null
    suggestedLabel: string | null
    confidence: number
    reason: string
  }[],
  now: Date,
): number {
  const stamp = now.toISOString()
  const validCategories = new Set(
    db.prepare('SELECT id FROM category WHERE archived = 0').pluck().all() as string[],
  )
  const checkTx = db.prepare('SELECT 1 FROM transactions WHERE id = ?')
  const upsert = db.prepare(
    `INSERT INTO categorization_suggestion (
       transaction_id, category_id, tag_ids, suggested_label, suggested_payee,
       source, rule_id, confidence, reason, status, created_at, updated_at
     ) VALUES (?, ?, '[]', ?, NULL, 'ai', NULL, ?, ?, 'pending', ?, ?)
     ON CONFLICT (transaction_id) DO UPDATE SET
       category_id = excluded.category_id,
       suggested_label = coalesce(excluded.suggested_label, categorization_suggestion.suggested_label),
       source = 'ai',
       rule_id = NULL,
       confidence = excluded.confidence,
       reason = excluded.reason,
       status = 'pending',
       updated_at = excluded.updated_at`,
  )

  let count = 0
  db.transaction(() => {
    for (const item of items) {
      if (!checkTx.get(item.transactionId)) continue
      const catId = item.categoryId && validCategories.has(item.categoryId) ? item.categoryId : null
      if (!catId && !item.suggestedLabel) continue
      upsert.run(
        item.transactionId,
        catId,
        item.suggestedLabel,
        Math.max(0, Math.min(1, item.confidence)),
        item.reason.slice(0, 240),
        stamp,
        stamp,
      )
      count++
    }
  }).immediate()

  return count
}

/** Retourne les noms connus (employeurs, tiers) afin de les masquer avant tout appel IA. */
export function listKnownPiiNames(db: Db): string[] {
  const employers = db.prepare('SELECT name FROM employer').pluck().all() as string[]
  const payees = db.prepare('SELECT name FROM payee').pluck().all() as string[]
  return [...new Set([...employers, ...payees].map((s) => s.trim()).filter((s) => s.length >= 3))]
}
