import { EXPENSE_CATEGORY_IDS, type ExpenseCategoryId } from '../categories'
import { sum, type MinorUnits } from '../money'
import { addMonths, parseMonth } from '../months'
import type { PayslipExtra, PayslipSummary } from '../payslip'

/**
 * Données de démonstration DÉTERMINISTES (même graine → mêmes données).
 * Servent au mode démo, aux captures d'écran et aux tests — jamais de données réelles.
 */
export interface MonthlySummary {
  /** AAAA-MM */
  month: string
  /** Total des entrées (salaire net payé + remboursements). */
  income: MinorUnits
  /** Total des sorties, en valeur positive. */
  expenses: MinorUnits
  byCategory: Record<ExpenseCategoryId, MinorUnits>
  payslip: PayslipSummary
}

export interface DemoOptions {
  /** Dernier mois généré, AAAA-MM. */
  endMonth: string
  /** Nombre de mois (par défaut 18). */
  count?: number
  seed?: number
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Taux de prélèvement à la source : il change chaque année en septembre, après la déclaration. */
function withholdingRateFor(year: number, month: number): number {
  const taxYear = month >= 9 ? year : year - 1
  return Math.round((0.068 + 0.006 * (taxYear - 2024)) * 1000) / 1000
}

export function generateDemoMonths({
  endMonth,
  count = 18,
  seed = 2026,
}: DemoOptions): MonthlySummary[] {
  const random = mulberry32(seed)
  const euros = (min: number, max: number): MinorUnits =>
    Math.round((min + (max - min) * random()) * 100)
  const result: MonthlySummary[] = []

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const month = addMonths(endMonth, -offset)
    const { year, month: m } = parseMonth(month)

    // — Bulletin de paie (modèle simplifié, ordres de grandeur réalistes pour la France)
    const baseSalary = 340_000
    const extras: PayslipExtra[] = []
    if (random() < 0.45) extras.push({ kind: 'on-call', amount: euros(150, 320) })
    if (random() < 0.2) extras.push({ kind: 'overtime', amount: euros(90, 260) })
    if (m === 6) extras.push({ kind: 'holiday-bonus', amount: 60_000 })
    if (m === 12) extras.push({ kind: 'thirteenth-month', amount: baseSalary })
    const gross = baseSalary + sum(extras.map((extra) => extra.amount))
    const employeeContributions = Math.round(gross * 0.222)
    const netBeforeTax = gross - employeeContributions
    const taxableNet = netBeforeTax + Math.round(gross * 0.0285)
    const withholdingRate = withholdingRateFor(year, m)
    const withholdingTax = Math.round(taxableNet * withholdingRate)
    const otherAdjustments = -euros(40, 60) // part salariale des titres-restaurant
    const netPaid = netBeforeTax - withholdingTax + otherAdjustments
    const payslip: PayslipSummary = {
      period: month,
      baseSalary,
      extras,
      gross,
      employeeContributions,
      netBeforeTax,
      taxableNet,
      withholdingRate,
      withholdingTax,
      otherAdjustments,
      netPaid,
    }

    // — Dépenses par catégorie, avec saisonnalité
    const summer = m === 7 || m === 8
    // Budget type d'un salarié locataire : ~2 200 € de dépenses pour ~2 650 € nets (≈ 15–20 % d'épargne).
    const byCategory: Record<ExpenseCategoryId, MinorUnits> = {
      housing: 95_000 + euros(60, 120),
      groceries: euros(320, 480) + (m === 12 ? 10_000 : 0),
      transport: euros(90, 190) + (summer ? 12_000 : 0),
      health: euros(10, 110),
      leisure: euros(100, 300) + (summer ? 25_000 : 0) + (m === 12 ? 12_000 : 0),
      // Hausse de prix d'un abonnement à mi-parcours (cas d'usage : détection d'augmentation).
      subscriptions: offset >= count / 2 ? 6_490 : 6_990,
      shopping: euros(50, 300) + (m === 11 ? 20_000 : 0) + (m === 12 ? 30_000 : 0),
      other: euros(20, 120),
    }
    const expenses = sum(EXPENSE_CATEGORY_IDS.map((id) => byCategory[id]))
    const refunds = random() < 0.3 ? euros(20, 120) : 0

    result.push({ month, income: netPaid + refunds, expenses, byCategory, payslip })
  }
  return result
}
