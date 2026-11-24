import { useState, type FormEvent } from 'react'
import { PASSWORD_MIN_LENGTH } from '@shared/vault'
import { Button } from '../../components/ui/Button'
import { PasswordField } from '../../components/ui/PasswordField'
import { useT } from '../../i18n'
import { getApi } from '../../lib/api'
import { GateLayout } from './GateLayout'
import { failureMessage, newPasswordError } from './messages'

/** Après un déverrouillage par le code de récupération : nouveau mot de passe obligatoire. */
export function NewPasswordScreen() {
  const t = useT()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const problem = newPasswordError(t, password, confirm)
    if (problem) return setError(problem)
    setBusy(true)
    try {
      const result = await getApi().vault.changePassword({ newPassword: password })
      setError(result.ok ? null : failureMessage(t, result))
    } catch {
      setError(t.vault.errors.generic)
    } finally {
      setBusy(false)
    }
  }

  return (
    <GateLayout title={t.vault.newPassword.title} description={t.vault.newPassword.description}>
      <form className="grid gap-3" onSubmit={(event) => void submit(event)} noValidate>
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
        {error ? (
          <p role="alert" className="text-sm font-medium text-expense">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" disabled={busy} className="mt-2 justify-self-start">
          {t.vault.newPassword.save}
        </Button>
      </form>
    </GateLayout>
  )
}
