import { describe, expect, it } from 'vitest'
import { EXPENSE_CATEGORY_IDS } from '../categories'
import { sum } from '../money'
import { checkPayslip } from '../payslip'
import { generateDemoMonths } from './demo-data'

describe('generateDemoMonths', () => {
  const months = generateDemoMonths({ endMonth: '2026-11', count: 18 })

  it('est déterministe (même graine → mêmes données)', () => {
    expect(generateDemoMonths({ endMonth: '2026-11', count: 18 })).toEqual(months)
    expect(generateDemoMonths({ endMonth: '2026-11', count: 18, seed: 7 })).not.toEqual(months)
  })

  it('couvre la période demandée, dans l’ordre', () => {
    expect(months).toHaveLength(18)
    expect(months[0]?.month).toBe('2025-06')
    expect(months.at(-1)?.month).toBe('2026-11')
  })

  it('garde des totaux cohérents avec le détail par catégorie', () => {
    for (const month of months) {
      expect(month.expenses).toBe(sum(EXPENSE_CATEGORY_IDS.map((id) => month.byCategory[id])))
      for (const id of EXPENSE_CATEGORY_IDS)
        expect(Number.isInteger(month.byCategory[id])).toBe(true)
    }
  })

  it('produit des bulletins arithmétiquement justes, avec 13e mois en décembre', () => {
    for (const month of months) expect(checkPayslip(month.payslip)).toEqual([])
    const december = months.find((month) => month.month === '2025-12')
    expect(december?.payslip.extras.some((extra) => extra.kind === 'thirteenth-month')).toBe(true)
  })

  it('change le taux de prélèvement à la source en septembre', () => {
    const august = months.find((month) => month.month === '2026-08')
    const september = months.find((month) => month.month === '2026-09')
    expect(september?.payslip.withholdingRate).not.toBe(august?.payslip.withholdingRate)
  })
})
