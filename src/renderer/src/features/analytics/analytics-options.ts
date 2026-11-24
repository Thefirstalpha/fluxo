import type {
  BarSeriesOption,
  HeatmapSeriesOption,
  LineSeriesOption,
  SankeySeriesOption,
} from 'echarts/charts'
import type {
  BrushComponentOption,
  CalendarComponentOption,
  GridComponentOption,
  LegendComponentOption,
  TooltipComponentOption,
  VisualMapComponentOption,
} from 'echarts/components'
import type { ComposeOption } from 'echarts/core'
import type { AnalyticsOverview } from '@shared/analytics/model'
import { UNCATEGORIZED } from '@shared/ledger/model'
import type { MinorUnits } from '@shared/money'
import { CHART_FONT_FAMILY, type ChartTheme } from '../../lib/charts/chart-theme'
import { TOOLTIP_CONTAINER, tooltipHtml } from '../../lib/charts/tooltip'

export type AnalyticsOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | SankeySeriesOption
  | HeatmapSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | LegendComponentOption
  | VisualMapComponentOption
  | CalendarComponentOption
  | BrushComponentOption
>

export function translateCategoryLabel(
  name: string,
  uncatLabel: string,
  otherLabel: string,
): string {
  if (name === '__other__') return otherLabel
  if (name === UNCATEGORIZED || name === '__none__') return uncatLabel
  return name
}

export function buildCategoryEvolutionOption({
  overview,
  monthLabels,
  theme,
  money,
  hideAmounts,
  uncatLabel,
  otherLabel,
  animate,
}: {
  overview: AnalyticsOverview
  monthLabels: readonly string[]
  theme: ChartTheme
  money: (amount: MinorUnits, options?: { compact?: boolean }) => string
  hideAmounts: boolean
  uncatLabel: string
  otherLabel: string
  animate: boolean
}): AnalyticsOption {
  const textStyle = { fontFamily: CHART_FONT_FAMILY }
  const { series } = overview.categoryEvolution

  return {
    animation: animate,
    animationDuration: 260,
    textStyle,
    grid: { left: 58, right: 20, top: 44, bottom: 28 },
    legend: {
      top: 0,
      left: 0,
      textStyle: { ...textStyle, color: theme.text2, fontSize: 11 },
    },
    brush: {
      toolbox: ['lineX'],
      xAxisIndex: 0,
      brushType: 'lineX',
      brushMode: 'single',
    },
    tooltip: {
      ...TOOLTIP_CONTAINER,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: theme.highlight } },
      formatter: (params) => {
        const list = Array.isArray(params) ? params : [params]
        const first = list[0]
        const idx = first?.dataIndex ?? -1
        const title = monthLabels[idx] ?? ''
        const rows = list
          .filter((item) => typeof item.value === 'number' && item.value > 0)
          .map((item) => ({
            keyClass: 'fx-key--expense',
            label: item.seriesName ?? '',
            value: money(Number(item.value)),
          }))
        return tooltipHtml({ title, rows })
      },
    },
    xAxis: {
      type: 'category',
      data: [...monthLabels],
      axisTick: { show: false },
      axisLine: { lineStyle: { color: theme.axis } },
      axisLabel: { color: theme.muted, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: theme.grid } },
      axisLabel: {
        color: theme.muted,
        fontSize: 11,
        formatter: (value: number) => (hideAmounts ? '••••••' : money(value, { compact: true })),
      },
    },
    series: series.map((s) => ({
      name: translateCategoryLabel(s.name, uncatLabel, otherLabel),
      type: 'bar',
      stack: 'expenses',
      barMaxWidth: 24,
      itemStyle: { color: s.color, borderColor: theme.surface, borderWidth: 1 },
      data: s.totalsByMonth,
    })),
  }
}

export function buildTrendsOption({
  overview,
  monthLabels,
  theme,
  money,
  hideAmounts,
  labels,
  animate,
}: {
  overview: AnalyticsOverview
  monthLabels: readonly string[]
  theme: ChartTheme
  money: (amount: MinorUnits, options?: { compact?: boolean }) => string
  hideAmounts: boolean
  labels: { income: string; expenses: string; ma3: string; ma6: string; ma12: string }
  animate: boolean
}): AnalyticsOption {
  const textStyle = { fontFamily: CHART_FONT_FAMILY }
  const pts = overview.monthlySeries
  return {
    animation: animate,
    animationDuration: 260,
    textStyle,
    grid: { left: 58, right: 20, top: 44, bottom: 28 },
    legend: {
      top: 0,
      left: 0,
      textStyle: { ...textStyle, color: theme.text2, fontSize: 11 },
    },
    tooltip: {
      ...TOOLTIP_CONTAINER,
      trigger: 'axis',
      formatter: (params) => {
        const list = Array.isArray(params) ? params : [params]
        const idx = list[0]?.dataIndex ?? -1
        const title = monthLabels[idx] ?? ''
        const rows = list
          .filter((item) => item.value !== null && item.value !== undefined)
          .map((item) => ({
            keyClass: item.seriesName === labels.income ? 'fx-key--income' : 'fx-key--expense',
            label: item.seriesName ?? '',
            value: money(Number(item.value)),
          }))
        return tooltipHtml({ title, rows })
      },
    },
    xAxis: {
      type: 'category',
      data: [...monthLabels],
      axisLine: { lineStyle: { color: theme.axis } },
      axisLabel: { color: theme.muted, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: theme.grid } },
      axisLabel: {
        color: theme.muted,
        fontSize: 11,
        formatter: (value: number) => (hideAmounts ? '••••••' : money(value, { compact: true })),
      },
    },
    series: [
      {
        name: labels.income,
        type: 'line',
        smooth: true,
        lineStyle: { width: 2, color: theme.income },
        itemStyle: { color: theme.income },
        data: pts.map((p) => p.income),
      },
      {
        name: labels.expenses,
        type: 'line',
        smooth: true,
        lineStyle: { width: 2, color: theme.expense },
        itemStyle: { color: theme.expense },
        data: pts.map((p) => p.expenses),
      },
      {
        name: labels.ma3,
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 1.5, type: 'dashed', color: theme.series[0] },
        itemStyle: { color: theme.series[0] },
        data: pts.map((p) => p.ma3Expense),
      },
      {
        name: labels.ma6,
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 1.5, type: 'dotted', color: theme.series[4] },
        itemStyle: { color: theme.series[4] },
        data: pts.map((p) => p.ma6Expense),
      },
      {
        name: labels.ma12,
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 1.5, type: 'solid', color: theme.series[3] },
        itemStyle: { color: theme.series[3] },
        data: pts.map((p) => p.ma12Expense),
      },
    ],
  }
}

export function buildSankeyOption({
  overview,
  categoryNames,
  theme,
  money,
  labels,
  animate,
}: {
  overview: AnalyticsOverview
  categoryNames: ReadonlyMap<string, string>
  theme: ChartTheme
  money: (amount: MinorUnits) => string
  labels: {
    budget: string
    savings: string
    surplus: string
    otherIncome: string
    otherCategory: string
    uncategorized: string
  }
  animate: boolean
}): AnalyticsOption {
  const resolveLabel = (nodeId: string) => {
    if (nodeId === 'budget') return labels.budget
    if (nodeId === 'out:savings') return labels.savings
    if (nodeId === 'out:surplus') return labels.surplus
    if (nodeId === 'in:other') return labels.otherIncome
    if (nodeId === 'in:none') return labels.uncategorized
    if (nodeId === 'out:__other__') return labels.otherCategory
    if (nodeId === 'out:none') return labels.uncategorized
    const catId = nodeId.slice(nodeId.indexOf(':') + 1)
    const rawName = categoryNames.get(catId) ?? labels.uncategorized
    return nodeId.startsWith('in:') ? `${rawName} (+)` : rawName
  }

  return {
    animation: animate,
    textStyle: { fontFamily: CHART_FONT_FAMILY },
    tooltip: {
      ...TOOLTIP_CONTAINER,
      trigger: 'item',
      formatter: (params) => {
        const p = params as {
          dataType?: string
          data?: { source?: string; target?: string; value?: number; name?: string }
          value?: number
        }
        if (p.dataType === 'edge' && p.data?.source && p.data?.target) {
          return tooltipHtml({
            title: `${resolveLabel(p.data.source)} → ${resolveLabel(p.data.target)}`,
            rows: [{ keyClass: 'fx-key--net', label: '', value: money(Number(p.data.value ?? 0)) }],
          })
        }
        const name = p.data?.name ?? ''
        return tooltipHtml({
          title: resolveLabel(name),
          rows: [{ keyClass: 'fx-key--net', label: '', value: money(Number(p.value ?? 0)) }],
        })
      },
    },
    series: [
      {
        type: 'sankey',
        left: 12,
        right: 140,
        top: 12,
        bottom: 12,
        nodeGap: 10,
        draggable: false,
        label: {
          color: theme.text,
          fontSize: 11,
          formatter: (param) => resolveLabel((param as { name?: string }).name ?? ''),
        },
        lineStyle: { color: 'source', curveness: 0.45, opacity: 0.35 },
        data: overview.sankey.nodes.map((node, index) => ({
          name: node.name,
          itemStyle: {
            color:
              node.kind === 'income'
                ? theme.income
                : node.kind === 'savings' || node.kind === 'surplus'
                  ? theme.series[2]
                  : node.kind === 'budget'
                    ? theme.net
                    : theme.series[index % theme.series.length]!,
          },
        })),
        links: overview.sankey.links.map((link) => ({
          source: link.source,
          target: link.target,
          value: link.value,
        })),
      },
    ],
  }
}

export function buildCalendarHeatmapOption({
  overview,
  theme,
  money,
  hideAmounts,
  outflowLabel,
  animate,
}: {
  overview: AnalyticsOverview
  theme: ChartTheme
  money: (amount: MinorUnits) => string
  hideAmounts: boolean
  outflowLabel: string
  animate: boolean
}): AnalyticsOption {
  const { year, days, maxOutflow } = overview.calendarHeatmap
  return {
    animation: animate,
    textStyle: { fontFamily: CHART_FONT_FAMILY },
    tooltip: {
      ...TOOLTIP_CONTAINER,
      formatter: (params) => {
        const val = (params as { value?: [string, number] }).value
        if (!val) return ''
        return tooltipHtml({
          title: val[0],
          rows: [{ keyClass: 'fx-key--expense', label: outflowLabel, value: money(val[1]) }],
        })
      },
    },
    visualMap: {
      min: 0,
      max: Math.max(100, maxOutflow),
      type: 'piecewise',
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      show: !hideAmounts,
      inRange: { color: [theme.grid, '#ffd6e6', '#f27eb3', theme.series[0], '#8e1550'] },
      textStyle: { color: theme.muted, fontSize: 10 },
      formatter: (minVal: unknown, maxVal: unknown) =>
        `${money(Math.round(Number(minVal)))} – ${money(Math.round(Number(maxVal)))}`,
    },
    calendar: {
      top: 28,
      left: 36,
      right: 16,
      bottom: 42,
      cellSize: ['auto', 14],
      range: year,
      itemStyle: { borderWidth: 1.5, borderColor: theme.surface, color: theme.grid },
      splitLine: { lineStyle: { color: theme.axis, width: 1 } },
      yearLabel: { show: false },
      dayLabel: { color: theme.muted, fontSize: 10 },
      monthLabel: { color: theme.text2, fontSize: 11 },
    },
    series: [
      {
        type: 'heatmap',
        coordinateSystem: 'calendar',
        data: days.map((d) => [d.date, d.outflow]),
      },
    ],
  }
}

export function buildHistogramOption({
  overview,
  binLabels,
  theme,
  money,
  countLabel,
  animate,
}: {
  overview: AnalyticsOverview
  binLabels: readonly string[]
  theme: ChartTheme
  money: (amount: MinorUnits) => string
  countLabel: string
  animate: boolean
}): AnalyticsOption {
  const textStyle = { fontFamily: CHART_FONT_FAMILY }
  const buckets = overview.amountHistogram
  return {
    animation: animate,
    textStyle,
    grid: { left: 58, right: 20, top: 16, bottom: 28 },
    tooltip: {
      ...TOOLTIP_CONTAINER,
      trigger: 'axis',
      formatter: (params) => {
        const p = (Array.isArray(params) ? params[0] : params) as { dataIndex?: number }
        const idx = p?.dataIndex ?? -1
        const b = buckets[idx]
        if (!b) return ''
        return tooltipHtml({
          title: binLabels[idx] ?? '',
          rows: [
            { keyClass: 'fx-key--net', label: countLabel, value: String(b.count) },
            { keyClass: 'fx-key--expense', label: 'Total', value: money(b.total) },
          ],
        })
      },
    },
    xAxis: {
      type: 'category',
      data: [...binLabels],
      axisLine: { lineStyle: { color: theme.axis } },
      axisLabel: { color: theme.muted, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: theme.grid } },
      axisLabel: { color: theme.muted, fontSize: 11 },
    },
    series: [
      {
        name: countLabel,
        type: 'bar',
        barMaxWidth: 24,
        itemStyle: { color: theme.series[6], borderRadius: [4, 4, 0, 0] },
        data: buckets.map((b) => b.count),
      },
    ],
  }
}
