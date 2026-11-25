import {
  Check,
  CircleAlert,
  CircleCheck,
  Download,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useState } from 'react'
import type {
  AiConfigPublic,
  DocumentDetail,
  DocumentKind,
  ExtractedDocumentDraft,
  ExtractedPayslipDraft,
  ExtractedStatementDraft,
  SourceZone,
} from '@shared/documents/model'
import { DOCUMENT_KINDS, normalizeCompanyName } from '@shared/documents/model'
import type { AccountSummary } from '@shared/ledger/model'
import { checkPayslipDetailed, type ContractSummary } from '@shared/payslip'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { SelectField, TextField } from '../../components/ui/Field'
import { Switch } from '../../components/ui/Switch'
import { useT } from '../../i18n'
import { useFormatters } from '../../lib/format'

function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '0.00'
  return (cents / 100).toFixed(2)
}

function inputToCents(raw: string, signed = false): number {
  const num = Number.parseFloat(raw.replace(',', '.').replace(/\s+/g, ''))
  if (!Number.isFinite(num)) return 0
  const cents = Math.round(num * 100)
  return signed ? cents : Math.max(0, cents)
}

/**
 * Relecture côte à côte M7 :
 * - à gauche : aperçu image (scans) ou page reconstituée fidèlement depuis les coordonnées extraites,
 *   avec mise en surbrillance de la `SourceZone` sélectionnée ;
 * - à droite : formulaire éditable (Bulletin M6 ou Relevé M3), contrôles de cohérence en direct,
 *   boutons d'export avant purge, assistance IA anonymisée optionnelle (ADR-022) et intégration.
 */
export function DocumentReviewPane({
  detail,
  aiConfig,
  contracts,
  accounts,
  busy,
  onRerunExtraction,
  onAskAiAssist,
  onExportOriginal,
  onCommitPayslip,
  onCommitStatement,
  onReject,
  onDelete,
}: {
  detail: DocumentDetail
  aiConfig: AiConfigPublic | null
  contracts: readonly ContractSummary[]
  accounts: readonly AccountSummary[]
  busy: boolean
  onRerunExtraction: (kindOverride: DocumentKind) => void
  onAskAiAssist: () => void
  onExportOriginal: () => void
  onCommitPayslip: (payload: {
    contractId: string | null
    employerName?: string
    employerSiret?: string | null
    contractTitle?: string
    contractStartDate?: string | null
    contractEndDate?: string | null
    draft: ExtractedPayslipDraft
  }) => void
  onCommitStatement: (payload: { accountId: string; draft: ExtractedStatementDraft }) => void
  onReject: () => void
  onDelete: () => void
}) {
  const t = useT()
  const dt = t.documents
  const rv = dt.review
  const fmt = useFormatters()

  const [draft, setDraft] = useState<ExtractedDocumentDraft | null>(detail.draft)
  const [activeZone, setActiveZone] = useState<SourceZone | null>(null)
  const [selectedContractId, setSelectedContractId] = useState<string>(() => {
    if (detail.draft?.kind !== 'payslip') return ''
    const empTarget = detail.draft.employerName
      ? normalizeCompanyName(detail.draft.employerName)
      : ''
    const titleTarget = detail.draft.contractTitle
      ? normalizeCompanyName(detail.draft.contractTitle)
      : ''
    const active = contracts.filter((c) => !c.archived)
    if (empTarget) {
      const sameEmployer = active.filter((c) => normalizeCompanyName(c.employerName) === empTarget)
      if (titleTarget) {
        const matchTitle = sameEmployer.find((c) => normalizeCompanyName(c.title) === titleTarget)
        if (matchTitle) return matchTitle.id
      }
      if (sameEmployer.length > 0) return sameEmployer[0]!.id
    }
    return ''
  })
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    accounts.find((a) => !a.archived && a.trackingMode !== 'valuation')?.id ?? '',
  )

  const readOnly = detail.status === 'committed'
  const page = detail.pages[activeZone ? Math.max(0, activeZone.page - 1) : 0] ?? detail.pages[0]

  // Contrôle arithmétique M6 en direct lorsque le brouillon est un bulletin de paie.
  const payslipIssues =
    draft && draft.kind === 'payslip'
      ? checkPayslipDetailed({
          countryPack: 'fr',
          period: draft.period ?? '2026-01',
          totalsOnly: true,
          baseHoursHundredths: draft.baseHoursHundredths,
          hourlyRate: draft.hourlyRate,
          baseSalary: draft.baseSalary,
          gross: draft.gross,
          employeeContributions: draft.employeeContributions,
          employerContributions: draft.employerContributions,
          netBeforeTax: draft.netBeforeTax,
          taxableNet: draft.taxableNet,
          socialNet: draft.socialNet,
          withholdingRateMicros: draft.withholdingRateMicros,
          withholdingBase: draft.withholdingBase,
          withholdingTax: draft.withholdingTax,
          otherAdjustments: draft.otherAdjustments,
          netPaid: draft.netPaid,
          ytdGross: draft.ytdGross,
          ytdTaxableNet: draft.ytdTaxableNet,
          ytdWithholding: draft.ytdWithholding,
          ytdHoursHundredths: draft.ytdHoursHundredths,
          lines: draft.lines,
        })
      : []
  const payslipErrors = payslipIssues.filter((i) => i.severity === 'error')

  const eligibleAccounts = accounts.filter((a) => !a.archived && a.trackingMode !== 'valuation')

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Colonne gauche : aperçu source et zone surlignée */}
      <Card
        title={rv.previewTitle}
        subtitle={
          detail.pages.length > 0
            ? rv.previewPage(page?.pageNumber ?? 1, detail.pageCount)
            : detail.hasOriginalBytes
              ? rv.previewEmpty
              : rv.previewPurged
        }
      >
        <div className="space-y-3">
          {detail.previewImageDataUrl ? (
            <div
              className="relative overflow-hidden rounded-lg border border-border bg-surface-2"
              style={{ minHeight: '340px' }}
            >
              <img
                src={detail.previewImageDataUrl}
                alt={detail.fileName}
                className="w-full"
                style={{ display: 'block', objectFit: 'contain', maxHeight: '520px' }}
              />
              {activeZone ? (
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: `${activeZone.box.x * 100}%`,
                    top: `${activeZone.box.y * 100}%`,
                    width: `${activeZone.box.width * 100}%`,
                    height: `${activeZone.box.height * 100}%`,
                    border: '2px solid #e11d74',
                    backgroundColor: 'rgba(225, 29, 116, 0.14)',
                    pointerEvents: 'none',
                  }}
                />
              ) : null}
            </div>
          ) : page ? (
            <div
              className="relative overflow-hidden rounded-lg border border-border bg-surface-2"
              style={{
                position: 'relative',
                minHeight: '380px',
                aspectRatio: `${page.width} / ${page.height}`,
              }}
            >
              {page.items.length > 0 ? (
                page.items.map((item, idx) => (
                  <span
                    key={`${idx}-${item.text.slice(0, 12)}`}
                    className="text-xs text-fg"
                    style={{
                      position: 'absolute',
                      left: `${item.box.x * 100}%`,
                      top: `${item.box.y * 100}%`,
                      whiteSpace: 'nowrap',
                      fontSize: '10px',
                      lineHeight: 1.1,
                    }}
                  >
                    {item.text}
                  </span>
                ))
              ) : (
                <pre className="p-3 text-xs text-fg" style={{ whiteSpace: 'pre-wrap' }}>
                  {page.text}
                </pre>
              )}
              {activeZone ? (
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: `${activeZone.box.x * 100}%`,
                    top: `${activeZone.box.y * 100}%`,
                    width: `${activeZone.box.width * 100}%`,
                    height: `${activeZone.box.height * 100}%`,
                    border: '2px solid #e11d74',
                    backgroundColor: 'rgba(225, 29, 116, 0.14)',
                    pointerEvents: 'none',
                  }}
                />
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-surface-2 p-4 text-xs text-muted">
              {detail.hasOriginalBytes ? rv.previewEmpty : rv.previewPurged}
            </div>
          )}

          <p className="text-xs text-muted">{rv.highlightHint}</p>
        </div>
      </Card>

      {/* Colonne droite : champs éditables + contrôles + actions */}
      <Card
        title={rv.formTitle}
        subtitle={`${detail.fileName} · ${dt.methods[detail.extractionMethod]} · ${rv.confidenceBadge(Math.round(detail.confidence * 100))}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={detail.status === 'needs_review' ? 'accent' : 'neutral'}>
              {dt.statuses[detail.status]}
            </Badge>
            {detail.hasOriginalBytes ? (
              <Button disabled={busy} onClick={onExportOriginal}>
                <Download size={14} aria-hidden />
                {rv.exportOriginal}
              </Button>
            ) : null}
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div style={{ minWidth: '180px' }}>
              <SelectField
                label={rv.kindLabel}
                value={draft?.kind ?? detail.kind}
                disabled={readOnly || busy}
                options={DOCUMENT_KINDS.map((k) => ({ value: k, label: dt.kinds[k] }))}
                onChange={(nextKind) => onRerunExtraction(nextKind)}
              />
            </div>
            {!readOnly ? (
              <Button disabled={busy} onClick={() => onRerunExtraction(detail.kind)}>
                <RefreshCw size={14} aria-hidden />
                {rv.rerunLocal}
              </Button>
            ) : null}
          </div>

          {!readOnly && draft?.needsAiAssist ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 p-3 text-xs">
              <span className="text-fg-2">{rv.needsAiBanner}</span>
              {aiConfig && aiConfig.provider !== 'none' ? (
                <Button disabled={busy} onClick={onAskAiAssist}>
                  <Sparkles size={14} aria-hidden />
                  {rv.askAiAssist}
                </Button>
              ) : (
                <span className="text-muted">{rv.aiDisabledHint}</span>
              )}
            </div>
          ) : null}

          {draft && draft.kind === 'payslip' ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label={rv.payslipFields.contract}
                  value={selectedContractId}
                  disabled={readOnly}
                  options={[
                    { value: '', label: rv.payslipFields.newContractAuto },
                    ...contracts
                      .filter((c) => !c.archived)
                      .map((c) => ({ value: c.id, label: `${c.employerName} — ${c.title}` })),
                  ]}
                  onChange={setSelectedContractId}
                />
                <TextField
                  label={rv.payslipFields.employerName}
                  value={draft.employerName ?? ''}
                  disabled={readOnly}
                  onFocus={() => setActiveZone(draft.fieldZones.employerName?.sourceZone ?? null)}
                  onChange={(v) => setDraft({ ...draft, employerName: v || null })}
                />
                <TextField
                  label={rv.payslipFields.contractTitle}
                  value={draft.contractTitle ?? ''}
                  disabled={readOnly}
                  onFocus={() => setActiveZone(draft.fieldZones.contractTitle?.sourceZone ?? null)}
                  onChange={(v) => setDraft({ ...draft, contractTitle: v || null })}
                />
                <TextField
                  label={rv.payslipFields.contractStartDate}
                  value={draft.contractStartDate ?? ''}
                  disabled={readOnly}
                  onFocus={() =>
                    setActiveZone(draft.fieldZones.contractStartDate?.sourceZone ?? null)
                  }
                  onChange={(v) => setDraft({ ...draft, contractStartDate: v || null })}
                />
                <TextField
                  label={rv.payslipFields.contractEndDate}
                  value={draft.contractEndDate ?? ''}
                  disabled={readOnly}
                  onFocus={() =>
                    setActiveZone(draft.fieldZones.contractEndDate?.sourceZone ?? null)
                  }
                  onChange={(v) => setDraft({ ...draft, contractEndDate: v || null })}
                />
                <TextField
                  label={rv.payslipFields.period}
                  value={draft.period ?? ''}
                  disabled={readOnly}
                  onFocus={() => setActiveZone(draft.fieldZones.period?.sourceZone ?? null)}
                  onChange={(v) => setDraft({ ...draft, period: v || null })}
                />
                <TextField
                  label={rv.payslipFields.paymentDate}
                  value={draft.paymentDate ?? ''}
                  disabled={readOnly}
                  onFocus={() => setActiveZone(draft.fieldZones.paymentDate?.sourceZone ?? null)}
                  onChange={(v) => setDraft({ ...draft, paymentDate: v || null })}
                />
                <TextField
                  label={rv.payslipFields.baseSalary}
                  value={centsToInput(draft.baseSalary)}
                  disabled={readOnly}
                  onFocus={() => setActiveZone(draft.fieldZones.baseSalary?.sourceZone ?? null)}
                  onChange={(v) => setDraft({ ...draft, baseSalary: inputToCents(v) })}
                />
                <TextField
                  label={rv.payslipFields.gross}
                  value={centsToInput(draft.gross)}
                  disabled={readOnly}
                  onFocus={() => setActiveZone(draft.fieldZones.gross?.sourceZone ?? null)}
                  onChange={(v) => setDraft({ ...draft, gross: inputToCents(v) })}
                />
                <TextField
                  label={rv.payslipFields.employeeContributions}
                  value={centsToInput(draft.employeeContributions)}
                  disabled={readOnly}
                  onFocus={() =>
                    setActiveZone(draft.fieldZones.employeeContributions?.sourceZone ?? null)
                  }
                  onChange={(v) => setDraft({ ...draft, employeeContributions: inputToCents(v) })}
                />
                <TextField
                  label={rv.payslipFields.netBeforeTax}
                  value={centsToInput(draft.netBeforeTax)}
                  disabled={readOnly}
                  onFocus={() => setActiveZone(draft.fieldZones.netBeforeTax?.sourceZone ?? null)}
                  onChange={(v) => setDraft({ ...draft, netBeforeTax: inputToCents(v, true) })}
                />
                <TextField
                  label={rv.payslipFields.taxableNet}
                  value={centsToInput(draft.taxableNet)}
                  disabled={readOnly}
                  onFocus={() => setActiveZone(draft.fieldZones.taxableNet?.sourceZone ?? null)}
                  onChange={(v) => setDraft({ ...draft, taxableNet: inputToCents(v, true) })}
                />
                <TextField
                  label={rv.payslipFields.withholdingTax}
                  value={centsToInput(draft.withholdingTax)}
                  disabled={readOnly}
                  onFocus={() => setActiveZone(draft.fieldZones.withholdingTax?.sourceZone ?? null)}
                  onChange={(v) => setDraft({ ...draft, withholdingTax: inputToCents(v) })}
                />
                <TextField
                  label={rv.payslipFields.otherAdjustments}
                  value={centsToInput(draft.otherAdjustments)}
                  disabled={readOnly}
                  onChange={(v) => setDraft({ ...draft, otherAdjustments: inputToCents(v, true) })}
                />
                <TextField
                  label={rv.payslipFields.netPaid}
                  value={centsToInput(draft.netPaid)}
                  disabled={readOnly}
                  onFocus={() => setActiveZone(draft.fieldZones.netPaid?.sourceZone ?? null)}
                  onChange={(v) => setDraft({ ...draft, netPaid: inputToCents(v, true) })}
                />
              </div>

              {!readOnly ? (
                <div className="rounded-lg border border-border bg-surface-2 px-3">
                  <Switch
                    checked={draft.isFinalSettlement}
                    label={rv.payslipFields.isFinalSettlement}
                    onChange={(checked) => setDraft({ ...draft, isFinalSettlement: checked })}
                  />
                </div>
              ) : draft.isFinalSettlement ? (
                <div className="flex items-center gap-2">
                  <Badge tone="accent">{rv.payslipFields.finalSettlementBadge}</Badge>
                </div>
              ) : null}

              <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs">
                {payslipErrors.length === 0 ? (
                  <>
                    <CircleCheck size={14} className="text-income" aria-hidden />
                    <span className="text-income">{rv.payslipFields.coherenceOk}</span>
                  </>
                ) : (
                  <>
                    <CircleAlert size={14} className="text-expense" aria-hidden />
                    <span className="text-expense">
                      {rv.payslipFields.coherenceErrors(payslipErrors.length)}
                    </span>
                  </>
                )}
              </div>

              {!readOnly ? (
                <div className="flex flex-wrap justify-between gap-2 pt-2">
                  <div className="flex gap-2">
                    <Button disabled={busy} onClick={onReject}>
                      <X size={14} aria-hidden />
                      {rv.reject}
                    </Button>
                    <Button disabled={busy} onClick={onDelete}>
                      <Trash2 size={14} aria-hidden />
                      {rv.remove}
                    </Button>
                  </div>
                  <Button
                    variant="primary"
                    disabled={busy || !draft.period}
                    onClick={() =>
                      onCommitPayslip({
                        contractId: selectedContractId || null,
                        employerName: draft.employerName ?? undefined,
                        employerSiret: draft.employerSiret,
                        contractTitle: draft.contractTitle ?? undefined,
                        contractStartDate: draft.contractStartDate,
                        contractEndDate: draft.contractEndDate,
                        draft,
                      })
                    }
                  >
                    <Check size={14} aria-hidden />
                    {rv.payslipFields.commitPayslip}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {draft && draft.kind === 'statement' ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label={rv.statementFields.account}
                  value={selectedAccountId}
                  disabled={readOnly}
                  options={eligibleAccounts.map((a) => ({
                    value: a.id,
                    label: `${a.name} (${a.currency})`,
                  }))}
                  onChange={setSelectedAccountId}
                />
                <div className="flex items-end pb-1 text-xs font-medium text-fg-2">
                  {rv.statementFields.rowCount(draft.rows.length)}
                </div>
                <TextField
                  label={rv.statementFields.openingBalance}
                  value={centsToInput(draft.openingBalance ?? 0)}
                  disabled={readOnly}
                  onChange={(v) => setDraft({ ...draft, openingBalance: inputToCents(v, true) })}
                />
                <TextField
                  label={rv.statementFields.closingBalance}
                  value={centsToInput(draft.closingBalance ?? 0)}
                  disabled={readOnly}
                  onChange={(v) => setDraft({ ...draft, closingBalance: inputToCents(v, true) })}
                />
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs">
                {draft.balanceDiscrepancy === null || draft.balanceDiscrepancy === 0 ? (
                  <>
                    <CircleCheck size={14} className="text-income" aria-hidden />
                    <span className="text-income">{rv.statementFields.discrepancyZero}</span>
                  </>
                ) : (
                  <>
                    <CircleAlert size={14} className="text-expense" aria-hidden />
                    <span className="text-expense">
                      {rv.statementFields.discrepancyWarn(
                        fmt.money(draft.balanceDiscrepancy, { currency: draft.currency }),
                      )}
                    </span>
                  </>
                )}
              </div>

              <div
                className="overflow-auto rounded-lg border border-border"
                style={{ maxHeight: '260px' }}
              >
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-surface-2 text-left text-muted">
                      <th className="px-2.5 py-2">{rv.statementFields.colDate}</th>
                      <th className="px-2.5 py-2">{rv.statementFields.colLabel}</th>
                      <th className="px-2.5 py-2 text-right">{rv.statementFields.colAmount}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.rows.map((row) => (
                      <tr
                        key={row.index}
                        className="border-b border-border hover:bg-surface-2"
                        onClick={() => setActiveZone(row.sourceZone)}
                      >
                        <td className="px-2.5 py-1.5 tabular-nums text-fg-2">{row.bookingDate}</td>
                        <td className="px-2.5 py-1.5 text-fg">{row.labelRaw}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">
                          {fmt.money(row.amount, { currency: draft.currency })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!readOnly ? (
                <div className="flex flex-wrap justify-between gap-2 pt-2">
                  <div className="flex gap-2">
                    <Button disabled={busy} onClick={onReject}>
                      <X size={14} aria-hidden />
                      {rv.reject}
                    </Button>
                    <Button disabled={busy} onClick={onDelete}>
                      <Trash2 size={14} aria-hidden />
                      {rv.remove}
                    </Button>
                  </div>
                  <Button
                    variant="primary"
                    disabled={busy || !selectedAccountId || draft.rows.length === 0}
                    onClick={() => onCommitStatement({ accountId: selectedAccountId, draft })}
                  >
                    <Check size={14} aria-hidden />
                    {rv.statementFields.commitStatement}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {draft && draft.kind === 'other' && !readOnly ? (
            <div className="flex flex-wrap justify-between gap-2 pt-2">
              <Button disabled={busy} onClick={onReject}>
                <X size={14} aria-hidden />
                {rv.reject}
              </Button>
              <Button disabled={busy} onClick={onDelete}>
                <Trash2 size={14} aria-hidden />
                {rv.remove}
              </Button>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  )
}
