import { KeyRound, Lock, LifeBuoy, MonitorSmartphone } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { AUTO_LOCK_MINUTES, type AutoLockMinutes } from '@shared/settings'
import type { VaultResult } from '@shared/vault'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { PasswordField } from '../../components/ui/PasswordField'
import { Switch } from '../../components/ui/Switch'
import { useT } from '../../i18n'
import { getApi } from '../../lib/api'
import { useSettingsStore } from '../../stores/settings'
import { useVaultStore } from '../../stores/vault'
import { failureMessage, newPasswordError } from '../vault/messages'

type Action =
  'change-password' | 'to-password' | 'to-session' | 'create-recovery' | 'remove-recovery'

/** Actions qui choisissent un nouveau mot de passe. */
const SETS_PASSWORD: readonly Action[] = ['change-password', 'to-password']

/** Section « Sécurité du coffre » : mode, mot de passe, code de récupération, verrouillage. */
export function VaultSettings() {
  const t = useT()
  const status = useVaultStore((state) => state.status)
  const showRecoveryCode = useVaultStore((state) => state.showRecoveryCode)
  const settings = useSettingsStore((state) => state.settings)
  const update = useSettingsStore((state) => state.update)
  const [action, setAction] = useState<Action | null>(null)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const autoLockId = useId()

  if (!status || status.mode === null) return null
  const t2 = t.settings.security
  const needsCurrent = status.mode === 'password'

  const start = (next: Action) => {
    setAction(next)
    setCurrent('')
    setNext('')
    setConfirm('')
    setError(null)
    setNotice(null)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!action) return
    if (SETS_PASSWORD.includes(action)) {
      const problem = newPasswordError(t, next, confirm)
      if (problem) return setError(problem)
    }
    const currentPassword = needsCurrent ? { currentPassword: current } : {}
    setBusy(true)
    try {
      const api = getApi().vault
      let result: VaultResult
      if (action === 'create-recovery') {
        const created = await api.createRecoveryCode(currentPassword)
        if (created.ok) showRecoveryCode(created.code)
        result = created.ok ? { ok: true } : created
      } else if (action === 'remove-recovery') {
        result = await api.removeRecoveryCode(currentPassword)
      } else if (action === 'to-session') {
        result = await api.enableSessionMode(currentPassword)
      } else {
        result = await api.changePassword({ ...currentPassword, newPassword: next })
      }
      if (result.ok) {
        setAction(null)
        setNotice(t2.saved)
      } else {
        setError(failureMessage(t, result))
      }
    } catch {
      setError(t.vault.errors.generic)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={t2.title} subtitle={t2.description}>
      <div className="grid gap-5">
        <section className="grid gap-2" aria-label={t2.mode}>
          <p className="flex items-center gap-2 text-sm text-fg">
            {status.mode === 'session' ? (
              <MonitorSmartphone size={15} aria-hidden className="text-orange" />
            ) : (
              <KeyRound size={15} aria-hidden className="text-orange" />
            )}
            <span className="font-medium">{t2.mode} :</span>
            {status.mode === 'session' ? t2.modeSession : t2.modePassword}
          </p>
          <div className="flex flex-wrap gap-2">
            {status.mode === 'password' ? (
              <>
                <Button onClick={() => start('change-password')}>{t2.changePassword}</Button>
                {status.sessionAvailable ? (
                  <Button variant="ghost" onClick={() => start('to-session')}>
                    {t2.switchToSession}
                  </Button>
                ) : null}
              </>
            ) : (
              <Button onClick={() => start('to-password')}>{t2.switchToPassword}</Button>
            )}
          </div>
        </section>

        <section className="grid gap-2 border-t border-border pt-4" aria-label={t2.recoveryTitle}>
          <p className="flex items-start gap-2 text-sm text-fg">
            <LifeBuoy size={15} aria-hidden className="mt-0.5 shrink-0 text-orange" />
            <span>
              <span className="font-medium">{t2.recoveryTitle} : </span>
              {status.hasRecoveryCode ? t2.recoveryOn : t2.recoveryOff}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => start('create-recovery')}>
              {status.hasRecoveryCode ? t2.regenerateRecovery : t2.createRecovery}
            </Button>
            {status.hasRecoveryCode ? (
              <Button variant="ghost" onClick={() => start('remove-recovery')}>
                {t2.removeRecovery}
              </Button>
            ) : null}
          </div>
        </section>

        {action ? (
          <form
            className="grid gap-3 rounded-lg border border-border bg-surface-2 p-4"
            onSubmit={(event) => void submit(event)}
            noValidate
          >
            {needsCurrent ? (
              <PasswordField
                label={t2.currentPassword}
                value={current}
                onChange={setCurrent}
                autoComplete="current-password"
                autoFocus
              />
            ) : null}
            {SETS_PASSWORD.includes(action) ? (
              <>
                <PasswordField
                  label={t2.newPassword}
                  value={next}
                  onChange={setNext}
                  autoComplete="new-password"
                  autoFocus={!needsCurrent}
                />
                <PasswordField
                  label={t2.confirmPassword}
                  value={confirm}
                  onChange={setConfirm}
                  autoComplete="new-password"
                />
              </>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm font-medium text-expense">
                {error}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={busy}>
                {t2.apply}
              </Button>
              <Button variant="ghost" onClick={() => setAction(null)}>
                {t2.cancel}
              </Button>
            </div>
          </form>
        ) : null}
        {notice ? (
          <p role="status" className="text-sm text-income">
            {notice}
          </p>
        ) : null}

        <section className="grid gap-1 border-t border-border pt-4">
          <div>
            <label htmlFor={autoLockId} className="mb-1.5 block text-sm font-medium text-fg">
              {t2.autoLock}
            </label>
            <select
              id={autoLockId}
              value={settings.autoLockMinutes}
              onChange={(event) => {
                const minutes = Number(event.target.value) as AutoLockMinutes
                if (AUTO_LOCK_MINUTES.includes(minutes)) void update({ autoLockMinutes: minutes })
              }}
              aria-describedby={`${autoLockId}-hint`}
              className="h-9 w-48 rounded-md border border-border-strong bg-surface-2 px-2.5 text-sm text-fg"
            >
              {AUTO_LOCK_MINUTES.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes === 0 ? t2.autoLockNever : t2.autoLockMinutes(minutes)}
                </option>
              ))}
            </select>
            <p id={`${autoLockId}-hint`} className="mt-1.5 text-xs text-muted">
              {t2.autoLockHint}
            </p>
          </div>
          <Switch
            checked={settings.lockOnSystemLock}
            onChange={(lockOnSystemLock) => void update({ lockOnSystemLock })}
            label={t2.lockOnSystemLock}
            description={t2.lockOnSystemLockHint}
          />
          <Button onClick={() => void getApi().vault.lock()} className="justify-self-start">
            <Lock size={14} aria-hidden />
            {t2.lockNow}
          </Button>
        </section>
      </div>
    </Card>
  )
}
