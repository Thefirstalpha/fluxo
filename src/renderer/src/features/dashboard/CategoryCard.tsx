import { ChartColumn, Table2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EXPENSE_CATEGORY_IDS } from '@shared/categories'
import type { MonthlySummary } from '@shared/demo/demo-data'
import { ratio } from '@shared/money'
import { Card } from '../../components/ui/Card'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useT } from '../../i18n'
import { EChart } from '../../lib/charts/EChart'
import { useChartTheme } from '../../lib/charts/chart-theme'
import { capitalize, useFormatters } from '../../lib/format'
import { useReducedMotion } from '../../lib/theme'
import { buildCategoryOption, type CategoryPoint } from './category-option'
import { relativeChange } from './demo-months'

type View = 'chart' | 'table'

export function CategoryCard({
  current,
  previous,
}: {
  current: MonthlySummary
  previous: MonthlySummary | undefined
}) {
  const t = useT()
  const fmt = useFormatters()
  const theme = useChartTheme()
  const reducedMotion = useReducedMotion()
  const [view, setView] = useState<View>('chart')
  const monthTitle = capitalize(fmt.month(current.month))

  const points = useMemo<CategoryPoint[]>(
    () =>
      EXPENSE_CATEGORY_IDS.map((id) => ({
        id,
        label: t.categories[id],
        amount: current.byCategory[id],
        share: ratio(current.byCategory[id], current.expenses),
        change: relativeChange(current.byCategory[id], previous?.byCategory[id]),
      })).sort((a, b) => b.amount - a.amount),
    [current, previous, t],
  )

  const option = useMemo(
    () =>
      buildCategoryOption({
        points,
        monthTitle,
        theme,
        money: (amount) => fmt.money(amount),
        percent: (value, options) => fmt.percent(value, options),
        labels: {
          ofTotal: t.dashboard.categories.ofTotal,
          vsPrevious: t.dashboard.categories.vsPrevious,
        },
        animate: !reducedMotion,
      }),
    [points, monthTitle, theme, fmt, t, reducedMotion],
  )

  return (
    <Card
      accent
      title={t.dashboard.categories.title}
      subtitle={t.dashboard.categories.subtitle(monthTitle)}
      actions={
        <SegmentedControl<View>
          ariaLabel={t.dashboard.categories.title}
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
        <EChart option={option} height={300} ariaLabel={t.dashboard.categories.aria(monthTitle)} />
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">{t.dashboard.categories.title}</caption>
          <thead className="text-xs text-muted">
            <tr>
              <th scope="col" className="py-2 text-left font-medium">
                {t.dashboard.categories.category}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                {t.dashboard.categories.amount}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                {t.dashboard.categories.share}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                {t.dashboard.categories.change}
              </th>
            </tr>
          </thead>
          <tbody className="fx-tabular">
            {points.map((point) => (
              <tr key={point.id} className="border-t border-border">
                <th scope="row" className="py-1.5 text-left font-medium text-fg">
                  {point.label}
                </th>
                <td className="py-1.5 text-right text-fg">{fmt.money(point.amount)}</td>
                <td className="py-1.5 text-right text-fg-2">
                  {point.share === null ? '—' : fmt.percent(point.share)}
                </td>
                <td className="py-1.5 text-right text-fg-2">
                  {point.change === null ? '—' : fmt.percent(point.change, { signed: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}
