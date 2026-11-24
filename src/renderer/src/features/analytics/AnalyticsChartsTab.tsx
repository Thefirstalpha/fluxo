import { ChartColumn, ImageDown, Table2 } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import type { AnalyticsOverview } from '@shared/analytics/model'
import { type CategorySummary, UNCATEGORIZED } from '@shared/ledger/model'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { StatTile } from '../../components/ui/StatTile'
import { useT } from '../../i18n'
import { AnalyticsEChart, type AnalyticsChartHandle } from '../../lib/charts/AnalyticsEChart'
import { useChartTheme } from '../../lib/charts/chart-theme'
import { capitalize, useFormatters } from '../../lib/format'
import { useReducedMotion } from '../../lib/theme'
import { useAnalyticsStore } from '../../stores/analytics'
import { useSettingsStore } from '../../stores/settings'
import {
  buildCalendarHeatmapOption,
  buildCategoryEvolutionOption,
  buildHistogramOption,
  buildSankeyOption,
  buildTrendsOption,
  translateCategoryLabel,
} from './analytics-options'

type ViewMode = 'chart' | 'table'

/** Vue Graphiques & Exploration (M5) : 5 visualisations, vue tableau accessible et export PNG/SVG. */
export function AnalyticsChartsTab({
  overview,
  categories,
  onDrillToTransactions,
  onNotice,
  onError,
}: {
  overview: AnalyticsOverview
  categories: readonly CategorySummary[]
  onDrillToTransactions: (opts: { from?: string; to?: string; categoryId?: string | null }) => void
  onNotice: (message: string) => void
  onError: (message: string | null) => void
}) {
  const t = useT()
  const c = t.analytics.charts
  const ex = t.analytics.exports
  const fmt = useFormatters()
  const theme = useChartTheme()
  const animate = !useReducedMotion()
  const currency = useSettingsStore((state) => state.settings.currency)
  const hideAmounts = useSettingsStore((state) => state.settings.hideAmounts)

  const setCustomRange = useAnalyticsStore((state) => state.setCustomRange)
  const setCategoryIds = useAnalyticsStore((state) => state.setCategoryIds)
  const setAmountBounds = useAnalyticsStore((state) => state.setAmountBounds)

  const [views, setViews] = useState<Record<string, ViewMode>>({})
  const evoRef = useRef<AnalyticsChartHandle>(null)
  const trendsRef = useRef<AnalyticsChartHandle>(null)
  const sankeyRef = useRef<AnalyticsChartHandle>(null)
  const heatmapRef = useRef<AnalyticsChartHandle>(null)
  const histRef = useRef<AnalyticsChartHandle>(null)

  const getView = (key: string): ViewMode => views[key] ?? 'chart'
  const setView = (key: string, mode: ViewMode) => setViews((prev) => ({ ...prev, [key]: mode }))

  const moneyC = useCallback(
    (amount: number, opts?: { signed?: boolean; compact?: boolean }) =>
      fmt.money(amount, { ...opts, currency }),
    [fmt, currency],
  )

  const categoryNameMap = useMemo(
    () => new Map(categories.map((cat) => [cat.id, cat.name])),
    [categories],
  )

  const evoMonths = overview.categoryEvolution.months
  const evoMonthLabels = useMemo(
    () => evoMonths.map((m) => capitalize(fmt.month(m, 'short'))),
    [evoMonths, fmt],
  )

  const evoOption = useMemo(
    () =>
      buildCategoryEvolutionOption({
        overview,
        monthLabels: evoMonthLabels,
        theme,
        money: moneyC,
        hideAmounts,
        uncatLabel: c.uncategorized,
        otherLabel: c.otherSeries,
        animate,
      }),
    [overview, evoMonthLabels, theme, moneyC, hideAmounts, c.uncategorized, c.otherSeries, animate],
  )

  const trendsOption = useMemo(
    () =>
      buildTrendsOption({
        overview,
        monthLabels: evoMonthLabels,
        theme,
        money: moneyC,
        hideAmounts,
        labels: c.trendsSeries,
        animate,
      }),
    [overview, evoMonthLabels, theme, moneyC, hideAmounts, c.trendsSeries, animate],
  )

  const sankeyOption = useMemo(
    () =>
      buildSankeyOption({
        overview,
        categoryNames: categoryNameMap,
        theme,
        money: (amt) => moneyC(amt),
        labels: {
          budget: c.sankeyBudgetNode,
          savings: c.sankeySavingsNode,
          surplus: c.sankeySurplusNode,
          otherIncome: c.sankeyOtherIncome,
          otherCategory: c.otherSeries,
          uncategorized: c.uncategorized,
        },
        animate,
      }),
    [
      overview,
      categoryNameMap,
      theme,
      moneyC,
      c.sankeyBudgetNode,
      c.sankeySavingsNode,
      c.sankeySurplusNode,
      c.sankeyOtherIncome,
      c.otherSeries,
      c.uncategorized,
      animate,
    ],
  )

  const heatmapOption = useMemo(
    () =>
      buildCalendarHeatmapOption({
        overview,
        theme,
        money: (amt) => moneyC(amt),
        hideAmounts,
        outflowLabel: t.analytics.synthesis.expenses,
        animate,
      }),
    [overview, theme, moneyC, hideAmounts, t.analytics.synthesis.expenses, animate],
  )

  const histBins = c.histogramBins
  const binLabels = useMemo(
    () =>
      overview.amountHistogram.map(
        (b) => `${histBins[b.key as keyof typeof histBins] ?? b.key} ${currency}`,
      ),
    [overview.amountHistogram, histBins, currency],
  )

  const countColLabel = c.columns.count
  const histOption = useMemo(
    () =>
      buildHistogramOption({
        overview,
        binLabels,
        theme,
        money: (amt) => moneyC(amt),
        countLabel: countColLabel,
        animate,
      }),
    [overview, binLabels, theme, moneyC, countColLabel, animate],
  )

  const exportChart = async (
    handle: AnalyticsChartHandle | null,
    format: 'png' | 'svg',
    defaultName: string,
  ) => {
    onError(null)
    if (!handle) return
    const data = format === 'png' ? handle.exportPng(theme.surface) : handle.exportSvg()
    if (!data) return
    const res = await window.fluxo.analytics.exportImage({ format, defaultName, data })
    if (res.canceled) return
    if (!res.ok) {
      onError(ex.failed)
      return
    }
    onNotice(ex.imageSuccess(res.fileName ?? ''))
  }

  const renderCardActions = (
    key: string,
    chartHandle: React.RefObject<AnalyticsChartHandle | null>,
    exportPrefix: string,
  ) => (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl
        ariaLabel={key}
        value={getView(key)}
        onChange={(v) => setView(key, v)}
        options={[
          { value: 'chart', label: t.common.chart, icon: ChartColumn },
          { value: 'table', label: t.common.table, icon: Table2 },
        ]}
      />
      {getView(key) === 'chart' ? (
        <>
          <Button
            className="h-8 px-2 text-xs"
            onClick={() => void exportChart(chartHandle.current, 'png', exportPrefix)}
          >
            <ImageDown size={13} aria-hidden />
            {ex.png}
          </Button>
          <Button
            className="h-8 px-2 text-xs"
            onClick={() => void exportChart(chartHandle.current, 'svg', exportPrefix)}
          >
            <ImageDown size={13} aria-hidden />
            {ex.svg}
          </Button>
        </>
      ) : null}
    </div>
  )

  return (
    <div className="space-y-5">
      {/* KPIs de la période filtrée */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={t.analytics.synthesis.income} value={moneyC(overview.kpis.income)} />
        <StatTile label={t.analytics.synthesis.expenses} value={moneyC(overview.kpis.expenses)} />
        <StatTile label={t.analytics.synthesis.savings} value={moneyC(overview.kpis.savings)} />
        <StatTile
          label={t.analytics.synthesis.net}
          value={moneyC(overview.kpis.net, { signed: true })}
        />
      </div>

      {/* 1. Évolution par catégorie (barres empilées + brush zoom + clic) */}
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-fg">{c.evolutionTitle}</h2>
            <p className="text-xs text-muted">{c.evolutionSubtitle}</p>
          </div>
          {renderCardActions('evolution', evoRef, 'fluxo-categories-evolution')}
        </div>

        {getView('evolution') === 'chart' ? (
          <AnalyticsEChart
            ref={evoRef}
            option={evoOption}
            height={300}
            ariaLabel={c.evolutionTitle}
            onBrushCoordRange={([startIdx, endIdx]) => {
              const i0 = Math.max(0, Math.round(Math.min(startIdx, endIdx)))
              const i1 = Math.min(evoMonths.length - 1, Math.round(Math.max(startIdx, endIdx)))
              const m0 = evoMonths[i0]
              const m1 = evoMonths[i1]
              if (m0 && m1) setCustomRange(`${m0}-01`, `${m1}-31`)
            }}
            onItemClick={(params) => {
              const found = overview.categoryEvolution.series.find(
                (s) =>
                  translateCategoryLabel(s.name, c.uncategorized, c.otherSeries) ===
                  params.seriesName,
              )
              if (found && found.categoryId && found.categoryId !== '__other__') {
                setCategoryIds([found.categoryId])
              } else if (found && found.categoryId === null) {
                onDrillToTransactions({ categoryId: UNCATEGORIZED })
              }
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="py-2 pr-3">{c.columns.category}</th>
                  {evoMonthLabels.map((lbl, idx) => (
                    <th key={evoMonths[idx]} className="px-2 py-2 text-right">
                      {lbl}
                    </th>
                  ))}
                  <th className="py-2 pl-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {overview.categoryEvolution.series.map((s) => (
                  <tr key={s.name} className="border-b border-border/50">
                    <td className="py-1.5 pr-3 font-medium text-fg">
                      {translateCategoryLabel(s.name, c.uncategorized, c.otherSeries)}
                    </td>
                    {s.totalsByMonth.map((val, idx) => (
                      <td key={evoMonths[idx]} className="px-2 py-1.5 text-right tabular-nums">
                        {moneyC(val)}
                      </td>
                    ))}
                    <td className="py-1.5 pl-2 text-right font-semibold tabular-nums">
                      {moneyC(s.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 2. Tendances & moyennes glissantes */}
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-sm font-semibold text-fg">{c.trendsTitle}</h2>
          {renderCardActions('trends', trendsRef, 'fluxo-tendances')}
        </div>

        {getView('trends') === 'chart' ? (
          <AnalyticsEChart
            ref={trendsRef}
            option={trendsOption}
            height={280}
            ariaLabel={c.trendsTitle}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="py-2 pr-3">{c.columns.month}</th>
                  <th className="px-2 py-2 text-right">{c.trendsSeries.income}</th>
                  <th className="px-2 py-2 text-right">{c.trendsSeries.expenses}</th>
                  <th className="px-2 py-2 text-right">{c.trendsSeries.ma3}</th>
                  <th className="px-2 py-2 text-right">{c.trendsSeries.ma6}</th>
                  <th className="py-2 pl-2 text-right">{c.trendsSeries.ma12}</th>
                </tr>
              </thead>
              <tbody>
                {overview.monthlySeries.map((row) => (
                  <tr key={row.month} className="border-b border-border/50">
                    <td className="py-1.5 pr-3 font-medium text-fg">
                      {capitalize(fmt.month(row.month, 'short'))}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{moneyC(row.income)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{moneyC(row.expenses)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {row.ma3Expense !== null ? moneyC(row.ma3Expense) : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {row.ma6Expense !== null ? moneyC(row.ma6Expense) : '—'}
                    </td>
                    <td className="py-1.5 pl-2 text-right tabular-nums">
                      {row.ma12Expense !== null ? moneyC(row.ma12Expense) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 3. Sankey des flux */}
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-sm font-semibold text-fg">{c.sankeyTitle}</h2>
          {renderCardActions('sankey', sankeyRef, 'fluxo-sankey')}
        </div>

        {getView('sankey') === 'chart' ? (
          <AnalyticsEChart
            ref={sankeyRef}
            option={sankeyOption}
            height={320}
            ariaLabel={c.sankeyTitle}
            onItemClick={(params) => {
              const nodeName = params.name
              if (!nodeName) return
              const found = overview.sankey.nodes.find((n) => n.name === nodeName)
              if (found?.categoryId && found.categoryId !== '__other__') {
                setCategoryIds([found.categoryId])
              }
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="py-2 pr-3">{c.columns.source}</th>
                  <th className="px-2 py-2">{c.columns.target}</th>
                  <th className="py-2 pl-2 text-right">{c.columns.amount}</th>
                </tr>
              </thead>
              <tbody>
                {overview.sankey.links.map((link) => (
                  <tr key={`${link.source}-${link.target}`} className="border-b border-border/50">
                    <td className="py-1.5 pr-3 text-fg">{link.source}</td>
                    <td className="px-2 py-1.5 text-fg-2">{link.target}</td>
                    <td className="py-1.5 pl-2 text-right font-semibold tabular-nums">
                      {moneyC(link.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 4 & 5. Calendrier heatmap + Histogramme */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-fg">
                {c.heatmapTitle(overview.calendarHeatmap.year)}
              </h2>
              <p className="text-xs text-muted">{c.heatmapSubtitle}</p>
            </div>
            {renderCardActions('heatmap', heatmapRef, 'fluxo-calendrier')}
          </div>

          {getView('heatmap') === 'chart' ? (
            <AnalyticsEChart
              ref={heatmapRef}
              option={heatmapOption}
              height={220}
              ariaLabel={c.heatmapTitle(overview.calendarHeatmap.year)}
              onItemClick={(params) => {
                const pair = params.value
                if (Array.isArray(pair) && typeof pair[0] === 'string') {
                  onDrillToTransactions({ from: pair[0], to: pair[0] })
                }
              }}
            />
          ) : (
            <div className="max-h-60 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted">
                    <th className="py-1.5">{c.columns.date}</th>
                    <th className="py-1.5 text-right">{t.analytics.synthesis.expenses}</th>
                    <th className="py-1.5 text-right">{c.columns.count}</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.calendarHeatmap.days.slice(-31).map((d) => (
                    <tr key={d.date} className="border-b border-border/50">
                      <td className="py-1">{fmt.date(d.date)}</td>
                      <td className="py-1 text-right tabular-nums">{moneyC(d.outflow)}</td>
                      <td className="py-1 text-right tabular-nums">{d.txCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="text-sm font-semibold text-fg">{c.histogramTitle}</h2>
            {renderCardActions('histogram', histRef, 'fluxo-histogramme')}
          </div>

          {getView('histogram') === 'chart' ? (
            <AnalyticsEChart
              ref={histRef}
              option={histOption}
              height={220}
              ariaLabel={c.histogramTitle}
              onItemClick={(params) => {
                const b = overview.amountHistogram[params.dataIndex ?? -1]
                if (b) setAmountBounds(b.min, b.max ?? undefined)
              }}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted">
                    <th className="py-1.5">{c.columns.bucket}</th>
                    <th className="py-1.5 text-right">{c.columns.count}</th>
                    <th className="py-1.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.amountHistogram.map((b, idx) => (
                    <tr key={b.key} className="border-b border-border/50">
                      <td className="py-1.5">{binLabels[idx]}</td>
                      <td className="py-1.5 text-right tabular-nums">{b.count}</td>
                      <td className="py-1.5 text-right tabular-nums">{moneyC(b.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
