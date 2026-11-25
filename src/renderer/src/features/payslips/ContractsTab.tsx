import { Archive, Building2, Eye, EyeOff, FileText, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import {
  CONTRACT_TYPES,
  EXECUTIVE_STATUSES,
  WORK_TIMES,
  type ContractType,
  type ExecutiveStatus,
  type WorkTime,
} from '@shared/payslip'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { SelectField, TextField } from '../../components/ui/Field'
import { useT } from '../../i18n'
import { useFormatters } from '../../lib/format'
import { ledgerErrorCode, useLedgerMutation, useLedgerQuery } from '../../lib/ledger'
import { useSettingsStore } from '../../stores/settings'

function parseEurosToCents(raw: string): number | null {
  const clean = raw.replace(/\s+/g, '').replace(',', '.')
  if (!clean) return null
  const num = Number(clean)
  if (!Number.isFinite(num) || num < 0) return null
  return Math.round(num * 100)
}

export function ContractsTab() {
  const t = useT()
  const fmt = useFormatters()
  const pt = t.payslips
  const currency = useSettingsStore((s) => s.settings.currency)

  const employers = useLedgerQuery('employersList', { includeArchived: true })
  const contracts = useLedgerQuery('contractsList', { includeArchived: true })

  const createEmployer = useLedgerMutation('employerCreate')
  const updateEmployer = useLedgerMutation('employerUpdate')
  const deleteEmployer = useLedgerMutation('employerDelete')
  const revealAddress = useLedgerMutation('employerRevealAddress')

  const createContract = useLedgerMutation('contractCreate')
  const updateContract = useLedgerMutation('contractUpdate')
  const deleteContract = useLedgerMutation('contractDelete')
  const revealNir = useLedgerMutation('contractRevealNir')

  // Formulaire employeur
  const [empName, setEmpName] = useState('')
  const [empSiret, setEmpSiret] = useState('')
  const [empAddress, setEmpAddress] = useState('')
  const [empError, setEmpError] = useState<string | null>(null)
  const [revealedAddrs, setRevealedAddrs] = useState<Record<string, string | null>>({})

  // Formulaire contrat
  const activeEmployers = (employers.data ?? []).filter((e) => !e.archived)
  const [selectedEmployerId, setSelectedEmployerId] = useState('')
  const [contractTitle, setContractTitle] = useState('')
  const [contractType, setContractType] = useState<ContractType>('cdi')
  const [executiveStatus, setExecutiveStatus] = useState<ExecutiveStatus>('cadre')
  const [workTime, setWorkTime] = useState<WorkTime>('full_time')
  const [ratioPct, setRatioPct] = useState('100')
  const [monthlyHours, setMonthlyHours] = useState('151.67')
  const [collectiveAgreement, setCollectiveAgreement] = useState('')
  const [classification, setClassification] = useState('')
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState('')
  const [defaultBase, setDefaultBase] = useState('3400')
  const [nir, setNir] = useState('')
  const [contractError, setContractError] = useState<string | null>(null)
  const [revealedNirs, setRevealedNirs] = useState<Record<string, string | null>>({})

  const effectiveEmployerId = selectedEmployerId || activeEmployers[0]?.id || ''

  const submitEmployer = async (event: FormEvent) => {
    event.preventDefault()
    setEmpError(null)
    try {
      const res = await createEmployer.mutateAsync({
        name: empName.trim(),
        siret: empSiret.trim() || null,
        address: empAddress.trim() || null,
      })
      setEmpName('')
      setEmpSiret('')
      setEmpAddress('')
      setSelectedEmployerId(res.id)
    } catch (error) {
      setEmpError(t.ledger.errors[ledgerErrorCode(error)])
    }
  }

  const submitContract = async (event: FormEvent) => {
    event.preventDefault()
    setContractError(null)
    if (!effectiveEmployerId) return
    const ratioNum = Number(ratioPct.replace(',', '.'))
    const hoursNum = Number(monthlyHours.replace(',', '.'))
    try {
      await createContract.mutateAsync({
        employerId: effectiveEmployerId,
        title: contractTitle.trim(),
        contractType,
        executiveStatus,
        workTime,
        workTimeRatioMicros:
          Number.isFinite(ratioNum) && ratioNum > 0
            ? Math.min(1_000_000, Math.round(ratioNum * 10_000))
            : 1_000_000,
        monthlyHoursHundredths:
          Number.isFinite(hoursNum) && hoursNum > 0 ? Math.round(hoursNum * 100) : null,
        collectiveAgreement: collectiveAgreement.trim() || null,
        classification: classification.trim() || null,
        startDate,
        endDate: endDate.trim() || null,
        defaultBaseSalary: parseEurosToCents(defaultBase),
        currency,
        countryPack: 'fr',
        employeeNir: nir.trim() || null,
      })
      setContractTitle('')
      setCollectiveAgreement('')
      setClassification('')
      setEndDate('')
      setNir('')
    } catch (error) {
      setContractError(t.ledger.errors[ledgerErrorCode(error)])
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Employeurs */}
      <div className="space-y-4">
        <Card accent title={pt.contracts.employersTitle}>
          <form
            onSubmit={(e) => {
              void submitEmployer(e)
            }}
            className="space-y-3"
          >
            <TextField
              label={pt.contracts.name}
              value={empName}
              onChange={setEmpName}
              required
              placeholder="Atelier Exemple SAS"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label={pt.contracts.siret}
                value={empSiret}
                onChange={setEmpSiret}
                placeholder="12345678900014"
              />
              <TextField
                label={pt.contracts.address}
                value={empAddress}
                onChange={setEmpAddress}
                placeholder="10 avenue des Nations, 75001 Paris"
              />
            </div>
            {empError ? (
              <p role="alert" className="text-xs text-expense">
                {empError}
              </p>
            ) : null}
            <Button type="submit" variant="primary" disabled={createEmployer.isPending}>
              <Plus size={14} aria-hidden />
              {pt.contracts.saveEmployer}
            </Button>
          </form>

          <ul className="mt-5 divide-y divide-border border-t border-border pt-3">
            {(employers.data ?? []).map((emp) => {
              const revealed = revealedAddrs[emp.id]
              return (
                <li key={emp.id} className="flex items-start justify-between gap-2 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium text-fg">
                      <Building2 size={14} aria-hidden className="text-muted" />
                      <span className="truncate">{emp.name}</span>
                      {emp.archived ? <Badge>{pt.contracts.archived}</Badge> : null}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {emp.siret ? `SIRET ${emp.siret} · ` : ''}
                      {revealed !== undefined ? (revealed ?? '—') : (emp.addressMasked ?? '—')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {emp.hasAddress ? (
                      <Button
                        aria-label={revealed !== undefined ? pt.actions.hide : pt.actions.reveal}
                        onClick={() => {
                          void (async () => {
                            if (revealed !== undefined) {
                              setRevealedAddrs((prev) => {
                                const next = { ...prev }
                                delete next[emp.id]
                                return next
                              })
                            } else {
                              const addr = await revealAddress.mutateAsync({ id: emp.id })
                              setRevealedAddrs((prev) => ({ ...prev, [emp.id]: addr }))
                            }
                          })()
                        }}
                      >
                        {revealed !== undefined ? <EyeOff size={13} /> : <Eye size={13} />}
                      </Button>
                    ) : null}
                    <Button
                      aria-label={emp.archived ? pt.contracts.restore : pt.contracts.archive}
                      onClick={() =>
                        updateEmployer.mutate({
                          id: emp.id,
                          patch: { archived: !emp.archived },
                        })
                      }
                    >
                      {emp.archived ? <RotateCcw size={13} /> : <Archive size={13} />}
                    </Button>
                    {emp.contractCount === 0 ? (
                      <Button
                        aria-label={pt.contracts.delete}
                        onClick={() => deleteEmployer.mutate({ id: emp.id })}
                      >
                        <Trash2 size={13} />
                      </Button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      </div>

      {/* Contrats */}
      <div className="space-y-4">
        <Card accent title={pt.contracts.contractsTitle}>
          <form
            onSubmit={(e) => {
              void submitContract(e)
            }}
            className="space-y-3"
          >
            <SelectField
              label={pt.contracts.employersTitle}
              value={effectiveEmployerId}
              onChange={setSelectedEmployerId}
              options={
                activeEmployers.length > 0
                  ? activeEmployers.map((e) => ({ value: e.id, label: e.name }))
                  : [{ value: '', label: '—' }]
              }
              disabled={activeEmployers.length === 0}
            />
            <TextField
              label={pt.contracts.contractTitle}
              value={contractTitle}
              onChange={setContractTitle}
              required
              placeholder="Ingénieur logiciel"
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <SelectField
                label={pt.contracts.contractType}
                value={contractType}
                onChange={setContractType}
                options={CONTRACT_TYPES.map((value) => ({
                  value,
                  label: pt.contractTypes[value],
                }))}
              />
              <SelectField
                label={pt.contracts.executiveStatus}
                value={executiveStatus}
                onChange={setExecutiveStatus}
                options={EXECUTIVE_STATUSES.map((value) => ({
                  value,
                  label: pt.executiveStatuses[value],
                }))}
              />
              <SelectField
                label={pt.contracts.workTime}
                value={workTime}
                onChange={setWorkTime}
                options={WORK_TIMES.map((value) => ({
                  value,
                  label: pt.workTimes[value],
                }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField
                label={pt.contracts.workTimeRatio}
                value={ratioPct}
                onChange={setRatioPct}
              />
              <TextField
                label={pt.contracts.monthlyHours}
                value={monthlyHours}
                onChange={setMonthlyHours}
              />
              <TextField
                label={pt.contracts.defaultBase}
                value={defaultBase}
                onChange={setDefaultBase}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label={pt.contracts.collectiveAgreement}
                value={collectiveAgreement}
                onChange={setCollectiveAgreement}
                placeholder="Syntec"
              />
              <TextField
                label={pt.contracts.classification}
                value={classification}
                onChange={setClassification}
                placeholder="Position 2.2 · Coef 130"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField
                label={pt.contracts.startDate}
                type="date"
                value={startDate}
                onChange={setStartDate}
                required
              />
              <TextField
                label={pt.contracts.endDate}
                type="date"
                value={endDate}
                onChange={setEndDate}
              />
              <TextField
                label={pt.contracts.nir}
                value={nir}
                onChange={setNir}
                placeholder="1 85 …"
              />
            </div>
            {contractError ? (
              <p role="alert" className="text-xs text-expense">
                {contractError}
              </p>
            ) : null}
            <Button
              type="submit"
              variant="primary"
              disabled={!effectiveEmployerId || createContract.isPending}
            >
              <Plus size={14} aria-hidden />
              {pt.contracts.saveContract}
            </Button>
          </form>

          <ul className="mt-5 divide-y divide-border border-t border-border pt-3">
            {(contracts.data ?? []).map((c) => {
              const revealedNir = revealedNirs[c.id]
              return (
                <li key={c.id} className="flex items-start justify-between gap-2 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium text-fg">
                      <FileText size={14} aria-hidden className="text-muted" />
                      <span className="truncate">{c.title}</span>
                      <Badge>{pt.contractTypes[c.contractType]}</Badge>
                      {c.archived ? <Badge>{pt.contracts.archived}</Badge> : null}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {c.employerName} · {pt.executiveStatuses[c.executiveStatus]} ·{' '}
                      {pt.workTimes[c.workTime]}
                      {c.collectiveAgreement ? ` · ${c.collectiveAgreement}` : ''}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {fmt.date(c.startDate)}
                      {c.endDate ? ` → ${fmt.date(c.endDate)}` : ''}
                      {c.defaultBaseSalary !== null
                        ? ` · ${fmt.money(c.defaultBaseSalary, { currency: c.currency })}`
                        : ''}
                      {c.hasNir
                        ? ` · NIR : ${revealedNir !== undefined ? (revealedNir ?? '—') : (c.nirMasked ?? '')}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {c.hasNir ? (
                      <Button
                        aria-label={revealedNir !== undefined ? pt.actions.hide : pt.actions.reveal}
                        onClick={() => {
                          void (async () => {
                            if (revealedNir !== undefined) {
                              setRevealedNirs((prev) => {
                                const next = { ...prev }
                                delete next[c.id]
                                return next
                              })
                            } else {
                              const nirVal = await revealNir.mutateAsync({ id: c.id })
                              setRevealedNirs((prev) => ({ ...prev, [c.id]: nirVal }))
                            }
                          })()
                        }}
                      >
                        {revealedNir !== undefined ? <EyeOff size={13} /> : <Eye size={13} />}
                      </Button>
                    ) : null}
                    <Button
                      aria-label={c.archived ? pt.contracts.restore : pt.contracts.archive}
                      onClick={() =>
                        updateContract.mutate({
                          id: c.id,
                          patch: { archived: !c.archived },
                        })
                      }
                    >
                      {c.archived ? <RotateCcw size={13} /> : <Archive size={13} />}
                    </Button>
                    {c.payslipCount === 0 ? (
                      <Button
                        aria-label={pt.contracts.delete}
                        onClick={() => deleteContract.mutate({ id: c.id })}
                      >
                        <Trash2 size={13} />
                      </Button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      </div>
    </div>
  )
}
