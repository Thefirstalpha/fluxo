import {
  AI_PROVIDERS,
  AI_PURPOSES,
  AI_SEND_STATUSES,
  DOCUMENT_EXTRACTION_METHODS,
  DOCUMENT_KINDS,
  DOCUMENT_LINKED_TYPES,
  DOCUMENT_MIME_TYPES,
  DOCUMENT_STATUSES,
} from '@shared/documents/model'
import { id, list, text, timestamp } from './schema-v1'

/**
 * Migration v10 — Google AI (Gemini) & synthèses IA transverses :
 * - élargit `document.extraction_method` à `'ai-google'` ;
 * - élargit `ai_send_log.provider` à `'google'` et `ai_send_log.purpose` à `'insights'`.
 */
export const SCHEMA_V10 = `
CREATE TABLE document_v10 (
  ${id()} PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN (${list(DOCUMENT_KINDS)})),
  ${text('file_name', 260)},
  mime_type TEXT NOT NULL CHECK (mime_type IN (${list(DOCUMENT_MIME_TYPES)})),
  sha256 TEXT NOT NULL UNIQUE CHECK (length(sha256) = 64 AND sha256 GLOB '[0-9a-f]*'),
  page_count INTEGER NOT NULL CHECK (page_count BETWEEN 1 AND 600),
  status TEXT NOT NULL CHECK (status IN (${list(DOCUMENT_STATUSES)})),
  extraction_method TEXT NOT NULL CHECK (extraction_method IN (${list(DOCUMENT_EXTRACTION_METHODS)})),
  confidence REAL NOT NULL DEFAULT 0.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  extracted_json TEXT CHECK (extracted_json IS NULL OR json_valid(extracted_json)),
  linked_entity_type TEXT CHECK (linked_entity_type IS NULL OR linked_entity_type IN (${list(DOCUMENT_LINKED_TYPES)})),
  linked_entity_id TEXT,
  ${timestamp('created_at')},
  ${timestamp('updated_at')}
) STRICT;

INSERT INTO document_v10 (
  id, kind, file_name, mime_type, sha256, page_count, status, extraction_method,
  confidence, extracted_json, linked_entity_type, linked_entity_id, created_at, updated_at
)
SELECT
  id, kind, file_name, mime_type, sha256, page_count, status, extraction_method,
  confidence, extracted_json, linked_entity_type, linked_entity_id, created_at, updated_at
FROM document;

DROP TABLE document;
ALTER TABLE document_v10 RENAME TO document;
CREATE INDEX idx_document_status ON document (status, created_at DESC);

CREATE TABLE ai_send_log_v10 (
  ${id()} PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN (${list(AI_PROVIDERS)})),
  ${text('model', 120)},
  purpose TEXT NOT NULL CHECK (purpose IN (${list(AI_PURPOSES)})),
  document_id TEXT REFERENCES document (id) ON DELETE SET NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cost_micro_usd INTEGER NOT NULL DEFAULT 0 CHECK (cost_micro_usd >= 0),
  payload_sha256 TEXT NOT NULL CHECK (length(payload_sha256) = 64 AND payload_sha256 GLOB '[0-9a-f]*'),
  redaction_summary_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(redaction_summary_json)),
  status TEXT NOT NULL CHECK (status IN (${list(AI_SEND_STATUSES)})),
  ${timestamp('created_at')}
) STRICT;

INSERT INTO ai_send_log_v10 (
  id, provider, model, purpose, document_id, input_tokens, output_tokens,
  cost_micro_usd, payload_sha256, redaction_summary_json, status, created_at
)
SELECT
  id, provider, model, purpose, document_id, input_tokens, output_tokens,
  cost_micro_usd, payload_sha256, redaction_summary_json, status, created_at
FROM ai_send_log;

DROP TABLE ai_send_log;
ALTER TABLE ai_send_log_v10 RENAME TO ai_send_log;
CREATE INDEX idx_ai_send_log_month ON ai_send_log (created_at DESC);
`
