import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Wallet,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { AnalyticsAnomaly, AnalyticsOverview } from '@shared/analytics/model'
import { UNCATEGORIZED } from '@shared/ledger/model'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { StatTile, type StatDelta } from '../../components/ui/StatTile'
import { useT } from '../../i18n'
import { capitalize, useFormatters } from '../../lib/format'
import { useAnalyticsStore } from '../../stores/analytics'
import { useSettingsStore } from '../../stores/settings'

function buildDelta(
  diff: number,
  pct: number | null,
  caption: string,
  higherIsGood: boolean,
  formatMoney: (n: number, opts?: { signed?: boolean }) => string,
): StatDelta {
  const direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'
  const tone = diff === 0 ? 'neutral' : diff > 0 === higherIsGood ? 'good' : 'bad'
  const pctStr = pct !== null ? ` (${pct > 0 ? '+' : ''}${pct} %)` : ''
  return {
    text: `${formatMoney(diff, { signed: true })}${pctStr}`,
    direction,
    tone,
    caption,
  }
}

/** Synthèse mensuelle détaillée (M5) : KPI, M-1 / N-1, faits marquants, exploration ≤ 3 clics et anomalies. */
export function MonthlySynthesisTab({
  overview,
  anomalies,
  onDrillToTransactions,
  onOpenPayslips,
}: {
  overview: AnalyticsOverview
  anomalies: readonly AnalyticsAnomaly[]
  onDrillToTransactions: (opts: { from?: string; to?: string; categoryId?: string | null }) => void
  onOpenPayslips: () => void
}) {
  const t = useT()
  const s = t.analytics.synthesis
  const fmt = useFormatters()
  const currency = useSettingsStore((state) => state.settings.currency)
  const categoryIds = useAnalyticsStore((state) => state.categoryIds)
  const setCategoryIds = useAnalyticsStore((state) => state.setCategoryIds)
  const setFocusMonth = useAnalyticsStore((state) => state.setFocusMonth)

  const syn = overview.monthlySynthesis
  const available = syn.availableMonths
  const currentIdx = available.indexOf(syn.month)
  const canPrev = currentIdx >= 0 && currentIdx < available.length - 1
  const canNext = currentIdx > 0

  const navRef = useRef({ canPrev, canNext, available, currentIdx, setFocusMonth })
  useEffect(() => {
    navRef.current = { canPrev, canNext, available, currentIdx, setFocusMonth }
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }
      const st = navRef.current
      if (event.key === 'ArrowLeft' && st.canPrev) {
        event.preventDefault()
        st.setFocusMonth(st.available[st.currentIdx + 1])
      } else if (event.key === 'ArrowRight' && st.canNext) {
        event.preventDefault()
        st.setFocusMonth(st.available[st.currentIdx - 1])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const moneyC = (amt: number, signed = false) => fmt.money(amt, { currency, signed })
  const monthStart = `${syn.month}-01`
  const monthEnd = `${syn.month}-31`

  return (
    <div className="space-y-5">
      {/* Sélecteur de mois (flèches + liste + clavier) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            iconOnly
            aria-label={s.prevMonth}
            disabled={!canPrev}
            onClick={() => canPrev && setFocusMonth(available[currentIdx + 1])}
          >
            <ChevronLeft size={16} aria-hidden />
          </Button>
          <select
            aria-label={s.monthSelector}
            value={syn.month}
            onChange={(event) => setFocusMonth(event.target.value)}
            className="h-9 rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold text-fg"
          >
            {(available.length > 0 ? available : [syn.month]).map((m) => (
              <option key={m} value={m}>
                {capitalize(fmt.month(m))}
              </option>
            ))}
          </select>
          <Button
            iconOnly
            aria-label={s.nextMonth}
            disabled={!canNext}
            onClick={() => canNext && setFocusMonth(available[currentIdx - 1])}
          >
            <ChevronRight size={16} aria-hidden />
          </Button>
        </div>

        <Button
          className="h-8 px-3 text-xs"
          onClick={() =>
            onDrillToTransactions({
              from: monthStart,
              to: monthEnd,
              categoryId: categoryIds[0] ?? null,
            })
          }
        >
          {t.analytics.filters.openInTransactions}
          <ArrowRight size={13} aria-hidden />
        </Button>
      </div>

      {/* KPIs M + comparaisons M-1 et N-1 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={s.income}
          value={moneyC(syn.income)}
          delta={
            syn.vsPrevMonth
              ? buildDelta(
                  syn.vsPrevMonth.incomeDiff,
                  null,
                  s.vsPrevMonth(fmt.month(syn.vsPrevMonth.referenceMonth, 'short')),
                  true,
                  (n, o) => moneyC(n, o?.signed),
                )
              : undefined
          }
        />
        <StatTile
          label={s.expenses}
          value={moneyC(syn.expenses)}
          delta={
            syn.vsPrevMonth
              ? buildDelta(
                  syn.vsPrevMonth.expenseDiff,
                  syn.vsPrevMonth.expensePct,
                  s.vsPrevMonth(fmt.month(syn.vsPrevMonth.referenceMonth, 'short')),
                  false,
                  (n, o) => moneyC(n, o?.signed),
                )
              : undefined
          }
        />
        <StatTile
          label={s.savings}
          value={moneyC(syn.savings)}
          delta={
            syn.vsLastYear
              ? buildDelta(
                  syn.vsLastYear.expenseDiff,
                  syn.vsLastYear.expensePct,
                  s.vsLastYear(fmt.month(syn.vsLastYear.referenceMonth, 'short')),
                  false,
                  (n, o) => moneyC(n, o?.signed),
                )
              : undefined
          }
        />
        <StatTile
          label={s.net}
          value={moneyC(syn.net, true)}
          delta={{
            text: fmt.percent(syn.savingsRate),
            direction: syn.net > 0 ? 'up' : syn.net < 0 ? 'down' : 'flat',
            tone: syn.net >= 0 ? 'good' : 'bad',
            caption: s.savingsRate,
          }}
        />
      </div>

      {/* Faits marquants & lien Salaires */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="space-y-2 p-4 lg:col-span-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
            <Sparkles size={15} aria-hidden className="text-pink" />
            {s.insightsTitle}
          </h2>
          <ul className="space-y-1.5 text-xs text-fg-2">
            {syn.insights.map((ins, i) => {
              const catLabel =
                ins.categoryName === UNCATEGORIZED
                  ? t.analytics.charts.uncategorized
                  : (ins.categoryName ?? '')
              let text: string
              if (ins.kind === 'category-increase') {
                text = s.insightMessages.increase(
                  catLabel,
                  moneyC(ins.delta ?? 0),
                  ins.percent ?? null,
                )
              } else if (ins.kind === 'category-decrease') {
                text = s.insightMessages.decrease(
                  catLabel,
                  moneyC(ins.delta ?? 0),
                  ins.percent ?? null,
                )
              } else if (ins.kind === 'top-category') {
                text = s.insightMessages.topCategory(
                  catLabel,
                  moneyC(ins.delta ?? 0),
                  ins.percent ?? 0,
                )
              } else if (ins.kind === 'savings-rate') {
                text = s.insightMessages.savingsRate(ins.rate ?? 0)
              } else {
                text = s.insightMessages.noData
              }
              return <li key={i}>{text}</li>
            })}
          </ul>
        </Card>

        <Card className="flex flex-col justify-between gap-2 p-4">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
              <Wallet size={15} aria-hidden className="text-teal" />
              {s.payslipTitle}
            </h2>
            <p className="mt-1.5 text-xs text-fg-2">
              {syn.payslipSummary
                ? s.payslipValue(syn.payslipSummary.count, moneyC(syn.payslipSummary.totalIncome))
                : s.noItems}
            </p>
          </div>
          <Button className="h-8 self-start px-3 text-xs" onClick={onOpenPayslips}>
            {s.payslipAction}
          </Button>
        </Card>
      </div>

      {/* Exploration par catégorie + Top commerçants */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-fg">{s.categoriesTitle}</h2>
            {categoryIds.length > 0 ? (
              <Button className="h-7 px-2 text-xs" onClick={() => setCategoryIds([])}>
                <ArrowLeft size={12} aria-hidden />
                {t.analytics.filters.clearCategory}
              </Button>
            ) : null}
          </div>
          {syn.topCategories.length === 0 ? (
            <p className="text-xs text-muted">{s.noItems}</p>
          ) : (
            <ul className="space-y-2">
              {syn.topCategories.map((cat) => {
                const label =
                  cat.name === UNCATEGORIZED ? t.analytics.charts.uncategorized : cat.name
                return (
                  <li key={cat.categoryId ?? 'none'} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          if (!cat.categoryId) {
                            onDrillToTransactions({
                              from: monthStart,
                              to: monthEnd,
                              categoryId: UNCATEGORIZED,
                            })
                            return
                          }
                          if (categoryIds[0] === cat.categoryId) {
                            onDrillToTransactions({
                              from: monthStart,
                              to: monthEnd,
                              categoryId: cat.categoryId,
                            })
                          } else {
                            setCategoryIds([cat.categoryId])
                          }
                        }}
                        className="text-left font-medium text-fg hover:text-pink"
                      >
                        {label}
                      </button>
                      <div className="flex items-center gap-2 tabular-nums">
                        <span className="text-muted">{fmt.percent(cat.share)}</span>
                        <span className="font-semibold text-fg">{moneyC(cat.amount)}</span>
                        <Button
                          variant="ghost"
                          className="h-6 px-1.5 text-[11px]"
                          onClick={() =>
                            onDrillToTransactions({
                              from: monthStart,
                              to: monthEnd,
                              categoryId: cat.categoryId ?? UNCATEGORIZED,
                            })
                          }
                        >
                          {s.inspectTransactions}
                        </Button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-semibold text-fg">{s.merchantsTitle}</h2>
          {syn.topMerchants.length === 0 ? (
            <p className="text-xs text-muted">{s.noItems}</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {syn.topMerchants.map((m) => (
                <li key={m.name} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-fg-2">
                    {m.name} <span className="text-muted">({m.transactionCount})</span>
                  </span>
                  <span className="font-semibold text-fg tabular-nums">{moneyC(m.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Plus grosses dépenses + Prélèvements récurrents */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-semibold text-fg">{s.largestTitle}</h2>
          {syn.largestExpenses.length === 0 ? (
            <p className="text-xs text-muted">{s.noItems}</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {syn.largestExpenses.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-fg-2">
                    {fmt.date(tx.bookingDate)} · {tx.label}
                    {tx.categoryName ? ` · ${tx.categoryName}` : ''}
                  </span>
                  <span className="font-semibold text-fg tabular-nums">
                    {fmt.money(tx.amount, { currency: tx.currency })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-semibold text-fg">{s.recurringTitle}</h2>
          {syn.recurringInMonth.length === 0 ? (
            <p className="text-xs text-muted">{s.noItems}</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {syn.recurringInMonth.map((rec) => (
                <li key={rec.merchant} className="flex items-center justify-between gap-2">
                  <span className="text-fg-2">{rec.merchant}</span>
                  <span className="font-semibold text-fg tabular-nums">{moneyC(rec.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Anomalies détectées (F12) */}
      <Card className="space-y-3 p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
          <AlertTriangle size={15} aria-hidden className="text-expense" />
          {s.anomaliesTitle}
        </h2>
        {anomalies.length === 0 ? (
          <p className="text-xs text-muted">{s.anomaliesEmpty}</p>
        ) : (
          <ul className="space-y-2 text-xs">
            {anomalies.map((anom) => (
              <li
                key={anom.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-fg">{anom.title}</span>
                    <Badge>{anom.accountName}</Badge>
                    <span className="text-muted tabular-nums">{fmt.date(anom.date)}</span>
                  </div>
                  <p className="text-fg-2">
                    {anom.kind === 'unusual-expense'
                      ? s.anomalyKinds['unusual-expense'](
                          anom.ratio ?? 3,
                          fmt.money(anom.referenceAmount ?? 0, { currency: anom.currency }),
                        )
                      : anom.kind === 'duplicate-charge'
                        ? s.anomalyKinds['duplicate-charge']
                        : s.anomalyKinds['bank-fees'](anom.count ?? 1)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-expense tabular-nums">
                    {fmt.money(anom.amount, { currency: anom.currency })}
                  </span>
                  <Button
                    className="h-7 px-2 text-xs"
                    onClick={() => onDrillToTransactions({ from: anom.date, to: anom.date })}
                  >
                    {s.inspectTransactions}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
