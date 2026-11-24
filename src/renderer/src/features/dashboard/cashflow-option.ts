import type { BarSeriesOption, LineSeriesOption } from 'echarts/charts'
import type {
  DataZoomComponentOption,
  GridComponentOption,
  LegendComponentOption,
  MarkAreaComponentOption,
  TooltipComponentOption,
} from 'echarts/components'
import type { ComposeOption } from 'echarts/core'
import type { MinorUnits } from '@shared/money'
import { CHART_FONT_FAMILY, type ChartTheme } from '../../lib/charts/chart-theme'
import { TOOLTIP_CONTAINER, tooltipHtml } from '../../lib/charts/tooltip'

export type CashflowChartOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | LegendComponentOption
  | DataZoomComponentOption
  | MarkAreaComponentOption
>

export interface CashflowPoint {
  month: string
  /** Libellé court de l'axe, unique (« nov. 26 »). */
  axisLabel: string
  /** Libellé long de l'infobulle (« Novembre 2026 »). */
  title: string
  income: MinorUnits
  expenses: MinorUnits
}

export interface CashflowOptionInput {
  points: readonly CashflowPoint[]
  selectedIndex: number
  theme: ChartTheme
  labels: { income: string; expenses: string; net: string; savingsRate: string }
  money: (amount: MinorUnits, options?: { signed?: boolean; compact?: boolean }) => string
  percent: (value: number) => string
  animate: boolean
}

/**
 * Flux mensuels : colonnes divergentes (revenus vers le haut, dépenses vers le bas) sur UN seul
 * axe, plus la courbe du solde net. Règles dataviz : barres ≤ 24 px, extrémité arrondie côté
 * donnée et carrée côté ligne de base, 2 px d'espace couleur surface entre barres qui se touchent,
 * infobulle sur toute la bande du mois (cible plus large que la marque), libellés en encre neutre.
 */
export function buildCashflowOption({
  points,
  selectedIndex,
  theme,
  labels,
  money,
  percent,
  animate,
}: CashflowOptionInput): CashflowChartOption {
  const textStyle = { fontFamily: CHART_FONT_FAMILY }
  const selected = points[selectedIndex]
  const surfaceGap = { borderColor: theme.surface, borderWidth: 1 }

  return {
    animation: animate,
    animationDuration: 280,
    textStyle,
    grid: { left: 8, right: 16, top: 44, bottom: 52 },
    legend: {
      top: 0,
      left: 0,
      itemGap: 18,
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { ...textStyle, color: theme.text2, fontSize: 12 },
    },
    tooltip: {
      ...TOOLTIP_CONTAINER,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: theme.highlight } },
      formatter: (params) => {
        const first = Array.isArray(params) ? params[0] : params
        const point = points[first?.dataIndex ?? -1]
        if (!point) return ''
        const net = point.income - point.expenses
        return tooltipHtml({
          title: point.title,
          rows: [
            { keyClass: 'fx-key--income', label: labels.income, value: money(point.income) },
            {
              keyClass: 'fx-key--expense',
              label: labels.expenses,
              value: money(-point.expenses, { signed: true }),
            },
            { keyClass: 'fx-key--net', label: labels.net, value: money(net, { signed: true }) },
          ],
          note:
            point.income > 0 ? `${labels.savingsRate} : ${percent(net / point.income)}` : undefined,
        })
      },
    },
    xAxis: {
      type: 'category',
      data: points.map((point) => point.axisLabel),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: theme.axis } },
      axisLabel: {
        color: theme.muted,
        fontSize: 11,
        margin: 12,
        // Tous les mois jusqu'à 12 (le mois sélectionné reste lisible), sinon espacement automatique.
        interval: points.length <= 12 ? 0 : 'auto',
        hideOverlap: true,
        formatter: (value: string, index: number) =>
          index === selectedIndex ? `{selected|${value}}` : value,
        rich: { selected: { color: theme.text, fontWeight: 700, fontSize: 11 } },
      },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: theme.grid, width: 1 } },
      axisLabel: {
        color: theme.muted,
        fontSize: 11,
        formatter: (value: number) => money(value, { compact: true }),
      },
    },
    dataZoom: [
      { type: 'inside', zoomOnMouseWheel: 'ctrl', moveOnMouseWheel: false, moveOnMouseMove: true },
      {
        type: 'slider',
        height: 14,
        bottom: 8,
        left: 56,
        right: 24,
        showDetail: false,
        brushSelect: false,
        borderColor: 'transparent',
        backgroundColor: theme.grid,
        fillerColor: theme.highlight,
        handleSize: '140%',
        handleStyle: { color: theme.text2, borderColor: theme.surface, borderWidth: 2 },
        moveHandleStyle: { color: theme.axis },
        dataBackground: {
          lineStyle: { color: theme.axis },
          areaStyle: { color: theme.axis, opacity: 0.25 },
        },
        selectedDataBackground: {
          lineStyle: { color: theme.series[0] },
          areaStyle: { color: theme.series[0], opacity: 0.15 },
        },
      },
    ],
    series: [
      {
        name: labels.income,
        type: 'bar',
        stack: 'flow',
        barMaxWidth: 24,
        data: points.map((point) => point.income),
        itemStyle: { ...surfaceGap, color: theme.income, borderRadius: [4, 4, 0, 0] },
        emphasis: { disabled: true },
        markArea: selected
          ? {
              silent: true,
              itemStyle: { color: theme.highlight },
              data: [[{ xAxis: selected.axisLabel }, { xAxis: selected.axisLabel }]],
            }
          : undefined,
      },
      {
        name: labels.expenses,
        type: 'bar',
        stack: 'flow',
        barMaxWidth: 24,
        data: points.map((point) => -point.expenses),
        itemStyle: { ...surfaceGap, color: theme.expense, borderRadius: [0, 0, 4, 4] },
        emphasis: { disabled: true },
      },
      {
        name: labels.net,
        type: 'line',
        z: 3,
        data: points.map((point) => point.income - point.expenses),
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: { width: 2, color: theme.net },
        itemStyle: { color: theme.net, borderColor: theme.surface, borderWidth: 2 },
        emphasis: { disabled: true },
      },
    ],
  }
}
