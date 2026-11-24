/**
 * Migration v5 (M5 — analyses & synthèses) :
 * - table d'agrégats mensuels précalculés (`monthly_category_aggregate`) par mois, compte, catégorie
 *   et devise, invalidée automatiquement via un drapeau `meta.aggregates_dirty` ;
 * - index couvrant par date d'opération (`idx_transactions_booking_date`) pour accélérer les filtres
 *   multi-comptes sur plage de dates à 50 000 opérations (< 50 ms).
 */
export const SCHEMA_V5 = `
CREATE TABLE monthly_category_aggregate (
  month          TEXT    NOT NULL CHECK (length(month) = 7),
  account_id     TEXT    NOT NULL REFERENCES account (id) ON DELETE CASCADE,
  category_id    TEXT    NOT NULL DEFAULT '__none__',
  currency       TEXT    NOT NULL CHECK (length(currency) = 3),
  income         INTEGER NOT NULL DEFAULT 0,
  expenses       INTEGER NOT NULL DEFAULT 0,
  savings        INTEGER NOT NULL DEFAULT 0,
  transfer_in    INTEGER NOT NULL DEFAULT 0,
  transfer_out   INTEGER NOT NULL DEFAULT 0,
  income_conv    INTEGER NOT NULL DEFAULT 0,
  expenses_conv  INTEGER NOT NULL DEFAULT 0,
  savings_conv   INTEGER NOT NULL DEFAULT 0,
  transfer_in_conv  INTEGER NOT NULL DEFAULT 0,
  transfer_out_conv INTEGER NOT NULL DEFAULT 0,
  unconverted    INTEGER NOT NULL DEFAULT 0,
  tx_count       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (month, account_id, category_id, currency)
) STRICT;

CREATE INDEX idx_monthly_agg_month ON monthly_category_aggregate (month, currency);
CREATE INDEX idx_transactions_booking_date ON transactions (booking_date, account_id, amount)
WHERE nature = 'operation';

INSERT INTO meta (key, value) VALUES ('aggregates_dirty', '1')
ON CONFLICT (key) DO UPDATE SET value = '1';

CREATE TRIGGER agg_dirty_tx_insert AFTER INSERT ON transactions
WHEN NEW.nature = 'operation'
  AND coalesce((SELECT value FROM meta WHERE key = 'aggregates_dirty'), '1') != '1'
BEGIN
  UPDATE meta SET value = '1' WHERE key = 'aggregates_dirty';
END;

CREATE TRIGGER agg_dirty_tx_update AFTER UPDATE OF booking_date, amount, converted_amount, nature, transfer_id, account_id, currency ON transactions
WHEN coalesce((SELECT value FROM meta WHERE key = 'aggregates_dirty'), '1') != '1'
BEGIN
  UPDATE meta SET value = '1' WHERE key = 'aggregates_dirty';
END;

CREATE TRIGGER agg_dirty_tx_delete AFTER DELETE ON transactions
WHEN OLD.nature = 'operation'
  AND coalesce((SELECT value FROM meta WHERE key = 'aggregates_dirty'), '1') != '1'
BEGIN
  UPDATE meta SET value = '1' WHERE key = 'aggregates_dirty';
END;

CREATE TRIGGER agg_dirty_split_insert AFTER INSERT ON split
WHEN coalesce((SELECT value FROM meta WHERE key = 'aggregates_dirty'), '1') != '1'
BEGIN
  UPDATE meta SET value = '1' WHERE key = 'aggregates_dirty';
END;

CREATE TRIGGER agg_dirty_split_update AFTER UPDATE OF category_id, amount ON split
WHEN coalesce((SELECT value FROM meta WHERE key = 'aggregates_dirty'), '1') != '1'
BEGIN
  UPDATE meta SET value = '1' WHERE key = 'aggregates_dirty';
END;

CREATE TRIGGER agg_dirty_split_delete AFTER DELETE ON split
WHEN coalesce((SELECT value FROM meta WHERE key = 'aggregates_dirty'), '1') != '1'
BEGIN
  UPDATE meta SET value = '1' WHERE key = 'aggregates_dirty';
END;

CREATE TRIGGER agg_dirty_category_update AFTER UPDATE OF parent_id, kind ON category
WHEN coalesce((SELECT value FROM meta WHERE key = 'aggregates_dirty'), '1') != '1'
BEGIN
  UPDATE meta SET value = '1' WHERE key = 'aggregates_dirty';
END;
`
