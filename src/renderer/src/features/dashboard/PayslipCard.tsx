import { CircleAlert, CircleCheck } from 'lucide-react'
import { checkPayslip, type PayslipSummary } from '@shared/payslip'
import { Card } from '../../components/ui/Card'
import { useT } from '../../i18n'
import { cx } from '../../lib/cx'
import { useFormatters } from '../../lib/format'

interface Line {
  key: string
  label: string
  value: string
  tone?: 'income' | 'expense' | 'muted'
  strong?: boolean
  divider?: boolean
}

/** Aperçu du jalon M6 : du brut au net payé, avec contrôles de cohérence arithmétique. */
export function PayslipCard({ payslip }: { payslip: PayslipSummary }) {
  const t = useT()
  const fmt = useFormatters()
  const p = t.dashboard.payslip
  const issues = checkPayslip(payslip)
  const contributionRate = payslip.gross > 0 ? payslip.employeeContributions / payslip.gross : 0

  const lines: Line[] = [
    { key: 'base', label: p.base, value: fmt.money(payslip.baseSalary) },
    ...payslip.extras.map((extra, index) => ({
      key: `extra-${index}`,
      label: t.payslipExtras[extra.kind],
      value: fmt.money(extra.amount, { signed: true }),
      tone: 'income' as const,
    })),
    { key: 'gross', label: p.gross, value: fmt.money(payslip.gross), strong: true, divider: true },
    {
      key: 'contributions',
      label: p.contributions(fmt.percent(contributionRate)),
      value: fmt.money(-payslip.employeeContributions, { signed: true }),
      tone: 'expense',
    },
    {
      key: 'net-before-tax',
      label: p.netBeforeTax,
      value: fmt.money(payslip.netBeforeTax),
      strong: true,
      divider: true,
    },
    { key: 'taxable', label: p.taxableNet, value: fmt.money(payslip.taxableNet), tone: 'muted' },
    {
      key: 'withholding',
      label: p.withholding(fmt.percent(payslip.withholdingRate)),
      value: fmt.money(-payslip.withholdingTax, { signed: true }),
      tone: 'expense',
    },
    {
      key: 'adjustments',
      label: p.adjustments,
      value: fmt.money(payslip.otherAdjustments, { signed: true }),
      tone: 'expense',
    },
  ]

  return (
    <Card accent title={p.title} subtitle={p.subtitle}>
      <dl className="fx-tabular text-sm">
        {lines.map((line) => (
          <div
            key={line.key}
            className={cx(
              'flex items-baseline justify-between gap-4 py-1.5',
              line.divider && 'border-t border-border',
            )}
          >
            <dt className={cx(line.strong ? 'font-semibold text-fg' : 'text-fg-2')}>
              {line.label}
            </dt>
            <dd
              className={cx(
                line.strong && 'font-semibold',
                line.tone === 'income' && 'text-income',
                line.tone === 'expense' && 'text-expense',
                line.tone === 'muted' ? 'text-muted' : !line.tone && 'text-fg',
              )}
            >
              {line.value}
            </dd>
          </div>
        ))}
        <div className="fx-frame mt-2 flex items-baseline justify-between gap-4 rounded-lg px-3 py-2.5">
          <dt className="font-semibold text-fg">{p.netPaid}</dt>
          <dd className="text-xl font-semibold text-fg">{fmt.money(payslip.netPaid)}</dd>
        </div>
      </dl>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-fg-2">
        {issues.length === 0 ? (
          <CircleCheck size={14} aria-hidden className="text-[color:var(--fx-status-good)]" />
        ) : (
          <CircleAlert size={14} aria-hidden className="text-[color:var(--fx-status-critical)]" />
        )}
        {issues.length === 0 ? p.checksOk : p.checksKo(issues.length)}
      </p>
    </Card>
  )
}
