import { sum, type MinorUnits } from './money'
import {
  getCountryPack,
  PAYSLIP_ABSENCE_KINDS,
  PAYSLIP_AFTER_TAX_KINDS,
  PAYSLIP_COUNTRY_PACKS,
  PAYSLIP_VARIABLE_KINDS,
  type PayslipCountryPackId,
} from './payslip/pack-fr'

export {
  buildDefaultContributionLines,
  CONTRIBUTION_GROUPS_FR,
  COUNTRY_PACK_FR,
  getCountryPack,
  PAYSLIP_ABSENCE_KINDS,
  PAYSLIP_AFTER_TAX_KINDS,
  PAYSLIP_COUNTRY_PACKS,
  PAYSLIP_VARIABLE_KINDS,
  type ContributionGroup,
  type ContributionTemplateLine,
  type PayslipAbsenceKind,
  type PayslipAfterTaxKind,
  type PayslipCountryPack,
  type PayslipCountryPackId,
  type PayslipVariableKind,
} from './payslip/pack-fr'
export { isValidNir, maskAddress, maskNir, normalizeNir } from './payslip/nir'
export {
  simulatePayslipAdjustment,
  type PayslipSimulationBase,
  type PayslipSimulationResult,
  type PayslipSimulationScenario,
} from './payslip/simulator'
export type * from './payslip/ledger-model'

/**
 * Sous-ensemble historique M0 des éléments variables ; conservé pour la compatibilité de
 * `PayslipCard` et du jeu de démonstration M0.
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
 * Contrôles arithmétiques de base (M0) d'un bulletin. Utilisés par la carte d'aperçu
 * du tableau de bord et la suite de démonstration.
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

// ——— Modèle complet M6 ——————————————————————————————————————————————————

export const CONTRACT_TYPES = ['cdi', 'cdd', 'interim', 'apprenticeship', 'other'] as const
export type ContractType = (typeof CONTRACT_TYPES)[number]

export const EXECUTIVE_STATUSES = ['cadre', 'non_cadre'] as const
export type ExecutiveStatus = (typeof EXECUTIVE_STATUSES)[number]

export const WORK_TIMES = ['full_time', 'part_time'] as const
export type WorkTime = (typeof WORK_TIMES)[number]

export const PAYSLIP_LINE_SECTIONS = ['variable', 'absence', 'contribution', 'after_tax'] as const
export type PayslipLineSection = (typeof PAYSLIP_LINE_SECTIONS)[number]

export const PAYSLIP_SOURCE_ORIGINS = [
  'user',
  'document',
  'ia:local',
  'ia:anthropic',
  'demo',
] as const
export type PayslipSourceOrigin = (typeof PAYSLIP_SOURCE_ORIGINS)[number]

export interface PayslipLineInput {
  section: PayslipLineSection
  itemKind: string
  label: string
  quantityHundredths: number | null
  baseAmount: MinorUnits | null
  employeeRateMicros: number | null
  employeeAmount: MinorUnits
  employerRateMicros: number | null
  employerAmount: MinorUnits
  taxable: boolean
}

export interface PayslipLine extends PayslipLineInput {
  id: string
  payslipId: string
  position: number
}

export type DetailedPayslipIssueCode =
  | PayslipIssueCode
  | 'BASE_CALC_MISMATCH'
  | 'EMPLOYEE_CONTRIB_MISMATCH'
  | 'EMPLOYER_CONTRIB_MISMATCH'
  | 'LINE_CONTRIBUTION_MISMATCH'
  | 'AFTER_TAX_MISMATCH'
  | 'YTD_GROSS_MISMATCH'
  | 'YTD_TAXABLE_NET_MISMATCH'
  | 'YTD_WITHHOLDING_MISMATCH'
  | 'YTD_HOURS_MISMATCH'
  | 'PLAUSIBILITY_CONTRIBUTION_RATE'
  | 'PLAUSIBILITY_WITHHOLDING_RATE'
  | 'PLAUSIBILITY_SOCIAL_NET'

export type PayslipIssueSeverity = 'error' | 'warning'

export interface PayslipDetailedIssue {
  code: DetailedPayslipIssueCode
  severity: PayslipIssueSeverity
  expected: number
  actual: number
  diff: number
  /** Nom de la ligne concernée si le contrôle porte sur une ligne de cotisation. */
  lineLabel?: string
}

export interface PayslipCheckTarget {
  countryPack?: PayslipCountryPackId
  period: string
  totalsOnly: boolean
  baseHoursHundredths: number | null
  hourlyRate: MinorUnits | null
  baseSalary: MinorUnits
  gross: MinorUnits
  employeeContributions: MinorUnits
  employerContributions: MinorUnits
  netBeforeTax: MinorUnits
  taxableNet: MinorUnits
  socialNet: MinorUnits | null
  withholdingRateMicros: number
  withholdingBase: MinorUnits | null
  withholdingTax: MinorUnits
  otherAdjustments: MinorUnits
  netPaid: MinorUnits
  ytdGross: MinorUnits | null
  ytdTaxableNet: MinorUnits | null
  ytdWithholding: MinorUnits | null
  ytdHoursHundredths: number | null
  lines: readonly PayslipLineInput[]
}

export interface PayslipYtdComparisonPoint {
  period: string
  gross: MinorUnits
  taxableNet: MinorUnits
  withholdingTax: MinorUnits
  baseHoursHundredths: number | null
}

/**
 * Contrôles arithmétiques, cumuls annuels et contrôles de plausibilité (M6).
 * Toute valeur financière reste en entiers (centimes, centièmes d'heure, millionièmes de taux).
 */
export function checkPayslipDetailed(
  payslip: PayslipCheckTarget,
  yearMonthsSameContract: readonly PayslipYtdComparisonPoint[] = [],
  tolerance = 2,
): PayslipDetailedIssue[] {
  const issues: PayslipDetailedIssue[] = []
  const pack = getCountryPack(payslip.countryPack ?? 'fr')

  const pushIssue = (
    code: DetailedPayslipIssueCode,
    severity: PayslipIssueSeverity,
    expected: number,
    actual: number,
    lineLabel?: string,
  ): void => {
    issues.push({
      code,
      severity,
      expected,
      actual,
      diff: actual - expected,
      ...(lineLabel ? { lineLabel } : {}),
    })
  }

  // 1. Base = heures * taux horaire (si les deux sont saisis).
  if (
    payslip.baseHoursHundredths !== null &&
    payslip.baseHoursHundredths > 0 &&
    payslip.hourlyRate !== null &&
    payslip.hourlyRate > 0
  ) {
    const expectedBase = Math.round((payslip.baseHoursHundredths * payslip.hourlyRate) / 100)
    if (Math.abs(expectedBase - payslip.baseSalary) > tolerance) {
      pushIssue('BASE_CALC_MISMATCH', 'error', expectedBase, payslip.baseSalary)
    }
  }

  // 2. Brut = base + variables - absences (si mode détaillé ou lignes variables/absences présentes).
  const variableLines = payslip.lines.filter((line) => line.section === 'variable')
  const absenceLines = payslip.lines.filter((line) => line.section === 'absence')
  if (!payslip.totalsOnly || variableLines.length > 0 || absenceLines.length > 0) {
    const variablesTotal = sum(variableLines.map((line) => line.employeeAmount))
    const absencesTotal = sum(absenceLines.map((line) => Math.abs(line.employeeAmount)))
    const expectedGross = payslip.baseSalary + variablesTotal - absencesTotal
    if (Math.abs(expectedGross - payslip.gross) > tolerance) {
      pushIssue('GROSS_MISMATCH', 'error', expectedGross, payslip.gross)
    }
  }

  // 3. Cotisations ligne à ligne : base × taux et somme des lignes.
  const contribLines = payslip.lines.filter((line) => line.section === 'contribution')
  for (const line of contribLines) {
    if (
      line.baseAmount !== null &&
      line.baseAmount > 0 &&
      line.employeeRateMicros !== null &&
      line.employeeRateMicros > 0
    ) {
      const expectedLine = Math.round((line.baseAmount * line.employeeRateMicros) / 1_000_000)
      if (Math.abs(expectedLine - line.employeeAmount) > tolerance) {
        pushIssue(
          'LINE_CONTRIBUTION_MISMATCH',
          'warning',
          expectedLine,
          line.employeeAmount,
          line.label,
        )
      }
    }
  }
  if (contribLines.length > 0) {
    const sumEmp = sum(contribLines.map((line) => line.employeeAmount))
    if (
      Math.abs(sumEmp - payslip.employeeContributions) > Math.max(tolerance, contribLines.length)
    ) {
      pushIssue('EMPLOYEE_CONTRIB_MISMATCH', 'error', sumEmp, payslip.employeeContributions)
    }
    const sumEr = sum(contribLines.map((line) => line.employerAmount))
    if (
      payslip.employerContributions > 0 &&
      Math.abs(sumEr - payslip.employerContributions) > Math.max(tolerance, contribLines.length)
    ) {
      pushIssue('EMPLOYER_CONTRIB_MISMATCH', 'warning', sumEr, payslip.employerContributions)
    }
  }

  // 4. Net avant impôt = brut − cotisations salariales.
  const expectedNetBeforeTax = payslip.gross - payslip.employeeContributions
  if (Math.abs(expectedNetBeforeTax - payslip.netBeforeTax) > tolerance) {
    pushIssue('NET_BEFORE_TAX_MISMATCH', 'error', expectedNetBeforeTax, payslip.netBeforeTax)
  }

  // 5. Prélèvement à la source = taux × base (ou net imposable).
  const pasBase = payslip.withholdingBase ?? payslip.taxableNet
  const expectedPas = Math.round((pasBase * payslip.withholdingRateMicros) / 1_000_000)
  if (Math.abs(expectedPas - payslip.withholdingTax) > tolerance) {
    pushIssue('WITHHOLDING_MISMATCH', 'error', expectedPas, payslip.withholdingTax)
  }

  // 6. Après impôt (somme des lignes) et Net payé.
  const afterTaxLines = payslip.lines.filter((line) => line.section === 'after_tax')
  if (afterTaxLines.length > 0) {
    const sumAfterTax = sum(afterTaxLines.map((line) => line.employeeAmount))
    if (Math.abs(sumAfterTax - payslip.otherAdjustments) > tolerance) {
      pushIssue('AFTER_TAX_MISMATCH', 'warning', sumAfterTax, payslip.otherAdjustments)
    }
  }
  const expectedNetPaid = payslip.netBeforeTax - payslip.withholdingTax + payslip.otherAdjustments
  if (Math.abs(expectedNetPaid - payslip.netPaid) > tolerance) {
    pushIssue('NET_PAID_MISMATCH', 'error', expectedNetPaid, payslip.netPaid)
  }

  // 7. Plausibilité des taux et du net social.
  if (payslip.gross > 0) {
    const empRateMicros = Math.round((payslip.employeeContributions * 1_000_000) / payslip.gross)
    if (
      empRateMicros < pack.plausibility.minEmployeeContributionRateMicros ||
      empRateMicros > pack.plausibility.maxEmployeeContributionRateMicros
    ) {
      pushIssue(
        'PLAUSIBILITY_CONTRIBUTION_RATE',
        'warning',
        pack.defaultEmployeeContributionRateMicros,
        empRateMicros,
      )
    }
  }
  if (payslip.withholdingRateMicros > pack.plausibility.maxWithholdingRateMicros) {
    pushIssue(
      'PLAUSIBILITY_WITHHOLDING_RATE',
      'warning',
      pack.plausibility.maxWithholdingRateMicros,
      payslip.withholdingRateMicros,
    )
  }
  if (payslip.socialNet !== null && (payslip.socialNet < 0 || payslip.socialNet > payslip.gross)) {
    pushIssue('PLAUSIBILITY_SOCIAL_NET', 'warning', payslip.netBeforeTax, payslip.socialNet)
  }

  // 8. Cumuls annuels : comparer à Σ des mois de la même année jusqu'à cette période.
  const prior = yearMonthsSameContract.filter((point) => point.period < payslip.period)
  if (prior.length > 0 || payslip.period.endsWith('-01')) {
    const ytdTol = Math.max(tolerance, (prior.length + 1) * tolerance)
    if (payslip.ytdGross !== null) {
      const sumGross = sum(prior.map((p) => p.gross)) + payslip.gross
      if (Math.abs(sumGross - payslip.ytdGross) > ytdTol) {
        pushIssue('YTD_GROSS_MISMATCH', 'error', sumGross, payslip.ytdGross)
      }
    }
    if (payslip.ytdTaxableNet !== null) {
      const sumTaxable = sum(prior.map((p) => p.taxableNet)) + payslip.taxableNet
      if (Math.abs(sumTaxable - payslip.ytdTaxableNet) > ytdTol) {
        pushIssue('YTD_TAXABLE_NET_MISMATCH', 'error', sumTaxable, payslip.ytdTaxableNet)
      }
    }
    if (payslip.ytdWithholding !== null) {
      const sumTax = sum(prior.map((p) => p.withholdingTax)) + payslip.withholdingTax
      if (Math.abs(sumTax - payslip.ytdWithholding) > ytdTol) {
        pushIssue('YTD_WITHHOLDING_MISMATCH', 'error', sumTax, payslip.ytdWithholding)
      }
    }
    if (payslip.ytdHoursHundredths !== null && payslip.baseHoursHundredths !== null) {
      const allHaveHours = prior.every((p) => p.baseHoursHundredths !== null)
      if (allHaveHours) {
        const sumHours =
          sum(prior.map((p) => p.baseHoursHundredths ?? 0)) + payslip.baseHoursHundredths
        if (Math.abs(sumHours - payslip.ytdHoursHundredths) > 10) {
          pushIssue('YTD_HOURS_MISMATCH', 'warning', sumHours, payslip.ytdHoursHundredths)
        }
      }
    }
  }

  return issues
}

/**
 * Convertit un bulletin complet M6 en `PayslipSummary` simplifié (carte tableau de bord M0).
 */
export function toPayslipSummary(payslip: PayslipCheckTarget): PayslipSummary {
  const extras: PayslipExtra[] = payslip.lines
    .filter((line) => line.section === 'variable')
    .map((line) => {
      const mappedKind: PayslipExtraKind =
        line.itemKind === 'overtime-25' ||
        line.itemKind === 'overtime-50' ||
        line.itemKind === 'overtime-tax-free' ||
        line.itemKind === 'overtime'
          ? 'overtime'
          : (PAYSLIP_EXTRA_KINDS as readonly string[]).includes(line.itemKind)
            ? (line.itemKind as PayslipExtraKind)
            : 'other'
      return { kind: mappedKind, amount: line.employeeAmount }
    })

  return {
    period: payslip.period,
    baseSalary: payslip.baseSalary,
    extras,
    gross: payslip.gross,
    employeeContributions: payslip.employeeContributions,
    netBeforeTax: payslip.netBeforeTax,
    taxableNet: payslip.taxableNet,
    withholdingRate: payslip.withholdingRateMicros / 1_000_000,
    withholdingTax: payslip.withholdingTax,
    otherAdjustments: payslip.otherAdjustments,
    netPaid: payslip.netPaid,
  }
}

void PAYSLIP_ABSENCE_KINDS
void PAYSLIP_AFTER_TAX_KINDS
void PAYSLIP_COUNTRY_PACKS
void PAYSLIP_VARIABLE_KINDS
