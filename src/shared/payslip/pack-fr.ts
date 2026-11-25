import type { MinorUnits } from '../money'

/** Pays pris en charge pour le modèle « pack pays » des bulletins (France en premier, M6). */
export const PAYSLIP_COUNTRY_PACKS = ['fr'] as const
export type PayslipCountryPackId = (typeof PAYSLIP_COUNTRY_PACKS)[number]

/** Regroupements standard des cotisations sur un bulletin français. */
export const CONTRIBUTION_GROUPS_FR = [
  'health',
  'pension-base',
  'pension-comp',
  'unemployment',
  'csg-deductible',
  'csg-non-deductible',
  'crds',
  'provident',
  'mutual',
  'other',
] as const
export type ContributionGroup = (typeof CONTRIBUTION_GROUPS_FR)[number]

/** Catégories d'éléments variables typés d'un bulletin. */
export const PAYSLIP_VARIABLE_KINDS = [
  'on-call',
  'overtime-25',
  'overtime-50',
  'overtime-tax-free',
  'overtime',
  'thirteenth-month',
  'holiday-bonus',
  'seniority-bonus',
  'performance-bonus',
  'transport-allowance',
  'remote-allowance',
  'benefit-in-kind',
  'other',
] as const
export type PayslipVariableKind = (typeof PAYSLIP_VARIABLE_KINDS)[number]

/** Types d'absences retenues ou valorisées sur le bulletin. */
export const PAYSLIP_ABSENCE_KINDS = ['paid-leave', 'unpaid-leave', 'sick-leave', 'other'] as const
export type PayslipAbsenceKind = (typeof PAYSLIP_ABSENCE_KINDS)[number]

/** Éléments après impôt (titres-restaurant, acomptes, remboursements…). */
export const PAYSLIP_AFTER_TAX_KINDS = [
  'meal-vouchers',
  'advance',
  'reimbursement',
  'garnishment',
  'other',
] as const
export type PayslipAfterTaxKind = (typeof PAYSLIP_AFTER_TAX_KINDS)[number]

export interface ContributionTemplateLine {
  group: ContributionGroup
  label: string
  employeeRateMicros: number
  employerRateMicros: number
  /** Renseigne la part usuelle de la base (ex. 98,25 % du brut pour la CSG/CRDS). */
  baseRatioMicros: number
}

export interface PayslipCountryPack {
  readonly id: PayslipCountryPackId
  readonly currency: string
  readonly fullTimeMonthlyHoursHundredths: number
  readonly defaultEmployeeContributionRateMicros: number
  readonly defaultEmployerContributionRateMicros: number
  readonly plausibility: {
    readonly minEmployeeContributionRateMicros: number
    readonly maxEmployeeContributionRateMicros: number
    readonly maxEmployerContributionRateMicros: number
    readonly maxWithholdingRateMicros: number
  }
  readonly defaultContributions: readonly ContributionTemplateLine[]
}

/**
 * Pack pays France : libellés regroupés conformes au bulletin clarifié, seuils de plausibilité
 * des taux et modèle de cotisations prêt à l'emploi pour la saisie rapide ou la simulation.
 */
export const COUNTRY_PACK_FR: PayslipCountryPack = {
  id: 'fr',
  currency: 'EUR',
  fullTimeMonthlyHoursHundredths: 15_167,
  defaultEmployeeContributionRateMicros: 222_000,
  defaultEmployerContributionRateMicros: 420_000,
  plausibility: {
    minEmployeeContributionRateMicros: 80_000,
    maxEmployeeContributionRateMicros: 350_000,
    maxEmployerContributionRateMicros: 650_000,
    maxWithholdingRateMicros: 450_000,
  },
  defaultContributions: [
    {
      group: 'health',
      label: 'Sécurité sociale — Maladie, maternité, invalidité',
      employeeRateMicros: 0,
      employerRateMicros: 70_000,
      baseRatioMicros: 1_000_000,
    },
    {
      group: 'pension-base',
      label: 'Assurance vieillesse plafonnée et déplafonnée',
      employeeRateMicros: 73_000,
      employerRateMicros: 105_700,
      baseRatioMicros: 1_000_000,
    },
    {
      group: 'pension-comp',
      label: 'Retraite complémentaire AGIRC-ARRCO',
      employeeRateMicros: 40_100,
      employerRateMicros: 60_200,
      baseRatioMicros: 1_000_000,
    },
    {
      group: 'unemployment',
      label: 'Assurance chômage et AGS',
      employeeRateMicros: 0,
      employerRateMicros: 42_000,
      baseRatioMicros: 1_000_000,
    },
    {
      group: 'csg-deductible',
      label: 'CSG déductible de l’impôt sur le revenu',
      employeeRateMicros: 68_000,
      employerRateMicros: 0,
      baseRatioMicros: 982_500,
    },
    {
      group: 'csg-non-deductible',
      label: 'CSG non déductible de l’impôt sur le revenu',
      employeeRateMicros: 24_000,
      employerRateMicros: 0,
      baseRatioMicros: 982_500,
    },
    {
      group: 'crds',
      label: 'CRDS non déductible',
      employeeRateMicros: 5_000,
      employerRateMicros: 0,
      baseRatioMicros: 982_500,
    },
    {
      group: 'provident',
      label: 'Prévoyance / incapacité / décès',
      employeeRateMicros: 6_000,
      employerRateMicros: 12_000,
      baseRatioMicros: 1_000_000,
    },
    {
      group: 'mutual',
      label: 'Complémentaire santé (mutuelle)',
      employeeRateMicros: 10_000,
      employerRateMicros: 10_000,
      baseRatioMicros: 1_000_000,
    },
  ],
}

export function getCountryPack(id: PayslipCountryPackId = 'fr'): PayslipCountryPack {
  switch (id) {
    case 'fr':
      return COUNTRY_PACK_FR
  }
}

export function buildDefaultContributionLines(
  gross: MinorUnits,
  pack: PayslipCountryPack = COUNTRY_PACK_FR,
) {
  return pack.defaultContributions.map((line) => {
    const baseAmount = Math.round((gross * line.baseRatioMicros) / 1_000_000)
    return {
      section: 'contribution' as const,
      itemKind: line.group,
      label: line.label,
      quantityHundredths: null,
      baseAmount,
      employeeRateMicros: line.employeeRateMicros,
      employeeAmount: Math.round((baseAmount * line.employeeRateMicros) / 1_000_000),
      employerRateMicros: line.employerRateMicros,
      employerAmount: Math.round((baseAmount * line.employerRateMicros) / 1_000_000),
      taxable: line.group === 'csg-non-deductible' || line.group === 'crds' ? false : true,
    }
  })
}
