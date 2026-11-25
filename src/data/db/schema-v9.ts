import {
  BUDGET_MODES,
  INSTALLMENT_STATUSES,
  LOAN_PERIODICITIES,
  LOAN_STATUSES,
  LOAN_TYPES,
  PLANNED_ORIGINS,
  PLANNED_PERIODICITIES,
} from '@shared/planning/model'
import { AUDIT_ACTIONS, AUDIT_ORIGINS, date, flag, id, list, text, timestamp } from './schema-v1'

const AUDIT_ENTITIES_V9 = [
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
  'valuation_entry',
  'loan',
  'loan_installment',
  'budget',
  'goal',
  'scenario',
  'planned_item',
] as const

/**
 * Migration v9 — Patrimoine, crédits, budgets & prévisions (M8) :
 * - `valuation_entry` (valorisations manuelles datées d'actifs externes) ;
 * - `loan` et `loan_installment` (crédits, échéanciers d'amortissement, rapprochement) ;
 * - `budget` et `goal` (enveloppes par catégorie et objectifs d'épargne) ;
 * - `scenario` et `planned_item` (simulation multi-comptes à long terme et scénarios « et si ») ;
 * - extension de `audit_entry` aux entités M8.
 */
export const SCHEMA_V9 = `
CREATE TABLE valuation_entry (
  ${id()} PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES account (id) ON DELETE CASCADE,
  valuation_date TEXT NOT NULL CHECK (${date('valuation_date')}),
  value_cents INTEGER NOT NULL,
  ${text('note', 500, false)},
  ${timestamp('created_at')},
  ${timestamp('updated_at')}
) STRICT;
CREATE INDEX idx_valuation_account_date ON valuation_entry (account_id, valuation_date DESC, created_at DESC);

CREATE TABLE loan (
  ${id()} PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE REFERENCES account (id) ON DELETE CASCADE,
  ${text('name', 200)},
  loan_type TEXT NOT NULL CHECK (loan_type IN (${list(LOAN_TYPES)})),
  initial_capital INTEGER NOT NULL CHECK (initial_capital > 0),
  nominal_rate_micros INTEGER NOT NULL CHECK (nominal_rate_micros >= 0 AND nominal_rate_micros <= 1000000),
  taeg_micros INTEGER CHECK (taeg_micros IS NULL OR (taeg_micros >= 0 AND taeg_micros <= 1000000)),
  insurance_monthly_cents INTEGER NOT NULL DEFAULT 0 CHECK (insurance_monthly_cents >= 0),
  duration_months INTEGER NOT NULL CHECK (duration_months BETWEEN 1 AND 600),
  periodicity TEXT NOT NULL CHECK (periodicity IN (${list(LOAN_PERIODICITIES)})),
  start_date TEXT NOT NULL CHECK (${date('start_date')}),
  end_date TEXT NOT NULL CHECK (${date('end_date')}),
  monthly_payment_cents INTEGER NOT NULL CHECK (monthly_payment_cents >= 0),
  remaining_principal_cents INTEGER NOT NULL CHECK (remaining_principal_cents >= 0),
  status TEXT NOT NULL CHECK (status IN (${list(LOAN_STATUSES)})),
  fixed_rate_end_date TEXT CHECK (fixed_rate_end_date IS NULL OR ${date('fixed_rate_end_date')}),
  ${timestamp('created_at')},
  ${timestamp('updated_at')}
) STRICT;

CREATE TABLE loan_installment (
  ${id()} PRIMARY KEY,
  loan_id TEXT NOT NULL REFERENCES loan (id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL CHECK (installment_number >= 1),
  due_date TEXT NOT NULL CHECK (${date('due_date')}),
  principal_cents INTEGER NOT NULL CHECK (principal_cents >= 0),
  interest_cents INTEGER NOT NULL CHECK (interest_cents >= 0),
  insurance_cents INTEGER NOT NULL DEFAULT 0 CHECK (insurance_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  remaining_principal_cents INTEGER NOT NULL CHECK (remaining_principal_cents >= 0),
  status TEXT NOT NULL CHECK (status IN (${list(INSTALLMENT_STATUSES)})),
  transaction_id TEXT REFERENCES transactions (id) ON DELETE SET NULL,
  UNIQUE (loan_id, installment_number)
) STRICT;
CREATE INDEX idx_loan_installment_due ON loan_installment (loan_id, due_date);

CREATE TABLE budget (
  ${id()} PRIMARY KEY,
  category_id TEXT NOT NULL UNIQUE REFERENCES category (id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN (${list(BUDGET_MODES)})),
  amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  percent_micros INTEGER CHECK (percent_micros IS NULL OR (percent_micros >= 0 AND percent_micros <= 1000000)),
  ${flag('rollover', 0)},
  ${flag('alert_80', 1)},
  ${flag('alert_100', 1)},
  ${flag('archived', 0)},
  ${timestamp('created_at')},
  ${timestamp('updated_at')}
) STRICT;

CREATE TABLE goal (
  ${id()} PRIMARY KEY,
  ${text('name', 200)},
  target_cents INTEGER NOT NULL CHECK (target_cents > 0),
  target_date TEXT CHECK (target_date IS NULL OR ${date('target_date')}),
  account_id TEXT REFERENCES account (id) ON DELETE SET NULL,
  ${flag('archived', 0)},
  ${timestamp('created_at')},
  ${timestamp('updated_at')}
) STRICT;

CREATE TABLE scenario (
  ${id()} PRIMARY KEY,
  ${text('name', 200)},
  base_scenario_id TEXT REFERENCES scenario (id) ON DELETE SET NULL,
  horizon_months INTEGER NOT NULL CHECK (horizon_months BETWEEN 1 AND 120),
  account_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(account_ids_json)),
  default_indexation_micros INTEGER NOT NULL DEFAULT 0,
  savings_rate_overrides_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(savings_rate_overrides_json)),
  ${flag('is_base', 0)},
  ${timestamp('created_at')},
  ${timestamp('updated_at')}
) STRICT;

CREATE TABLE planned_item (
  ${id()} PRIMARY KEY,
  scenario_id TEXT NOT NULL REFERENCES scenario (id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES account (id) ON DELETE CASCADE,
  ${text('label', 200)},
  category_id TEXT REFERENCES category (id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL,
  periodicity TEXT NOT NULL CHECK (periodicity IN (${list(PLANNED_PERIODICITIES)})),
  start_date TEXT NOT NULL CHECK (${date('start_date')}),
  end_date TEXT CHECK (end_date IS NULL OR ${date('end_date')}),
  indexation_micros INTEGER NOT NULL DEFAULT 0,
  origin TEXT NOT NULL CHECK (origin IN (${list(PLANNED_ORIGINS)})),
  ${text('source_ref_id', 64, false)},
  ${flag('enabled', 1)},
  ${timestamp('created_at')},
  ${timestamp('updated_at')}
) STRICT;
CREATE INDEX idx_planned_item_scenario ON planned_item (scenario_id, start_date);

CREATE TABLE audit_entry_v9 (
  ${id()} PRIMARY KEY,
  ${timestamp('at')},
  entity TEXT NOT NULL CHECK (entity IN (${list(AUDIT_ENTITIES_V9)})),
  entity_id TEXT,
  action TEXT NOT NULL CHECK (action IN (${list(AUDIT_ACTIONS)})),
  origin TEXT NOT NULL CHECK (origin IN (${list(AUDIT_ORIGINS)})),
  before TEXT CHECK (before IS NULL OR json_valid(before)),
  after TEXT CHECK (after IS NULL OR json_valid(after))
) STRICT;

INSERT INTO audit_entry_v9 (id, at, entity, entity_id, action, origin, before, after)
SELECT id, at, entity, entity_id, action, origin, before, after FROM audit_entry;

DROP TABLE audit_entry;
ALTER TABLE audit_entry_v9 RENAME TO audit_entry;

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
