import type { BarSeriesOption, LineSeriesOption } from 'echarts/charts'
import { describe, expect, it } from 'vitest'
import { CHART_THEMES } from '../../lib/charts/chart-theme'
import { buildCashflowOption, type CashflowPoint } from './cashflow-option'

const points: CashflowPoint[] = [
  {
    month: '2026-10',
    axisLabel: 'oct. 26',
    title: 'Octobre 2026',
    income: 300_000,
    expenses: 250_000,
  },
  {
    month: '2026-11',
    axisLabel: 'nov. 26',
    title: 'Novembre 2026',
    income: 310_000,
    expenses: 320_000,
  },
]

const option = buildCashflowOption({
  points,
  selectedIndex: 1,
  theme: CHART_THEMES.dark,
  labels: { income: '<b>Revenus</b>', expenses: 'Dépenses', net: 'Solde net', savingsRate: 'Taux' },
  money: (amount) => `${amount / 100} €`,
  percent: (value) => `${Math.round(value * 100)} %`,
  animate: false,
})
const series = option.series as [BarSeriesOption, BarSeriesOption, LineSeriesOption]

describe('buildCashflowOption', () => {
  it('n’utilise qu’un seul axe des ordonnées (pas de double axe)', () => {
    const yAxes = Array.isArray(option.yAxis) ? option.yAxis : [option.yAxis]
    expect(yAxes).toHaveLength(1)
  })

  it('trace les revenus vers le haut et les dépenses vers le bas, plus le solde net', () => {
    expect(series[0].data).toEqual([300_000, 310_000])
    expect(series[1].data).toEqual([-250_000, -320_000])
    expect(series[2].data).toEqual([50_000, -10_000])
  })

  it('respecte les spécifications de marques (barres ≤ 24 px, paire divergente validée)', () => {
    for (const bar of [series[0], series[1]]) expect(bar.barMaxWidth).toBeLessThanOrEqual(24)
    expect(series[0].itemStyle?.color).toBe(CHART_THEMES.dark.income)
    expect(series[1].itemStyle?.color).toBe(CHART_THEMES.dark.expense)
    expect(series[2].lineStyle?.width).toBe(2)
  })

  it('produit une infobulle complète et échappée', () => {
    const tooltip = option.tooltip as { formatter: (params: unknown) => string }
    const html = tooltip.formatter([{ dataIndex: 1 }])
    expect(html).toContain('Novembre 2026')
    expect(html).toContain('&lt;b&gt;Revenus&lt;/b&gt;')
    expect(html).toContain('-100 €')
    expect(html).not.toContain('<b>')
  })
})
