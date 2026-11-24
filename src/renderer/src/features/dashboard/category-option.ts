import type { BarSeriesOption } from 'echarts/charts'
import type { GridComponentOption, TooltipComponentOption } from 'echarts/components'
import type { ComposeOption } from 'echarts/core'
import type { MinorUnits } from '@shared/money'
import { CHART_FONT_FAMILY, type ChartTheme } from '../../lib/charts/chart-theme'
import { TOOLTIP_CONTAINER, tooltipHtml } from '../../lib/charts/tooltip'

export type CategoryChartOption = ComposeOption<
  BarSeriesOption | GridComponentOption | TooltipComponentOption
>

export interface CategoryPoint {
  id: string
  label: string
  amount: MinorUnits
  /** Part des dépenses du mois (0..1). */
  share: number | null
  /** Variation relative vs mois précédent. */
  change: number | null
}

export interface CategoryOptionInput {
  /** Déjà triés par montant décroissant. */
  points: readonly CategoryPoint[]
  monthTitle: string
  theme: ChartTheme
  money: (amount: MinorUnits) => string
  percent: (value: number, options?: { signed?: boolean }) => string
  labels: { ofTotal: (share: string) => string; vsPrevious: (change: string) => string }
  animate: boolean
}

/**
 * Catégories nominales : une seule série, donc une seule teinte (emplacement 1), classées par
 * montant. Valeur affichée au bout de chaque barre ; détails (part, évolution) dans l'infobulle.
 */
export function buildCategoryOption({
  points,
  monthTitle,
  theme,
  money,
  percent,
  labels,
  animate,
}: CategoryOptionInput): CategoryChartOption {
  const textStyle = { fontFamily: CHART_FONT_FAMILY }
  return {
    animation: animate,
    animationDuration: 280,
    textStyle,
    grid: { left: 4, right: 84, top: 4, bottom: 4 },
    tooltip: {
      ...TOOLTIP_CONTAINER,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: theme.highlight } },
      formatter: (params) => {
        const first = Array.isArray(params) ? params[0] : params
        const point = points[first?.dataIndex ?? -1]
        if (!point) return ''
        const notes = [
          point.share === null ? null : labels.ofTotal(percent(point.share)),
          point.change === null ? null : labels.vsPrevious(percent(point.change, { signed: true })),
        ].filter((note): note is string => note !== null)
        return tooltipHtml({
          title: point.label,
          rows: [{ keyClass: 'fx-key--s1', label: monthTitle, value: money(point.amount) }],
          note: notes.length > 0 ? notes.join(' · ') : undefined,
        })
      },
    },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      inverse: true,
      data: points.map((point) => point.label),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: theme.text2, fontSize: 12, margin: 12 },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 14,
        data: points.map((point) => point.amount),
        itemStyle: { color: theme.series[0], borderRadius: [0, 4, 4, 0] },
        label: {
          show: true,
          position: 'right',
          distance: 8,
          color: theme.text2,
          fontSize: 11,
          fontFamily: CHART_FONT_FAMILY,
          formatter: (params) => money(Number(params.value)),
        },
        emphasis: { disabled: true },
      },
    ],
  }
}
