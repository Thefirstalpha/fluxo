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
import { IMPORT_BATCH_FORMATS } from '@shared/imports/model'
import { AUDIT_ACTIONS, AUDIT_ORIGINS, id, list, text, timestamp } from './schema-v1'

const AUDIT_ENTITIES_V8 = [
  'vault',
  'account',
  'category',
  'payee',
  'tag',
  'transaction',
  'split',
  'import_batch',
  'rule',
  'employer',
  'contract',
  'payslip',
  'payslip_line',
  'document',
  'ai_send_log',
] as const

/**
 * Migration v8 — Documents, OCR & IA (M7) :
 * - table `document` (métadonnées + résultat structuré uniquement ; jamais les octets bruts ADR-018) ;
 * - table `ai_send_log` (journal des envois anonymisés, jetons, coût estimé en micro-USD) ;
 * - élargissement de `categorization_suggestion.source` à `'ai'` ;
 * - élargissement de `import_batch.format` à `'pdf'` ;
 * - extension de `audit_entry` aux entités `document` et `ai_send_log`.
 */
export const SCHEMA_V8 = `
CREATE TABLE document (
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
CREATE INDEX idx_document_status ON document (status, created_at DESC);

CREATE TABLE ai_send_log (
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
CREATE INDEX idx_ai_send_log_month ON ai_send_log (created_at DESC);

CREATE TABLE categorization_suggestion_v8 (
  transaction_id  TEXT    PRIMARY KEY REFERENCES transactions (id) ON DELETE CASCADE,
  category_id     TEXT    REFERENCES category (id) ON DELETE CASCADE,
  tag_ids         TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(tag_ids)),
  suggested_label TEXT,
  suggested_payee TEXT,
  source          TEXT    NOT NULL CHECK (source IN ('rule', 'merchant', 'naive-bayes', 'ai')),
  rule_id         TEXT    REFERENCES rule (id) ON DELETE SET NULL,
  confidence      REAL    NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  reason          TEXT    NOT NULL,
  status          TEXT    NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL
) STRICT;

INSERT INTO categorization_suggestion_v8 (
  transaction_id, category_id, tag_ids, suggested_label, suggested_payee,
  source, rule_id, confidence, reason, status, created_at, updated_at
)
SELECT
  transaction_id, category_id, tag_ids, suggested_label, suggested_payee,
  source, rule_id, confidence, reason, status, created_at, updated_at
FROM categorization_suggestion;

DROP TABLE categorization_suggestion;
ALTER TABLE categorization_suggestion_v8 RENAME TO categorization_suggestion;
CREATE INDEX idx_suggestion_pending ON categorization_suggestion (confidence DESC) WHERE status = 'pending';

CREATE TABLE import_batch_v8 (
  id                   TEXT    PRIMARY KEY,
  account_id           TEXT    NOT NULL REFERENCES account(id),
  file_name            TEXT    NOT NULL,
  file_hash            TEXT    NOT NULL,
  format               TEXT    NOT NULL CHECK (format IN (${list(IMPORT_BATCH_FORMATS)})),
  profile              TEXT,
  period_start         TEXT,
  period_end           TEXT,
  opening_balance      INTEGER CHECK (opening_balance IS NULL OR typeof(opening_balance) = 'integer'),
  closing_balance      INTEGER CHECK (closing_balance IS NULL OR typeof(closing_balance) = 'integer'),
  balance_discrepancy  INTEGER CHECK (balance_discrepancy IS NULL OR typeof(balance_discrepancy) = 'integer'),
  inserted_count       INTEGER NOT NULL DEFAULT 0,
  duplicate_count      INTEGER NOT NULL DEFAULT 0,
  skipped_count        INTEGER NOT NULL DEFAULT 0,
  state                TEXT    NOT NULL CHECK (state IN ('pending', 'committed', 'reverted')),
  created_at           TEXT    NOT NULL
) STRICT;

INSERT INTO import_batch_v8 (
  id, account_id, file_name, file_hash, format, profile,
  period_start, period_end, opening_balance, closing_balance, balance_discrepancy,
  inserted_count, duplicate_count, skipped_count, state, created_at
)
SELECT
  id, account_id, file_name, file_hash, format, profile,
  period_start, period_end, opening_balance, closing_balance, balance_discrepancy,
  inserted_count, duplicate_count, skipped_count, state, created_at
FROM import_batch;

DROP TABLE import_batch;
ALTER TABLE import_batch_v8 RENAME TO import_batch;
CREATE INDEX idx_batch_account ON import_batch (account_id, created_at);

CREATE TABLE audit_entry_v8 (
  ${id()} PRIMARY KEY,
  ${timestamp('at')},
  entity TEXT NOT NULL CHECK (entity IN (${list(AUDIT_ENTITIES_V8)})),
  entity_id TEXT,
  action TEXT NOT NULL CHECK (action IN (${list(AUDIT_ACTIONS)})),
  origin TEXT NOT NULL CHECK (origin IN (${list(AUDIT_ORIGINS)})),
  before TEXT CHECK (before IS NULL OR json_valid(before)),
  after TEXT CHECK (after IS NULL OR json_valid(after))
) STRICT;

INSERT INTO audit_entry_v8 (id, at, entity, entity_id, action, origin, before, after)
SELECT id, at, entity, entity_id, action, origin, before, after FROM audit_entry;

DROP TABLE audit_entry;
ALTER TABLE audit_entry_v8 RENAME TO audit_entry;

CREATE INDEX audit_entry_entity ON audit_entry (entity, entity_id);
CREATE TRIGGER audit_entry_no_update BEFORE UPDATE ON audit_entry
BEGIN
  SELECT RAISE(ABORT, 'audit_is_append_only');
END;
CREATE TRIGGER audit_entry_no_delete BEFORE DELETE ON audit_entry
BEGIN
  SELECT RAISE(ABORT, 'audit_is_append_only');
END;
`
