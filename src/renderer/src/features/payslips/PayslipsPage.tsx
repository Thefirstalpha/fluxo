import {
  Building2,
  ChartNoAxesCombined,
  CircleAlert,
  CircleCheck,
  Copy,
  Info,
  Plus,
  SlidersHorizontal,
  Wallet,
} from 'lucide-react'
import { useState } from 'react'
import { addMonths } from '@shared/months'
import type { PayslipDetail, PayslipDuplicateDraft } from '@shared/payslip'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { PageHeader } from '../../components/ui/PageHeader'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useT } from '../../i18n'
import { cx } from '../../lib/cx'
import { capitalize, useFormatters } from '../../lib/format'
import { useLedgerMutation, useLedgerQuery } from '../../lib/ledger'
import { useSettingsStore } from '../../stores/settings'
import { ContractsTab } from './ContractsTab'
import { GrossToNetCard } from './GrossToNetCard'
import { PayslipEditorDialog } from './PayslipEditorDialog'
import { PayslipSimulatorTab } from './PayslipSimulatorTab'
import { SalaryDashboardTab } from './SalaryDashboardTab'

type PayslipTab = 'list' | 'dashboard' | 'simulator' | 'contracts'

export default function PayslipsPage() {
  const t = useT()
  const fmt = useFormatters()
  const pt = t.payslips
  const currency = useSettingsStore((s) => s.settings.currency)

  const [tab, setTab] = useState<PayslipTab>('list')
  const [selectedId, setSelectedId] = useState<string>('')
  const [dashboardContractId, setDashboardContractId] = useState<string>('')
  const [editorState, setEditorState] = useState<{
    mode: 'create' | 'edit'
    initial: PayslipDetail | PayslipDuplicateDraft | null
    payslipId?: string
  } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<PayslipDetail | null>(null)

  const contracts = useLedgerQuery('contractsList', { includeArchived: true })
  const payslips = useLedgerQuery('payslipsList', { limit: 200 })
  const overview = useLedgerQuery('salaryDashboard', {
    ...(dashboardContractId ? { contractId: dashboardContractId } : {}),
    currency,
  })

  const list = payslips.data ?? []
  const activeId =
    selectedId && list.some((p) => p.id === selectedId) ? selectedId : (list[0]?.id ?? '')
  const selectedDetail = useLedgerQuery(
    'payslipGet',
    { id: activeId },
    { enabled: activeId.length > 0 && tab === 'list' },
  )

  const duplicateMutation = useLedgerMutation('payslipDuplicatePrevious')
  const deleteMutation = useLedgerMutation('payslipDelete')

  const activeContracts = (contracts.data ?? []).filter((c) => !c.archived)

  const openDuplicate = async () => {
    const source = list[0]
    if (!source) return
    const targetPeriod = addMonths(source.period, 1)
    const draft = await duplicateMutation.mutateAsync({
      sourcePayslipId: source.id,
      targetPeriod,
    })
    setEditorState({ mode: 'create', initial: draft })
  }

  return (
    <>
      <PageHeader
        title={pt.title}
        subtitle={pt.subtitle}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {list.length > 0 ? (
              <Button
                onClick={() => {
                  void openDuplicate()
                }}
                disabled={duplicateMutation.isPending}
              >
                <Copy size={14} aria-hidden />
                {pt.actions.duplicatePrevious}
              </Button>
            ) : null}
            <Button
              variant="primary"
              disabled={activeContracts.length === 0}
              onClick={() => setEditorState({ mode: 'create', initial: null })}
            >
              <Plus size={14} aria-hidden />
              {pt.actions.newPayslip}
            </Button>
          </div>
        }
      />

      <p
        role="note"
        className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-xs text-fg-2"
      >
        <Info size={14} aria-hidden className="shrink-0 text-teal" />
        {pt.disclaimer}
      </p>

      <div className="mb-5">
        <SegmentedControl<PayslipTab>
          ariaLabel={pt.title}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'list', label: pt.tabs.list, icon: Wallet },
            {
              value: 'dashboard',
              label: pt.tabs.dashboard,
              icon: ChartNoAxesCombined,
            },
            {
              value: 'simulator',
              label: pt.tabs.simulator,
              icon: SlidersHorizontal,
            },
            {
              value: 'contracts',
              label: pt.tabs.contracts,
              icon: Building2,
            },
          ]}
        />
      </div>

      {tab === 'contracts' ? (
        <ContractsTab />
      ) : tab === 'simulator' ? (
        <PayslipSimulatorTab payslips={list} />
      ) : tab === 'dashboard' ? (
        overview.data ? (
          <SalaryDashboardTab
            overview={overview.data}
            contractId={dashboardContractId}
            onSelectContract={setDashboardContractId}
          />
        ) : null
      ) : list.length === 0 ? (
        <Card accent title={pt.empty.title}>
          <p className="text-sm text-fg-2">{pt.empty.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {activeContracts.length === 0 ? (
              <Button variant="primary" onClick={() => setTab('contracts')}>
                <Building2 size={14} aria-hidden />
                {pt.empty.setupContract}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => setEditorState({ mode: 'create', initial: null })}
              >
                <Plus size={14} aria-hidden />
                {pt.actions.newPayslip}
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title={`${pt.tabs.list} (${list.length})`}>
            <ul className="divide-y divide-border">
              {list.map((item) => {
                const active = item.id === activeId
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={cx(
                        'flex w-full items-center justify-between gap-2 px-2 py-2.5 text-left transition-colors',
                        active ? 'bg-surface-2 text-fg' : 'text-fg-2 hover:bg-surface-2/60',
                      )}
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sm font-medium text-fg">
                          <span>{capitalize(fmt.month(item.period))}</span>
                          {item.errorCount > 0 ? (
                            <CircleAlert
                              size={13}
                              aria-label={String(item.errorCount)}
                              className="text-[color:var(--fx-status-critical)]"
                            />
                          ) : (
                            <CircleCheck
                              size={13}
                              aria-hidden
                              className="text-[color:var(--fx-status-good)]"
                            />
                          )}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {item.contractTitle} · {item.employerName}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="fx-tabular text-sm font-semibold text-fg">
                          {fmt.money(item.netPaid, { currency: item.currency })}
                        </p>
                        {item.transactionId ? <Badge tone="neutral">✓</Badge> : null}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Card>

          <div className="lg:col-span-2">
            {(() => {
              const detail = selectedDetail.data
              if (!detail) return null
              return (
                <GrossToNetCard
                  payslip={detail}
                  onEdit={() =>
                    setEditorState({
                      mode: 'edit',
                      initial: detail,
                      payslipId: detail.id,
                    })
                  }
                  onDelete={() => setConfirmDelete(detail)}
                />
              )
            })()}
          </div>
        </div>
      )}

      {editorState ? (
        <PayslipEditorDialog
          contracts={contracts.data ?? []}
          initial={editorState.initial}
          payslipId={editorState.payslipId}
          existingYearPoints={(overview.data?.months ?? []).map((m) => ({
            contractId: m.contractId,
            period: m.period,
            gross: m.gross,
            taxableNet: m.taxableNet,
            withholdingTax: m.withholdingTax,
            baseHoursHundredths: null,
          }))}
          onClose={() => setEditorState(null)}
          onSaved={(saved) => {
            setSelectedId(saved.id)
            setTab('list')
            setEditorState(null)
          }}
        />
      ) : null}

      {confirmDelete ? (
        <ConfirmDialog
          title={pt.form.confirmDeleteTitle}
          message={pt.form.confirmDeleteMessage(capitalize(fmt.month(confirmDelete.period)))}
          confirmLabel={pt.actions.delete}
          onConfirm={() => {
            void (async () => {
              await deleteMutation.mutateAsync({ id: confirmDelete.id })
              setConfirmDelete(null)
              setSelectedId('')
            })()
          }}
          onClose={() => setConfirmDelete(null)}
        />
      ) : null}
    </>
  )
}
