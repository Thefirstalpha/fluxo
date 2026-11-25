import { CalendarClock, Landmark, PiggyBank, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '../../components/ui/PageHeader'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useT } from '../../i18n'
import { useLedgerQuery } from '../../lib/ledger'
import { AiInsightsPanel } from '../documents/AiInsightsPanel'
import { BudgetsGoalsTab } from './BudgetsGoalsTab'
import { ForecastSimTab } from './ForecastSimTab'
import { LoansTab } from './LoansTab'
import { NetWorthTab } from './NetWorthTab'

type PlanningTab = 'budgets' | 'loans' | 'netWorth' | 'forecast'

export default function BudgetsPage() {
  const t = useT()
  const pt = t.planning
  const [tab, setTab] = useState<PlanningTab>('budgets')

  const accountsQuery = useLedgerQuery('accountsList', { includeArchived: true })
  const categoriesQuery = useLedgerQuery('categoriesList', {})
  const accounts = accountsQuery.data ?? []
  const categories = categoriesQuery.data ?? []

  return (
    <div className="space-y-5">
      <PageHeader
        title={pt.title}
        subtitle={pt.subtitle}
        actions={
          <SegmentedControl
            ariaLabel={pt.title}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'budgets', label: pt.tabs.budgets, icon: PiggyBank },
              { value: 'loans', label: pt.tabs.loans, icon: Landmark },
              { value: 'netWorth', label: pt.tabs.netWorth, icon: TrendingUp },
              { value: 'forecast', label: pt.tabs.forecast, icon: CalendarClock },
            ]}
          />
        }
      />

      {tab === 'budgets' ? <BudgetsGoalsTab categories={categories} accounts={accounts} /> : null}
      {tab === 'loans' ? <LoansTab /> : null}
      {tab === 'netWorth' ? <NetWorthTab accounts={accounts} /> : null}
      {tab === 'forecast' ? <ForecastSimTab accounts={accounts} /> : null}
      <AiInsightsPanel scope="planning" />
    </div>
  )
}
