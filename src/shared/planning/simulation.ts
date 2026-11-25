import type { MinorUnits } from '../money'
import { addMonths } from '../months'
import type {
  GoalSummary,
  PlannedItem,
  SimulationAccountBalance,
  SimulationMonthPoint,
  SimulationProjection,
  SimulationThresholdHit,
} from './model'

export interface SimulationAccountInput {
  id: string
  name: string
  type: string
  balanceCents: MinorUnits
  /** Taux annuel de rémunération en millionièmes (ex. 30_000 = 3,00 %/an), sur comptes d'épargne. */
  interestRateMicros?: number
}

function itemOccursInMonth(item: PlannedItem, month: string): boolean {
  if (!item.enabled) return false
  const startMonth = item.startDate.slice(0, 7)
  const endMonth = item.endDate ? item.endDate.slice(0, 7) : null
  if (month < startMonth) return false
  if (endMonth && month > endMonth) return false
  if (item.periodicity === 'once') return month === startMonth
  if (item.periodicity === 'monthly') return true

  const startYear = Number(startMonth.slice(0, 4))
  const startMon = Number(startMonth.slice(5, 7))
  const curYear = Number(month.slice(0, 4))
  const curMon = Number(month.slice(5, 7))
  const diffMonths = (curYear - startYear) * 12 + (curMon - startMon)
  if (diffMonths < 0) return false
  if (item.periodicity === 'quarterly') return diffMonths % 3 === 0
  return diffMonths % 12 === 0
}

function indexedAmountCents(item: PlannedItem, month: string): MinorUnits {
  if (item.indexationMicros === 0) return item.amountCents
  const startYear = Number(item.startDate.slice(0, 4))
  const startMon = Number(item.startDate.slice(5, 7))
  const curYear = Number(month.slice(0, 4))
  const curMon = Number(month.slice(5, 7))
  const yearsElapsed = Math.floor(((curYear - startYear) * 12 + (curMon - startMon)) / 12)
  if (yearsElapsed <= 0) return item.amountCents
  const factor = Math.pow(1 + item.indexationMicros / 1_000_000, yearsElapsed)
  return Math.round(item.amountCents * factor)
}

/**
 * Projette mois par mois les soldes de comptes courants et d'épargne en centimes entiers.
 * Invariant :
 * - au mois 0 (`monthIndex === 0`), chaque solde projeté === solde réel initial ;
 * - chaque mois `m >= 1`, `solde[m] === solde[m-1] + Σ éléments(m) + intérêts(m)` (arrondi au centime).
 */
export function projectScenario(params: {
  scenarioId: string
  scenarioName: string
  currency: string
  startMonth: string
  horizonMonths: number
  accounts: readonly SimulationAccountInput[]
  items: readonly PlannedItem[]
  goals?: readonly GoalSummary[]
}): SimulationProjection {
  const horizon = Math.max(1, Math.min(120, params.horizonMonths))
  const runningBalances = new Map<string, number>()
  for (const acc of params.accounts) {
    runningBalances.set(acc.id, acc.balanceCents)
  }

  const points: SimulationMonthPoint[] = []
  const thresholds: SimulationThresholdHit[] = []
  const seenOverdraft = new Set<string>()
  const seenGoals = new Set<string>()

  // Mois 0 : état réel instantané.
  const month0Balances: SimulationAccountBalance[] = params.accounts.map((acc) => ({
    accountId: acc.id,
    accountName: acc.name,
    balanceCents: acc.balanceCents,
  }))
  const total0 = month0Balances.reduce((s, a) => s + a.balanceCents, 0)
  points.push({
    monthIndex: 0,
    month: params.startMonth,
    totalBalanceCents: total0,
    lowBalanceCents: total0,
    highBalanceCents: total0,
    inflowsCents: 0,
    outflowsCents: 0,
    interestCents: 0,
    byAccount: month0Balances,
  })

  for (let m = 1; m <= horizon; m++) {
    const month = addMonths(params.startMonth, m)
    let inflowsCents = 0
    let outflowsCents = 0
    let interestCents = 0

    for (const item of params.items) {
      if (!runningBalances.has(item.accountId)) continue
      if (!itemOccursInMonth(item, month)) continue
      const delta = indexedAmountCents(item, month)
      runningBalances.set(item.accountId, (runningBalances.get(item.accountId) ?? 0) + delta)
      if (delta >= 0) inflowsCents += delta
      else outflowsCents += Math.abs(delta)
    }

    for (const acc of params.accounts) {
      const rate = acc.interestRateMicros ?? 0
      if (rate <= 0) continue
      const bal = runningBalances.get(acc.id) ?? 0
      if (bal <= 0) continue
      const monthlyInt = Math.round((bal * rate) / 12 / 1_000_000)
      if (monthlyInt > 0) {
        runningBalances.set(acc.id, bal + monthlyInt)
        interestCents += monthlyInt
      }
    }

    const byAccount: SimulationAccountBalance[] = params.accounts.map((acc) => {
      const bal = runningBalances.get(acc.id) ?? 0
      if (bal < 0 && !seenOverdraft.has(acc.id)) {
        seenOverdraft.add(acc.id)
        thresholds.push({
          kind: 'overdraft',
          month,
          label: acc.name,
          balanceCents: bal,
        })
      }
      return {
        accountId: acc.id,
        accountName: acc.name,
        balanceCents: bal,
      }
    })

    const totalBalanceCents = byAccount.reduce((s, a) => s + a.balanceCents, 0)
    // Bande d'incertitude croissante (~1,5 % par an sur les flux cumulés, bornée en centimes).
    const spread = Math.round(((inflowsCents + outflowsCents) * m * 15) / 12_000)
    points.push({
      monthIndex: m,
      month,
      totalBalanceCents,
      lowBalanceCents: totalBalanceCents - spread,
      highBalanceCents: totalBalanceCents + spread,
      inflowsCents,
      outflowsCents,
      interestCents,
      byAccount,
    })

    if (params.goals) {
      for (const goal of params.goals) {
        if (seenGoals.has(goal.id)) continue
        const targetBal = goal.accountId
          ? (runningBalances.get(goal.accountId) ?? 0)
          : totalBalanceCents
        if (targetBal >= goal.targetCents) {
          seenGoals.add(goal.id)
          thresholds.push({
            kind: 'goal_reached',
            month,
            label: goal.name,
            balanceCents: targetBal,
          })
        }
      }
    }
  }

  return {
    scenarioId: params.scenarioId,
    scenarioName: params.scenarioName,
    currency: params.currency,
    points,
    thresholds,
  }
}
