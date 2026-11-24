import { ChartColumn, Table2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { MinorUnits } from '@shared/money'
import { Card } from '../../components/ui/Card'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useT } from '../../i18n'
import { EChart } from '../../lib/charts/EChart'
import { useChartTheme } from '../../lib/charts/chart-theme'
import { cx } from '../../lib/cx'
import { capitalize, useFormatters } from '../../lib/format'
import { useReducedMotion } from '../../lib/theme'
import { buildCashflowOption, type CashflowPoint } from './cashflow-option'

type View = 'chart' | 'table'

export function CashflowCard({
  months,
  selectedMonth,
  onSelectMonth,
}: {
  months: readonly { month: string; income: MinorUnits; expenses: MinorUnits }[]
  selectedMonth: string
  onSelectMonth: (month: string) => void
}) {
  const t = useT()
  const fmt = useFormatters()
  const theme = useChartTheme()
  const reducedMotion = useReducedMotion()
  const [view, setView] = useState<View>('chart')

  const points = useMemo<CashflowPoint[]>(
    () =>
      months.map((month) => ({
        month: month.month,
        axisLabel: fmt.month(month.month, 'short'),
        title: capitalize(fmt.month(month.month)),
        income: month.income,
        expenses: month.expenses,
      })),
    [months, fmt],
  )
  const selectedIndex = points.findIndex((point) => point.month === selectedMonth)

  const option = useMemo(
    () =>
      buildCashflowOption({
        points,
        selectedIndex,
        theme,
        labels: {
          income: t.dashboard.cashflow.income,
          expenses: t.dashboard.cashflow.expenses,
          net: t.dashboard.cashflow.net,
          savingsRate: t.dashboard.cashflow.savingsRate,
        },
        money: fmt.money,
        percent: (value) => fmt.percent(value),
        animate: !reducedMotion,
      }),
    [points, selectedIndex, theme, t, fmt, reducedMotion],
  )

  return (
    <Card
      accent
      title={t.dashboard.cashflow.title}
      subtitle={t.dashboard.cashflow.subtitle}
      actions={
        <SegmentedControl<View>
          ariaLabel={t.dashboard.cashflow.title}
          value={view}
          onChange={setView}
          options={[
            { value: 'chart', label: t.common.chart, icon: ChartColumn },
            { value: 'table', label: t.common.table, icon: Table2 },
          ]}
        />
      }
    >
      {view === 'chart' ? (
        <>
          <EChart
            option={option}
            height={340}
            ariaLabel={t.dashboard.cashflow.aria(points.length)}
            onCategoryClick={(index) => {
              const point = points[index]
              if (point) onSelectMonth(point.month)
            }}
          />
          <p className="mt-1 text-right text-[11px] text-muted">{t.dashboard.cashflow.zoomHint}</p>
        </>
      ) : (
        <div className="max-h-[360px] overflow-y-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{t.dashboard.cashflow.title}</caption>
            <thead className="sticky top-0 bg-surface text-xs text-muted">
              <tr>
                <th scope="col" className="py-2 text-left font-medium">
                  {t.dashboard.cashflow.month}
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  {t.dashboard.cashflow.income}
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  {t.dashboard.cashflow.expenses}
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  {t.dashboard.cashflow.net}
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  {t.dashboard.cashflow.savingsRate}
                </th>
              </tr>
            </thead>
            <tbody className="fx-tabular">
              {points.map((point) => {
                const net = point.income - point.expenses
                return (
                  <tr
                    key={point.month}
                    className={cx(
                      'border-t border-border',
                      point.month === selectedMonth && 'bg-surface-2',
                    )}
                  >
                    <th scope="row" className="py-1.5 text-left font-medium text-fg">
                      {point.title}
                    </th>
                    <td className="py-1.5 text-right text-income">{fmt.money(point.income)}</td>
                    <td className="py-1.5 text-right text-expense">
                      {fmt.money(-point.expenses, { signed: true })}
                    </td>
                    <td className="py-1.5 text-right text-fg">
                      {fmt.money(net, { signed: true })}
                    </td>
                    <td className="py-1.5 text-right text-fg-2">
                      {point.income > 0 ? fmt.percent(net / point.income) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
