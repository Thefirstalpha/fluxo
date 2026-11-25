import { ChartColumn, CircleAlert, CircleCheck, Table2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { SalaryDashboardOverview } from '@shared/payslip'
import { Card } from '../../components/ui/Card'
import { SelectField } from '../../components/ui/Field'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { StatTile } from '../../components/ui/StatTile'
import { useT } from '../../i18n'
import { EChart } from '../../lib/charts/EChart'
import { useChartTheme } from '../../lib/charts/chart-theme'
import { capitalize, useFormatters } from '../../lib/format'
import { useReducedMotion } from '../../lib/theme'
import { useSettingsStore } from '../../stores/settings'
import {
  buildSalaryEvolutionOption,
  buildVariableBreakdownOption,
  buildWithholdingRatesOption,
} from './salary-options'

type ViewMode = 'chart' | 'table'

export function SalaryDashboardTab({
  overview,
  contractId,
  onSelectContract,
}: {
  overview: SalaryDashboardOverview
  contractId: string
  onSelectContract: (id: string) => void
}) {
  const t = useT()
  const fmt = useFormatters()
  const theme = useChartTheme()
  const reducedMotion = useReducedMotion()
  const hideAmounts = useSettingsStore((s) => s.settings.hideAmounts)
  const pt = t.payslips
  const dt = pt.dashboardTab

  const [evolutionView, setEvolutionView] = useState<ViewMode>('chart')
  const [ratesView, setRatesView] = useState<ViewMode>('chart')
  const [variablesView, setVariablesView] = useState<ViewMode>('chart')

  const points = overview.months
  const axisLabels = useMemo(() => points.map((p) => fmt.month(p.period, 'short')), [points, fmt])
  const titles = useMemo(() => points.map((p) => capitalize(fmt.month(p.period))), [points, fmt])
  const currency = overview.currency

  const last12 = points.slice(-12)
  const gross12 = last12.reduce((s, p) => s + p.gross, 0)
  const var12 = last12.reduce((s, p) => s + p.variableTotal, 0)
  const onCall12 = last12.reduce((s, p) => s + p.onCallTotal, 0)
  const latest = points[points.length - 1]

  const evoOption = useMemo(
    () =>
      buildSalaryEvolutionOption({
        points,
        axisLabels,
        titles,
        theme,
        labels: {
          gross: pt.detail.gross,
          taxableNet: pt.detail.taxableNet,
          netPaid: pt.detail.netPaid,
          employerCost: pt.detail.employerCost,
        },
        money: (amt, opts) => fmt.money(amt, { ...opts, currency }),
        hideAmounts,
        animate: !reducedMotion,
      }),
    [points, axisLabels, titles, theme, pt.detail, fmt, currency, hideAmounts, reducedMotion],
  )

  const ratesOption = useMemo(
    () =>
      buildWithholdingRatesOption({
        points,
        axisLabels,
        titles,
        theme,
        labels: {
          pasRate: dt.columns.ratePas,
          contribRate: dt.columns.rateContrib,
        },
        percent: (r) => fmt.percent(r),
        animate: !reducedMotion,
      }),
    [points, axisLabels, titles, theme, dt.columns, fmt, reducedMotion],
  )

  const varsOption = useMemo(
    () =>
      buildVariableBreakdownOption({
        points,
        axisLabels,
        titles,
        theme,
        labels: {
          onCall: dt.columns.onCall,
          overtime: t.payslipExtras.overtime,
          thirteenth: dt.columns.thirteenth,
          bonuses: dt.columns.variables,
        },
        money: (amt, opts) => fmt.money(amt, { ...opts, currency }),
        hideAmounts,
        animate: !reducedMotion,
      }),
    [
      points,
      axisLabels,
      titles,
      theme,
      dt.columns,
      t.payslipExtras.overtime,
      fmt,
      currency,
      hideAmounts,
      reducedMotion,
    ],
  )

  const viewToggle = (view: ViewMode, onChange: (next: ViewMode) => void, ariaLabel: string) => (
    <SegmentedControl<ViewMode>
      ariaLabel={ariaLabel}
      value={view}
      onChange={onChange}
      options={[
        { value: 'chart', label: t.common.chart, icon: ChartColumn },
        { value: 'table', label: t.common.table, icon: Table2 },
      ]}
    />
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-72">
          <SelectField
            label={dt.contractFilter}
            value={contractId}
            onChange={onSelectContract}
            options={[
              { value: '', label: dt.allContracts },
              ...overview.contracts.map((c) => ({
                value: c.id,
                label: `${c.title} (${c.employerName})`,
              })),
            ]}
          />
        </div>
      </div>

      {/* KPI */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile
          label={dt.kpis.latestGross}
          value={latest ? fmt.money(latest.gross, { currency }) : '—'}
        />
        <StatTile
          label={dt.kpis.latestNetPaid}
          value={latest ? fmt.money(latest.netPaid, { currency }) : '—'}
        />
        <StatTile
          label={dt.kpis.latestEmployerCost}
          value={latest ? fmt.money(latest.employerCost, { currency }) : '—'}
        />
        <StatTile
          label={dt.kpis.effectiveContribRate}
          value={latest ? fmt.percent(latest.effectiveContributionRateMicros / 1_000_000) : '—'}
        />
        <StatTile
          label={dt.kpis.variableShare12m}
          value={gross12 > 0 ? fmt.percent(var12 / gross12) : '—'}
        />
        <StatTile label={dt.kpis.onCall12m} value={fmt.money(onCall12, { currency })} />
      </div>

      {/* Évolution brut / net / coût employeur */}
      <Card
        accent
        title={dt.evolutionTitle}
        actions={viewToggle(evolutionView, setEvolutionView, dt.evolutionTitle)}
      >
        {evolutionView === 'chart' ? (
          <EChart option={evoOption} height={280} ariaLabel={dt.evolutionTitle} />
        ) : (
          <div className="overflow-x-auto">
            <table className="fx-tabular w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="py-2 pr-3">{dt.columns.period}</th>
                  <th className="py-2 pr-3 text-right">{pt.detail.employerCost}</th>
                  <th className="py-2 pr-3 text-right">{dt.columns.gross}</th>
                  <th className="py-2 pr-3 text-right">{dt.columns.taxableNet}</th>
                  <th className="py-2 text-right">{dt.columns.netPaid}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {points.map((p) => (
                  <tr key={p.payslipId}>
                    <td className="py-2 pr-3">{capitalize(fmt.month(p.period))}</td>
                    <td className="py-2 pr-3 text-right">
                      {fmt.money(p.employerCost, { currency })}
                    </td>
                    <td className="py-2 pr-3 text-right">{fmt.money(p.gross, { currency })}</td>
                    <td className="py-2 pr-3 text-right">
                      {fmt.money(p.taxableNet, { currency })}
                    </td>
                    <td className="py-2 text-right font-semibold">
                      {fmt.money(p.netPaid, { currency })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={dt.ratesTitle} actions={viewToggle(ratesView, setRatesView, dt.ratesTitle)}>
          {ratesView === 'chart' ? (
            <EChart option={ratesOption} height={240} ariaLabel={dt.ratesTitle} />
          ) : (
            <div className="overflow-x-auto">
              <table className="fx-tabular w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted">
                    <th className="py-2 pr-3">{dt.columns.period}</th>
                    <th className="py-2 pr-3 text-right">{dt.columns.rateContrib}</th>
                    <th className="py-2 text-right">{dt.columns.ratePas}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {points.map((p) => (
                    <tr key={p.payslipId}>
                      <td className="py-2 pr-3">{capitalize(fmt.month(p.period))}</td>
                      <td className="py-2 pr-3 text-right">
                        {fmt.percent(p.effectiveContributionRateMicros / 1_000_000)}
                      </td>
                      <td className="py-2 text-right">
                        {fmt.percent(p.withholdingRateMicros / 1_000_000)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title={dt.variablesTitle}
          actions={viewToggle(variablesView, setVariablesView, dt.variablesTitle)}
        >
          {variablesView === 'chart' ? (
            <EChart option={varsOption} height={240} ariaLabel={dt.variablesTitle} />
          ) : (
            <div className="overflow-x-auto">
              <table className="fx-tabular w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted">
                    <th className="py-2 pr-3">{dt.columns.period}</th>
                    <th className="py-2 pr-3 text-right">{dt.columns.onCall}</th>
                    <th className="py-2 pr-3 text-right">{t.payslipExtras.overtime}</th>
                    <th className="py-2 pr-3 text-right">{dt.columns.thirteenth}</th>
                    <th className="py-2 text-right">{dt.columns.variables}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {points.map((p) => (
                    <tr key={p.payslipId}>
                      <td className="py-2 pr-3">{capitalize(fmt.month(p.period))}</td>
                      <td className="py-2 pr-3 text-right">
                        {fmt.money(p.onCallTotal, { currency })}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {fmt.money(p.overtimeTotal, { currency })}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {fmt.money(p.thirteenthMonthTotal, { currency })}
                      </td>
                      <td className="py-2 text-right font-semibold">
                        {fmt.money(p.variableTotal, { currency })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Récapitulatif annuel */}
      <Card accent title={dt.annualTitle} subtitle={dt.annualSubtitle}>
        <div className="overflow-x-auto">
          <table className="fx-tabular w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">{dt.columns.year}</th>
                <th className="py-2 pr-3 text-right font-medium">{dt.columns.months}</th>
                <th className="py-2 pr-3 text-right font-medium">{dt.columns.gross}</th>
                <th className="py-2 pr-3 text-right font-medium">{dt.columns.employerCost}</th>
                <th className="py-2 pr-3 text-right font-medium">{dt.columns.taxableNet}</th>
                <th className="py-2 pr-3 text-right font-medium">{dt.columns.withholdingTax}</th>
                <th className="py-2 pr-3 text-right font-medium">{dt.columns.netPaid}</th>
                <th className="py-2 pr-3 text-right font-medium">{dt.columns.variables}</th>
                <th className="py-2 font-medium">{dt.columns.ytdCheck}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {overview.annualRecaps.map((yr) => (
                <tr key={yr.year}>
                  <td className="py-2.5 pr-3 font-semibold text-fg">{yr.year}</td>
                  <td className="py-2.5 pr-3 text-right text-fg-2">{yr.monthCount}</td>
                  <td className="py-2.5 pr-3 text-right">{fmt.money(yr.gross, { currency })}</td>
                  <td className="py-2.5 pr-3 text-right">
                    {fmt.money(yr.employerCost, { currency })}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-medium text-fg">
                    {fmt.money(yr.taxableNet, { currency })}
                  </td>
                  <td className="py-2.5 pr-3 text-right text-expense">
                    {fmt.money(yr.withholdingTax, { currency })}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-semibold text-income">
                    {fmt.money(yr.netPaid, { currency })}
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    {fmt.money(yr.variableTotal, { currency })}
                  </td>
                  <td className="py-2.5 text-xs">
                    {yr.decemberYtdGross === null ? (
                      <span className="text-muted">{dt.ytdNoDec}</span>
                    ) : yr.hasDecemberYtdMismatch ? (
                      <span className="flex items-center gap-1 text-expense">
                        <CircleAlert size={13} aria-hidden />
                        {dt.ytdMatchWarn}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[color:var(--fx-status-good)]">
                        <CircleCheck size={13} aria-hidden />
                        {dt.ytdMatchOk}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
