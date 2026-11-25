import { RotateCcw } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useT } from '../../i18n'
import { ledgerErrorCode, useLedgerMutation, useLedgerQuery } from '../../lib/ledger'

/** Paramètres de catégorisation : seuil de confiance du modèle local et réinitialisation. */
export function CategorizationSettings() {
  const t = useT()
  const q = t.categorization.queue
  const r = t.categorization.reset
  const resetTitleId = useId()

  const statusQuery = useLedgerQuery('classifierStatus', {})
  const setThreshold = useLedgerMutation('categorizationThresholdSet')
  const resetMutation = useLedgerMutation('categorizationReset')

  const [thresholdDraft, setThresholdDraft] = useState<number | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const serverThreshold = statusQuery.data?.threshold ?? 0.85
  const effectiveThreshold = thresholdDraft ?? serverThreshold
  const pctThreshold = Math.round(effectiveThreshold * 100)

  const runReset = async () => {
    setError(null)
    setNotice(null)
    try {
      const res = await resetMutation.mutateAsync({})
      setNotice(
        r.doneNotice(res.clearedTransactions, res.clearedSuggestions, res.clearedModelSamples),
      )
    } catch (failure) {
      setError(t.ledger.errors[ledgerErrorCode(failure)])
    }
  }

  return (
    <Card title={r.title} subtitle={r.description}>
      <div className="grid gap-5">
        <div className="space-y-3">
          <p className="text-sm text-fg">
            {q.classifierSummary(
              statusQuery.data?.sampleCount ?? 0,
              statusQuery.data?.categoryCount ?? 0,
            )}
          </p>
          <label className="flex flex-wrap items-center gap-3 text-sm text-fg-2">
            <span>{q.thresholdLabel}</span>
            <input
              type="range"
              min={50}
              max={99}
              step={1}
              value={pctThreshold}
              onChange={(event) => setThresholdDraft(Number(event.target.value) / 100)}
              onMouseUp={(event) => {
                const value = Number((event.target as HTMLInputElement).value) / 100
                void setThreshold
                  .mutateAsync({ threshold: value })
                  .then(() => setThresholdDraft(null))
                  .catch((failure: unknown) => setError(t.ledger.errors[ledgerErrorCode(failure)]))
              }}
              onBlur={(event) => {
                if (thresholdDraft === null) return
                const value = Number(event.target.value) / 100
                void setThreshold
                  .mutateAsync({ threshold: value })
                  .then(() => setThresholdDraft(null))
                  .catch((failure: unknown) => setError(t.ledger.errors[ledgerErrorCode(failure)]))
              }}
              className="w-32 accent-pink"
            />
            <span className="w-10 font-semibold text-fg tabular-nums">
              {q.thresholdValue(pctThreshold)}
            </span>
          </label>
        </div>

        {notice ? (
          <p role="status" className="text-sm text-income">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm font-medium text-expense">
            {error}
          </p>
        ) : null}

        <section
          className="grid gap-3 rounded-lg border border-expense/40 p-4"
          aria-labelledby={resetTitleId}
        >
          <h3 id={resetTitleId} className="text-sm font-semibold text-expense">
            {r.sectionTitle}
          </h3>
          <p className="text-xs text-fg-2">{r.sectionDescription}</p>
          <Button
            className="justify-self-start text-expense"
            disabled={resetMutation.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            <RotateCcw size={14} aria-hidden />
            {r.button}
          </Button>
        </section>
      </div>

      {confirmOpen ? (
        <ConfirmDialog
          title={r.confirmTitle}
          message={r.confirmMessage}
          confirmLabel={r.confirmAction}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => void runReset()}
        />
      ) : null}
    </Card>
  )
}
