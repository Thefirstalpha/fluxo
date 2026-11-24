/**
 * Migration v2 (M2 — registre) : apparence des comptes, favoris, filtres enregistrés, recherche
 * plein texte, et deux règles de plus portées par la base (voir l'ADR-032) :
 * - le mode de suivi d'un compte ne change plus dès qu'il a des opérations (ADR-026) ;
 * - l'arbre des catégories a deux niveaux au plus.
 *
 * Recherche : table FTS5 sans contenu, indexée par une clé entière **explicite**
 * (`transaction_search_key`) — le `rowid` implicite de `transactions` n'est pas stable
 * (`VACUUM`, et donc les sauvegardes, peut le renuméroter). Les triggers tiennent l'index à jour
 * quelle que soit l'écriture (saisie, import, annulation).
 */
import { id, timestamp } from './schema-v1'

const color = (column: string) =>
  `${column} TEXT CHECK (${column} IS NULL OR ${column} GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]')`

/** Colonnes indexées pour une transaction `T` (`NEW` ou ligne d'une requête). */
const searchValues = (t: string) =>
  `${t}.label, ${t}.label_raw, ${t}.note, (SELECT name FROM payee WHERE id = ${t}.payee_id)`
const searchKey = (id: string) =>
  `(SELECT search_id FROM transaction_search_key WHERE transaction_id = ${id})`

export const SCHEMA_V2 = `
ALTER TABLE account ADD COLUMN ${color('color')};
ALTER TABLE account ADD COLUMN icon TEXT CHECK (icon IS NULL OR length(icon) BETWEEN 1 AND 60);
ALTER TABLE transactions ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1));

CREATE INDEX transactions_transfer ON transactions (transfer_id) WHERE transfer_id IS NOT NULL;

-- Index couvrant des soldes (compte, date, montant, statut) : remplace l'index (compte, date).
CREATE INDEX transactions_account_balance
  ON transactions (account_id, booking_date, amount, status);
DROP INDEX transactions_account_date;
CREATE INDEX transactions_amount ON transactions (amount);

CREATE TRIGGER account_tracking_mode_locked
BEFORE UPDATE OF tracking_mode ON account
WHEN NEW.tracking_mode IS NOT OLD.tracking_mode
  AND EXISTS (SELECT 1 FROM transactions WHERE account_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'tracking_mode_locked');
END;

CREATE TRIGGER category_depth_insert
BEFORE INSERT ON category
WHEN NEW.parent_id IS NOT NULL
  AND (SELECT parent_id FROM category WHERE id = NEW.parent_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'category_depth');
END;

CREATE TRIGGER category_depth_update
BEFORE UPDATE OF parent_id ON category
WHEN NEW.parent_id IS NOT NULL AND (
  (SELECT parent_id FROM category WHERE id = NEW.parent_id) IS NOT NULL
  OR EXISTS (SELECT 1 FROM category WHERE parent_id = NEW.id)
)
BEGIN
  SELECT RAISE(ABORT, 'category_depth');
END;

CREATE TABLE saved_filter (
  ${id()} PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(name) BETWEEN 1 AND 100),
  filter TEXT NOT NULL CHECK (json_valid(filter) AND json_type(filter) = 'object'),
  sort_order INTEGER NOT NULL DEFAULT 0,
  ${timestamp('created_at')},
  ${timestamp('updated_at')}
) STRICT;

CREATE TABLE transaction_search_key (
  search_id INTEGER PRIMARY KEY,
  transaction_id TEXT NOT NULL UNIQUE
) STRICT;

CREATE VIRTUAL TABLE transactions_fts USING fts5(
  label, label_raw, note, payee,
  content = '', contentless_delete = 1,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER transactions_search_insert AFTER INSERT ON transactions
BEGIN
  INSERT INTO transaction_search_key (transaction_id) VALUES (NEW.id);
  INSERT INTO transactions_fts (rowid, label, label_raw, note, payee)
  VALUES (${searchKey('NEW.id')}, ${searchValues('NEW')});
END;

CREATE TRIGGER transactions_search_update
AFTER UPDATE OF label, label_raw, note, payee_id ON transactions
BEGIN
  DELETE FROM transactions_fts WHERE rowid = ${searchKey('OLD.id')};
  INSERT INTO transactions_fts (rowid, label, label_raw, note, payee)
  VALUES (${searchKey('NEW.id')}, ${searchValues('NEW')});
END;

CREATE TRIGGER transactions_search_delete AFTER DELETE ON transactions
BEGIN
  DELETE FROM transactions_fts WHERE rowid = ${searchKey('OLD.id')};
  DELETE FROM transaction_search_key WHERE transaction_id = OLD.id;
END;

CREATE TRIGGER payee_search_rename AFTER UPDATE OF name ON payee
BEGIN
  DELETE FROM transactions_fts WHERE rowid IN (
    SELECT k.search_id FROM transaction_search_key k
    JOIN transactions t ON t.id = k.transaction_id WHERE t.payee_id = NEW.id
  );
  INSERT INTO transactions_fts (rowid, label, label_raw, note, payee)
  SELECT k.search_id, ${searchValues('t')} FROM transactions t
  JOIN transaction_search_key k ON k.transaction_id = t.id WHERE t.payee_id = NEW.id;
END;

INSERT INTO transaction_search_key (transaction_id) SELECT id FROM transactions ORDER BY id;
INSERT INTO transactions_fts (rowid, label, label_raw, note, payee)
SELECT k.search_id, ${searchValues('t')} FROM transactions t
JOIN transaction_search_key k ON k.transaction_id = t.id;
`
