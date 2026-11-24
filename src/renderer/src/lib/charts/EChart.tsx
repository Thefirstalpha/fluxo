import { useEffect, useRef } from 'react'
import { useSettingsStore } from '../../stores/settings'
import { echarts, type ECharts, type EChartsCoreOption } from './echarts'

interface EChartProps {
  option: EChartsCoreOption
  /** Hauteur totale, axes et curseur de zoom compris (évite tout défilement interne). */
  height: number
  /** Résumé lisible par les lecteurs d'écran ; la vue tableau reste l'équivalent complet. */
  ariaLabel: string
  /** Clic n'importe où dans la bande d'une catégorie de l'axe X (pas seulement sur la barre). */
  onCategoryClick?: (index: number) => void
}

export function EChart({ option, height, ariaLabel, onCategoryClick }: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ECharts | null>(null)
  const clickRef = useRef(onCategoryClick)
  const locale = useSettingsStore((state) => state.settings.locale)

  useEffect(() => {
    clickRef.current = onCategoryClick
  }, [onCategoryClick])

  // Cycle de vie de l'instance (recréée si la langue change : libellés internes d'ECharts).
  useEffect(() => {
    const element = containerRef.current
    if (!element) return undefined
    const chart = echarts.init(element, null, {
      renderer: 'canvas',
      locale: locale === 'fr-FR' ? 'FR' : 'EN',
    })
    chartRef.current = chart

    const zr = chart.getZr()
    const handleClick = (event: { offsetX: number; offsetY: number }): void => {
      const point = [event.offsetX, event.offsetY]
      if (!clickRef.current || !chart.containPixel('grid', point)) return
      const [index] = chart.convertFromPixel({ xAxisIndex: 0 }, point)
      if (typeof index === 'number' && Number.isFinite(index)) clickRef.current(Math.round(index))
    }
    zr.on('click', handleClick)

    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(element)
    return () => {
      observer.disconnect()
      zr.off('click', handleClick)
      chart.dispose()
      chartRef.current = null
    }
  }, [locale])

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true })
  }, [option, locale])

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      className={onCategoryClick ? 'cursor-pointer' : undefined}
      style={{ height }}
    />
  )
}
