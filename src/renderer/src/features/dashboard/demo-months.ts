import { generateDemoMonths, type MonthlySummary } from '@shared/demo/demo-data'
import { monthOf } from '@shared/months'

let cache: MonthlySummary[] | undefined

/** 18 mois de démonstration se terminant au mois courant (générés une fois par session). */
export function getDemoMonths(): MonthlySummary[] {
  cache ??= generateDemoMonths({ endMonth: monthOf(new Date()), count: 18 })
  return cache
}

/** Variation relative (0,042 = +4,2 %) ; `null` si non calculable. */
export function relativeChange(current: number, previous: number | undefined): number | null {
  if (previous === undefined || previous === 0) return null
  return (current - previous) / Math.abs(previous)
}
