import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  Link2,
  Pencil,
  Trash2,
  Unlink,
} from 'lucide-react'
import { useState } from 'react'
import type { ContributionGroup, PayslipDetail, PayslipLine } from '@shared/payslip'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { useT } from '../../i18n'
import { capitalize, useFormatters } from '../../lib/format'
import { useLedgerMutation, useLedgerQuery } from '../../lib/ledger'

export function GrossToNetCard({
  payslip,
  onEdit,
  onDelete,
}: {
  payslip: PayslipDetail
  onEdit: () => void
  onDelete: () => void
}) {
  const t = useT()
  const fmt = useFormatters()
  const pt = t.payslips
  const [contribExpanded, setContribExpanded] = useState(false)
  const [revealed, setRevealed] = useState<{ nir: string | null; address: string | null } | null>(
    null,
  )

  const candidates = useLedgerQuery('payslipTransferCandidates', { id: payslip.id })
  const revealMutation = useLedgerMutation('payslipRevealSensitive')
  const linkMutation = useLedgerMutation('payslipLinkTransaction')

  const currency = payslip.currency
  const totalBase = Math.max(1, payslip.gross)
  const netRatio = Math.max(0, Math.min(100, Math.round((payslip.netPaid * 100) / totalBase)))
  const contribRatio = Math.max(
    0,
    Math.min(100, Math.round((payslip.employeeContributions * 100) / totalBase)),
  )
  const pasRatio = Math.max(
    0,
    Math.min(100, Math.round((payslip.withholdingTax * 100) / totalBase)),
  )
  const afterTaxNeg = Math.max(
    0,
    Math.min(100, Math.round((Math.max(0, -payslip.otherAdjustments) * 100) / totalBase)),
  )

  const contributionLines = payslip.lines.filter((l) => l.section === 'contribution')
  const groupedContrib = new Map<
    string,
    { label: string; emp: number; er: number; lines: PayslipLine[] }
  >()
  for (const line of contributionLines) {
    const label =
      pt.contributionGroups[line.itemKind as ContributionGroup] ?? pt.contributionGroups.other
    const cur = groupedContrib.get(line.itemKind)
    if (cur) {
      cur.emp += line.employeeAmount
      cur.er += line.employerAmount
      cur.lines.push(line)
    } else {
      groupedContrib.set(line.itemKind, {
        label,
        emp: line.employeeAmount,
        er: line.employerAmount,
        lines: [line],
      })
    }
  }

  const toggleReveal = async () => {
    if (revealed) {
      setRevealed(null)
      return
    }
    const res = await revealMutation.mutateAsync({ id: payslip.id })
    setRevealed(res)
  }

  return (
    <div className="space-y-4">
      <Card
        accent
        title={`${capitalize(fmt.month(payslip.period))} · ${payslip.contractTitle}`}
        subtitle={payslip.employerName}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {payslip.totalsOnly ? <Badge>{pt.detail.totalsOnlyBadge}</Badge> : null}
            <Button onClick={onEdit}>
              <Pencil size={14} aria-hidden />
              {pt.actions.edit}
            </Button>
            <Button onClick={onDelete} aria-label={pt.actions.delete}>
              <Trash2 size={14} aria-hidden />
            </Button>
          </div>
        }
      >
        {/* Barre segmentée : du brut au net */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-fg-2">
            <span>{pt.detail.grossToNet}</span>
            <span className="fx-tabular font-medium">
              {pt.detail.gross} : {fmt.money(payslip.gross, { currency })}
            </span>
          </div>
          <div
            role="img"
            aria-label={`${pt.detail.netPaid} ${netRatio} %, ${pt.detail.contributions} ${contribRatio} %, ${pt.detail.withholding} ${pasRatio} %`}
            className="flex h-4 w-full overflow-hidden rounded-full bg-surface-2"
          >
            <div
              style={{ width: `${netRatio}%`, backgroundColor: 'var(--fx-income)' }}
              title={`${pt.detail.netPaid} (${netRatio} %)`}
            />
            <div
              style={{ width: `${contribRatio}%`, backgroundColor: 'var(--fx-pink)' }}
              title={`${pt.detail.contributions} (${contribRatio} %)`}
            />
            <div
              style={{ width: `${pasRatio}%`, backgroundColor: 'var(--fx-expense)' }}
              title={`${pt.detail.withholding} (${pasRatio} %)`}
            />
            {afterTaxNeg > 0 ? (
              <div
                style={{ width: `${afterTaxNeg}%`, backgroundColor: 'var(--fx-gold)' }}
                title={`${pt.detail.afterTax} (${afterTaxNeg} %)`}
              />
            ) : null}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-2">
            <span className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: 'var(--fx-income)' }}
              />
              {pt.detail.netPaid} ({fmt.money(payslip.netPaid, { currency })})
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: 'var(--fx-pink)' }}
              />
              {pt.detail.contributions} ({fmt.money(payslip.employeeContributions, { currency })})
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: 'var(--fx-expense)' }}
              />
              {pt.detail.withholding} ({fmt.money(payslip.withholdingTax, { currency })})
            </span>
          </div>
        </div>

        {/* Chiffres clés */}
        <dl className="fx-tabular mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between rounded-lg border border-border px-3 py-2">
            <dt className="text-fg-2">{pt.detail.baseSalary}</dt>
            <dd className="font-medium">{fmt.money(payslip.baseSalary, { currency })}</dd>
          </div>
          <div className="flex justify-between rounded-lg border border-border px-3 py-2">
            <dt className="text-fg-2">{pt.detail.netBeforeTax}</dt>
            <dd className="font-medium">{fmt.money(payslip.netBeforeTax, { currency })}</dd>
          </div>
          <div className="flex justify-between rounded-lg border border-border px-3 py-2">
            <dt className="text-fg-2">{pt.detail.taxableNet}</dt>
            <dd className="font-medium">{fmt.money(payslip.taxableNet, { currency })}</dd>
          </div>
          <div className="flex justify-between rounded-lg border border-border px-3 py-2">
            <dt className="text-fg-2">{pt.detail.socialNet}</dt>
            <dd className="font-medium">
              {payslip.socialNet !== null ? fmt.money(payslip.socialNet, { currency }) : '—'}
            </dd>
          </div>
          <div className="flex justify-between rounded-lg border border-border px-3 py-2">
            <dt className="text-fg-2">
              {pt.detail.withholding} ({fmt.percent(payslip.withholdingRateMicros / 1_000_000)} ·{' '}
              {payslip.withholdingPersonalized ? pt.detail.personalizedRate : pt.detail.neutralRate}
              )
            </dt>
            <dd className="font-medium text-expense">
              {fmt.money(-payslip.withholdingTax, { signed: true, currency })}
            </dd>
          </div>
          <div className="flex justify-between rounded-lg border border-border px-3 py-2">
            <dt className="text-fg-2">{pt.detail.employerCost}</dt>
            <dd className="font-semibold">
              {fmt.money(payslip.employerCost, { currency })}{' '}
              <span className="text-xs font-normal text-muted">
                (+{fmt.money(payslip.employerContributions, { currency })})
              </span>
            </dd>
          </div>
        </dl>

        {/* Détail repliable des cotisations */}
        <div className="mt-4 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setContribExpanded((v) => !v)}
            aria-expanded={contribExpanded}
            className="flex w-full items-center justify-between text-left text-sm font-medium text-fg hover:text-pink"
          >
            <span className="flex items-center gap-1.5">
              {contribExpanded ? (
                <ChevronDown size={15} aria-hidden />
              ) : (
                <ChevronRight size={15} aria-hidden />
              )}
              {pt.detail.contribBreakdown} ({contributionLines.length})
            </span>
            <span className="fx-tabular text-xs text-muted">
              {fmt.money(payslip.employeeContributions, { currency })} /{' '}
              {fmt.money(payslip.employerContributions, { currency })}
            </span>
          </button>

          {contribExpanded ? (
            groupedContrib.size === 0 ? (
              <p className="mt-2 text-xs text-muted">{pt.detail.noLines}</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="fx-tabular w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted">
                      <th className="py-1.5 pr-3 font-medium">{pt.detail.contribBreakdown}</th>
                      <th className="py-1.5 pr-3 text-right font-medium">
                        {pt.detail.contributions}
                      </th>
                      <th className="py-1.5 text-right font-medium">{pt.detail.employerContrib}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[...groupedContrib.entries()].map(([groupKey, group]) => (
                      <tr key={groupKey}>
                        <td className="py-1.5 pr-3 font-medium text-fg">{group.label}</td>
                        <td className="py-1.5 pr-3 text-right text-expense">
                          {fmt.money(group.emp, { currency })}
                        </td>
                        <td className="py-1.5 text-right text-fg-2">
                          {fmt.money(group.er, { currency })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}
        </div>
      </Card>

      {/* Contrôles de cohérence */}
      <Card title={pt.checks.title}>
        {payslip.issues.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-fg-2">
            <CircleCheck size={16} aria-hidden className="text-[color:var(--fx-status-good)]" />
            {pt.checks.allGreen}
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {payslip.issues.map((issue, idx) => (
              <li
                key={`${issue.code}-${idx}`}
                className="flex items-start gap-2 rounded-md border border-border bg-surface-2 px-3 py-2"
              >
                <CircleAlert
                  size={16}
                  aria-hidden
                  className={
                    issue.severity === 'error'
                      ? 'mt-0.5 shrink-0 text-[color:var(--fx-status-critical)]'
                      : 'mt-0.5 shrink-0 text-expense'
                  }
                />
                <div>
                  <p className="font-medium text-fg">
                    {pt.checks.codes[issue.code]}
                    {issue.lineLabel ? ` (${issue.lineLabel})` : ''}
                  </p>
                  <p className="fx-tabular text-xs text-muted">
                    {issue.code.includes('RATE')
                      ? pt.checks.expectedVsActual(
                          fmt.percent(issue.expected / 1_000_000),
                          fmt.percent(issue.actual / 1_000_000),
                        )
                      : issue.code === 'YTD_HOURS_MISMATCH'
                        ? pt.checks.expectedVsActual(
                            `${(issue.expected / 100).toFixed(2)} h`,
                            `${(issue.actual / 100).toFixed(2)} h`,
                          )
                        : pt.checks.expectedVsActual(
                            fmt.money(issue.expected, { currency }),
                            fmt.money(issue.actual, { currency }),
                          )}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Rapprochement virement + Données sensibles */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={pt.detail.reconcileTitle}>
          {payslip.transactionId && payslip.matchedTransactionLabel ? (
            <div className="space-y-2 text-sm">
              <p className="text-fg">
                {pt.detail.reconciledWith(
                  payslip.matchedTransactionLabel,
                  fmt.date(payslip.matchedTransactionDate ?? payslip.period),
                  fmt.money(payslip.matchedTransactionAmount ?? payslip.netPaid, { currency }),
                )}
              </p>
              {payslip.matchedTransactionAmount !== null &&
              Math.abs(payslip.matchedTransactionAmount - payslip.netPaid) > 0 ? (
                <p className="text-xs font-medium text-expense">
                  {pt.detail.reconcileDiff(
                    fmt.money(payslip.matchedTransactionAmount - payslip.netPaid, {
                      signed: true,
                      currency,
                    }),
                  )}
                </p>
              ) : (
                <p className="text-xs text-[color:var(--fx-status-good)]">
                  {pt.detail.reconcileOk}
                </p>
              )}
              <Button
                onClick={() => linkMutation.mutate({ id: payslip.id, transactionId: null })}
                disabled={linkMutation.isPending}
              >
                <Unlink size={14} aria-hidden />
                {pt.detail.unlinkTx}
              </Button>
            </div>
          ) : (candidates.data?.length ?? 0) === 0 ? (
            <p className="text-xs text-muted">{pt.detail.noCandidates}</p>
          ) : (
            <ul className="space-y-2">
              {candidates.data?.slice(0, 4).map((cand) => (
                <li
                  key={cand.transactionId}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-fg">{cand.label}</p>
                    <p className="fx-tabular text-muted">
                      {cand.accountName} · {fmt.date(cand.bookingDate)} ·{' '}
                      {fmt.money(cand.amount, { currency })}
                      {cand.diffCents !== 0
                        ? ` (${fmt.money(cand.diffCents, { signed: true, currency })})`
                        : ''}
                    </p>
                  </div>
                  <Button
                    disabled={cand.alreadyLinkedPayslipId !== null || linkMutation.isPending}
                    onClick={() =>
                      linkMutation.mutate({ id: payslip.id, transactionId: cand.transactionId })
                    }
                  >
                    <Link2 size={13} aria-hidden />
                    {pt.detail.linkTx}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title={pt.detail.sensitiveTitle}
          actions={
            payslip.hasNir || payslip.hasAddress ? (
              <Button
                onClick={() => {
                  void toggleReveal()
                }}
              >
                {revealed ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
                {revealed ? pt.actions.hide : pt.actions.reveal}
              </Button>
            ) : null
          }
        >
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{pt.detail.nirLabel}</dt>
              <dd className="font-mono text-xs text-fg">
                {revealed?.nir ?? payslip.nirMasked ?? '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{pt.detail.addressLabel}</dt>
              <dd className="text-right text-xs text-fg">
                {revealed?.address ?? payslip.addressMasked ?? '—'}
              </dd>
            </div>
            {(payslip.ytdGross !== null || payslip.ytdTaxableNet !== null) && (
              <div className="border-t border-border pt-2">
                <p className="mb-1 text-xs font-semibold text-fg-2">{pt.detail.ytdTitle}</p>
                <div className="fx-tabular grid grid-cols-2 gap-1 text-xs text-muted">
                  <span>
                    {pt.detail.ytdGross} :{' '}
                    {payslip.ytdGross !== null ? fmt.money(payslip.ytdGross, { currency }) : '—'}
                  </span>
                  <span>
                    {pt.detail.ytdTaxable} :{' '}
                    {payslip.ytdTaxableNet !== null
                      ? fmt.money(payslip.ytdTaxableNet, { currency })
                      : '—'}
                  </span>
                  <span>
                    {pt.detail.ytdTax} :{' '}
                    {payslip.ytdWithholding !== null
                      ? fmt.money(payslip.ytdWithholding, { currency })
                      : '—'}
                  </span>
                  <span>
                    {pt.detail.ytdHours} :{' '}
                    {payslip.ytdHoursHundredths !== null
                      ? `${(payslip.ytdHoursHundredths / 100).toFixed(2)} h`
                      : '—'}
                  </span>
                </div>
              </div>
            )}
          </dl>
        </Card>
      </div>
    </div>
  )
}
