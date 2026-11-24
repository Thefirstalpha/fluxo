import { useState } from 'react'
import { useLocation } from 'wouter'
import { UNCATEGORIZED } from '@shared/ledger/model'
import { Card } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/PageHeader'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useT } from '../../i18n'
import { useLedgerQuery } from '../../lib/ledger'
import { buildAnalyticsQueryFilter, useAnalyticsStore } from '../../stores/analytics'
import { useRegisterStore } from '../../stores/register'
import { useSettingsStore } from '../../stores/settings'
import { AnalyticsChartsTab } from './AnalyticsChartsTab'
import { AnalyticsFilterBar } from './AnalyticsFilterBar'
import { MonthlySynthesisTab } from './MonthlySynthesisTab'

type Tab = 'synthesis' | 'charts'

/** Page Analyses & Synthèses (M5) : filtres globaux partagés, synthèse mensuelle et graphiques interactifs. */
export default function AnalyticsPage() {
  const t = useT()
  const a = t.analytics
  const [, navigate] = useLocation()
  const currency = useSettingsStore((state) => state.settings.currency)
  const openRegister = useRegisterStore((state) => state.openRegister)
  const analyticsState = useAnalyticsStore()

  const [tab, setTab] = useState<Tab>('synthesis')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filter = buildAnalyticsQueryFilter(analyticsState, currency)

  const accounts = useLedgerQuery('accountsList', { includeArchived: true })
  const categories = useLedgerQuery('categoriesList', { includeArchived: true })
  const tags = useLedgerQuery('tagsList', {})
  const overviewQuery = useLedgerQuery('analyticsOverview', filter, {
    placeholderData: (prev) => prev,
  })
  const anomaliesQuery = useLedgerQuery('analyticsAnomalies', filter, {
    placeholderData: (prev) => prev,
  })

  const overview = overviewQuery.data

  const drillToTransactions = (opts: {
    from?: string
    to?: string
    categoryId?: string | null
  }) => {
    const targetCategory = opts.categoryId ?? analyticsState.categoryIds[0]
    openRegister({
      ...(opts.from || analyticsState.from ? { from: opts.from ?? analyticsState.from } : {}),
      ...(opts.to || analyticsState.to ? { to: opts.to ?? analyticsState.to } : {}),
      ...(analyticsState.accountIds.length > 0 ? { accountIds: analyticsState.accountIds } : {}),
      ...(targetCategory
        ? { categoryIds: [targetCategory === '__none__' ? UNCATEGORIZED : targetCategory] }
        : analyticsState.categoryIds.length > 0
          ? { categoryIds: analyticsState.categoryIds }
          : {}),
      ...(analyticsState.tagIds.length > 0 ? { tagIds: analyticsState.tagIds } : {}),
      ...(analyticsState.minAmount !== undefined ? { minAmount: analyticsState.minAmount } : {}),
      ...(analyticsState.maxAmount !== undefined ? { maxAmount: analyticsState.maxAmount } : {}),
    })
    navigate('/transactions')
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={a.title}
        subtitle={a.subtitle}
        actions={
          <SegmentedControl
            ariaLabel={a.tabs.aria}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'synthesis', label: a.tabs.synthesis },
              { value: 'charts', label: a.tabs.charts },
            ]}
          />
        }
      />

      <AnalyticsFilterBar
        accounts={accounts.data ?? []}
        categories={categories.data ?? []}
        tags={tags.data ?? []}
        onNotice={(msg) => {
          setError(null)
          setNotice(msg)
        }}
        onError={setError}
        onOpenRegister={() => drillToTransactions({})}
      />

      {notice ? (
        <p role="status" className="fx-frame px-3.5 py-2 text-xs font-medium text-fg">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs font-medium text-expense">
          {error}
        </p>
      ) : null}
      {overview && overview.otherCurrencies.length > 0 ? (
        <p
          role="status"
          className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-fg-2"
        >
          {a.multiCurrencyWarning(overview.otherCurrencies.join(', '))}
        </p>
      ) : null}

      {overviewQuery.isPending || !overview ? (
        <Card>
          <p className="text-sm text-muted">{t.common.loading}</p>
        </Card>
      ) : !overview.hasTransactions ? (
        <Card className="space-y-1 p-6 text-center">
          <p className="text-sm font-medium text-fg">{a.empty.title}</p>
          <p className="text-xs text-muted">{a.empty.hint}</p>
        </Card>
      ) : (
        <div
          className={
            overviewQuery.isFetching ? 'opacity-65 transition-opacity' : 'transition-opacity'
          }
        >
          {tab === 'synthesis' ? (
            <MonthlySynthesisTab
              overview={overview}
              anomalies={anomaliesQuery.data ?? []}
              onDrillToTransactions={drillToTransactions}
              onOpenPayslips={() => navigate('/payslips')}
            />
          ) : (
            <AnalyticsChartsTab
              overview={overview}
              categories={categories.data ?? []}
              onDrillToTransactions={drillToTransactions}
              onNotice={(msg) => {
                setError(null)
                setNotice(msg)
              }}
              onError={setError}
            />
          )}
        </div>
      )}
    </div>
  )
}
