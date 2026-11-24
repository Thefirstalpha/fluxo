/**
 * Migration v3 — imports de relevés bancaires (M3) :
 * - élargit `import_batch.format` à `mt940` et ajoute les soldes de contrôle
 *   (`opening_balance`, `closing_balance`, `balance_discrepancy`) ;
 * - crée `csv_profile` pour sauvegarder et partager des configurations CSV validées.
 */
export const SCHEMA_V3 = `
CREATE TABLE import_batch_v3 (
  id                   TEXT    PRIMARY KEY,
  account_id           TEXT    NOT NULL REFERENCES account(id),
  file_name            TEXT    NOT NULL,
  file_hash            TEXT    NOT NULL,
  format               TEXT    NOT NULL CHECK (format IN ('csv', 'ofx', 'qfx', 'qif', 'camt053', 'mt940', 'demo')),
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

INSERT INTO import_batch_v3 (
  id, account_id, file_name, file_hash, format, profile,
  period_start, period_end, inserted_count, duplicate_count, skipped_count,
  state, created_at
)
SELECT
  id, account_id, file_name, file_hash, format, profile,
  period_start, period_end, inserted_count, duplicate_count, skipped_count,
  state, created_at
FROM import_batch;

DROP TABLE import_batch;
ALTER TABLE import_batch_v3 RENAME TO import_batch;
CREATE INDEX idx_batch_account ON import_batch (account_id, created_at);

CREATE TABLE csv_profile (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  bank        TEXT,
  config      TEXT NOT NULL CHECK (json_valid(config)),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
) STRICT;
`
