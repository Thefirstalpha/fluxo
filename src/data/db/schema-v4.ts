/**
 * Migration v4 — catégorisation automatique locale (M4) :
 * - `classifier_state` : modèle Bayes naïf sérialisé dans le coffre chiffré ;
 * - `categorization_suggestion` : suggestions et explicabilité pour la file « À valider » ;
 * - `recurring_dismissed` : récurrences ou alertes de hausse masquées par l'utilisateur.
 */
export const SCHEMA_V4 = `
CREATE TABLE classifier_state (
  id              TEXT    PRIMARY KEY,
  vocabulary_json TEXT    NOT NULL CHECK (json_valid(vocabulary_json)),
  priors_json     TEXT    NOT NULL CHECK (json_valid(priors_json)),
  sample_count    INTEGER NOT NULL DEFAULT 0 CHECK (sample_count >= 0),
  updated_at      TEXT    NOT NULL
) STRICT;

CREATE TABLE categorization_suggestion (
  transaction_id  TEXT    PRIMARY KEY REFERENCES transactions (id) ON DELETE CASCADE,
  category_id     TEXT    REFERENCES category (id) ON DELETE CASCADE,
  tag_ids         TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(tag_ids)),
  suggested_label TEXT,
  suggested_payee TEXT,
  source          TEXT    NOT NULL CHECK (source IN ('rule', 'merchant', 'naive-bayes')),
  rule_id         TEXT    REFERENCES rule (id) ON DELETE SET NULL,
  confidence      REAL    NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  reason          TEXT    NOT NULL,
  status          TEXT    NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL
) STRICT;

CREATE INDEX idx_suggestion_pending ON categorization_suggestion (confidence DESC) WHERE status = 'pending';

CREATE TABLE recurring_dismissed (
  signature         TEXT    PRIMARY KEY,
  last_known_amount INTEGER,
  dismissed_at      TEXT    NOT NULL
) STRICT;
`
