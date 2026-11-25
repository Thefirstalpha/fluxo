import {
  CONTRACT_TYPES,
  EXECUTIVE_STATUSES,
  PAYSLIP_COUNTRY_PACKS,
  PAYSLIP_LINE_SECTIONS,
  PAYSLIP_SOURCE_ORIGINS,
  WORK_TIMES,
} from '@shared/payslip'
import {
  AUDIT_ACTIONS,
  AUDIT_ORIGINS,
  currency,
  date,
  flag,
  id,
  list,
  text,
  timestamp,
} from './schema-v1'

const AUDIT_ENTITIES_V7 = [
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
] as const

/**
 * Migration v7 — Salaires et bulletins de paie (M6) :
 * - `employer` et `contract` (pack pays France par défaut, NIR chiffré avec la base) ;
 * - `payslip` et `payslip_line` (éléments variables, absences, cotisations salariales/patronales
 *   par ligne, net imposable, net social, PAS, cumuls annuels, rapprochement virement) ;
 * - extension de `audit_entry` aux entités de paie.
 */
export const SCHEMA_V7 = `
CREATE TABLE employer (
  ${id()} PRIMARY KEY,
  ${text('name', 200)},
  siret TEXT CHECK (siret IS NULL OR (length(siret) = 14 AND siret GLOB '[0-9]*')),
  ${text('address', 400, false)},
  ${flag('archived', 0)},
  ${timestamp('created_at')},
  ${timestamp('updated_at')}
) STRICT;

CREATE TABLE contract (
  ${id()} PRIMARY KEY,
  employer_id TEXT NOT NULL REFERENCES employer (id) ON DELETE RESTRICT,
  ${text('title', 200)},
  contract_type TEXT NOT NULL CHECK (contract_type IN (${list(CONTRACT_TYPES)})),
  executive_status TEXT NOT NULL CHECK (executive_status IN (${list(EXECUTIVE_STATUSES)})),
  work_time TEXT NOT NULL CHECK (work_time IN (${list(WORK_TIMES)})),
  work_time_ratio_micros INTEGER NOT NULL DEFAULT 1000000 CHECK (work_time_ratio_micros BETWEEN 1 AND 1000000),
  monthly_hours_hundredths INTEGER CHECK (monthly_hours_hundredths IS NULL OR monthly_hours_hundredths >= 0),
  ${text('collective_agreement', 200, false)},
  ${text('classification', 120, false)},
  start_date TEXT NOT NULL CHECK (${date('start_date')}),
  end_date TEXT CHECK (end_date IS NULL OR ${date('end_date')}),
  default_base_salary INTEGER CHECK (default_base_salary IS NULL OR default_base_salary >= 0),
  ${currency()},
  country_pack TEXT NOT NULL DEFAULT 'fr' CHECK (country_pack IN (${list(PAYSLIP_COUNTRY_PACKS)})),
  employee_nir TEXT CHECK (employee_nir IS NULL OR length(employee_nir) BETWEEN 13 AND 25),
  ${flag('archived', 0)},
  ${timestamp('created_at')},
  ${timestamp('updated_at')},
  CHECK (end_date IS NULL OR start_date <= end_date)
) STRICT;
CREATE INDEX idx_contract_employer ON contract (employer_id);

CREATE TABLE payslip (
  ${id()} PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contract (id) ON DELETE RESTRICT,
  period TEXT NOT NULL CHECK (period GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]'),
  payment_date TEXT CHECK (payment_date IS NULL OR ${date('payment_date')}),
  country_pack TEXT NOT NULL DEFAULT 'fr' CHECK (country_pack IN (${list(PAYSLIP_COUNTRY_PACKS)})),
  ${currency()},
  ${flag('totals_only', 0)},
  base_hours_hundredths INTEGER CHECK (base_hours_hundredths IS NULL OR base_hours_hundredths >= 0),
  hourly_rate INTEGER CHECK (hourly_rate IS NULL OR hourly_rate >= 0),
  base_salary INTEGER NOT NULL CHECK (base_salary >= 0),
  gross INTEGER NOT NULL CHECK (gross >= 0),
  employee_contributions INTEGER NOT NULL CHECK (employee_contributions >= 0),
  employer_contributions INTEGER NOT NULL DEFAULT 0 CHECK (employer_contributions >= 0),
  net_before_tax INTEGER NOT NULL,
  taxable_net INTEGER NOT NULL,
  social_net INTEGER CHECK (social_net IS NULL OR social_net >= 0),
  withholding_rate_micros INTEGER NOT NULL DEFAULT 0 CHECK (withholding_rate_micros BETWEEN 0 AND 1000000),
  ${flag('withholding_personalized', 1)},
  withholding_base INTEGER CHECK (withholding_base IS NULL OR withholding_base >= 0),
  withholding_tax INTEGER NOT NULL DEFAULT 0 CHECK (withholding_tax >= 0),
  other_adjustments INTEGER NOT NULL DEFAULT 0,
  net_paid INTEGER NOT NULL,
  ytd_gross INTEGER CHECK (ytd_gross IS NULL OR ytd_gross >= 0),
  ytd_taxable_net INTEGER CHECK (ytd_taxable_net IS NULL OR ytd_taxable_net >= 0),
  ytd_withholding INTEGER CHECK (ytd_withholding IS NULL OR ytd_withholding >= 0),
  ytd_hours_hundredths INTEGER CHECK (ytd_hours_hundredths IS NULL OR ytd_hours_hundredths >= 0),
  employee_nir TEXT CHECK (employee_nir IS NULL OR length(employee_nir) BETWEEN 13 AND 25),
  ${text('employee_address', 400, false)},
  transaction_id TEXT REFERENCES transactions (id) ON DELETE SET NULL,
  source_origin TEXT NOT NULL DEFAULT 'user' CHECK (source_origin IN (${list(PAYSLIP_SOURCE_ORIGINS)})),
  ${text('notes', 2000, false)},
  ${timestamp('created_at')},
  ${timestamp('updated_at')}
) STRICT;
CREATE INDEX idx_payslip_contract_period ON payslip (contract_id, period DESC);
CREATE UNIQUE INDEX idx_payslip_transaction ON payslip (transaction_id) WHERE transaction_id IS NOT NULL;

CREATE TABLE payslip_line (
  ${id()} PRIMARY KEY,
  payslip_id TEXT NOT NULL REFERENCES payslip (id) ON DELETE CASCADE,
  section TEXT NOT NULL CHECK (section IN (${list(PAYSLIP_LINE_SECTIONS)})),
  ${text('item_kind', 60)},
  ${text('label', 200)},
  quantity_hundredths INTEGER,
  base_amount INTEGER,
  employee_rate_micros INTEGER CHECK (employee_rate_micros IS NULL OR employee_rate_micros BETWEEN 0 AND 1000000),
  employee_amount INTEGER NOT NULL DEFAULT 0,
  employer_rate_micros INTEGER CHECK (employer_rate_micros IS NULL OR employer_rate_micros BETWEEN 0 AND 1000000),
  employer_amount INTEGER NOT NULL DEFAULT 0,
  ${flag('taxable', 1)},
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  UNIQUE (payslip_id, position)
) STRICT;
CREATE INDEX idx_payslip_line_payslip ON payslip_line (payslip_id, section, position);

CREATE TABLE audit_entry_v7 (
  ${id()} PRIMARY KEY,
  ${timestamp('at')},
  entity TEXT NOT NULL CHECK (entity IN (${list(AUDIT_ENTITIES_V7)})),
  entity_id TEXT,
  action TEXT NOT NULL CHECK (action IN (${list(AUDIT_ACTIONS)})),
  origin TEXT NOT NULL CHECK (origin IN (${list(AUDIT_ORIGINS)})),
  before TEXT CHECK (before IS NULL OR json_valid(before)),
  after TEXT CHECK (after IS NULL OR json_valid(after))
) STRICT;

INSERT INTO audit_entry_v7 (id, at, entity, entity_id, action, origin, before, after)
SELECT id, at, entity, entity_id, action, origin, before, after FROM audit_entry;

DROP TABLE audit_entry;
ALTER TABLE audit_entry_v7 RENAME TO audit_entry;

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
