import { useState } from 'react'
import { PageHeader } from '../../components/ui/PageHeader'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useT } from '../../i18n'
import { useLedgerQuery } from '../../lib/ledger'
import { useSettingsStore } from '../../stores/settings'
import { RulesTab } from './RulesTab'
import { SubscriptionsTab } from './SubscriptionsTab'
import { ValidationQueueTab } from './ValidationQueueTab'

type Tab = 'queue' | 'rules' | 'subscriptions'

/** Centre de catégorisation (M4) : file À valider, règles personnalisées, abonnements et virements. */
export default function CategorizationPage() {
  const t = useT()
  const c = t.categorization
  const currency = useSettingsStore((state) => state.settings.currency)

  const [tab, setTab] = useState<Tab>('queue')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const accounts = useLedgerQuery('accountsList', { includeArchived: true })
  const categories = useLedgerQuery('categoriesList', { includeArchived: true })
  const tags = useLedgerQuery('tagsList', {})
  const queue = useLedgerQuery('categorizationQueueList', { limit: 100 })
  const rules = useLedgerQuery('rulesList', {})
  const subscriptions = useLedgerQuery('subscriptionsOverview', { currency })
  const transferCandidates = useLedgerQuery('transferCandidatesList', {})

  const alertCount =
    (subscriptions.data?.priceIncreaseCount ?? 0) + (transferCandidates.data?.length ?? 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title={c.title}
        subtitle={c.subtitle}
        actions={
          <SegmentedControl
            ariaLabel={c.tabs.aria}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'queue', label: c.tabs.queue(queue.data?.length ?? 0) },
              { value: 'rules', label: c.tabs.rules(rules.data?.length ?? 0) },
              { value: 'subscriptions', label: c.tabs.subscriptions(alertCount) },
            ]}
          />
        }
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

      {tab === 'queue' ? (
        <ValidationQueueTab
          categories={categories.data ?? []}
          tags={tags.data ?? []}
          onNotice={(msg) => {
            setError(null)
            setNotice(msg)
          }}
          onError={setError}
        />
      ) : tab === 'rules' ? (
        <RulesTab
          accounts={accounts.data ?? []}
          categories={categories.data ?? []}
          tags={tags.data ?? []}
          onNotice={(msg) => {
            setError(null)
            setNotice(msg)
          }}
          onError={setError}
        />
      ) : (
        <SubscriptionsTab />
      )}
    </div>
  )
}
