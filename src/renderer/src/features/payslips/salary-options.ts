import type { BarSeriesOption, LineSeriesOption } from 'echarts/charts'
import type {
  GridComponentOption,
  LegendComponentOption,
  TooltipComponentOption,
} from 'echarts/components'
import type { ComposeOption } from 'echarts/core'
import type { MinorUnits } from '@shared/money'
import type { SalaryMonthlyPoint } from '@shared/payslip'
import { CHART_FONT_FAMILY, type ChartTheme } from '../../lib/charts/chart-theme'
import { TOOLTIP_CONTAINER, tooltipHtml } from '../../lib/charts/tooltip'
import { MASKED_AMOUNT } from '../../lib/format'

type SalaryChartOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | LegendComponentOption
>

export interface SalaryEvolutionChartInput {
  points: readonly SalaryMonthlyPoint[]
  axisLabels: readonly string[]
  titles: readonly string[]
  theme: ChartTheme
  labels: {
    gross: string
    taxableNet: string
    netPaid: string
    employerCost: string
  }
  money: (amount: MinorUnits, options?: { signed?: boolean; compact?: boolean }) => string
  hideAmounts: boolean
  animate: boolean
}

export function buildSalaryEvolutionOption({
  points,
  axisLabels,
  titles,
  theme,
  labels,
  money,
  hideAmounts,
  animate,
}: SalaryEvolutionChartInput): SalaryChartOption {
  const textStyle = { fontFamily: CHART_FONT_FAMILY }
  return {
    animation: animate,
    animationDuration: 280,
    textStyle,
    grid: { left: 16, right: 16, top: 42, bottom: 28, containLabel: true },
    legend: {
      top: 0,
      left: 0,
      itemGap: 16,
      textStyle: { ...textStyle, color: theme.text2, fontSize: 12 },
    },
    tooltip: {
      ...TOOLTIP_CONTAINER,
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: theme.axis } },
      formatter: (params) => {
        const first = Array.isArray(params) ? params[0] : params
        const idx = first?.dataIndex ?? -1
        const point = points[idx]
        if (!point) return ''
        return tooltipHtml({
          title: titles[idx] ?? point.period,
          rows: [
            {
              keyClass: 'fx-key--net',
              label: labels.employerCost,
              value: money(point.employerCost),
            },
            { keyClass: 'fx-key--income', label: labels.gross, value: money(point.gross) },
            {
              keyClass: 'fx-key--expense',
              label: labels.taxableNet,
              value: money(point.taxableNet),
            },
            { keyClass: 'fx-key--net', label: labels.netPaid, value: money(point.netPaid) },
          ],
        })
      },
    },
    xAxis: {
      type: 'category',
      data: [...axisLabels],
      axisTick: { show: false },
      axisLine: { lineStyle: { color: theme.axis } },
      axisLabel: { color: theme.muted, fontSize: 11, hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: theme.grid } },
      axisLabel: {
        color: theme.muted,
        fontSize: 11,
        formatter: (value: number) =>
          hideAmounts ? MASKED_AMOUNT : money(Math.round(value), { compact: true }),
      },
    },
    series: [
      {
        name: labels.employerCost,
        type: 'line',
        data: points.map((p) => p.employerCost),
        smooth: false,
        symbolSize: 6,
        lineStyle: { width: 2, type: 'dashed', color: theme.series[4] },
        itemStyle: { color: theme.series[4] },
      },
      {
        name: labels.gross,
        type: 'line',
        data: points.map((p) => p.gross),
        smooth: false,
        symbolSize: 8,
        lineStyle: { width: 2, color: theme.series[0] },
        itemStyle: { color: theme.series[0], borderColor: theme.surface, borderWidth: 2 },
      },
      {
        name: labels.taxableNet,
        type: 'line',
        data: points.map((p) => p.taxableNet),
        smooth: false,
        symbolSize: 6,
        lineStyle: { width: 2, color: theme.series[1] },
        itemStyle: { color: theme.series[1] },
      },
      {
        name: labels.netPaid,
        type: 'line',
        data: points.map((p) => p.netPaid),
        smooth: false,
        symbolSize: 8,
        lineStyle: { width: 2, color: theme.series[2] },
        itemStyle: { color: theme.series[2], borderColor: theme.surface, borderWidth: 2 },
      },
    ],
  }
}

export function buildWithholdingRatesOption({
  points,
  axisLabels,
  titles,
  theme,
  labels,
  percent,
  animate,
}: {
  points: readonly SalaryMonthlyPoint[]
  axisLabels: readonly string[]
  titles: readonly string[]
  theme: ChartTheme
  labels: { pasRate: string; contribRate: string }
  percent: (ratio: number) => string
  animate: boolean
}): SalaryChartOption {
  const textStyle = { fontFamily: CHART_FONT_FAMILY }
  return {
    animation: animate,
    animationDuration: 280,
    textStyle,
    grid: { left: 16, right: 16, top: 42, bottom: 28, containLabel: true },
    legend: {
      top: 0,
      left: 0,
      itemGap: 16,
      textStyle: { ...textStyle, color: theme.text2, fontSize: 12 },
    },
    tooltip: {
      ...TOOLTIP_CONTAINER,
      trigger: 'axis',
      formatter: (params) => {
        const first = Array.isArray(params) ? params[0] : params
        const idx = first?.dataIndex ?? -1
        const point = points[idx]
        if (!point) return ''
        return tooltipHtml({
          title: titles[idx] ?? point.period,
          rows: [
            {
              keyClass: 'fx-key--income',
              label: labels.contribRate,
              value: percent(point.effectiveContributionRateMicros / 1_000_000),
            },
            {
              keyClass: 'fx-key--expense',
              label: labels.pasRate,
              value: percent(point.withholdingRateMicros / 1_000_000),
            },
          ],
        })
      },
    },
    xAxis: {
      type: 'category',
      data: [...axisLabels],
      axisTick: { show: false },
      axisLine: { lineStyle: { color: theme.axis } },
      axisLabel: { color: theme.muted, fontSize: 11, hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: theme.grid } },
      axisLabel: {
        color: theme.muted,
        fontSize: 11,
        formatter: (value: number) => percent(value / 100),
      },
    },
    series: [
      {
        name: labels.contribRate,
        type: 'line',
        data: points.map((p) => Number((p.effectiveContributionRateMicros / 10_000).toFixed(2))),
        symbolSize: 8,
        lineStyle: { width: 2, color: theme.series[6] },
        itemStyle: { color: theme.series[6], borderColor: theme.surface, borderWidth: 2 },
      },
      {
        name: labels.pasRate,
        type: 'line',
        data: points.map((p) => Number((p.withholdingRateMicros / 10_000).toFixed(2))),
        symbolSize: 8,
        lineStyle: { width: 2, color: theme.series[1] },
        itemStyle: { color: theme.series[1], borderColor: theme.surface, borderWidth: 2 },
      },
    ],
  }
}

export function buildVariableBreakdownOption({
  points,
  axisLabels,
  titles,
  theme,
  labels,
  money,
  hideAmounts,
  animate,
}: {
  points: readonly SalaryMonthlyPoint[]
  axisLabels: readonly string[]
  titles: readonly string[]
  theme: ChartTheme
  labels: { onCall: string; overtime: string; thirteenth: string; bonuses: string }
  money: (amount: MinorUnits, options?: { compact?: boolean }) => string
  hideAmounts: boolean
  animate: boolean
}): SalaryChartOption {
  const textStyle = { fontFamily: CHART_FONT_FAMILY }
  const barStyle = { barMaxWidth: 22, itemStyle: { borderColor: theme.surface, borderWidth: 1 } }
  return {
    animation: animate,
    animationDuration: 280,
    textStyle,
    grid: { left: 16, right: 16, top: 42, bottom: 28, containLabel: true },
    legend: {
      top: 0,
      left: 0,
      itemGap: 14,
      textStyle: { ...textStyle, color: theme.text2, fontSize: 12 },
    },
    tooltip: {
      ...TOOLTIP_CONTAINER,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: theme.highlight } },
      formatter: (params) => {
        const first = Array.isArray(params) ? params[0] : params
        const idx = first?.dataIndex ?? -1
        const point = points[idx]
        if (!point) return ''
        return tooltipHtml({
          title: titles[idx] ?? point.period,
          rows: [
            { keyClass: 'fx-key--income', label: labels.onCall, value: money(point.onCallTotal) },
            {
              keyClass: 'fx-key--net',
              label: labels.overtime,
              value: money(point.overtimeTotal),
            },
            {
              keyClass: 'fx-key--expense',
              label: labels.thirteenth,
              value: money(point.thirteenthMonthTotal),
            },
            {
              keyClass: 'fx-key--net',
              label: labels.bonuses,
              value: money(point.bonusesTotal),
            },
          ],
        })
      },
    },
    xAxis: {
      type: 'category',
      data: [...axisLabels],
      axisTick: { show: false },
      axisLine: { lineStyle: { color: theme.axis } },
      axisLabel: { color: theme.muted, fontSize: 11, hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: theme.grid } },
      axisLabel: {
        color: theme.muted,
        fontSize: 11,
        formatter: (value: number) =>
          hideAmounts ? MASKED_AMOUNT : money(Math.round(value), { compact: true }),
      },
    },
    series: [
      {
        name: labels.onCall,
        type: 'bar',
        stack: 'var',
        ...barStyle,
        color: theme.series[2],
        data: points.map((p) => p.onCallTotal),
      },
      {
        name: labels.overtime,
        type: 'bar',
        stack: 'var',
        ...barStyle,
        color: theme.series[6],
        data: points.map((p) => p.overtimeTotal),
      },
      {
        name: labels.thirteenth,
        type: 'bar',
        stack: 'var',
        ...barStyle,
        color: theme.series[0],
        data: points.map((p) => p.thirteenthMonthTotal),
      },
      {
        name: labels.bonuses,
        type: 'bar',
        stack: 'var',
        ...barStyle,
        color: theme.series[3],
        data: points.map((p) => p.bonusesTotal),
      },
    ],
  }
}
