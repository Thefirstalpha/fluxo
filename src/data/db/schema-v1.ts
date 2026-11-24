/**
 * Schéma v1 du coffre (M1) — voir docs/architecture/modele-de-donnees.md.
 *
 * Règles appliquées par la base elle-même, pour qu'aucun code (même futur ou fautif) ne
 * puisse les contourner :
 * - tables `STRICT` : un montant est un entier (un flottant ou un texte est refusé) ;
 * - identifiants UUIDv7 (36 caractères), dates calendaires `AAAA-MM-JJ` valides,
 *   horodatages UTC ISO 8601 au format de `Date.toISOString()` ;
 * - énumérations fermées, longueurs bornées, JSON valide ;
 * - ADR-026 : sur un compte « relevé importé », une opération ne naît que d'un import ou d'une
 *   écriture d'ajustement, et son montant, sa date et son compte sont figés ; un compte en
 *   valorisation manuelle n'a pas d'opérations ;
 * - journal d'audit en ajout seul.
 *
 * Σ des ventilations = montant de la transaction : vérifiée par le service à chaque écriture
 * (SQLite n'a pas de contrainte différée) et par `findUnbalancedTransactions` (tests).
 */
import {
  ACCOUNT_TYPES,
  AUDIT_ENTITIES,
  CATEGORY_KINDS,
  TRACKING_MODES,
  TRANSACTION_NATURES,
  TRANSACTION_STATUSES,
} from '@shared/ledger/model'

export const id = (column = 'id') => `${column} TEXT NOT NULL CHECK (length(${column}) = 36)`
const date = (column: string) => `date(${column}) IS ${column}`
export const timestamp = (column: string) =>
  `${column} TEXT NOT NULL CHECK (${column} GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z')`
const currency = (column = 'currency') =>
  `${column} TEXT NOT NULL CHECK (${column} GLOB '[A-Z][A-Z][A-Z]')`
const flag = (column: string, fallback: 0 | 1) =>
  `${column} INTEGER NOT NULL DEFAULT ${fallback} CHECK (${column} IN (0, 1))`
const text = (column: string, max: number, required = true) =>
  required
    ? `${column} TEXT NOT NULL CHECK (length(${column}) BETWEEN 1 AND ${max})`
    : `${column} TEXT CHECK (${column} IS NULL OR length(${column}) <= ${max})`
const color = (column = 'color') =>
  `${column} TEXT CHECK (${column} IS NULL OR ${column} GLOB '#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]')`

export {
  ACCOUNT_TYPES,
  AUDIT_ENTITIES,
  CATEGORY_KINDS,
  TRACKING_MODES,
  TRANSACTION_NATURES,
  TRANSACTION_STATUSES,
}
export const IMPORT_FORMATS = ['csv', 'ofx', 'qfx', 'qif', 'camt053', 'demo'] as const
export const IMPORT_STATES = ['pending', 'committed', 'reverted'] as const
export const AUDIT_ACTIONS = [
  'create',
  'update',
  'delete',
  'import',
  'revert',
  'seed',
  'migrate',
  'restore',
] as const
export const AUDIT_ORIGINS = ['user', 'import', 'rule', 'ai', 'system'] as const

export const list = (values: readonly string[]) => values.map((value) => `'${value}'`).join(', ')

export const SCHEMA_V1 = `
CREATE TABLE meta (
  key TEXT PRIMARY KEY NOT NULL CHECK (length(key) BETWEEN 1 AND 100),
  value TEXT NOT NULL
) STRICT;

CREATE TABLE account (
  ${id()} PRIMARY KEY,
  ${text('name', 200)},
  type TEXT NOT NULL CHECK (type IN (${list(ACCOUNT_TYPES)})),
  tracking_mode TEXT NOT NULL CHECK (tracking_mode IN (${list(TRACKING_MODES)})),
  ${text('institution', 200, false)},
  ${currency()},
  opening_balance INTEGER NOT NULL DEFAULT 0,
  opening_date TEXT CHECK (opening_date IS NULL OR ${date('opening_date')}),
  iban TEXT CHECK (iban IS NULL OR length(iban) BETWEEN 15 AND 34),
  ${flag('archived', 0)},
  sort_order INTEGER NOT NULL DEFAULT 0,
  ${timestamp('created_at')},
  ${timestamp('updated_at')}
) STRICT;

CREATE TABLE category (
  ${id()} PRIMARY KEY,
  parent_id TEXT REFERENCES category (id) ON DELETE RESTRICT,
  ${text('name', 100)},
  kind TEXT NOT NULL CHECK (kind IN (${list(CATEGORY_KINDS)})),
  ${text('icon', 60, false)},
  ${color()},
  sort_order INTEGER NOT NULL DEFAULT 0,
  ${flag('archived', 0)},
  ${timestamp('created_at')},
  ${timestamp('updated_at')},
  CHECK (parent_id IS NULL OR parent_id <> id)
) STRICT;
CREATE INDEX category_parent ON category (parent_id);

CREATE TABLE payee (
  ${id()} PRIMARY KEY,
  ${text('name', 200)},
  aliases TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(aliases) AND json_type(aliases) = 'array'),
  default_category_id TEXT REFERENCES category (id) ON DELETE SET NULL,
  ${timestamp('created_at')},
  ${timestamp('updated_at')}
) STRICT;

CREATE TABLE tag (
  ${id()} PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(name) BETWEEN 1 AND 60),
  ${color()},
  ${timestamp('created_at')}
) STRICT;

CREATE TABLE import_batch (
  ${id()} PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES account (id) ON DELETE RESTRICT,
  ${text('file_name', 255)},
  file_hash TEXT NOT NULL CHECK (file_hash GLOB '[0-9a-f]*' AND length(file_hash) = 64),
  format TEXT NOT NULL CHECK (format IN (${list(IMPORT_FORMATS)})),
  ${text('profile', 100, false)},
  period_start TEXT CHECK (period_start IS NULL OR ${date('period_start')}),
  period_end TEXT CHECK (period_end IS NULL OR ${date('period_end')}),
  inserted_count INTEGER NOT NULL DEFAULT 0 CHECK (inserted_count >= 0),
  duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
  skipped_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  state TEXT NOT NULL CHECK (state IN (${list(IMPORT_STATES)})),
  ${timestamp('created_at')},
  CHECK (period_start IS NULL OR period_end IS NULL OR period_start <= period_end)
) STRICT;
CREATE INDEX import_batch_account ON import_batch (account_id);

CREATE TABLE transactions (
  ${id()} PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES account (id) ON DELETE RESTRICT,
  booking_date TEXT NOT NULL CHECK (${date('booking_date')}),
  value_date TEXT CHECK (value_date IS NULL OR ${date('value_date')}),
  amount INTEGER NOT NULL,
  ${currency()},
  converted_amount INTEGER,
  label_raw TEXT NOT NULL CHECK (length(label_raw) <= 500),
  ${text('label', 500, false)},
  payee_id TEXT REFERENCES payee (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (${list(TRANSACTION_STATUSES)})),
  nature TEXT NOT NULL DEFAULT 'operation' CHECK (nature IN (${list(TRANSACTION_NATURES)})),
  ${text('note', 2000, false)},
  import_batch_id TEXT REFERENCES import_batch (id) ON DELETE RESTRICT,
  dedup_hash TEXT CHECK (dedup_hash IS NULL OR length(dedup_hash) BETWEEN 16 AND 128),
  transfer_id TEXT REFERENCES transactions (id) ON DELETE SET NULL,
  ${timestamp('created_at')},
  ${timestamp('updated_at')},
  CHECK (nature <> 'adjustment' OR length(trim(coalesce(note, ''))) > 0),
  CHECK (transfer_id IS NULL OR transfer_id <> id)
) STRICT;
CREATE INDEX transactions_account_date ON transactions (account_id, booking_date);
CREATE INDEX transactions_date ON transactions (booking_date);
CREATE INDEX transactions_dedup ON transactions (account_id, dedup_hash) WHERE dedup_hash IS NOT NULL;
CREATE INDEX transactions_batch ON transactions (import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX transactions_payee ON transactions (payee_id) WHERE payee_id IS NOT NULL;

-- ADR-026 : origine des opérations selon le mode de suivi du compte.
CREATE TRIGGER transactions_statement_origin
BEFORE INSERT ON transactions
WHEN (SELECT tracking_mode FROM account WHERE id = NEW.account_id) = 'statement'
  AND NEW.import_batch_id IS NULL AND NEW.nature <> 'adjustment'
BEGIN
  SELECT RAISE(ABORT, 'statement_account_requires_import');
END;

CREATE TRIGGER transactions_valuation_none
BEFORE INSERT ON transactions
WHEN (SELECT tracking_mode FROM account WHERE id = NEW.account_id) = 'valuation'
BEGIN
  SELECT RAISE(ABORT, 'valuation_account_has_no_transactions');
END;

CREATE TRIGGER transactions_statement_frozen
BEFORE UPDATE OF amount, booking_date, account_id, currency ON transactions
WHEN (SELECT tracking_mode FROM account WHERE id = OLD.account_id) = 'statement'
  AND OLD.nature = 'operation'
  AND (NEW.amount IS NOT OLD.amount OR NEW.booking_date IS NOT OLD.booking_date
    OR NEW.account_id IS NOT OLD.account_id OR NEW.currency IS NOT OLD.currency)
BEGIN
  SELECT RAISE(ABORT, 'imported_transaction_frozen');
END;

CREATE TABLE split (
  ${id()} PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
  category_id TEXT REFERENCES category (id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL,
  ${text('note', 2000, false)},
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  UNIQUE (transaction_id, position)
) STRICT;
CREATE INDEX split_category ON split (category_id);

CREATE TABLE split_tag (
  split_id TEXT NOT NULL REFERENCES split (id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tag (id) ON DELETE CASCADE,
  PRIMARY KEY (split_id, tag_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX split_tag_tag ON split_tag (tag_id);

CREATE TABLE rule (
  ${id()} PRIMARY KEY,
  ${text('name', 200)},
  conditions TEXT NOT NULL CHECK (json_valid(conditions)),
  actions TEXT NOT NULL CHECK (json_valid(actions)),
  priority INTEGER NOT NULL DEFAULT 0,
  ${flag('active', 1)},
  applied_count INTEGER NOT NULL DEFAULT 0 CHECK (applied_count >= 0),
  last_applied_at TEXT,
  ${timestamp('created_at')},
  ${timestamp('updated_at')}
) STRICT;

CREATE TABLE audit_entry (
  ${id()} PRIMARY KEY,
  ${timestamp('at')},
  entity TEXT NOT NULL CHECK (entity IN (${list(AUDIT_ENTITIES)})),
  entity_id TEXT,
  action TEXT NOT NULL CHECK (action IN (${list(AUDIT_ACTIONS)})),
  origin TEXT NOT NULL CHECK (origin IN (${list(AUDIT_ORIGINS)})),
  before TEXT CHECK (before IS NULL OR json_valid(before)),
  after TEXT CHECK (after IS NULL OR json_valid(after))
) STRICT;
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
