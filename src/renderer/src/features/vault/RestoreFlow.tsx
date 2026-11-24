import { FileArchive, TriangleAlert } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { BackupSummary, RestorePreview, RestoreSecret } from '@shared/vault'
import { Button } from '../../components/ui/Button'
import { PasswordField } from '../../components/ui/PasswordField'
import { useT } from '../../i18n'
import { getApi } from '../../lib/api'
import { useFormatters } from '../../lib/format'
import { failureMessage } from './messages'

type Step =
  | { name: 'pick' }
  | { name: 'secret'; token: string; summary: BackupSummary }
  | { name: 'preview'; token: string; summary: BackupSummary; preview: RestorePreview }

/**
 * Restauration en trois temps : choix du fichier (boîte de dialogue du système), secret si la
 * sauvegarde vient d'un autre coffre, aperçu vérifié, puis confirmation. Rien n'est remplacé
 * avant la confirmation ; le renderer ne voit jamais le chemin du fichier, seulement un jeton.
 */
export function RestoreFlow({ onClose }: { onClose: () => void }) {
  const t = useT()
  const fmt = useFormatters()
  const r = t.vault.restore
  const [step, setStep] = useState<Step>({ name: 'pick' })
  const [method, setMethod] = useState<RestoreSecret['method']>('password')
  const [secret, setSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const api = getApi().vault

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch {
      setError(t.vault.errors.generic)
    } finally {
      setBusy(false)
    }
  }

  const preview = (token: string, summary: BackupSummary, withSecret?: RestoreSecret) =>
    run(async () => {
      const result = await api.previewRestore(
        withSecret ? { token, secret: withSecret } : { token },
      )
      if (result.ok) setStep({ name: 'preview', token, summary, preview: result.preview })
      else setError(failureMessage(t, result, withSecret?.method ?? 'password'))
    })

  const pick = () =>
    run(async () => {
      const picked = await api.pickBackup()
      if (!picked.ok) {
        if (picked.reason !== 'cancelled') setError(failureMessage(t, picked))
        return
      }
      setMethod(picked.summary.methods[0] ?? 'password')
      if (picked.summary.sameVault) await preview(picked.token, picked.summary)
      else setStep({ name: 'secret', token: picked.token, summary: picked.summary })
    })

  const cancel = () => {
    void api.cancelRestore().catch(() => undefined)
    onClose()
  }

  const confirm = (token: string) =>
    run(async () => {
      const result = await api.confirmRestore(token)
      if (result.ok) onClose()
      else setError(failureMessage(t, result))
    })

  const summaryLine = (summary: BackupSummary) =>
    `${r.backupOf(fmt.dateTime(summary.createdAt))} · ${r.kinds[summary.kind]}`

  return (
    <section
      className="grid gap-4 rounded-lg border border-border bg-surface-2 p-4"
      aria-labelledby="restore-title"
    >
      <h3 id="restore-title" className="flex items-center gap-2 text-sm font-semibold text-fg">
        <FileArchive size={15} aria-hidden className="text-orange" />
        {r.title}
      </h3>

      {step.name === 'pick' ? (
        <>
          <p className="text-xs text-fg-2">{r.description}</p>
          <div className="flex gap-2">
            <Button variant="primary" disabled={busy} onClick={() => void pick()}>
              {r.choose}
            </Button>
            <Button variant="ghost" onClick={cancel}>
              {r.cancel}
            </Button>
          </div>
        </>
      ) : null}

      {step.name === 'secret' ? (
        <form
          className="grid gap-3"
          noValidate
          onSubmit={(event: FormEvent) => {
            event.preventDefault()
            if (secret) void preview(step.token, step.summary, { method, value: secret })
          }}
        >
          <p className="text-sm text-fg">{summaryLine(step.summary)}</p>
          <p className="text-xs text-fg-2">
            <span className="font-semibold">{r.secretTitle}.</span> {r.secretDescription}
          </p>
          {step.summary.methods.length > 1 ? (
            <div className="flex gap-2" role="group" aria-label={r.secretTitle}>
              {step.summary.methods.map((option) => (
                <Button
                  key={option}
                  variant={option === method ? 'secondary' : 'ghost'}
                  aria-pressed={option === method}
                  onClick={() => {
                    setMethod(option)
                    setSecret('')
                  }}
                >
                  {option === 'password' ? r.usePassword : r.useRecovery}
                </Button>
              ))}
            </div>
          ) : null}
          <PasswordField
            key={method}
            label={method === 'password' ? t.vault.unlock.password : t.vault.unlock.recoveryCode}
            value={secret}
            onChange={setSecret}
            autoComplete="off"
            monospace={method === 'recovery'}
            autoFocus
          />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={busy || !secret}>
              {r.check}
            </Button>
            <Button variant="ghost" onClick={cancel}>
              {r.cancel}
            </Button>
          </div>
        </form>
      ) : null}

      {step.name === 'preview' ? (
        <div className="grid gap-3">
          <p className="text-sm text-fg">{summaryLine(step.summary)}</p>
          <dl
            aria-label={r.previewTitle}
            className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[140px_1fr]"
          >
            <dt className="text-muted">{r.accounts}</dt>
            <dd className="fx-tabular text-fg">{fmt.count(step.preview.accounts)}</dd>
            <dt className="text-muted">{r.transactions}</dt>
            <dd className="fx-tabular text-fg">{fmt.count(step.preview.transactions)}</dd>
            <dt className="text-muted">{r.period}</dt>
            <dd className="text-fg">
              {step.preview.firstDate && step.preview.lastDate
                ? r.periodValue(fmt.date(step.preview.firstDate), fmt.date(step.preview.lastDate))
                : r.empty}
            </dd>
          </dl>
          <p className="flex gap-2 text-xs text-fg-2">
            <TriangleAlert size={14} aria-hidden className="mt-0.5 shrink-0 text-orange" />
            {r.replaceWarning}
          </p>
          <div className="flex gap-2">
            <Button variant="primary" disabled={busy} onClick={() => void confirm(step.token)}>
              {r.confirm}
            </Button>
            <Button variant="ghost" onClick={cancel}>
              {r.cancel}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm font-medium text-expense">
          {error}
        </p>
      ) : null}
    </section>
  )
}
