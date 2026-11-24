import { Eye, EyeOff } from 'lucide-react'
import { useId, useState } from 'react'
import { useT } from '../../i18n'

interface PasswordFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password' | 'off'
  hint?: string
  error?: string | null
  autoFocus?: boolean
  /** Saisie d'un code (récupération) : police à chasse fixe, sans masquage par défaut. */
  monospace?: boolean
}

/** Champ secret avec bouton afficher/masquer ; erreur annoncée aux lecteurs d'écran. */
export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  hint,
  error,
  autoFocus = false,
  monospace = false,
}: PasswordFieldProps) {
  const t = useT()
  const id = useId()
  const [visible, setVisible] = useState(monospace)
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ')

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-fg">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          spellCheck={false}
          autoCapitalize="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={
            'h-9 w-full rounded-md border bg-surface-2 pr-10 pl-2.5 text-sm text-fg ' +
            (error ? 'border-expense' : 'border-border-strong') +
            (monospace ? ' font-mono tracking-wider uppercase' : '')
          }
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? t.vault.hidePassword : t.vault.showPassword}
          aria-pressed={visible}
          className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted hover:text-fg"
        >
          {visible ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
        </button>
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-medium text-expense">
          {error}
        </p>
      ) : null}
    </div>
  )
}
