import { Calculator, CircleAlert, CircleCheck, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import {
  buildDefaultContributionLines,
  checkPayslipDetailed,
  CONTRIBUTION_GROUPS_FR,
  PAYSLIP_ABSENCE_KINDS,
  PAYSLIP_AFTER_TAX_KINDS,
  PAYSLIP_VARIABLE_KINDS,
  type ContractSummary,
  type PayslipDetail,
  type PayslipDuplicateDraft,
  type PayslipLineInput,
  type PayslipSaveInput,
} from '@shared/payslip'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { SelectField, TextField } from '../../components/ui/Field'
import { Switch } from '../../components/ui/Switch'
import { useT } from '../../i18n'
import { useFormatters } from '../../lib/format'
import { ledgerErrorCode, useLedgerMutation } from '../../lib/ledger'

function parseCents(raw: string, signed = false): number {
  const clean = raw.replace(/\s+/g, '').replace(',', '.')
  if (!clean) return 0
  const val = Number(clean)
  if (!Number.isFinite(val)) return 0
  const rounded = Math.round(val * 100)
  return signed ? rounded : Math.max(0, rounded)
}

function parseOptionalCents(raw: string): number | null {
  if (!raw.trim()) return null
  return parseCents(raw)
}

function parseOptionalHundredths(raw: string): number | null {
  const clean = raw.replace(/\s+/g, '').replace(',', '.')
  if (!clean) return null
  const val = Number(clean)
  if (!Number.isFinite(val) || val < 0) return null
  return Math.round(val * 100)
}

function parseRateMicros(raw: string): number {
  const clean = raw.replace(/\s+/g, '').replace(',', '.')
  if (!clean) return 0
  const val = Number(clean)
  if (!Number.isFinite(val) || val < 0) return 0
  return Math.min(1_000_000, Math.round(val * 10_000))
}

function fmtEurosInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return ''
  return (cents / 100).toFixed(2)
}

function fmtPctInput(micros: number | null | undefined): string {
  if (micros === null || micros === undefined) return ''
  return (micros / 10_000).toFixed(2)
}

function fmtHoursInput(hundredths: number | null | undefined): string {
  if (hundredths === null || hundredths === undefined) return ''
  return (hundredths / 100).toFixed(2)
}

type EditableSource = PayslipDetail | PayslipDuplicateDraft

export function PayslipEditorDialog({
  contracts,
  initial,
  payslipId,
  existingYearPoints,
  onClose,
  onSaved,
}: {
  contracts: readonly ContractSummary[]
  initial: EditableSource | null
  payslipId?: string
  existingYearPoints?: readonly {
    contractId: string
    period: string
    gross: number
    taxableNet: number
    withholdingTax: number
    baseHoursHundredths: number | null
  }[]
  onClose: () => void
  onSaved: (saved: PayslipDetail) => void
}) {
  const t = useT()
  const fmt = useFormatters()
  const pt = t.payslips
  const saveMutation = useLedgerMutation('payslipSave')

  const defaultContract = contracts.find((c) => !c.archived) ?? contracts[0]
  const [contractId, setContractId] = useState(initial?.contractId ?? defaultContract?.id ?? '')
  const [period, setPeriod] = useState(initial?.period ?? new Date().toISOString().slice(0, 7))
  const [paymentDate, setPaymentDate] = useState(initial?.paymentDate ?? '')
  const [totalsOnly, setTotalsOnly] = useState(initial?.totalsOnly ?? false)
  const [baseHours, setBaseHours] = useState(() =>
    fmtHoursInput(initial?.baseHoursHundredths ?? defaultContract?.monthlyHoursHundredths),
  )
  const [hourlyRate, setHourlyRate] = useState(() => fmtEurosInput(initial?.hourlyRate))
  const [baseSalary, setBaseSalary] = useState(() =>
    fmtEurosInput(initial?.baseSalary ?? defaultContract?.defaultBaseSalary ?? 0),
  )
  const [lines, setLines] = useState<PayslipLineInput[]>(() =>
    initial
      ? initial.lines.map((l) => ({
          section: l.section,
          itemKind: l.itemKind,
          label: l.label,
          quantityHundredths: l.quantityHundredths,
          baseAmount: l.baseAmount,
          employeeRateMicros: l.employeeRateMicros,
          employeeAmount: l.employeeAmount,
          employerRateMicros: l.employerRateMicros,
          employerAmount: l.employerAmount,
          taxable: l.taxable,
        }))
      : [],
  )
  const [gross, setGross] = useState(() =>
    fmtEurosInput(initial?.gross ?? defaultContract?.defaultBaseSalary ?? 0),
  )
  const [employeeContrib, setEmployeeContrib] = useState(() =>
    fmtEurosInput(initial?.employeeContributions ?? 0),
  )
  const [employerContrib, setEmployerContrib] = useState(() =>
    fmtEurosInput(initial?.employerContributions ?? 0),
  )
  const [netBeforeTax, setNetBeforeTax] = useState(() =>
    fmtEurosInput(initial?.netBeforeTax ?? defaultContract?.defaultBaseSalary ?? 0),
  )
  const [taxableNet, setTaxableNet] = useState(() =>
    fmtEurosInput(initial?.taxableNet ?? defaultContract?.defaultBaseSalary ?? 0),
  )
  const [socialNet, setSocialNet] = useState(() => fmtEurosInput(initial?.socialNet))
  const [withholdingRate, setWithholdingRate] = useState(() =>
    fmtPctInput(initial?.withholdingRateMicros ?? 0),
  )
  const [withholdingPersonalized, setWithholdingPersonalized] = useState(
    initial?.withholdingPersonalized ?? true,
  )
  const [withholdingBase, setWithholdingBase] = useState(() =>
    fmtEurosInput(initial?.withholdingBase),
  )
  const [withholdingTax, setWithholdingTax] = useState(() =>
    fmtEurosInput(initial?.withholdingTax ?? 0),
  )
  const [otherAdjustments, setOtherAdjustments] = useState(() =>
    fmtEurosInput(initial?.otherAdjustments ?? 0),
  )
  const [netPaid, setNetPaid] = useState(() =>
    fmtEurosInput(initial?.netPaid ?? defaultContract?.defaultBaseSalary ?? 0),
  )
  const [ytdGross, setYtdGross] = useState(() => fmtEurosInput(initial?.ytdGross))
  const [ytdTaxable, setYtdTaxable] = useState(() => fmtEurosInput(initial?.ytdTaxableNet))
  const [ytdTax, setYtdTax] = useState(() => fmtEurosInput(initial?.ytdWithholding))
  const [ytdHours, setYtdHours] = useState(() => fmtHoursInput(initial?.ytdHoursHundredths))
  const [employeeNir, setEmployeeNir] = useState(() =>
    initial && 'employeeNir' in initial ? (initial.employeeNir ?? '') : '',
  )
  const [employeeAddress, setEmployeeAddress] = useState(() =>
    initial && 'employeeAddress' in initial ? (initial.employeeAddress ?? '') : '',
  )
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [formError, setFormError] = useState<string | null>(null)

  const selectedContract = contracts.find((c) => c.id === contractId) ?? defaultContract
  const currency = selectedContract?.currency ?? 'EUR'

  const draftInput: PayslipSaveInput = useMemo(
    () => ({
      ...(payslipId ? { id: payslipId } : {}),
      contractId,
      period,
      paymentDate: paymentDate.trim() || null,
      countryPack: selectedContract?.countryPack ?? 'fr',
      currency,
      totalsOnly,
      baseHoursHundredths: parseOptionalHundredths(baseHours),
      hourlyRate: parseOptionalCents(hourlyRate),
      baseSalary: parseCents(baseSalary),
      gross: parseCents(gross),
      employeeContributions: parseCents(employeeContrib),
      employerContributions: parseCents(employerContrib),
      netBeforeTax: parseCents(netBeforeTax, true),
      taxableNet: parseCents(taxableNet, true),
      socialNet: parseOptionalCents(socialNet),
      withholdingRateMicros: parseRateMicros(withholdingRate),
      withholdingPersonalized,
      withholdingBase: parseOptionalCents(withholdingBase),
      withholdingTax: parseCents(withholdingTax),
      otherAdjustments: parseCents(otherAdjustments, true),
      netPaid: parseCents(netPaid, true),
      ytdGross: parseOptionalCents(ytdGross),
      ytdTaxableNet: parseOptionalCents(ytdTaxable),
      ytdWithholding: parseOptionalCents(ytdTax),
      ytdHoursHundredths: parseOptionalHundredths(ytdHours),
      employeeNir: employeeNir.trim() || null,
      employeeAddress: employeeAddress.trim() || null,
      notes: notes.trim() || null,
      lines,
    }),
    [
      payslipId,
      contractId,
      period,
      paymentDate,
      selectedContract?.countryPack,
      currency,
      totalsOnly,
      baseHours,
      hourlyRate,
      baseSalary,
      gross,
      employeeContrib,
      employerContrib,
      netBeforeTax,
      taxableNet,
      socialNet,
      withholdingRate,
      withholdingPersonalized,
      withholdingBase,
      withholdingTax,
      otherAdjustments,
      netPaid,
      ytdGross,
      ytdTaxable,
      ytdTax,
      ytdHours,
      employeeNir,
      employeeAddress,
      notes,
      lines,
    ],
  )

  const sameYearPoints = useMemo(
    () =>
      (existingYearPoints ?? []).filter(
        (p) => p.contractId === contractId && p.period.startsWith(`${period.slice(0, 4)}-`),
      ),
    [existingYearPoints, contractId, period],
  )

  const liveIssues = useMemo(
    () => checkPayslipDetailed(draftInput, sameYearPoints),
    [draftInput, sameYearPoints],
  )

  const prefillFrance = () => {
    const baseCents = parseCents(baseSalary)
    const vars = lines
      .filter((l) => l.section === 'variable')
      .reduce((s, l) => s + l.employeeAmount, 0)
    const abs = lines
      .filter((l) => l.section === 'absence')
      .reduce((s, l) => s + Math.abs(l.employeeAmount), 0)
    const nextGross = Math.max(0, baseCents + vars - abs)
    const contribLines = buildDefaultContributionLines(nextGross)
    const keptOther = lines.filter((l) => l.section !== 'contribution')
    setLines([...keptOther, ...contribLines])
    const empSum = contribLines.reduce((s, l) => s + l.employeeAmount, 0)
    const erSum = contribLines.reduce((s, l) => s + l.employerAmount, 0)
    const nextNetBefore = nextGross - empSum
    const nextTaxable = Math.round(nextNetBefore * 1.035)
    const pasRate = parseRateMicros(withholdingRate)
    const pasAmt = Math.round((nextTaxable * pasRate) / 1_000_000)
    const aft = keptOther
      .filter((l) => l.section === 'after_tax')
      .reduce((s, l) => s + l.employeeAmount, 0)
    setGross(fmtEurosInput(nextGross))
    setEmployeeContrib(fmtEurosInput(empSum))
    setEmployerContrib(fmtEurosInput(erSum))
    setNetBeforeTax(fmtEurosInput(nextNetBefore))
    setTaxableNet(fmtEurosInput(nextTaxable))
    setSocialNet(fmtEurosInput(nextNetBefore))
    setWithholdingTax(fmtEurosInput(pasAmt))
    setOtherAdjustments(fmtEurosInput(aft))
    setNetPaid(fmtEurosInput(nextNetBefore - pasAmt + aft))
    setTotalsOnly(false)
  }

  const recomputeTotalsFromLines = () => {
    const baseCents = parseCents(baseSalary)
    const vars = lines
      .filter((l) => l.section === 'variable')
      .reduce((s, l) => s + l.employeeAmount, 0)
    const abs = lines
      .filter((l) => l.section === 'absence')
      .reduce((s, l) => s + Math.abs(l.employeeAmount), 0)
    const nextGross =
      !totalsOnly || vars > 0 || abs > 0 ? Math.max(0, baseCents + vars - abs) : parseCents(gross)
    const contribLines = lines.filter((l) => l.section === 'contribution')
    const empSum =
      contribLines.length > 0
        ? contribLines.reduce((s, l) => s + l.employeeAmount, 0)
        : parseCents(employeeContrib)
    const erSum =
      contribLines.length > 0
        ? contribLines.reduce((s, l) => s + l.employerAmount, 0)
        : parseCents(employerContrib)
    const nextNetBefore = nextGross - empSum
    const nextTaxable = parseCents(taxableNet, true) || nextNetBefore
    const pasBase = parseOptionalCents(withholdingBase) ?? nextTaxable
    const pasAmt = Math.round((pasBase * parseRateMicros(withholdingRate)) / 1_000_000)
    const afterLines = lines.filter((l) => l.section === 'after_tax')
    const aft =
      afterLines.length > 0
        ? afterLines.reduce((s, l) => s + l.employeeAmount, 0)
        : parseCents(otherAdjustments, true)
    setGross(fmtEurosInput(nextGross))
    setEmployeeContrib(fmtEurosInput(empSum))
    setEmployerContrib(fmtEurosInput(erSum))
    setNetBeforeTax(fmtEurosInput(nextNetBefore))
    setTaxableNet(fmtEurosInput(nextTaxable))
    setWithholdingTax(fmtEurosInput(pasAmt))
    setOtherAdjustments(fmtEurosInput(aft))
    setNetPaid(fmtEurosInput(nextNetBefore - pasAmt + aft))
  }

  const addLine = (section: PayslipLineInput['section']) => {
    const defaultKind =
      section === 'variable'
        ? PAYSLIP_VARIABLE_KINDS[0]
        : section === 'absence'
          ? PAYSLIP_ABSENCE_KINDS[0]
          : section === 'contribution'
            ? CONTRIBUTION_GROUPS_FR[0]
            : PAYSLIP_AFTER_TAX_KINDS[0]
    const defaultLabel =
      section === 'variable'
        ? t.payslipExtras[defaultKind as keyof typeof t.payslipExtras]
        : section === 'absence'
          ? pt.absenceKinds[defaultKind as keyof typeof pt.absenceKinds]
          : section === 'contribution'
            ? pt.contributionGroups[defaultKind as keyof typeof pt.contributionGroups]
            : pt.afterTaxKinds[defaultKind as keyof typeof pt.afterTaxKinds]
    setLines((prev) => [
      ...prev,
      {
        section,
        itemKind: defaultKind,
        label: defaultLabel,
        quantityHundredths: null,
        baseAmount: section === 'contribution' ? parseCents(gross) : null,
        employeeRateMicros: null,
        employeeAmount: 0,
        employerRateMicros: null,
        employerAmount: 0,
        taxable: true,
      },
    ])
  }

  const updateLine = (index: number, patch: Partial<PayslipLineInput>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    try {
      const saved = await saveMutation.mutateAsync(draftInput)
      onSaved(saved)
    } catch (error) {
      setFormError(t.ledger.errors[ledgerErrorCode(error)])
    }
  }

  return (
    <Dialog title={payslipId ? pt.form.editTitle : pt.form.createTitle} size="lg" onClose={onClose}>
      <form
        onSubmit={(e) => {
          void handleSubmit(e)
        }}
        className="space-y-4"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField
            label={pt.form.contract}
            value={contractId}
            onChange={setContractId}
            options={contracts.map((c) => ({
              value: c.id,
              label: `${c.title} (${c.employerName})`,
            }))}
          />
          <TextField
            label={pt.form.period}
            value={period}
            onChange={setPeriod}
            placeholder="2026-11"
            required
          />
          <TextField
            label={pt.form.paymentDate}
            type="date"
            value={paymentDate}
            onChange={setPaymentDate}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
          <div className="flex items-center gap-2">
            <Switch checked={totalsOnly} onChange={setTotalsOnly} label={pt.form.totalsOnly} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={prefillFrance}>
              <Sparkles size={13} aria-hidden />
              {pt.actions.prefillFrance}
            </Button>
            <Button onClick={recomputeTotalsFromLines}>
              <Calculator size={13} aria-hidden />
              {pt.actions.recomputeTotals}
            </Button>
          </div>
        </div>

        {/* Rémunération de base */}
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField label={pt.form.baseHours} value={baseHours} onChange={setBaseHours} />
          <TextField label={pt.form.hourlyRate} value={hourlyRate} onChange={setHourlyRate} />
          <TextField
            label={pt.form.baseSalary}
            value={baseSalary}
            onChange={setBaseSalary}
            required
          />
        </div>

        {/* Lignes variables / absences / après impôt / cotisations */}
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => addLine('variable')}>
              <Plus size={13} aria-hidden />
              {pt.form.addVariable}
            </Button>
            <Button onClick={() => addLine('absence')}>
              <Plus size={13} aria-hidden />
              {pt.form.addAbsence}
            </Button>
            {!totalsOnly ? (
              <Button onClick={() => addLine('contribution')}>
                <Plus size={13} aria-hidden />
                {pt.form.addContribution}
              </Button>
            ) : null}
            <Button onClick={() => addLine('after_tax')}>
              <Plus size={13} aria-hidden />
              {pt.form.addAfterTax}
            </Button>
          </div>

          {lines
            .map((line, index) => ({ line, index }))
            .filter(({ line }) => !(totalsOnly && line.section === 'contribution'))
            .map(({ line, index }) => {
              const kindOptions =
                line.section === 'variable'
                  ? PAYSLIP_VARIABLE_KINDS.map((k) => ({
                      value: k,
                      label: t.payslipExtras[k],
                    }))
                  : line.section === 'absence'
                    ? PAYSLIP_ABSENCE_KINDS.map((k) => ({
                        value: k,
                        label: pt.absenceKinds[k],
                      }))
                    : line.section === 'contribution'
                      ? CONTRIBUTION_GROUPS_FR.map((k) => ({
                          value: k,
                          label: pt.contributionGroups[k],
                        }))
                      : PAYSLIP_AFTER_TAX_KINDS.map((k) => ({
                          value: k,
                          label: pt.afterTaxKinds[k],
                        }))
              return (
                <div
                  key={`${line.section}-${index}`}
                  className="grid items-end gap-2 rounded-md border border-border bg-surface-2 p-2 sm:grid-cols-4"
                >
                  <SelectField
                    label={line.section}
                    value={line.itemKind}
                    onChange={(nextKind) => updateLine(index, { itemKind: nextKind })}
                    options={kindOptions}
                  />
                  <TextField
                    label={pt.form.lineLabel}
                    value={line.label}
                    onChange={(val) => updateLine(index, { label: val })}
                  />
                  <TextField
                    label={pt.form.lineEmpAmt}
                    value={(line.employeeAmount / 100).toFixed(2)}
                    onChange={(val) =>
                      updateLine(index, {
                        employeeAmount: parseCents(val, line.section === 'after_tax'),
                      })
                    }
                  />
                  {line.section === 'contribution' ? (
                    <TextField
                      label={pt.form.lineErAmt}
                      value={(line.employerAmount / 100).toFixed(2)}
                      onChange={(val) => updateLine(index, { employerAmount: parseCents(val) })}
                    />
                  ) : (
                    <div />
                  )}
                  <Button aria-label={pt.actions.delete} onClick={() => removeLine(index)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              )
            })}
        </div>

        {/* Totaux & Prélèvement à la source */}
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField label={pt.form.gross} value={gross} onChange={setGross} required />
          <TextField
            label={pt.form.employeeContrib}
            value={employeeContrib}
            onChange={setEmployeeContrib}
            required
          />
          <TextField
            label={pt.form.employerContrib}
            value={employerContrib}
            onChange={setEmployerContrib}
          />
          <TextField
            label={pt.form.netBeforeTax}
            value={netBeforeTax}
            onChange={setNetBeforeTax}
            required
          />
          <TextField
            label={pt.form.taxableNet}
            value={taxableNet}
            onChange={setTaxableNet}
            required
          />
          <TextField label={pt.form.socialNet} value={socialNet} onChange={setSocialNet} />
          <TextField
            label={pt.form.withholdingRate}
            value={withholdingRate}
            onChange={setWithholdingRate}
          />
          <TextField
            label={pt.form.withholdingTax}
            value={withholdingTax}
            onChange={setWithholdingTax}
          />
          <TextField
            label={pt.form.otherAdjustments}
            value={otherAdjustments}
            onChange={setOtherAdjustments}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={pt.form.netPaid} value={netPaid} onChange={setNetPaid} required />
          <TextField
            label={pt.form.withholdingBase}
            value={withholdingBase}
            onChange={setWithholdingBase}
          />
        </div>

        <Switch
          checked={withholdingPersonalized}
          onChange={setWithholdingPersonalized}
          label={pt.form.withholdingPersonalized}
        />

        {/* Cumuls annuels + Données sensibles */}
        <div className="grid gap-3 sm:grid-cols-4">
          <TextField label={pt.form.ytdGross} value={ytdGross} onChange={setYtdGross} />
          <TextField label={pt.form.ytdTaxable} value={ytdTaxable} onChange={setYtdTaxable} />
          <TextField label={pt.form.ytdTax} value={ytdTax} onChange={setYtdTax} />
          <TextField label={pt.form.ytdHours} value={ytdHours} onChange={setYtdHours} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={pt.form.nir} value={employeeNir} onChange={setEmployeeNir} />
          <TextField
            label={pt.form.address}
            value={employeeAddress}
            onChange={setEmployeeAddress}
          />
        </div>
        <TextField label={pt.form.notes} value={notes} onChange={setNotes} />

        {/* Contrôles en direct */}
        <div className="rounded-lg border border-border bg-surface-2 p-3 text-xs">
          {liveIssues.length === 0 ? (
            <p className="flex items-center gap-2 text-fg">
              <CircleCheck size={15} className="text-[color:var(--fx-status-good)]" />
              {pt.checks.allGreen}
            </p>
          ) : (
            <ul className="space-y-1">
              {liveIssues.map((issue, i) => (
                <li key={`${issue.code}-${i}`} className="flex items-start gap-2 text-fg">
                  <CircleAlert
                    size={14}
                    className={
                      issue.severity === 'error'
                        ? 'mt-0.5 shrink-0 text-[color:var(--fx-status-critical)]'
                        : 'mt-0.5 shrink-0 text-expense'
                    }
                  />
                  <span>
                    {pt.checks.codes[issue.code]} —{' '}
                    {issue.code.includes('RATE')
                      ? pt.checks.expectedVsActual(
                          fmt.percent(issue.expected / 1_000_000),
                          fmt.percent(issue.actual / 1_000_000),
                        )
                      : fmt.money(issue.expected, { currency })}
                    {' vs '}
                    {fmt.money(issue.actual, { currency })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {formError ? (
          <p role="alert" className="text-sm text-expense">
            {formError}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button type="submit" variant="primary" disabled={!contractId || saveMutation.isPending}>
            {pt.actions.save}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
