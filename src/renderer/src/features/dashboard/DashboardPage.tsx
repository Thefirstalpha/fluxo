import { ChevronLeft, ChevronRight, Info, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { MonthlySummary } from '@shared/demo/demo-data'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { StatTile, type StatDelta } from '../../components/ui/StatTile'
import { useT } from '../../i18n'
import { capitalize, useFormatters, type Formatters } from '../../lib/format'
import { useSettingsStore } from '../../stores/settings'
import { CashflowCard } from './CashflowCard'
import { CategoryCard } from './CategoryCard'
import { getDemoMonths, relativeChange } from './demo-months'
import { PayslipCard } from './PayslipCard'

const PERIODS = [6, 12, 18] as const
type Period = (typeof PERIODS)[number]

function direction(value: number): StatDelta['direction'] {
  if (value > 0) return 'up'
  if (value < 0) return 'down'
  return 'flat'
}

/** Ton d'une variation : `upIsGood` = une hausse est une bonne nouvelle (revenus, épargne). */
function tone(value: number, upIsGood: boolean): StatDelta['tone'] {
  if (value === 0) return 'neutral'
  return value > 0 === upIsGood ? 'good' : 'bad'
}

function percentDelta(
  current: number,
  previous: number | undefined,
  upIsGood: boolean,
  caption: string,
  fmt: Formatters,
): StatDelta | undefined {
  const change = relativeChange(current, previous)
  if (change === null) return undefined
  return {
    text: fmt.percent(change, { signed: true }),
    direction: direction(change),
    tone: tone(change, upIsGood),
    caption,
  }
}

function savingsRate(month: MonthlySummary): number | null {
  return month.income > 0 ? (month.income - month.expenses) / month.income : null
}

export default function DashboardPage() {
  const t = useT()
  const fmt = useFormatters()
  const locale = useSettingsStore((state) => state.settings.locale)
  const months = getDemoMonths()
  const [period, setPeriod] = useState<Period>(12)
  const [selectedMonth, setSelectedMonth] = useState(() => months[months.length - 1]?.month ?? '')

  const visible = useMemo(() => months.slice(-period), [months, period])
  const index = months.findIndex((month) => month.month === selectedMonth)
  const current = months[index] ?? months[months.length - 1]
  if (!current) return null
  const previous = index > 0 ? months[index - 1] : undefined
  const visibleIndex = visible.findIndex((month) => month.month === current.month)
  const monthTitle = capitalize(fmt.month(current.month))
  const caption = previous ? t.dashboard.kpi.vs(fmt.month(previous.month, 'short')) : ''

  const changePeriod = (next: Period): void => {
    setPeriod(next)
    const window = months.slice(-next)
    if (!window.some((month) => month.month === selectedMonth)) {
      setSelectedMonth(window[window.length - 1]?.month ?? selectedMonth)
    }
  }
  const step = (delta: number): void => {
    const target = visible[visibleIndex + delta]
    if (target) setSelectedMonth(target.month)
  }

  const net = current.income - current.expenses
  const previousNet = previous ? previous.income - previous.expenses : undefined
  const rate = savingsRate(current)
  const previousRate = previous ? savingsRate(previous) : null
  const ratePoints = rate !== null && previousRate !== null ? (rate - previousRate) * 100 : null
  const pointsFormat = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  })

  return (
    <>
      <PageHeader
        title={t.dashboard.title}
        subtitle={t.dashboard.subtitle(monthTitle)}
        actions={
          <Badge tone="accent">
            <Sparkles size={12} aria-hidden />
            {t.common.demo}
          </Badge>
        }
      />

      <p
        role="note"
        className="mb-5 flex items-start gap-2.5 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg-2"
      >
        <Info size={16} aria-hidden className="mt-0.5 shrink-0 text-teal" />
        {t.dashboard.demoNotice}
      </p>

      {/* Filtres : une seule rangée, au-dessus de tout ce qu'ils pilotent. */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <SegmentedControl<Period>
          ariaLabel={t.dashboard.period}
          value={period}
          onChange={changePeriod}
          options={PERIODS.map((count) => ({
            value: count,
            label: t.dashboard.periodMonths(count),
          }))}
        />
        <div
          role="group"
          aria-label={t.dashboard.focusMonth}
          className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-0.5"
        >
          <Button
            variant="ghost"
            iconOnly
            className="h-7 w-7"
            aria-label={t.common.previous}
            disabled={visibleIndex <= 0}
            onClick={() => step(-1)}
          >
            <ChevronLeft size={16} aria-hidden />
          </Button>
          <span aria-live="polite" className="min-w-36 text-center text-xs font-semibold text-fg">
            {monthTitle}
          </span>
          <Button
            variant="ghost"
            iconOnly
            className="h-7 w-7"
            aria-label={t.common.next}
            disabled={visibleIndex >= visible.length - 1}
            onClick={() => step(1)}
          >
            <ChevronRight size={16} aria-hidden />
          </Button>
        </div>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={t.dashboard.kpi.income}
          value={fmt.money(current.income)}
          delta={percentDelta(current.income, previous?.income, true, caption, fmt)}
        />
        <StatTile
          label={t.dashboard.kpi.expenses}
          value={fmt.money(current.expenses)}
          delta={percentDelta(current.expenses, previous?.expenses, false, caption, fmt)}
        />
        <StatTile
          label={t.dashboard.kpi.savings}
          value={fmt.money(net, { signed: true })}
          delta={
            previousNet === undefined
              ? undefined
              : {
                  text: fmt.money(net - previousNet, { signed: true }),
                  direction: direction(net - previousNet),
                  tone: tone(net - previousNet, true),
                  caption,
                }
          }
        />
        <StatTile
          label={t.dashboard.kpi.savingsRate}
          value={rate === null ? '—' : fmt.percent(rate)}
          delta={
            ratePoints === null
              ? undefined
              : {
                  text: t.dashboard.kpi.points(pointsFormat.format(ratePoints)),
                  direction: direction(ratePoints),
                  tone: tone(ratePoints, true),
                  caption,
                }
          }
        />
      </div>

      <div className="grid gap-4">
        <CashflowCard
          months={visible}
          selectedMonth={current.month}
          onSelectMonth={setSelectedMonth}
        />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <CategoryCard current={current} previous={previous} />
          <PayslipCard payslip={current.payslip} />
        </div>
      </div>
    </>
  )
}
