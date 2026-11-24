/**
 * Extension ECharts chargée uniquement par la route paresseuse `/analytics` (M5), afin de
 * garder le chunk du tableau de bord sous le budget de poids (≤ 700 Ko).
 */
import { BarChart, HeatmapChart, LineChart, SankeyChart } from 'echarts/charts'
import {
  BrushComponent,
  CalendarComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  ToolboxComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import langFR from 'echarts/i18n/langFR-obj.js'
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers'

echarts.use([
  BarChart,
  LineChart,
  SankeyChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkAreaComponent,
  VisualMapComponent,
  CalendarComponent,
  BrushComponent,
  ToolboxComponent,
  CanvasRenderer,
  SVGRenderer,
])
echarts.registerLocale('FR', langFR as Parameters<typeof echarts.registerLocale>[1])

export { echarts }
export type { ECharts, EChartsCoreOption } from 'echarts/core'
