import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Info, Upload } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import { useLocation } from 'wouter'
import {
  STATEMENT_FORMATS,
  type CsvInspection,
  type CsvProfileConfig,
  type ImportPreview,
  type ImportRowAction,
  type StageImportFileResult,
  type StatementFormat,
} from '@shared/imports/model'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { INPUT_CLASS } from '../../components/ui/Field'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatTile } from '../../components/ui/StatTile'
import { useT } from '../../i18n'
import { getApi } from '../../lib/api'
import { cx } from '../../lib/cx'
import { useFormatters } from '../../lib/format'
import { useLedgerQuery } from '../../lib/ledger'
import { useRegisterStore } from '../../stores/register'
import { CsvMappingEditor } from './CsvMappingEditor'
import { ImportHistoryCard } from './ImportHistoryCard'

type WizardStep = 'file' | 'preview' | 'result'
type StagedFile = Extract<StageImportFileResult, { ok: true }>

const MAX_DISPLAY_PREVIEW_ROWS = 200

export default function ImportsPage() {
  const t = useT()
  const fmt = useFormatters()
  const [, navigate] = useLocation()
  const queryClient = useQueryClient()
  const openRegister = useRegisterStore((state) => state.openRegister)

  const accountsQuery = useLedgerQuery('accountsList', { includeArchived: false })
  const eligibleAccounts = (accountsQuery.data ?? []).filter(
    (account) => account.trackingMode !== 'valuation',
  )

  const batchesQuery = useQuery({
    queryKey: ['imports', 'batches'],
    queryFn: async () => {
      const res = await getApi().imports.batchesList({})
      if (!res.ok) throw new Error(res.error)
      return res.value
    },
  })

  const profilesQuery = useQuery({
    queryKey: ['imports', 'profiles'],
    queryFn: async () => {
      const res = await getApi().imports.profilesList()
      if (!res.ok) throw new Error(res.error)
      return res.value
    },
  })

  const [step, setStep] = useState<WizardStep>('file')
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [stagedFile, setStagedFile] = useState<StagedFile | null>(null)
  const [forcedFormat, setForcedFormat] = useState<StatementFormat | 'auto'>('auto')
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [previewData, setPreviewData] = useState<ImportPreview | null>(null)
  const [selectedProfileId, setSelectedProfileId] = useState<string>('custom')
  const [csvConfig, setCsvConfig] = useState<CsvProfileConfig | null>(null)
  const [csvInspection, setCsvInspection] = useState<CsvInspection | null>(null)
  const [rowActions, setRowActions] = useState<Record<number, ImportRowAction>>({})
  const [replaceAdjustmentIds, setReplaceAdjustmentIds] = useState<string[]>([])
  const [createAdjustment, setCreateAdjustment] = useState(false)
  const [adjustmentNote, setAdjustmentNote] = useState('')
  const [saveProfile, setSaveProfile] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')
  const [newProfileBank, setNewProfileBank] = useState('')
  const [commitResult, setCommitResult] = useState<{
    insertedCount: number
    duplicateCount: number
    replacedAdjustmentCount: number
    adjustmentTransactionId: string | null
    savedProfileName: string | null
    accountId: string
  } | null>(null)

  const activeAccountId =
    selectedAccountId && eligibleAccounts.some((a) => a.id === selectedAccountId)
      ? selectedAccountId
      : (eligibleAccounts.find((a) => a.trackingMode === 'statement')?.id ??
        eligibleAccounts[0]?.id ??
        '')

  const applyPreview = (preview: ImportPreview) => {
    setPreviewData(preview)
    const initialActions: Record<number, ImportRowAction> = {}
    for (const row of preview.rows) initialActions[row.index] = row.defaultAction
    setRowActions(initialActions)
    setReplaceAdjustmentIds([])
    setCreateAdjustment(false)
    setAdjustmentNote('')
    if (preview.csvInspection) {
      setCsvInspection(preview.csvInspection)
      setCsvConfig((prev) => prev ?? preview.csvInspection!.suggestedConfig)
      setSelectedProfileId((prev) =>
        prev === 'custom' && preview.csvInspection?.suggestedProfileId
          ? preview.csvInspection.suggestedProfileId
          : prev,
      )
    }
    setStep('preview')
  }

  const runPreviewMutation = useMutation({
    mutationFn: async (params: {
      token: string
      accountId: string
      config?: CsvProfileConfig
      profileName?: string | null
      format?: StatementFormat
    }) => {
      const res = await getApi().imports.preview({
        token: params.token,
        accountId: params.accountId,
        csvConfig: params.config,
        profileName: params.profileName,
        forcedFormat: params.format,
      })
      if (!res.ok) {
        throw new Error(t.imports.errors[res.reason])
      }
      return res.preview
    },
    onSuccess: (preview) => {
      setError(null)
      applyPreview(preview)
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : t.vault.errors.generic)
    },
  })

  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!previewData) throw new Error(t.vault.errors.generic)
      if (createAdjustment && !adjustmentNote.trim()) {
        throw new Error(t.imports.reconciliation.adjustmentNoteRequired)
      }
      const decisions = previewData.rows.map((row) => ({
        index: row.index,
        action: rowActions[row.index] ?? row.defaultAction,
      }))
      const res = await getApi().imports.commit({
        previewId: previewData.previewId,
        rowDecisions: decisions,
        replaceAdjustmentIds,
        createAdjustment:
          createAdjustment && liveDiscrepancy !== null && liveDiscrepancy !== 0
            ? { note: adjustmentNote.trim() }
            : null,
        saveProfile:
          saveProfile && csvConfig && newProfileName.trim()
            ? {
                name: newProfileName.trim(),
                bank: newProfileBank.trim() || null,
                config: csvConfig,
              }
            : null,
      })
      if (!res.ok) throw new Error(t.vault.errors.generic)
      return res.value
    },
    onSuccess: async (res) => {
      setError(null)
      setCommitResult({
        insertedCount: res.insertedCount,
        duplicateCount: res.duplicateCount,
        replacedAdjustmentCount: res.replacedAdjustmentCount,
        adjustmentTransactionId: res.adjustmentTransactionId,
        savedProfileName: res.savedProfile?.name ?? null,
        accountId: previewData?.accountId ?? activeAccountId,
      })
      setStep('result')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['imports'] }),
        queryClient.invalidateQueries({ queryKey: ['ledger'] }),
      ])
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : t.vault.errors.generic)
    },
  })

  const revertMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const res = await getApi().imports.revert(batchId)
      if (!res.ok) throw new Error(t.vault.errors.generic)
      return res.value
    },
    onSuccess: async (res) => {
      setError(null)
      setNotice(t.imports.history.revertedNotice(res.removedCount))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['imports'] }),
        queryClient.invalidateQueries({ queryKey: ['ledger'] }),
      ])
    },
  })

  const saveProfileMutation = useMutation({
    mutationFn: async (input: { name: string; bank: string | null; config: CsvProfileConfig }) => {
      const res = await getApi().imports.profileSave(input)
      if (!res.ok) throw new Error(t.vault.errors.generic)
      return res.value
    },
    onSuccess: async (profile) => {
      setSelectedProfileId(profile.id)
      setCsvConfig(profile.config)
      await queryClient.invalidateQueries({ queryKey: ['imports', 'profiles'] })
      if (stagedFile && activeAccountId) {
        runPreviewMutation.mutate({
          token: stagedFile.token,
          accountId: activeAccountId,
          config: profile.config,
          profileName: profile.name,
        })
      }
    },
  })

  const deleteProfileMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await getApi().imports.profileDelete(id)
      if (!res.ok) throw new Error(t.vault.errors.generic)
      return res.value
    },
    onSuccess: async () => {
      setSelectedProfileId('custom')
      await queryClient.invalidateQueries({ queryKey: ['imports', 'profiles'] })
    },
  })

  const handleStagedOutcome = (res: StageImportFileResult) => {
    setError(null)
    setNotice(null)
    if (!res.ok) {
      if (res.reason !== 'cancelled') {
        setError(t.imports.errors[res.reason])
      }
      return
    }
    setStagedFile(res)
    setForcedFormat('auto')
    setCsvConfig(null)
    setCsvInspection(null)
    setSelectedProfileId('custom')
  }

  const handlePickFile = async () => {
    const res = await getApi().imports.pickFile()
    handleStagedOutcome(res)
  }

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (!file) return
    const res = await getApi().imports.registerDroppedFile(file)
    handleStagedOutcome(res)
  }

  const startPreview = () => {
    if (!stagedFile || !activeAccountId) return
    setNotice(null)
    runPreviewMutation.mutate({
      token: stagedFile.token,
      accountId: activeAccountId,
      format: forcedFormat === 'auto' ? undefined : forcedFormat,
    })
  }

  const selectedProfileName =
    (profilesQuery.data ?? []).find((p) => p.id === selectedProfileId)?.name ?? null

  // Calcul dynamique du nombre de lignes à importer et de l'écart projeté en étape 2.
  let importCount = 0
  let liveProjected = previewData?.projectedBalance ?? null
  let liveDiscrepancy = previewData?.discrepancy ?? null
  if (previewData && previewData.closingBalance !== null && liveProjected !== null) {
    const periodEnd = previewData.periodEnd ?? '9999-12-31'
    let deltaFromDefaults = 0
    for (const row of previewData.rows) {
      const current = rowActions[row.index] ?? row.defaultAction
      if (current === 'import') importCount++
      if (row.bookingDate <= periodEnd && current !== row.defaultAction) {
        deltaFromDefaults += current === 'import' ? row.amount : -row.amount
      }
    }
    let removedAdj = 0
    for (const adj of previewData.overlappingAdjustments) {
      if (replaceAdjustmentIds.includes(adj.id) && adj.bookingDate <= periodEnd) {
        removedAdj += adj.amount
      }
    }
    liveProjected = liveProjected + deltaFromDefaults - removedAdj
    liveDiscrepancy = previewData.closingBalance - liveProjected
  } else if (previewData) {
    for (const row of previewData.rows) {
      if ((rowActions[row.index] ?? row.defaultAction) === 'import') importCount++
    }
  }

  const resetWizard = () => {
    setStep('file')
    setStagedFile(null)
    setPreviewData(null)
    setCommitResult(null)
    setError(null)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.imports.title}
        subtitle={t.imports.subtitle}
        actions={
          <div className="flex items-center gap-2 text-xs">
            <Badge tone={step === 'file' ? 'accent' : 'neutral'}>{t.imports.steps.file}</Badge>
            <Badge tone={step === 'preview' ? 'accent' : 'neutral'}>
              {t.imports.steps.preview}
            </Badge>
            <Badge tone={step === 'result' ? 'accent' : 'neutral'}>{t.imports.steps.result}</Badge>
          </div>
        }
      />

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-expense/40 bg-expense/10 px-3 py-2.5 text-sm text-expense"
        >
          <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {notice ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-teal/40 bg-teal/10 px-3 py-2.5 text-sm text-teal"
        >
          <CheckCircle2 size={16} aria-hidden className="shrink-0" />
          <span>{notice}</span>
        </div>
      ) : null}

      {step === 'file' ? (
        <Card className="space-y-5">
          {eligibleAccounts.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-fg-2">{t.imports.noEligibleAccounts}</p>
              <Button variant="primary" onClick={() => navigate('/accounts')}>
                {t.imports.goToAccounts}
              </Button>
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-fg">
                  {t.imports.accountLabel}
                  <select
                    value={activeAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className={`${INPUT_CLASS} mt-1.5 border-border-strong`}
                  >
                    {eligibleAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.currency} ·{' '}
                        {fmt.money(acc.balance, { currency: acc.currency })})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-fg">
                  {t.imports.formatOverrideLabel}
                  <select
                    value={forcedFormat}
                    onChange={(e) => setForcedFormat(e.target.value as StatementFormat | 'auto')}
                    className={`${INPUT_CLASS} mt-1.5 border-border-strong`}
                  >
                    <option value="auto">{t.imports.formatAuto}</option>
                    {STATEMENT_FORMATS.map((f) => (
                      <option key={f} value={f}>
                        {f.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => void handleDrop(e)}
                className={cx(
                  'flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
                  dragging
                    ? 'border-pink bg-pink/5'
                    : 'border-border-strong bg-surface-2/40 hover:border-pink/60',
                )}
              >
                <Upload size={28} aria-hidden className="mb-3 text-pink" />
                <p className="text-sm font-medium text-fg">{t.imports.dropzoneTitle}</p>
                <p className="mt-1 text-xs text-muted">{t.imports.dropzoneHint}</p>
                <div className="mt-4">
                  <Button variant="secondary" onClick={() => void handlePickFile()}>
                    <FileSpreadsheet size={15} aria-hidden />
                    {t.imports.chooseFile}
                  </Button>
                </div>
              </div>

              {stagedFile ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-teal/40 bg-teal/10 px-4 py-3">
                  <span className="text-sm font-medium text-fg">
                    {t.imports.selectedFile(
                      stagedFile.fileName,
                      forcedFormat === 'auto' ? stagedFile.detectedFormat : forcedFormat,
                      (stagedFile.sizeBytes / 1000).toFixed(1),
                    )}
                  </span>
                  <Button
                    variant="primary"
                    disabled={runPreviewMutation.isPending || !activeAccountId}
                    onClick={startPreview}
                  >
                    {runPreviewMutation.isPending
                      ? t.imports.analyzing
                      : t.imports.continueToPreview}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </Card>
      ) : null}

      {step === 'preview' && previewData ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep('file')}>
              {t.imports.backToFile}
            </Button>
            <div className="text-xs text-fg-2">
              {previewData.fileName} · {previewData.format.toUpperCase()} ·{' '}
              {previewData.encoding.toUpperCase()}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label={t.imports.summary.newCount}
              value={String(previewData.counts.newCount)}
            />
            <StatTile
              label={t.imports.summary.duplicates}
              value={String(
                previewData.counts.exactDuplicateCount + previewData.counts.fuzzyDuplicateCount,
              )}
            />
            <StatTile
              label={t.imports.summary.pendingCount}
              value={String(previewData.counts.pendingCount)}
            />
            <StatTile
              label={t.imports.summary.period}
              value={
                previewData.periodStart && previewData.periodEnd
                  ? `${fmt.date(previewData.periodStart)} → ${fmt.date(previewData.periodEnd)}`
                  : '—'
              }
            />
          </div>

          {previewData.warnings.length > 0 || previewData.counts.skippedLines > 0 ? (
            <Card className="space-y-1.5 border-border bg-surface-2/60 text-xs text-fg-2">
              {previewData.warnings.map((w, idx) => (
                <p key={`${w.code}-${idx}`} className="flex items-start gap-2">
                  <Info size={14} aria-hidden className="mt-0.5 shrink-0 text-amber" />
                  <span>
                    {w.code === 'currency-mismatch' && w.detail
                      ? t.imports.warnings.currencyMismatch(w.detail)
                      : w.code === 'unsettled-card-notice'
                        ? t.imports.warnings.unsettledCard
                        : w.code === 'encoding-fallback' && w.detail
                          ? t.imports.warnings.encodingFallback(w.detail)
                          : w.detail}
                  </span>
                </p>
              ))}
              {previewData.counts.skippedLines > 0 ? (
                <p className="flex items-start gap-2">
                  <AlertTriangle size={14} aria-hidden className="mt-0.5 shrink-0 text-amber" />
                  <span>
                    {t.imports.warnings.skippedLinesNotice(previewData.counts.skippedLines)}
                  </span>
                </p>
              ) : null}
            </Card>
          ) : null}

          {previewData.format === 'csv' && csvConfig && csvInspection ? (
            <CsvMappingEditor
              profiles={profilesQuery.data ?? []}
              selectedProfileId={selectedProfileId}
              config={csvConfig}
              inspection={csvInspection}
              onSelectProfile={(profileId) => {
                setSelectedProfileId(profileId)
                const prof = (profilesQuery.data ?? []).find((p) => p.id === profileId)
                if (prof && stagedFile && activeAccountId) {
                  setCsvConfig(prof.config)
                  runPreviewMutation.mutate({
                    token: stagedFile.token,
                    accountId: activeAccountId,
                    config: prof.config,
                    profileName: prof.name,
                    format: 'csv',
                  })
                }
              }}
              onChangeConfig={(next) => {
                setSelectedProfileId('custom')
                setCsvConfig(next)
              }}
              onRefreshPreview={() => {
                if (!stagedFile || !activeAccountId) return
                runPreviewMutation.mutate({
                  token: stagedFile.token,
                  accountId: activeAccountId,
                  config: csvConfig,
                  profileName: selectedProfileName,
                  format: 'csv',
                })
              }}
              onDeleteProfile={(id) => deleteProfileMutation.mutate(id)}
              onImportJsonProfile={(parsed) => saveProfileMutation.mutate(parsed)}
            />
          ) : null}

          {previewData.closingBalance !== null &&
          liveProjected !== null &&
          liveDiscrepancy !== null ? (
            <Card className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-fg">{t.imports.reconciliation.title}</h2>
                <Badge tone={liveDiscrepancy === 0 ? 'accent' : 'neutral'}>
                  {liveDiscrepancy === 0
                    ? t.imports.reconciliation.matched
                    : t.imports.reconciliation.mismatch(
                        fmt.money(liveDiscrepancy, {
                          currency: previewData.accountCurrency,
                          signed: true,
                        }),
                      )}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-6 text-xs text-fg-2">
                <span>
                  {t.imports.reconciliation.statementClosing} :{' '}
                  <strong className="tabular-nums text-fg">
                    {fmt.money(previewData.closingBalance, {
                      currency: previewData.accountCurrency,
                    })}
                  </strong>
                </span>
                <span>
                  {t.imports.reconciliation.projectedClosing} :{' '}
                  <strong className="tabular-nums text-fg">
                    {fmt.money(liveProjected, { currency: previewData.accountCurrency })}
                  </strong>
                </span>
              </div>

              {previewData.overlappingAdjustments.length > 0 ? (
                <div className="space-y-1.5 rounded-md border border-border bg-surface-2/60 p-3">
                  <p className="text-xs font-medium text-fg">
                    {t.imports.reconciliation.existingAdjustmentsTitle}
                  </p>
                  {previewData.overlappingAdjustments.map((adj) => {
                    const checked = replaceAdjustmentIds.includes(adj.id)
                    return (
                      <label
                        key={adj.id}
                        className="flex cursor-pointer items-center gap-2 text-xs text-fg-2"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setReplaceAdjustmentIds((ids) =>
                              e.target.checked
                                ? [...ids, adj.id]
                                : ids.filter((id) => id !== adj.id),
                            )
                          }
                        />
                        <span>
                          {t.imports.reconciliation.replaceAdjustment(
                            fmt.date(adj.bookingDate),
                            fmt.money(adj.amount, {
                              currency: previewData.accountCurrency,
                              signed: true,
                            }),
                            adj.note,
                          )}
                        </span>
                      </label>
                    )
                  })}
                </div>
              ) : null}

              {liveDiscrepancy !== 0 ? (
                <div className="space-y-2 rounded-md border border-border-strong bg-surface-2/40 p-3">
                  <p className="text-xs text-fg-2">{t.imports.reconciliation.mismatchHint}</p>
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-fg">
                    <input
                      type="checkbox"
                      checked={createAdjustment}
                      onChange={(e) => setCreateAdjustment(e.target.checked)}
                    />
                    <span>
                      {t.imports.reconciliation.createAdjustmentLabel(
                        fmt.money(liveDiscrepancy, {
                          currency: previewData.accountCurrency,
                          signed: true,
                        }),
                      )}
                    </span>
                  </label>
                  {createAdjustment ? (
                    <label className="block text-xs font-medium text-fg-2">
                      {t.imports.reconciliation.adjustmentNoteLabel}
                      <input
                        type="text"
                        required
                        value={adjustmentNote}
                        onChange={(e) => setAdjustmentNote(e.target.value)}
                        placeholder={t.imports.reconciliation.adjustmentNotePlaceholder}
                        className={`${INPUT_CLASS} mt-1 border-border-strong`}
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
            </Card>
          ) : null}

          <Card className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-fg">{t.imports.previewTable.title}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    const next: Record<number, ImportRowAction> = {}
                    for (const r of previewData.rows) {
                      next[r.index] = r.matchKind === 'new' ? 'import' : 'skip'
                    }
                    setRowActions(next)
                  }}
                >
                  {t.imports.previewTable.ignoreDuplicates}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    const next: Record<number, ImportRowAction> = {}
                    for (const r of previewData.rows) next[r.index] = 'import'
                    setRowActions(next)
                  }}
                >
                  {t.imports.previewTable.selectAll}
                </Button>
              </div>
            </div>

            {previewData.rows.length > MAX_DISPLAY_PREVIEW_ROWS ? (
              <p className="text-xs text-muted">
                {t.imports.previewTable.truncatedNotice(
                  MAX_DISPLAY_PREVIEW_ROWS,
                  previewData.rows.length,
                )}
              </p>
            ) : null}

            <div className="max-h-96 overflow-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-fg-2">
                    <th className="py-2 pr-3 font-medium">{t.imports.previewTable.date}</th>
                    <th className="py-2 pr-3 font-medium">{t.imports.previewTable.label}</th>
                    <th className="py-2 pr-3 font-medium">{t.imports.previewTable.status}</th>
                    <th className="py-2 pr-3 font-medium">{t.imports.previewTable.match}</th>
                    <th className="py-2 pr-3 text-right font-medium">
                      {t.imports.previewTable.amount}
                    </th>
                    <th className="py-2 text-right font-medium">{t.imports.previewTable.action}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {previewData.rows.slice(0, MAX_DISPLAY_PREVIEW_ROWS).map((row) => {
                    const action = rowActions[row.index] ?? row.defaultAction
                    return (
                      <tr key={row.index} className={cx(action === 'skip' && 'opacity-60')}>
                        <td className="py-2 pr-3 whitespace-nowrap text-fg-2">
                          {fmt.date(row.bookingDate)}
                        </td>
                        <td className="py-2 pr-3">
                          <div className="font-medium text-fg">{row.labelRaw}</div>
                          {row.matchedTransaction ? (
                            <div className="text-[11px] text-muted">
                              {t.imports.previewTable.matchedHint(
                                fmt.date(row.matchedTransaction.bookingDate),
                                row.matchedTransaction.label,
                              )}
                            </div>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3 text-fg-2">
                          {t.transactions.statuses[row.status]}
                        </td>
                        <td className="py-2 pr-3">
                          <Badge tone={row.matchKind === 'new' ? 'accent' : 'neutral'}>
                            {t.imports.previewTable.kinds[row.matchKind]}
                          </Badge>
                        </td>
                        <td
                          className={cx(
                            'py-2 pr-3 text-right font-medium tabular-nums',
                            row.amount >= 0 ? 'text-income' : 'text-fg',
                          )}
                        >
                          {fmt.money(row.amount, {
                            currency: previewData.accountCurrency,
                            signed: true,
                          })}
                        </td>
                        <td className="py-2 text-right">
                          <select
                            aria-label={`${t.imports.previewTable.action} — ${row.labelRaw}`}
                            value={action}
                            onChange={(e) =>
                              setRowActions((prev) => ({
                                ...prev,
                                [row.index]: e.target.value as ImportRowAction,
                              }))
                            }
                            className="h-7 rounded border border-border-strong bg-surface-2 px-1.5 text-xs text-fg"
                          >
                            <option value="import">{t.imports.previewTable.actionImport}</option>
                            <option value="skip">{t.imports.previewTable.actionSkip}</option>
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {previewData.format === 'csv' && csvConfig ? (
              <div className="space-y-2 border-t border-border pt-3">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-fg">
                  <input
                    type="checkbox"
                    checked={saveProfile}
                    onChange={(e) => setSaveProfile(e.target.checked)}
                  />
                  <span>{t.imports.csv.saveProfileToggle}</span>
                </label>
                {saveProfile ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs text-fg-2">
                      {t.imports.csv.profileNameLabel}
                      <input
                        type="text"
                        value={newProfileName}
                        onChange={(e) => setNewProfileName(e.target.value)}
                        className={`${INPUT_CLASS} mt-1 border-border-strong`}
                      />
                    </label>
                    <label className="text-xs text-fg-2">
                      {t.imports.csv.profileBankLabel}
                      <input
                        type="text"
                        value={newProfileBank}
                        onChange={(e) => setNewProfileBank(e.target.value)}
                        className={`${INPUT_CLASS} mt-1 border-border-strong`}
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={resetWizard}>
                {t.common.cancel}
              </Button>
              <Button
                variant="primary"
                disabled={commitMutation.isPending}
                onClick={() => commitMutation.mutate()}
              >
                {commitMutation.isPending
                  ? t.imports.committing
                  : t.imports.confirmButton(importCount)}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {step === 'result' && commitResult ? (
        <Card className="space-y-4">
          <div className="flex items-center gap-2.5 text-teal">
            <CheckCircle2 size={22} aria-hidden />
            <h2 className="text-base font-semibold text-fg">{t.imports.result.title}</h2>
          </div>
          <p className="text-sm text-fg">
            {t.imports.result.summary(commitResult.insertedCount, commitResult.duplicateCount)}
          </p>
          {commitResult.replacedAdjustmentCount > 0 ? (
            <p className="text-xs text-fg-2">
              {t.imports.result.replacedAdjustments(commitResult.replacedAdjustmentCount)}
            </p>
          ) : null}
          {commitResult.adjustmentTransactionId ? (
            <p className="text-xs text-fg-2">{t.imports.result.createdAdjustment}</p>
          ) : null}
          {commitResult.savedProfileName ? (
            <p className="text-xs text-fg-2">
              {t.imports.result.savedProfile(commitResult.savedProfileName)}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => {
                openRegister({ accountIds: [commitResult.accountId] })
                navigate('/transactions')
              }}
            >
              {t.imports.result.viewTransactions}
            </Button>
            <Button variant="secondary" onClick={resetWizard}>
              {t.imports.result.importAnother}
            </Button>
          </div>
        </Card>
      ) : null}

      <ImportHistoryCard
        batches={batchesQuery.data ?? []}
        onRevert={(batchId) => revertMutation.mutate(batchId)}
      />
    </div>
  )
}
