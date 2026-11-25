import { useState } from 'react'
import { simulatePayslipAdjustment, type PayslipListItem } from '@shared/payslip'
import { Card } from '../../components/ui/Card'
import { SelectField, TextField } from '../../components/ui/Field'
import { useT } from '../../i18n'
import { useFormatters } from '../../lib/format'

function centsFromInput(raw: string): number {
  const num = Number(raw.replace(/\s+/g, '').replace(',', '.'))
  if (!Number.isFinite(num)) return 0
  return Math.round(num * 100)
}

export function PayslipSimulatorTab({ payslips }: { payslips: readonly PayslipListItem[] }) {
  const t = useT()
  const fmt = useFormatters()
  const pt = t.payslips
  const simT = pt.simulator

  const [selectedId, setSelectedId] = useState(() => payslips[0]?.id ?? '')
  const reference = payslips.find((p) => p.id === selectedId) ?? payslips[0]

  const [grossDelta, setGrossDelta] = useState('0')
  const [raisePct, setRaisePct] = useState('0')
  const [taxableBonus, setTaxableBonus] = useState('0')
  const [taxFreeOvertime, setTaxFreeOvertime] = useState('0')
  const [pasRatePct, setPasRatePct] = useState(() =>
    reference ? (reference.withholdingRateMicros / 10_000).toFixed(1) : '7.5',
  )

  const baseGross = reference?.gross ?? 340_000
  const baseEmp = reference?.employeeContributions ?? 75_480
  const baseEr = reference?.employerContributions ?? 142_800
  const baseNetBefore = reference?.netBeforeTax ?? 264_520
  const baseTaxable = reference?.taxableNet ?? 274_210
  const basePasMicros = reference?.withholdingRateMicros ?? 75_000
  const baseAfterTax = reference?.otherAdjustments ?? 0
  const baseNetPaid =
    reference?.netPaid ??
    baseNetBefore - Math.round((baseTaxable * basePasMicros) / 1_000_000) + baseAfterTax
  const currency = reference?.currency ?? 'EUR'

  const parsedRaise = Number(raisePct.replace(',', '.'))
  const parsedPas = Number(pasRatePct.replace(',', '.'))
  const deltaCents = centsFromInput(grossDelta)
  const raiseMicros =
    deltaCents === 0 && Number.isFinite(parsedRaise) && parsedRaise !== 0
      ? Math.round(parsedRaise * 10_000)
      : undefined

  const result = simulatePayslipAdjustment(
    {
      countryPack: reference?.countryPack ?? 'fr',
      gross: baseGross,
      employeeContributions: baseEmp,
      employerContributions: baseEr,
      netBeforeTax: baseNetBefore,
      taxableNet: baseTaxable,
      withholdingRateMicros: basePasMicros,
      otherAdjustments: baseAfterTax,
    },
    {
      grossDeltaAmount: deltaCents !== 0 ? deltaCents : undefined,
      grossRaiseMicros: raiseMicros,
      taxableBonus: Math.max(0, centsFromInput(taxableBonus)),
      taxFreeOvertime: Math.max(0, centsFromInput(taxFreeOvertime)),
      withholdingRateMicros:
        Number.isFinite(parsedPas) && parsedPas >= 0
          ? Math.min(1_000_000, Math.round(parsedPas * 10_000))
          : undefined,
    },
  )

  const handleReferenceChange = (nextId: string) => {
    setSelectedId(nextId)
    const found = payslips.find((p) => p.id === nextId)
    if (found) setPasRatePct((found.withholdingRateMicros / 10_000).toFixed(1))
  }

  const rows = [
    { label: pt.detail.gross, before: baseGross, after: result.gross },
    { label: pt.detail.contributions, before: baseEmp, after: result.employeeContributions },
    { label: pt.detail.netBeforeTax, before: baseNetBefore, after: result.netBeforeTax },
    { label: pt.detail.taxableNet, before: baseTaxable, after: result.taxableNet },
    {
      label: pt.detail.withholding,
      before: reference?.withholdingTax ?? Math.round((baseTaxable * basePasMicros) / 1_000_000),
      after: result.withholdingTax,
    },
    { label: pt.detail.netPaid, before: baseNetPaid, after: result.netPaid, strong: true },
    {
      label: pt.detail.employerCost,
      before: baseGross + baseEr,
      after: result.employerCost,
    },
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card accent title={simT.title} subtitle={simT.subtitle}>
        <div className="space-y-3">
          {payslips.length > 0 ? (
            <SelectField
              label={simT.reference}
              value={reference?.id ?? ''}
              onChange={handleReferenceChange}
              options={payslips.map((p) => ({
                value: p.id,
                label: `${fmt.month(p.period)} · ${p.contractTitle} (${fmt.money(p.gross, { currency: p.currency })})`,
              }))}
            />
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label={simT.grossDelta} value={grossDelta} onChange={setGrossDelta} />
            <TextField label={simT.raisePercent} value={raisePct} onChange={setRaisePct} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label={simT.taxableBonus} value={taxableBonus} onChange={setTaxableBonus} />
            <TextField
              label={simT.taxFreeOvertime}
              value={taxFreeOvertime}
              onChange={setTaxFreeOvertime}
            />
          </div>
          <TextField label={simT.newPasRate} value={pasRatePct} onChange={setPasRatePct} />
        </div>
      </Card>

      <Card accent title={simT.after}>
        <table className="fx-tabular w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="py-2 pr-3 font-medium" />
              <th className="py-2 pr-3 text-right font-medium">{simT.before}</th>
              <th className="py-2 pr-3 text-right font-medium">{simT.after}</th>
              <th className="py-2 text-right font-medium">{simT.delta}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const delta = row.after - row.before
              return (
                <tr key={row.label} className={row.strong ? 'font-semibold text-fg' : 'text-fg-2'}>
                  <td className="py-2.5 pr-3">{row.label}</td>
                  <td className="py-2.5 pr-3 text-right">{fmt.money(row.before, { currency })}</td>
                  <td className="py-2.5 pr-3 text-right text-fg">
                    {fmt.money(row.after, { currency })}
                  </td>
                  <td
                    className={`py-2.5 text-right ${
                      delta > 0 ? 'text-income' : delta < 0 ? 'text-expense' : 'text-muted'
                    }`}
                  >
                    {fmt.money(delta, { signed: true, currency })}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
