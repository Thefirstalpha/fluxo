import { ShieldCheck } from 'lucide-react'
import { formatMicroUsd } from '@shared/documents/ai'
import type { AiSendPreview } from '@shared/documents/model'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { useT } from '../../i18n'

/**
 * Modale de consentement explicite ADR-022 : affiche la destination, les catégories PII
 * caviardées localement, le texte exact anonymisé et l'estimation jetons / coût avant tout envoi.
 */
export function AiConsentDialog({
  preview,
  busy,
  onConfirm,
  onClose,
}: {
  preview: AiSendPreview
  busy: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const t = useT()
  const ac = t.aiConsent

  return (
    <Dialog title={ac.title} description={ac.description} onClose={onClose} size="lg">
      <div className="space-y-4">
        <dl className="grid gap-2 rounded-lg border border-border bg-surface-2 p-3 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-muted">{ac.destination}</dt>
            <dd className="font-medium text-fg">{preview.destinationLabel}</dd>
          </div>
          <div>
            <dt className="text-muted">{ac.model}</dt>
            <dd className="font-medium text-fg">{preview.model}</dd>
          </div>
          <div>
            <dt className="text-muted">{ac.estimatedCost}</dt>
            <dd className="font-medium text-fg tabular-nums">
              ~{preview.estimatedInputTokens} + {preview.estimatedOutputTokens} tok ·{' '}
              {formatMicroUsd(preview.estimatedCostMicroUsd)} (
              {formatMicroUsd(preview.spentThisMonthMicroUsd)} /{' '}
              {formatMicroUsd(preview.monthlyCapMicroUsd)})
            </dd>
          </div>
          <div>
            <dt className="text-muted">{ac.redactionsTitle}</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {preview.redactions.length === 0 ? (
                <span className="text-fg-2">{ac.redactionsNone}</span>
              ) : (
                preview.redactions.map((r) => (
                  <Badge key={r.category} tone="accent">
                    {ac.categories[r.category]} ×{r.count}
                  </Badge>
                ))
              )}
            </dd>
          </div>
        </dl>

        <div>
          <p className="mb-1.5 text-xs font-medium text-fg-2">{ac.payloadLabel}</p>
          <pre
            className="overflow-auto rounded-lg border border-border bg-surface-2 p-3 text-xs text-fg"
            style={{ maxHeight: '220px', whiteSpace: 'pre-wrap' }}
          >
            {preview.anonymizedPayload}
          </pre>
        </div>

        {preview.exceedsCap ? (
          <p role="alert" className="text-sm font-medium text-expense">
            {ac.capExceededWarning}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={busy} onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" disabled={busy || preview.exceedsCap} onClick={onConfirm}>
            <ShieldCheck size={14} aria-hidden />
            {busy ? ac.sending : ac.sendConfirm}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
