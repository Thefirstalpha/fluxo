import { LockKeyhole } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import type { VaultFailure, VaultStatus } from '@shared/vault'
import { Button } from '../../components/ui/Button'
import { PasswordField } from '../../components/ui/PasswordField'
import { useT } from '../../i18n'
import { getApi } from '../../lib/api'
import { DemoLink } from './DemoLink'
import { GateLayout } from './GateLayout'
import { failureMessage } from './messages'

/** Décompte jusqu'à `until` (horodatage), rafraîchi chaque seconde. */
function useCountdown(until: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (until <= now) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [until, now])
  return Math.max(0, until - now)
}

/** Coffre verrouillé : session (un clic), mot de passe, ou code de récupération. */
export function UnlockScreen({ status }: { status: VaultStatus }) {
  const t = useT()
  const [method, setMethod] = useState<'usual' | 'recovery'>('usual')
  const [secret, setSecret] = useState('')
  const [failure, setFailure] = useState<VaultFailure | null>(null)
  const [unexpected, setUnexpected] = useState(false)
  const [blockedUntil, setBlockedUntil] = useState(() => Date.now() + status.retryAfterMs)
  const [busy, setBusy] = useState(false)
  const remaining = useCountdown(blockedUntil)

  const usesPassword = method === 'recovery' || status.mode === 'password'
  const secretKind = method === 'recovery' ? 'recovery' : 'password'

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (remaining > 0 || (usesPassword && !secret)) return
    setBusy(true)
    setUnexpected(false)
    try {
      const api = getApi().vault
      const result =
        method === 'recovery'
          ? await api.unlock({ method: 'recovery', code: secret })
          : status.mode === 'session'
            ? await api.unlock({ method: 'session' })
            : await api.unlock({ method: 'password', password: secret })
      if (result.ok) return
      setFailure(result)
      if (result.retryAfterMs) setBlockedUntil(Date.now() + result.retryAfterMs)
      setSecret('')
    } catch {
      setFailure(null)
      setUnexpected(true)
    } finally {
      setBusy(false)
    }
  }

  const message =
    remaining > 0
      ? t.vault.errors.lockedOut(Math.ceil(remaining / 1000))
      : unexpected
        ? t.vault.errors.generic
        : failure
          ? status.mode === 'session' &&
            method === 'usual' &&
            failure.reason === 'wrong-credentials'
            ? t.vault.unlock.sessionFailed
            : failureMessage(t, failure, secretKind)
          : null

  return (
    <GateLayout
      title={t.vault.unlock.title}
      description={
        status.mode === 'session' && method === 'usual'
          ? t.vault.unlock.descriptionSession
          : t.vault.unlock.descriptionPassword
      }
    >
      <form className="grid gap-4" onSubmit={(event) => void submit(event)} noValidate>
        {usesPassword ? (
          <PasswordField
            key={method}
            label={method === 'recovery' ? t.vault.unlock.recoveryCode : t.vault.unlock.password}
            hint={method === 'recovery' ? t.vault.unlock.recoveryHint : undefined}
            value={secret}
            onChange={setSecret}
            autoComplete={method === 'recovery' ? 'off' : 'current-password'}
            monospace={method === 'recovery'}
            autoFocus
          />
        ) : null}

        {message ? (
          <p role="alert" className="text-sm font-medium text-expense">
            {message}
          </p>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          disabled={busy || remaining > 0}
          className="justify-self-start"
          autoFocus={!usesPassword}
        >
          <LockKeyhole size={15} aria-hidden />
          {t.vault.unlock.unlock}
        </Button>

        <div className="border-t border-border pt-4 text-sm">
          {method === 'usual' ? (
            status.hasRecoveryCode ? (
              <button
                type="button"
                className="text-teal underline-offset-2 hover:underline"
                onClick={() => {
                  setMethod('recovery')
                  setFailure(null)
                  setSecret('')
                }}
              >
                {t.vault.unlock.useRecovery}
              </button>
            ) : (
              <p className="text-xs text-muted">{t.vault.unlock.noRecovery}</p>
            )
          ) : (
            <button
              type="button"
              className="text-teal underline-offset-2 hover:underline"
              onClick={() => {
                setMethod('usual')
                setFailure(null)
                setSecret('')
              }}
            >
              {t.vault.unlock.backToPassword}
            </button>
          )}
        </div>
        <DemoLink />
      </form>
    </GateLayout>
  )
}
