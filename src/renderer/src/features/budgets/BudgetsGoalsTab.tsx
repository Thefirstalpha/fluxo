import { CircleAlert, CircleCheck, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { AccountSummary, CategorySummary } from '@shared/ledger/model'
import type { BudgetMode } from '@shared/planning/model'
import { BUDGET_MODES } from '@shared/planning/model'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { SelectField, TextField } from '../../components/ui/Field'
import { Switch } from '../../components/ui/Switch'
import { useT } from '../../i18n'
import { useFormatters } from '../../lib/format'
import { useLedgerMutation, useLedgerQuery } from '../../lib/ledger'

function parseEuroToCents(raw: string): number {
  const num = Number.parseFloat(raw.replace(',', '.').replace(/\s+/g, ''))
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) : 0
}

export function BudgetsGoalsTab({
  categories,
  accounts,
}: {
  categories: readonly CategorySummary[]
  accounts: readonly AccountSummary[]
}) {
  const t = useT()
  const pt = t.planning
  const bt = pt.budgets
  const gt = pt.goals
  const fmt = useFormatters()

  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [tableView, setTableView] = useState(false)

  const expenseCategories = categories.filter((c) => !c.archived && c.kind === 'expense')
  const [categoryId, setCategoryId] = useState(expenseCategories[0]?.id ?? '')
  const [mode, setMode] = useState<BudgetMode>('fixed')
  const [amountInput, setAmountInput] = useState('450')
  const [percentInput, setPercentInput] = useState('15')
  const [rollover, setRollover] = useState(false)

  const [goalName, setGoalName] = useState('')
  const [goalTarget, setGoalTarget] = useState('1500')
  const [goalDate, setGoalDate] = useState('')
  const [goalAccountId, setGoalAccountId] = useState('')

  const budgetsQuery = useLedgerQuery('budgetsList', { month })
  const goalsQuery = useLedgerQuery('goalsList', {})
  const saveBudget = useLedgerMutation('budgetSave')
  const deleteBudget = useLedgerMutation('budgetDelete')
  const saveGoal = useLedgerMutation('goalSave')
  const deleteGoal = useLedgerMutation('goalDelete')

  const budgets = budgetsQuery.data ?? []
  const goals = goalsQuery.data ?? []
  const effectiveCategoryId = categoryId || expenseCategories[0]?.id || ''

  const handleSaveBudget = (e: FormEvent) => {
    e.preventDefault()
    if (!effectiveCategoryId) return
    const pctNum = Number.parseFloat(percentInput.replace(',', '.'))
    saveBudget.mutate({
      categoryId: effectiveCategoryId,
      mode,
      amountCents: mode === 'fixed' ? parseEuroToCents(amountInput) : 0,
      percentMicros:
        mode === 'income_percent' && Number.isFinite(pctNum)
          ? Math.max(0, Math.min(1_000_000, Math.round(pctNum * 10_000)))
          : null,
      rollover,
      alert80: true,
      alert100: true,
      archived: false,
    })
  }

  const handleSaveGoal = (e: FormEvent) => {
    e.preventDefault()
    const targetCents = parseEuroToCents(goalTarget)
    if (!goalName.trim() || targetCents <= 0) return
    saveGoal.mutate(
      {
        name: goalName.trim(),
        targetCents,
        targetDate: goalDate || null,
        accountId: goalAccountId || null,
        archived: false,
      },
      {
        onSuccess: () => {
          setGoalName('')
        },
      },
    )
  }

  return (
    <div className="space-y-4">
      <Card
        title={pt.tabs.budgets}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TextField label={bt.monthLabel} type="month" value={month} onChange={setMonth} />
            <Button onClick={() => setTableView((v) => !v)}>{bt.tableView}</Button>
          </div>
        }
      >
        <form onSubmit={handleSaveBudget} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectField
              label={bt.categoryLabel}
              value={effectiveCategoryId}
              options={expenseCategories.map((c) => ({ value: c.id, label: c.name }))}
              onChange={setCategoryId}
            />
            <SelectField
              label={bt.modeLabel}
              value={mode}
              options={BUDGET_MODES.map((m) => ({ value: m, label: bt.modes[m] }))}
              onChange={setMode}
            />
            {mode === 'fixed' ? (
              <TextField label={bt.amountLabel} value={amountInput} onChange={setAmountInput} />
            ) : mode === 'income_percent' ? (
              <TextField label={bt.percentLabel} value={percentInput} onChange={setPercentInput} />
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Switch checked={rollover} label={bt.rolloverLabel} onChange={setRollover} />
            <Button
              type="submit"
              variant="primary"
              disabled={!effectiveCategoryId || saveBudget.isPending}
            >
              <Plus size={14} aria-hidden />
              {bt.saveBudget}
            </Button>
          </div>
        </form>

        <div className="mt-4 space-y-2 border-t border-border pt-3">
          {budgets.length === 0 ? (
            <p className="text-sm text-muted">{bt.empty}</p>
          ) : tableView ? (
            <div className="overflow-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted">
                    <th className="py-2 pr-2">{bt.categoryLabel}</th>
                    <th className="py-2 pr-2 text-right">{bt.amountLabel}</th>
                    <th className="py-2 pr-2 text-right">{fmt.month(month, 'short')}</th>
                    <th className="py-2 pr-2">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {budgets.map((b) => (
                    <tr key={b.id} className="border-b border-border">
                      <td className="py-2 pr-2 font-medium text-fg">{b.categoryName}</td>
                      <td className="py-2 pr-2 text-right">{fmt.money(b.effectiveLimitCents)}</td>
                      <td className="py-2 pr-2 text-right">{fmt.money(b.spentCents)}</td>
                      <td className="py-2 pr-2">
                        {b.alertLevel === 'exceeded_100'
                          ? bt.statusOver100
                          : b.alertLevel === 'warning_80'
                            ? bt.statusWarn80
                            : bt.statusOk}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            budgets.map((b) => {
              const pct = Math.min(100, Math.round(b.ratioMicros / 10_000))
              const barColor =
                b.alertLevel === 'exceeded_100'
                  ? 'var(--fx-expense)'
                  : b.alertLevel === 'warning_80'
                    ? 'var(--fx-amber)'
                    : 'var(--fx-income)'
              return (
                <div key={b.id} className="rounded-lg border border-border bg-surface-2 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {b.alertLevel === 'ok' ? (
                        <CircleCheck size={14} className="text-income" aria-hidden />
                      ) : (
                        <CircleAlert size={14} className="text-expense" aria-hidden />
                      )}
                      <span className="text-sm font-medium text-fg">{b.categoryName}</span>
                      <Badge tone={b.alertLevel === 'ok' ? 'neutral' : 'accent'}>
                        {b.alertLevel === 'exceeded_100'
                          ? bt.statusOver100
                          : b.alertLevel === 'warning_80'
                            ? bt.statusWarn80
                            : bt.statusOk}
                      </Badge>
                      {b.rolloverCents !== 0 ? (
                        <Badge>
                          {bt.rolloverTag(fmt.money(b.rolloverCents, { signed: true }))}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-fg-2">
                      <span>
                        {bt.spentOf(fmt.money(b.spentCents), fmt.money(b.effectiveLimitCents))}
                      </span>
                      <Button
                        aria-label={bt.remove}
                        onClick={() => deleteBudget.mutate({ id: b.id })}
                      >
                        <Trash2 size={13} aria-hidden />
                      </Button>
                    </div>
                  </div>
                  <div
                    className="mt-2 w-full overflow-hidden rounded-full bg-surface"
                    style={{ height: '6px' }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '6px',
                        backgroundColor: barColor,
                      }}
                    />
                  </div>
                </div>
              )
            })
          )}
        </div>
      </Card>

      <Card title={gt.title}>
        <form onSubmit={handleSaveGoal} className="grid gap-3 sm:grid-cols-2">
          <TextField
            label={gt.nameLabel}
            value={goalName}
            onChange={setGoalName}
            placeholder="Vacances"
          />
          <TextField label={gt.targetLabel} value={goalTarget} onChange={setGoalTarget} />
          <TextField
            label={gt.targetDateLabel}
            type="date"
            value={goalDate}
            onChange={setGoalDate}
          />
          <SelectField
            label={gt.accountLabel}
            value={goalAccountId}
            options={[
              { value: '', label: gt.allSavingsOption },
              ...accounts
                .filter((a) => !a.archived && (a.type === 'savings' || a.type === 'investment'))
                .map((a) => ({ value: a.id, label: a.name })),
            ]}
            onChange={setGoalAccountId}
          />
          <div>
            <Button
              type="submit"
              variant="primary"
              disabled={!goalName.trim() || saveGoal.isPending}
            >
              <Plus size={14} aria-hidden />
              {gt.saveGoal}
            </Button>
          </div>
        </form>

        <div className="mt-4 space-y-2 border-t border-border pt-3">
          {goals.length === 0 ? (
            <p className="text-sm text-muted">{gt.empty}</p>
          ) : (
            goals.map((g) => {
              const pct = Math.min(100, Math.round(g.progressMicros / 10_000))
              return (
                <div key={g.id} className="rounded-lg border border-border bg-surface-2 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-fg">{g.name}</p>
                      <p className="text-xs text-muted">
                        {g.currentCents >= g.targetCents
                          ? gt.reached
                          : g.projectedDate
                            ? gt.etaProjected(fmt.date(g.projectedDate))
                            : gt.etaUnknown}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-fg-2">
                      <span>
                        {fmt.money(g.currentCents, { currency: g.currency })} /{' '}
                        {fmt.money(g.targetCents, { currency: g.currency })}
                      </span>
                      <Button
                        aria-label={bt.remove}
                        onClick={() => deleteGoal.mutate({ id: g.id })}
                      >
                        <Trash2 size={13} aria-hidden />
                      </Button>
                    </div>
                  </div>
                  <div
                    className="mt-2 w-full overflow-hidden rounded-full bg-surface"
                    style={{ height: '6px' }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '6px',
                        backgroundColor: 'var(--fx-income)',
                      }}
                    />
                  </div>
                </div>
              )
            })
          )}
        </div>
      </Card>
    </div>
  )
}
