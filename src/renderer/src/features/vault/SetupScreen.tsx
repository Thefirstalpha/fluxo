import { KeyRound, MonitorSmartphone } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { PASSWORD_MIN_LENGTH, type VaultMode, type VaultStatus } from '@shared/vault'
import { Button } from '../../components/ui/Button'
import { PasswordField } from '../../components/ui/PasswordField'
import { useT } from '../../i18n'
import { getApi } from '../../lib/api'
import { cx } from '../../lib/cx'
import { useVaultStore } from '../../stores/vault'
import { DemoLink } from './DemoLink'
import { GateLayout } from './GateLayout'
import { RestoreFlow } from './RestoreFlow'
import { failureMessage, newPasswordError } from './messages'

function ModeOption({
  mode,
  selected,
  disabled,
  title,
  description,
  onSelect,
}: {
  mode: VaultMode
  selected: boolean
  disabled: boolean
  title: string
  description: string
  onSelect: (mode: VaultMode) => void
}) {
  const Icon = mode === 'session' ? MonitorSmartphone : KeyRound
  return (
    <label
      className={cx(
        'flex cursor-pointer gap-3 rounded-lg border p-3.5',
        selected ? 'fx-frame' : 'border-border bg-surface-2',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <input
        type="radio"
        name="vault-mode"
        value={mode}
        checked={selected}
        disabled={disabled}
        onChange={() => onSelect(mode)}
        className="mt-1 accent-[var(--fx-pink)]"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Icon size={15} aria-hidden className="text-orange" />
          {title}
        </span>
        <span className="mt-1 block text-xs text-fg-2">{description}</span>
      </span>
    </label>
  )
}

/** Premier lancement : création du coffre chiffré. */
export function SetupScreen({ status }: { status: VaultStatus }) {
  const t = useT()
  const showRecoveryCode = useVaultStore((state) => state.showRecoveryCode)
  const setSetupInProgress = useVaultStore((state) => state.setSetupInProgress)
  const [mode, setMode] = useState<VaultMode>(status.sessionAvailable ? 'session' : 'password')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [withRecovery, setWithRecovery] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [restoring, setRestoring] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (mode === 'password') {
      const problem = newPasswordError(t, password, confirm)
      if (problem) return setError(problem)
    }
    setError(null)
    setBusy(true)
    setSetupInProgress(true)
    try {
      const api = getApi().vault
      // Le code est demandé avant que l'état « déverrouillé » ne fasse disparaître cet écran.
      const created = await api.create(mode === 'session' ? { mode } : { mode, password })
      if (!created.ok) return setError(failureMessage(t, created))
      if (withRecovery) {
        const recovery = await api.createRecoveryCode(
          mode === 'password' ? { currentPassword: password } : {},
        )
        if (recovery.ok) showRecoveryCode(recovery.code)
        else setError(failureMessage(t, recovery))
      }
    } catch {
      setError(t.vault.errors.generic)
    } finally {
      setBusy(false)
      setSetupInProgress(false)
    }
  }

  if (restoring) {
    return (
      <GateLayout title={t.vault.restore.title} description={t.vault.setup.description}>
        <div className="grid gap-4">
          <RestoreFlow onClose={() => setRestoring(false)} />
          <button
            type="button"
            className="justify-self-start text-sm text-teal underline-offset-2 hover:underline"
            onClick={() => setRestoring(false)}
          >
            {t.vault.setupBack}
          </button>
        </div>
      </GateLayout>
    )
  }

  return (
    <GateLayout title={t.vault.setup.title} description={t.vault.setup.description}>
      <form className="grid gap-5" onSubmit={(event) => void submit(event)} noValidate>
        <fieldset className="grid gap-2.5">
          <legend className="mb-1.5 text-sm font-medium text-fg">{t.vault.setup.protection}</legend>
          <ModeOption
            mode="session"
            selected={mode === 'session'}
            disabled={!status.sessionAvailable}
            title={t.vault.setup.sessionTitle}
            description={
              status.sessionUnavailableReason
                ? t.vault.setup.sessionUnavailable[status.sessionUnavailableReason]
                : t.vault.setup.sessionDescription
            }
            onSelect={setMode}
          />
          <ModeOption
            mode="password"
            selected={mode === 'password'}
            disabled={false}
            title={t.vault.setup.passwordTitle}
            description={t.vault.setup.passwordDescription}
            onSelect={setMode}
          />
        </fieldset>

        {mode === 'password' ? (
          <div className="grid gap-3">
            <PasswordField
              label={t.vault.setup.password}
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              hint={t.vault.setup.passwordHint(PASSWORD_MIN_LENGTH)}
              autoFocus
            />
            <PasswordField
              label={t.vault.setup.confirm}
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
            />
          </div>
        ) : null}

        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={withRecovery}
            onChange={(event) => setWithRecovery(event.target.checked)}
            className="mt-1 accent-[var(--fx-pink)]"
          />
          <span>
            <span className="font-medium text-fg">{t.vault.setup.recovery}</span>
            <span className="mt-0.5 block text-xs text-muted">{t.vault.setup.recoveryHint}</span>
          </span>
        </label>

        {error ? (
          <p role="alert" className="text-sm font-medium text-expense">
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" disabled={busy} className="justify-self-start">
          {busy ? t.vault.setup.working : t.vault.setup.create}
        </Button>

        <div className="grid gap-3 border-t border-border pt-4 text-sm">
          <button
            type="button"
            className="justify-self-start text-teal underline-offset-2 hover:underline"
            onClick={() => setRestoring(true)}
          >
            {t.vault.setupRestore}
          </button>
          <DemoLink />
        </div>
      </form>
    </GateLayout>
  )
}
