import type { MinorUnits } from '../money'
import { COUNTRY_PACK_FR, getCountryPack, type PayslipCountryPackId } from './pack-fr'

export interface PayslipSimulationBase {
  countryPack?: PayslipCountryPackId
  gross: MinorUnits
  employeeContributions: MinorUnits
  employerContributions: MinorUnits
  netBeforeTax: MinorUnits
  taxableNet: MinorUnits
  withholdingRateMicros: number
  otherAdjustments: MinorUnits
}

export interface PayslipSimulationScenario {
  /** Augmentation du brut en montant (centimes) OU en pourcentage (millionièmes, ex. 50 000 = +5 %). */
  grossDeltaAmount?: MinorUnits
  grossRaiseMicros?: number
  /** Heures supplémentaires ou primes imposables ajoutées en brut (centimes). */
  taxableBonus?: MinorUnits
  /** Heures supplémentaires défiscalisées ajoutées en brut (centimes). */
  taxFreeOvertime?: MinorUnits
  /** Nouveau taux de prélèvement à la source (millionièmes) ; si absent, garde le taux actuel. */
  withholdingRateMicros?: number
}

export interface PayslipSimulationResult {
  gross: MinorUnits
  employeeContributions: MinorUnits
  employerContributions: MinorUnits
  netBeforeTax: MinorUnits
  taxableNet: MinorUnits
  withholdingRateMicros: number
  withholdingTax: MinorUnits
  otherAdjustments: MinorUnits
  netPaid: MinorUnits
  employerCost: MinorUnits
  deltaNetPaid: MinorUnits
  deltaGross: MinorUnits
  effectiveContributionRateMicros: number
}

/**
 * Simulateur brut → net (M6, proposition P-27 / G11) : évalue en arithmétique entière l'effet
 * d'une augmentation brute, d'heures supplémentaires (imposables ou défiscalisées) ou d'un
 * changement de taux de prélèvement à la source à partir des taux effectifs d'un bulletin existant.
 */
export function simulatePayslipAdjustment(
  base: PayslipSimulationBase,
  scenario: PayslipSimulationScenario,
): PayslipSimulationResult {
  const pack = getCountryPack(base.countryPack ?? 'fr')
  const baseGross = Math.max(0, base.gross)

  const empContribRateMicros =
    baseGross > 0
      ? Math.round((base.employeeContributions * 1_000_000) / baseGross)
      : pack.defaultEmployeeContributionRateMicros
  const erContribRateMicros =
    baseGross > 0 && base.employerContributions > 0
      ? Math.round((base.employerContributions * 1_000_000) / baseGross)
      : COUNTRY_PACK_FR.defaultEmployerContributionRateMicros
  // Rapport net imposable / net avant impôt observé (~1.03 en France à cause de CSG non déductible + CRDS).
  const taxableRatioMicros =
    base.netBeforeTax > 0
      ? Math.round((base.taxableNet * 1_000_000) / base.netBeforeTax)
      : 1_037_000

  const raiseAmount =
    scenario.grossDeltaAmount ??
    (scenario.grossRaiseMicros !== undefined
      ? Math.round((baseGross * scenario.grossRaiseMicros) / 1_000_000)
      : 0)
  const taxableBonus = Math.max(0, scenario.taxableBonus ?? 0)
  const taxFreeOvertime = Math.max(0, scenario.taxFreeOvertime ?? 0)

  const gross = Math.max(0, baseGross + raiseAmount + taxableBonus + taxFreeOvertime)
  const employeeContributions = Math.round((gross * empContribRateMicros) / 1_000_000)
  const employerContributions = Math.round((gross * erContribRateMicros) / 1_000_000)
  const netBeforeTax = gross - employeeContributions

  // La part défiscalisée augmente le net avant impôt mais n'entre pas dans l'assiette PAS.
  const taxFreeNetEstimate =
    taxFreeOvertime - Math.round((taxFreeOvertime * empContribRateMicros) / 1_000_000)
  const taxablePartBeforeTax = Math.max(0, netBeforeTax - taxFreeNetEstimate)
  const taxableNet = Math.round((taxablePartBeforeTax * taxableRatioMicros) / 1_000_000)

  const withholdingRateMicros = scenario.withholdingRateMicros ?? base.withholdingRateMicros
  const withholdingTax = Math.round((taxableNet * withholdingRateMicros) / 1_000_000)
  const otherAdjustments = base.otherAdjustments
  const netPaid = netBeforeTax - withholdingTax + otherAdjustments
  const employerCost = gross + employerContributions

  const baseWithholding = Math.round((base.taxableNet * base.withholdingRateMicros) / 1_000_000)
  const baseNetPaid = base.netBeforeTax - baseWithholding + base.otherAdjustments

  return {
    gross,
    employeeContributions,
    employerContributions,
    netBeforeTax,
    taxableNet,
    withholdingRateMicros,
    withholdingTax,
    otherAdjustments,
    netPaid,
    employerCost,
    deltaNetPaid: netPaid - baseNetPaid,
    deltaGross: gross - baseGross,
    effectiveContributionRateMicros: empContribRateMicros,
  }
}
