import { Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { AccountSummary } from '@shared/ledger/model'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { SelectField, TextField } from '../../components/ui/Field'
import { StatTile } from '../../components/ui/StatTile'
import { useT } from '../../i18n'
import { EChart } from '../../lib/charts/EChart'
import type { EChartsCoreOption } from '../../lib/charts/echarts'
import { useFormatters } from '../../lib/format'
import { useLedgerMutation, useLedgerQuery } from '../../lib/ledger'

function parseEuroToCents(raw: string): number {
  const num = Number.parseFloat(raw.replace(',', '.').replace(/\s+/g, ''))
  return Number.isFinite(num) ? Math.round(num * 100) : 0
}

export function NetWorthTab({ accounts }: { accounts: readonly AccountSummary[] }) {
  const t = useT()
  const nt = t.planning.netWorth
  const fmt = useFormatters()

  const [showTable, setShowTable] = useState(false)
  const overviewQuery = useLedgerQuery('netWorthOverview', {})
  const addValuation = useLedgerMutation('valuationAdd')

  const valuationAccounts = accounts.filter(
    (a) => !a.archived && a.trackingMode === 'valuation' && a.type !== 'loan',
  )
  const [accountId, setAccountId] = useState(valuationAccounts[0]?.id ?? '')
  const [valDate, setValDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [valAmount, setValAmount] = useState('')
  const [valNote, setValNote] = useState('')

  const effectiveAccId = accountId || valuationAccounts[0]?.id || ''
  const overview = overviewQuery.data

  const handleAddValuation = (e: FormEvent) => {
    e.preventDefault()
    if (!effectiveAccId || !valAmount.trim()) return
    addValuation.mutate(
      {
        accountId: effectiveAccId,
        valuationDate: valDate,
        valueCents: parseEuroToCents(valAmount),
        note: valNote.trim() || null,
      },
      {
        onSuccess: () => {
          setValAmount('')
          setValNote('')
        },
      },
    )
  }

  const history = overview?.history ?? []
  const option: EChartsCoreOption = {
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    grid: { left: 56, right: 20, top: 36, bottom: 28 },
    xAxis: {
      type: 'category',
      data: history.map((p) => fmt.month(p.month, 'short')),
    },
    yAxis: { type: 'value' },
    series: [
      {
        name: nt.assetsTotal,
        type: 'line',
        data: history.map((p) => Math.round(p.assetsCents / 100)),
      },
      {
        name: nt.liabilitiesTotal,
        type: 'line',
        data: history.map((p) => Math.round(p.liabilitiesCents / 100)),
      },
      {
        name: nt.netWorthTotal,
        type: 'bar',
        data: history.map((p) => Math.round(p.netWorthCents / 100)),
      },
    ],
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label={nt.assetsTotal}
          value={
            overview ? fmt.money(overview.totalAssetsCents, { currency: overview.currency }) : '—'
          }
        />
        <StatTile
          label={nt.liabilitiesTotal}
          value={
            overview
              ? fmt.money(overview.totalLiabilitiesCents, { currency: overview.currency })
              : '—'
          }
        />
        <StatTile
          label={nt.netWorthTotal}
          value={
            overview ? fmt.money(overview.netWorthCents, { currency: overview.currency }) : '—'
          }
        />
      </div>

      <Card
        title={nt.chartTitle}
        actions={
          <Button onClick={() => setShowTable((v) => !v)}>
            {showTable ? nt.chartToggle : nt.tableToggle}
          </Button>
        }
      >
        {showTable ? (
          <div className="overflow-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="py-2 pr-2">Mois</th>
                  <th className="py-2 pr-2 text-right">{nt.assetsTotal}</th>
                  <th className="py-2 pr-2 text-right">{nt.liabilitiesTotal}</th>
                  <th className="py-2 pr-2 text-right">{nt.netWorthTotal}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((p) => (
                  <tr key={p.month} className="border-b border-border">
                    <td className="py-2 pr-2">{fmt.month(p.month, 'short')}</td>
                    <td className="py-2 pr-2 text-right">{fmt.money(p.assetsCents)}</td>
                    <td className="py-2 pr-2 text-right">{fmt.money(p.liabilitiesCents)}</td>
                    <td className="py-2 pr-2 text-right font-medium text-fg">
                      {fmt.money(p.netWorthCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EChart option={option} height={240} ariaLabel={nt.chartTitle} />
        )}
      </Card>

      <Card title={nt.valuationsTitle}>
        {valuationAccounts.length === 0 ? (
          <p className="text-sm text-muted">{nt.noValuationAccounts}</p>
        ) : (
          <form onSubmit={handleAddValuation} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label={nt.accountLabel}
                value={effectiveAccId}
                options={valuationAccounts.map((a) => ({ value: a.id, label: a.name }))}
                onChange={setAccountId}
              />
              <TextField label={nt.dateLabel} type="date" value={valDate} onChange={setValDate} />
              <TextField label={nt.valueLabel} value={valAmount} onChange={setValAmount} />
              <TextField label={nt.noteLabel} value={valNote} onChange={setValNote} />
            </div>
            <Button
              type="submit"
              variant="primary"
              disabled={!valAmount.trim() || addValuation.isPending}
            >
              <Plus size={14} aria-hidden />
              {nt.saveValuation}
            </Button>
          </form>
        )}

        {overview && overview.assets.length > 0 ? (
          <ul className="mt-4 space-y-2 border-t border-border pt-3">
            {overview.assets.map((asset) => (
              <li
                key={asset.accountId}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-fg">{asset.name}</span>
                  {asset.staleValuation ? <Badge tone="accent">{nt.staleBadge}</Badge> : null}
                </div>
                <span className="text-fg-2">
                  {fmt.money(asset.balanceCents, { currency: asset.currency })}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </div>
  )
}
