import { Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import {
  LOAN_PERIODICITIES,
  LOAN_TYPES,
  type EarlyRepaymentSimulation,
  type LoanPeriodicity,
  type LoanType,
} from '@shared/planning/model'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { SelectField, TextField } from '../../components/ui/Field'
import { StatTile } from '../../components/ui/StatTile'
import { useT } from '../../i18n'
import { useFormatters } from '../../lib/format'
import { useLedgerMutation, useLedgerQuery } from '../../lib/ledger'

function parseEuroToCents(raw: string): number {
  const num = Number.parseFloat(raw.replace(',', '.').replace(/\s+/g, ''))
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) : 0
}

function parsePercentToMicros(raw: string): number {
  const num = Number.parseFloat(raw.replace(',', '.').replace(/\s+/g, ''))
  return Number.isFinite(num) && num >= 0 ? Math.min(1_000_000, Math.round(num * 10_000)) : 0
}

export function LoansTab() {
  const t = useT()
  const lt = t.planning.loans
  const fmt = useFormatters()

  const loansQuery = useLedgerQuery('loansList', {})
  const loans = loansQuery.data ?? []
  const [selectedLoanId, setSelectedLoanId] = useState('')
  const effectiveLoanId = selectedLoanId || loans[0]?.id || ''

  const detailQuery = useLedgerQuery(
    'loanGet',
    { id: effectiveLoanId },
    { enabled: effectiveLoanId.length > 0 },
  )

  const [name, setName] = useState('')
  const [loanType, setLoanType] = useState<LoanType>('mortgage')
  const [capital, setCapital] = useState('150000')
  const [rate, setRate] = useState('3.50')
  const [taeg, setTaeg] = useState('3.95')
  const [insurance, setInsurance] = useState('35')
  const [duration, setDuration] = useState('240')
  const [periodicity, setPeriodicity] = useState<LoanPeriodicity>('monthly')
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [fixedEnd, setFixedEnd] = useState('')

  const [extraPayment, setExtraPayment] = useState('10000')
  const [atInstallment, setAtInstallment] = useState('12')
  const [earlyMode, setEarlyMode] = useState<'reduce_duration' | 'reduce_payment'>(
    'reduce_duration',
  )
  const [earlySim, setEarlySim] = useState<EarlyRepaymentSimulation | null>(null)

  const createLoan = useLedgerMutation('loanCreate')
  const deleteLoan = useLedgerMutation('loanDelete')
  const simEarly = useLedgerMutation('loanSimulateEarlyRepayment')

  const totalRemaining = loans.reduce((s, l) => s + l.remainingPrincipalCents, 0)
  const totalMonthly = loans.reduce((s, l) => s + l.monthlyPaymentCents, 0)
  const latestEnd = loans.reduce((max, l) => (l.endDate > max ? l.endDate : max), '')

  const handleCreate = (e: FormEvent) => {
    e.preventDefault()
    const cap = parseEuroToCents(capital)
    const dur = Math.max(1, Number.parseInt(duration, 10) || 12)
    if (!name.trim() || cap <= 0) return
    createLoan.mutate(
      {
        name: name.trim(),
        loanType,
        initialCapital: cap,
        nominalRateMicros: parsePercentToMicros(rate),
        taegMicros: taeg ? parsePercentToMicros(taeg) : null,
        insuranceMonthlyCents: parseEuroToCents(insurance),
        durationMonths: dur,
        periodicity,
        startDate,
        fixedRateEndDate: fixedEnd || null,
        currency: 'EUR',
      },
      {
        onSuccess: (res) => {
          setSelectedLoanId(res.id)
          setName('')
        },
      },
    )
  }

  const handleSimulateEarly = () => {
    if (!effectiveLoanId) return
    const extra = parseEuroToCents(extraPayment)
    const inst = Math.max(1, Number.parseInt(atInstallment, 10) || 1)
    if (extra <= 0) return
    simEarly.mutate(
      {
        loanId: effectiveLoanId,
        extraPrincipalCents: extra,
        atInstallmentNumber: inst,
        mode: earlyMode,
      },
      {
        onSuccess: (res) => setEarlySim(res),
      },
    )
  }

  const detail = detailQuery.data

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label={lt.totalRemaining} value={fmt.money(totalRemaining)} />
        <StatTile label={lt.totalMonthly} value={fmt.money(totalMonthly)} />
        <StatTile label={lt.latestEnd} value={latestEnd ? fmt.date(latestEnd) : '—'} />
      </div>

      <Card title={lt.addTitle}>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField
              label={lt.nameLabel}
              value={name}
              onChange={setName}
              placeholder="Prêt immobilier"
            />
            <SelectField
              label={lt.typeLabel}
              value={loanType}
              options={LOAN_TYPES.map((type) => ({ value: type, label: lt.types[type] }))}
              onChange={setLoanType}
            />
            <TextField label={lt.capitalLabel} value={capital} onChange={setCapital} />
            <TextField label={lt.rateLabel} value={rate} onChange={setRate} />
            <TextField label={lt.taegLabel} value={taeg} onChange={setTaeg} />
            <TextField label={lt.insuranceLabel} value={insurance} onChange={setInsurance} />
            <TextField label={lt.durationLabel} value={duration} onChange={setDuration} />
            <SelectField
              label={lt.periodicityLabel}
              value={periodicity}
              options={LOAN_PERIODICITIES.map((p) => ({ value: p, label: lt.periodicities[p] }))}
              onChange={setPeriodicity}
            />
            <TextField
              label={lt.startDateLabel}
              type="date"
              value={startDate}
              onChange={setStartDate}
            />
            <TextField
              label={lt.fixedRateEndLabel}
              type="date"
              value={fixedEnd}
              onChange={setFixedEnd}
            />
          </div>
          <Button type="submit" variant="primary" disabled={!name.trim() || createLoan.isPending}>
            <Plus size={14} aria-hidden />
            {lt.createLoan}
          </Button>
        </form>
      </Card>

      {loans.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">{lt.empty}</p>
        </Card>
      ) : (
        <Card
          title={lt.scheduleTitle}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <SelectField
                label={lt.summaryTitle}
                value={effectiveLoanId}
                options={loans.map((l) => ({
                  value: l.id,
                  label: `${l.name} (${fmt.money(l.remainingPrincipalCents)})`,
                }))}
                onChange={(id) => {
                  setSelectedLoanId(id)
                  setEarlySim(null)
                }}
              />
              {effectiveLoanId ? (
                <Button
                  onClick={() =>
                    deleteLoan.mutate(
                      { id: effectiveLoanId },
                      { onSuccess: () => setSelectedLoanId('') },
                    )
                  }
                >
                  <Trash2 size={14} aria-hidden />
                  {lt.deleteLoan}
                </Button>
              ) : null}
            </div>
          }
        >
          {detail ? (
            <div className="space-y-4">
              <div className="overflow-auto" style={{ maxHeight: '320px' }}>
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted">
                      <th className="py-2 pr-2">{lt.colNum}</th>
                      <th className="py-2 pr-2">{lt.colDate}</th>
                      <th className="py-2 pr-2 text-right">{lt.colPrincipal}</th>
                      <th className="py-2 pr-2 text-right">{lt.colInterest}</th>
                      <th className="py-2 pr-2 text-right">{lt.colInsurance}</th>
                      <th className="py-2 pr-2 text-right">{lt.colTotal}</th>
                      <th className="py-2 pr-2 text-right">{lt.colRemaining}</th>
                      <th className="py-2 pr-2">{lt.colStatus}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.installments.slice(0, 60).map((inst) => (
                      <tr key={inst.id} className="border-b border-border">
                        <td className="py-2 pr-2">{inst.installmentNumber}</td>
                        <td className="py-2 pr-2">{fmt.date(inst.dueDate)}</td>
                        <td className="py-2 pr-2 text-right">{fmt.money(inst.principalCents)}</td>
                        <td className="py-2 pr-2 text-right">{fmt.money(inst.interestCents)}</td>
                        <td className="py-2 pr-2 text-right">{fmt.money(inst.insuranceCents)}</td>
                        <td className="py-2 pr-2 text-right font-medium text-fg">
                          {fmt.money(inst.totalCents)}
                        </td>
                        <td className="py-2 pr-2 text-right">
                          {fmt.money(inst.remainingPrincipalCents)}
                        </td>
                        <td className="py-2 pr-2">
                          <Badge tone={inst.status === 'planned' ? 'neutral' : 'accent'}>
                            {lt.statuses[inst.status]}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-lg border border-border bg-surface-2 p-3 space-y-3">
                <p className="text-sm font-medium text-fg">{lt.earlyTitle}</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <TextField
                    label={lt.extraLabel}
                    value={extraPayment}
                    onChange={setExtraPayment}
                  />
                  <TextField
                    label={lt.atInstallmentLabel}
                    value={atInstallment}
                    onChange={setAtInstallment}
                  />
                  <SelectField
                    label={lt.earlyModeLabel}
                    value={earlyMode}
                    options={[
                      { value: 'reduce_duration', label: lt.earlyModes.reduce_duration },
                      { value: 'reduce_payment', label: lt.earlyModes.reduce_payment },
                    ]}
                    onChange={setEarlyMode}
                  />
                </div>
                <Button variant="primary" onClick={handleSimulateEarly}>
                  {lt.runEarlySim}
                </Button>
                {earlySim ? (
                  <div className="flex flex-wrap gap-3 text-xs font-medium text-income">
                    <span>{lt.interestSaved(fmt.money(earlySim.interestSavedCents))}</span>
                    <span>{lt.monthsSaved(earlySim.monthsSaved)}</span>
                    <span>{lt.newMonthly(fmt.money(earlySim.newMonthlyPaymentCents))}</span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  )
}
