import { useEffect, useImperativeHandle, useRef } from 'react'
import { useSettingsStore } from '../../stores/settings'
import { echarts, type ECharts, type EChartsCoreOption } from './echarts-analytics'

export interface AnalyticsChartHandle {
  exportPng: (backgroundColor: string) => string | null
  exportSvg: (width?: number, height?: number) => string | null
}

interface AnalyticsEChartProps {
  ref?: React.Ref<AnalyticsChartHandle>
  option: EChartsCoreOption
  height: number
  ariaLabel: string
  onItemClick?: (params: {
    name?: string
    seriesName?: string
    dataIndex?: number
    value?: unknown
  }) => void
  onBrushCoordRange?: (range: [number, number]) => void
}

/** Wrapper ECharts dédié aux analyses M5 (clics croisés, sélection par pinceau, export PNG/SVG). */
export function AnalyticsEChart({
  ref,
  option,
  height,
  ariaLabel,
  onItemClick,
  onBrushCoordRange,
}: AnalyticsEChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ECharts | null>(null)
  const optionRef = useRef(option)
  const itemClickRef = useRef(onItemClick)
  const brushRef = useRef(onBrushCoordRange)
  const locale = useSettingsStore((state) => state.settings.locale)

  useEffect(() => {
    optionRef.current = option
    itemClickRef.current = onItemClick
    brushRef.current = onBrushCoordRange
  })

  useImperativeHandle(ref, () => ({
    exportPng: (backgroundColor) => {
      const chart = chartRef.current
      if (!chart) return null
      return chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor })
    },
    exportSvg: (width, heightOverride) => {
      const container = containerRef.current
      const w = width ?? container?.clientWidth ?? 800
      const h = heightOverride ?? container?.clientHeight ?? height
      const host = document.createElement('div')
      host.style.width = `${Math.max(320, w)}px`
      host.style.height = `${Math.max(200, h)}px`
      const svgChart = echarts.init(host, null, {
        renderer: 'svg',
        locale: locale === 'fr-FR' ? 'FR' : 'EN',
        width: Math.max(320, w),
        height: Math.max(200, h),
      })
      try {
        svgChart.setOption(optionRef.current)
        return svgChart.renderToSVGString()
      } finally {
        svgChart.dispose()
      }
    },
  }))

  useEffect(() => {
    const element = containerRef.current
    if (!element) return undefined
    const supportsCanvas = document.createElement('canvas').getContext('2d') !== null
    const chart = echarts.init(element, null, {
      renderer: supportsCanvas ? 'canvas' : 'svg',
      locale: locale === 'fr-FR' ? 'FR' : 'EN',
      ...(supportsCanvas ? {} : { width: element.clientWidth || 640, height }),
    })
    chartRef.current = chart

    const handleClick = (params: {
      name?: string
      seriesName?: string
      dataIndex?: number
      value?: unknown
    }) => {
      itemClickRef.current?.(params)
    }
    const handleBrushEnd = (params: unknown) => {
      const areas = (params as { areas?: { coordRange?: unknown }[] })?.areas
      const firstRange = areas?.[0]?.coordRange
      if (
        Array.isArray(firstRange) &&
        firstRange.length >= 2 &&
        typeof firstRange[0] === 'number' &&
        typeof firstRange[1] === 'number'
      ) {
        brushRef.current?.([firstRange[0], firstRange[1]])
      }
    }
    chart.on('click', handleClick)
    chart.on('brushEnd', handleBrushEnd)

    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(element)
    return () => {
      observer.disconnect()
      chart.off('click', handleClick)
      chart.off('brushEnd', handleBrushEnd)
      chart.dispose()
      chartRef.current = null
    }
  }, [locale, height])

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true })
  }, [option, locale])

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      className={onItemClick ? 'cursor-pointer' : undefined}
      style={{ height }}
    />
  )
}
