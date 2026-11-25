/**
 * Migration v6 — catégories de transfert liées aux comptes (épargne & virements internes) :
 * - `category.linked_account_id` associe une sous-catégorie de type `savings` ou `transfer` à un
 *   compte cible (ex. « Transfert ↔ Livret A ») ;
 * - invalidation des agrégats mensuels lors du changement de compte lié ou de type de compte, et
 *   recalcul immédiat pour intégrer le signe net des retraits d'épargne.
 */
export const SCHEMA_V6 = `
ALTER TABLE category ADD COLUMN linked_account_id TEXT REFERENCES account (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX idx_category_linked_account
  ON category (linked_account_id) WHERE linked_account_id IS NOT NULL;

CREATE TRIGGER agg_dirty_category_linked_update AFTER UPDATE OF linked_account_id ON category
WHEN coalesce((SELECT value FROM meta WHERE key = 'aggregates_dirty'), '1') != '1'
BEGIN
  UPDATE meta SET value = '1' WHERE key = 'aggregates_dirty';
END;

CREATE TRIGGER agg_dirty_account_type_update AFTER UPDATE OF type ON account
WHEN coalesce((SELECT value FROM meta WHERE key = 'aggregates_dirty'), '1') != '1'
BEGIN
  UPDATE meta SET value = '1' WHERE key = 'aggregates_dirty';
END;

INSERT INTO meta (key, value) VALUES ('aggregates_dirty', '1')
ON CONFLICT (key) DO UPDATE SET value = '1';
`
