import { sum, type MinorUnits } from './money'

/**
 * Modèle simplifié d'un bulletin de paie (France).
 * Le modèle complet (cotisations ligne à ligne, congés, cumuls annuels…) est décrit
 * dans docs/architecture/modele-de-donnees.md et livré au jalon M6.
 */
export const PAYSLIP_EXTRA_KINDS = [
  'on-call',
  'overtime',
  'thirteenth-month',
  'holiday-bonus',
  'performance-bonus',
  'seniority-bonus',
  'other',
] as const
export type PayslipExtraKind = (typeof PAYSLIP_EXTRA_KINDS)[number]

export interface PayslipExtra {
  kind: PayslipExtraKind
  amount: MinorUnits
}

export interface PayslipSummary {
  /** Période au format AAAA-MM. */
  period: string
  /** Salaire de base. */
  baseSalary: MinorUnits
  /** Primes et éléments variables : astreintes, heures sup., 13e mois… */
  extras: PayslipExtra[]
  /** Salaire brut. */
  gross: MinorUnits
  /** Total des cotisations salariales. */
  employeeContributions: MinorUnits
  /** Net à payer avant impôt sur le revenu. */
  netBeforeTax: MinorUnits
  /** Net imposable (base du prélèvement à la source). */
  taxableNet: MinorUnits
  /** Taux du prélèvement à la source, ex. 0.075 pour 7,5 %. */
  withholdingRate: number
  /** Montant du prélèvement à la source. */
  withholdingTax: MinorUnits
  /** Autres éléments après impôt (titres-restaurant, acomptes…), signés. */
  otherAdjustments: MinorUnits
  /** Net payé (montant du virement). */
  netPaid: MinorUnits
}

export type PayslipIssueCode =
  'GROSS_MISMATCH' | 'NET_BEFORE_TAX_MISMATCH' | 'WITHHOLDING_MISMATCH' | 'NET_PAID_MISMATCH'

export interface PayslipIssue {
  code: PayslipIssueCode
  expected: MinorUnits
  actual: MinorUnits
}

/**
 * Contrôles arithmétiques d'un bulletin. Utilisés pour la saisie manuelle (M6)
 * et pour valider les extractions automatiques de documents (M7).
 * `tolerance` absorbe les arrondis (en centimes).
 */
export function checkPayslip(payslip: PayslipSummary, tolerance = 2): PayslipIssue[] {
  const issues: PayslipIssue[] = []
  const check = (code: PayslipIssueCode, expected: MinorUnits, actual: MinorUnits): void => {
    if (Math.abs(expected - actual) > tolerance) issues.push({ code, expected, actual })
  }

  check(
    'GROSS_MISMATCH',
    payslip.baseSalary + sum(payslip.extras.map((extra) => extra.amount)),
    payslip.gross,
  )
  check(
    'NET_BEFORE_TAX_MISMATCH',
    payslip.gross - payslip.employeeContributions,
    payslip.netBeforeTax,
  )
  check(
    'WITHHOLDING_MISMATCH',
    Math.round(payslip.taxableNet * payslip.withholdingRate),
    payslip.withholdingTax,
  )
  check(
    'NET_PAID_MISMATCH',
    payslip.netBeforeTax - payslip.withholdingTax + payslip.otherAdjustments,
    payslip.netPaid,
  )
  return issues
}
