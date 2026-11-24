import { AlertTriangle, ArrowLeftRight, BellOff, CalendarClock, PiggyBank } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { StatTile } from '../../components/ui/StatTile'
import { useT } from '../../i18n'
import { useFormatters } from '../../lib/format'
import { ledgerErrorCode, useLedgerMutation, useLedgerQuery } from '../../lib/ledger'
import { useSettingsStore } from '../../stores/settings'

/** Abonnements détectés, hausses de tarifs et paires de virements internes candidats. */
export function SubscriptionsTab() {
  const t = useT()
  const s = t.categorization.subscriptions
  const fmt = useFormatters()
  const currency = useSettingsStore((state) => state.settings.currency)

  const overview = useLedgerQuery('subscriptionsOverview', { currency })
  const candidates = useLedgerQuery('transferCandidatesList', {})

  const dismissAlert = useLedgerMutation('subscriptionDismissAlert')
  const linkTransfer = useLedgerMutation('transferLink')

  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const data = overview.data
  const transferPairs = candidates.data ?? []

  return (
    <div className="space-y-6">
      {notice ? (
        <p role="status" className="fx-frame px-3.5 py-2 text-xs font-medium text-fg">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs font-medium text-expense">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={s.monthlyTotal}
          value={fmt.money(data?.totalMonthlyCost ?? 0, { currency: data?.currency ?? currency })}
        />
        <StatTile
          label={s.annualTotal}
          value={fmt.money(data?.totalAnnualCost ?? 0, { currency: data?.currency ?? currency })}
        />
        <StatTile label={s.priceIncreases} value={fmt.count(data?.priceIncreaseCount ?? 0)} />
        <StatTile label={s.dormantCount} value={fmt.count(data?.dormantCount ?? 0)} />
      </div>

      {/* Abonnements détectés */}
      <section aria-label={s.detectedTitle} className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <CalendarClock size={16} aria-hidden className="text-pink" />
          {s.detectedTitle}
        </h2>

        {!data || data.subscriptions.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">{s.detectedEmpty}</p>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {data.subscriptions.map((sub) => (
              <Card key={sub.signature} className="space-y-2.5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-fg">{sub.merchant}</span>
                      <Badge>{s.frequencies[sub.frequency]}</Badge>
                      {sub.categoryName ? <Badge>{sub.categoryName}</Badge> : null}
                      {sub.dormant ? <Badge tone="accent">{s.dormantBadge}</Badge> : null}
                    </div>
                    <p className="text-xs text-muted">
                      {sub.accountName} · {s.occurrences(sub.occurrenceCount)} ·{' '}
                      {s.nextExpected(fmt.date(sub.nextExpectedDate))}
                    </p>
                  </div>
                  <div className="text-right tabular-nums">
                    <p className="text-base font-semibold text-fg">
                      {fmt.money(sub.latestAmount, { currency: sub.currency })}
                    </p>
                    <p className="text-xs text-muted">
                      {s.monthlyEquiv(fmt.money(sub.monthlyEquivalent, { currency: sub.currency }))}{' '}
                      · {s.annualEquiv(fmt.money(sub.annualEquivalent, { currency: sub.currency }))}
                    </p>
                  </div>
                </div>

                {sub.priceIncrease ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-expense/40 bg-expense/10 px-3 py-2 text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-expense">
                      <AlertTriangle size={14} aria-hidden />
                      {s.priceAlert(
                        fmt.money(sub.priceIncrease.previousAmount, { currency: sub.currency }),
                        fmt.money(sub.priceIncrease.currentAmount, { currency: sub.currency }),
                        fmt.money(sub.priceIncrease.delta, { currency: sub.currency }),
                        sub.priceIncrease.percent,
                      )}
                    </span>
                    <Button
                      className="h-7 px-2.5 text-xs"
                      disabled={dismissAlert.isPending}
                      onClick={() => {
                        setError(null)
                        void dismissAlert
                          .mutateAsync({
                            signature: sub.signature,
                            lastKnownAmount: sub.latestAmount,
                          })
                          .then(() => setNotice(s.alertDismissedNotice))
                          .catch((failure: unknown) =>
                            setError(t.ledger.errors[ledgerErrorCode(failure)]),
                          )
                      }}
                    >
                      <BellOff size={13} aria-hidden />
                      {s.dismissAlert}
                    </Button>
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Paires de virements internes (± 3 jours) */}
      <section aria-label={s.transfersTitle} className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <ArrowLeftRight size={16} aria-hidden className="text-teal" />
          {s.transfersTitle}
        </h2>

        {transferPairs.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">{s.transfersEmpty}</p>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {transferPairs.map((pair) => (
              <Card key={pair.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="min-w-0 flex-1 space-y-1 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-fg">
                      {pair.fromTransaction.accountName} → {pair.toTransaction.accountName}
                    </span>
                    <Badge>{s.dayDiff(pair.dayDiff)}</Badge>
                    {pair.isSavingsTransfer ? (
                      <Badge tone="accent">
                        <PiggyBank size={12} aria-hidden />
                        {s.savingsBadge}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-fg-2">
                    {fmt.date(pair.fromTransaction.bookingDate)} · {pair.fromTransaction.label} ↔{' '}
                    {fmt.date(pair.toTransaction.bookingDate)} · {pair.toTransaction.label}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-fg tabular-nums">
                    {fmt.money(Math.abs(pair.fromTransaction.amount), {
                      currency: pair.fromTransaction.currency,
                    })}
                  </span>
                  <Button
                    variant="primary"
                    className="h-8 px-3 text-xs"
                    disabled={linkTransfer.isPending}
                    onClick={() => {
                      setError(null)
                      void linkTransfer
                        .mutateAsync({
                          ids: [pair.fromTransaction.id, pair.toTransaction.id],
                        })
                        .then(() => setNotice(s.linkedNotice))
                        .catch((failure: unknown) =>
                          setError(t.ledger.errors[ledgerErrorCode(failure)]),
                        )
                    }}
                  >
                    <ArrowLeftRight size={13} aria-hidden />
                    {s.linkTransfer}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
