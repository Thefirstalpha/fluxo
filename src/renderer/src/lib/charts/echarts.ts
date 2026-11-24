/**
 * ECharts « à la carte » : on n'enregistre que les graphiques et composants utilisés,
 * pour un bundle léger (tree-shaking). Ajouter ici tout nouveau type (Sankey, calendrier…).
 */
import { BarChart, LineChart } from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  TooltipComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import langFR from 'echarts/i18n/langFR-obj.js'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkAreaComponent,
  CanvasRenderer,
])
echarts.registerLocale('FR', langFR as Parameters<typeof echarts.registerLocale>[1])

export { echarts }
export type { ECharts, EChartsCoreOption } from 'echarts/core'
