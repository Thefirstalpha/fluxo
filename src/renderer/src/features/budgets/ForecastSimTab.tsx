import { CircleAlert, GitBranch, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { AccountSummary } from '@shared/ledger/model'
import { PLANNED_PERIODICITIES, type PlannedPeriodicity } from '@shared/planning/model'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { SelectField, TextField } from '../../components/ui/Field'
import { StatTile } from '../../components/ui/StatTile'
import { useT } from '../../i18n'
import { EChart } from '../../lib/charts/EChart'
import type { EChartsCoreOption } from '../../lib/charts/echarts'
import { useFormatters } from '../../lib/format'
import { useLedgerMutation, useLedgerQuery } from '../../lib/ledger'

function parseSignedEuroToCents(raw: string): number {
  const num = Number.parseFloat(raw.replace(',', '.').replace(/\s+/g, ''))
  return Number.isFinite(num) ? Math.round(num * 100) : 0
}

export function ForecastSimTab({ accounts }: { accounts: readonly AccountSummary[] }) {
  const t = useT()
  const ft = t.planning.forecast
  const fmt = useFormatters()

  const forecastQuery = useLedgerQuery('forecastOverview', {})
  const scenariosQuery = useLedgerQuery('scenariosList', {})
  const scenarios = scenariosQuery.data ?? []

  const [selectedId, setSelectedId] = useState('')
  const [compareId, setCompareId] = useState('')
  const [variantName, setVariantName] = useState('')
  const [showTable, setShowTable] = useState(false)

  const cashAccounts = accounts.filter(
    (a) => !a.archived && (a.type === 'checking' || a.type === 'savings'),
  )
  const [itemLabel, setItemLabel] = useState('')
  const [itemAccountId, setItemAccountId] = useState(cashAccounts[0]?.id ?? '')
  const [itemAmount, setItemAmount] = useState('-50')
  const [itemPeriodicity, setItemPeriodicity] = useState<PlannedPeriodicity>('monthly')
  const [itemStart, setItemStart] = useState(() => new Date().toISOString().slice(0, 10))
  const [itemIndexation, setItemIndexation] = useState('0')

  const activeScenarioId = selectedId || scenarios[0]?.id || ''
  const detailQuery = useLedgerQuery(
    'scenarioGet',
    { id: activeScenarioId },
    { enabled: activeScenarioId.length > 0 },
  )
  const simQuery = useLedgerQuery(
    'scenarioSimulate',
    { scenarioId: activeScenarioId },
    { enabled: activeScenarioId.length > 0 },
  )
  const compareQuery = useLedgerQuery(
    'scenarioSimulate',
    { scenarioId: compareId },
    { enabled: compareId.length > 0 && compareId !== activeScenarioId },
  )

  const genBase = useLedgerMutation('scenarioGenerateBase')
  const cloneVar = useLedgerMutation('scenarioCloneVariant')
  const saveItem = useLedgerMutation('plannedItemSave')
  const deleteItem = useLedgerMutation('plannedItemDelete')

  const forecast = forecastQuery.data
  const detail = detailQuery.data
  const sim = simQuery.data
  const compareSim = compareQuery.data
  const effectiveAccId = itemAccountId || cashAccounts[0]?.id || ''

  const handleClone = () => {
    if (!activeScenarioId || !variantName.trim()) return
    cloneVar.mutate(
      { sourceScenarioId: activeScenarioId, name: variantName.trim() },
      {
        onSuccess: (res) => {
          setSelectedId(res.scenario.id)
          setCompareId(activeScenarioId)
          setVariantName('')
        },
      },
    )
  }

  const handleAddItem = (e: FormEvent) => {
    e.preventDefault()
    if (!activeScenarioId || !effectiveAccId || !itemLabel.trim()) return
    const idxNum = Number.parseFloat(itemIndexation.replace(',', '.'))
    saveItem.mutate(
      {
        scenarioId: activeScenarioId,
        accountId: effectiveAccId,
        label: itemLabel.trim(),
        categoryId: null,
        amountCents: parseSignedEuroToCents(itemAmount),
        periodicity: itemPeriodicity,
        startDate: itemStart,
        endDate: null,
        indexationMicros: Number.isFinite(idxNum) ? Math.round(idxNum * 10_000) : 0,
        enabled: true,
      },
      { onSuccess: () => setItemLabel('') },
    )
  }

  const points = sim?.points ?? []
  const comparePoints = compareSim?.points ?? []
  const option: EChartsCoreOption = {
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    grid: { left: 60, right: 20, top: 36, bottom: 28 },
    xAxis: { type: 'category', data: points.map((p) => fmt.month(p.month, 'short')) },
    yAxis: { type: 'value' },
    series: [
      {
        name: sim?.scenarioName ?? ft.scenarioLabel,
        type: 'line',
        data: points.map((p) => Math.round(p.totalBalanceCents / 100)),
      },
      ...(comparePoints.length > 0
        ? [
            {
              name: compareSim?.scenarioName ?? ft.compareLabel,
              type: 'line' as const,
              data: comparePoints.map((p) => Math.round(p.totalBalanceCents / 100)),
            },
          ]
        : []),
    ],
  }

  return (
    <div className="space-y-4">
      <Card title={ft.eomTitle}>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label={ft.checkingNow}
            value={forecast ? fmt.money(forecast.currentCheckingBalanceCents) : '—'}
          />
          <StatTile
            label={ft.projectedEnd}
            value={forecast ? fmt.money(forecast.projectedEndBalanceCents) : '—'}
          />
          <StatTile
            label={ft.disposable}
            value={forecast ? fmt.money(forecast.disposableRemainingCents) : '—'}
          />
        </div>
        {forecast?.overdraftRisk ? (
          <p
            role="status"
            className="mt-3 flex items-center gap-2 text-xs font-medium text-expense"
          >
            <CircleAlert size={14} aria-hidden />
            {ft.overdraftAlert}
          </p>
        ) : null}
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-xs font-medium text-fg-2">{ft.upcomingTitle}</p>
          {!forecast || forecast.upcomingItems.length === 0 ? (
            <p className="text-xs text-muted">{ft.noUpcoming}</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {forecast.upcomingItems.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-2">
                  <span className="text-fg">
                    {fmt.date(it.dueDate)} · {it.label}
                  </span>
                  <span className={it.amountCents >= 0 ? 'text-income' : 'text-expense'}>
                    {fmt.money(it.amountCents, { signed: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card
        title={ft.simTitle}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              disabled={genBase.isPending}
              onClick={() =>
                genBase.mutate(
                  { horizonMonths: 36 },
                  { onSuccess: (res) => setSelectedId(res.scenario.id) },
                )
              }
            >
              <RefreshCw size={14} aria-hidden />
              {ft.generateBase}
            </Button>
            {points.length > 0 ? (
              <Button onClick={() => setShowTable((v) => !v)}>
                {showTable ? ft.chartView : ft.tableView}
              </Button>
            ) : null}
          </div>
        }
      >
        {scenarios.length > 0 ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <SelectField
                label={ft.scenarioLabel}
                value={activeScenarioId}
                options={scenarios.map((s) => ({ value: s.id, label: s.name }))}
                onChange={setSelectedId}
              />
              <SelectField
                label={ft.compareLabel}
                value={compareId}
                options={[
                  { value: '', label: ft.noneOption },
                  ...scenarios
                    .filter((s) => s.id !== activeScenarioId)
                    .map((s) => ({ value: s.id, label: s.name })),
                ]}
                onChange={setCompareId}
              />
              <div className="flex items-end gap-2">
                <TextField
                  label={ft.cloneVariant}
                  value={variantName}
                  onChange={setVariantName}
                  placeholder={ft.variantPlaceholder}
                />
                <Button disabled={!variantName.trim()} onClick={handleClone}>
                  <GitBranch size={14} aria-hidden />
                  {ft.cloneVariant}
                </Button>
              </div>
            </div>

            {showTable ? (
              <div className="overflow-auto" style={{ maxHeight: '260px' }}>
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted">
                      <th className="py-2 pr-2">{ft.colMonth}</th>
                      <th className="py-2 pr-2 text-right">{ft.colTotal}</th>
                      <th className="py-2 pr-2 text-right">{ft.colInflows}</th>
                      <th className="py-2 pr-2 text-right">{ft.colOutflows}</th>
                      <th className="py-2 pr-2 text-right">{ft.colInterest}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {points.map((p) => (
                      <tr key={p.month} className="border-b border-border">
                        <td className="py-2 pr-2">{fmt.month(p.month, 'short')}</td>
                        <td className="py-2 pr-2 text-right font-medium text-fg">
                          {fmt.money(p.totalBalanceCents)}
                        </td>
                        <td className="py-2 pr-2 text-right text-income">
                          {fmt.money(p.inflowsCents)}
                        </td>
                        <td className="py-2 pr-2 text-right text-expense">
                          {fmt.money(p.outflowsCents)}
                        </td>
                        <td className="py-2 pr-2 text-right">{fmt.money(p.interestCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : points.length > 0 ? (
              <EChart option={option} height={260} ariaLabel={ft.simTitle} />
            ) : null}

            <form onSubmit={handleAddItem} className="space-y-3 border-t border-border pt-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <TextField label={ft.itemLabel} value={itemLabel} onChange={setItemLabel} />
                <SelectField
                  label={ft.itemAccount}
                  value={effectiveAccId}
                  options={cashAccounts.map((a) => ({ value: a.id, label: a.name }))}
                  onChange={setItemAccountId}
                />
                <TextField label={ft.itemAmount} value={itemAmount} onChange={setItemAmount} />
                <SelectField
                  label={ft.itemPeriodicity}
                  value={itemPeriodicity}
                  options={PLANNED_PERIODICITIES.map((p) => ({
                    value: p,
                    label: ft.itemPeriodicities[p],
                  }))}
                  onChange={setItemPeriodicity}
                />
                <TextField
                  label={ft.itemStart}
                  type="date"
                  value={itemStart}
                  onChange={setItemStart}
                />
                <TextField
                  label={ft.itemIndexation}
                  value={itemIndexation}
                  onChange={setItemIndexation}
                />
              </div>
              <Button
                type="submit"
                variant="primary"
                disabled={!itemLabel.trim() || !effectiveAccId}
              >
                <Plus size={14} aria-hidden />
                {ft.addItem}
              </Button>
            </form>

            {detail ? (
              <ul className="space-y-2 border-t border-border pt-3">
                {detail.items.length === 0 ? (
                  <p className="text-xs text-muted">{ft.emptyItems}</p>
                ) : (
                  detail.items.map((it) => (
                    <li
                      key={it.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <span className="text-fg">
                        {it.label} ({ft.itemPeriodicities[it.periodicity]})
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={it.amountCents >= 0 ? 'text-income' : 'text-expense'}>
                          {fmt.money(it.amountCents, { signed: true })}
                        </span>
                        <Button
                          aria-label={t.planning.budgets.remove}
                          onClick={() => deleteItem.mutate({ id: it.id })}
                        >
                          <Trash2 size={13} aria-hidden />
                        </Button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  )
}
