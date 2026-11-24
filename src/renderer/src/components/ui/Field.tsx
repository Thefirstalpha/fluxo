import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cx } from '../../lib/cx'

export const INPUT_CLASS =
  'h-9 w-full rounded-md border bg-surface-2 px-2.5 text-sm text-fg disabled:cursor-not-allowed disabled:opacity-60'

interface FieldShellProps {
  label: string
  hint?: ReactNode
  error?: string | null
  /** Rend le contrôle avec les identifiants d'accessibilité calculés ici. */
  children: (props: {
    id: string
    'aria-describedby': string | undefined
    'aria-invalid': true | undefined
    className: string
  }) => ReactNode
  className?: string
}

/** Libellé, aide et erreur reliés au contrôle (lecteurs d'écran : `aria-describedby`). */
export function FieldShell({ label, hint, error, children, className }: FieldShellProps) {
  const id = useId()
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-fg">
        {label}
      </label>
      {children({
        id,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': error ? true : undefined,
        className: cx(INPUT_CLASS, error ? 'border-expense' : 'border-border-strong'),
      })}
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

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'className'> & {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: ReactNode
  error?: string | null
  className?: string
  /** Classes ajoutées au champ lui-même (ex. `font-mono`). */
  inputClassName?: string
}

export function TextField({
  label,
  hint,
  error,
  onChange,
  className,
  inputClassName,
  ...input
}: TextFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} className={className}>
      {(control) => (
        <input
          {...input}
          {...control}
          className={cx(control.className, inputClassName)}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </FieldShell>
  )
}

type SelectFieldProps<T extends string> = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'onChange' | 'value' | 'className'
> & {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  hint?: ReactNode
  error?: string | null
  className?: string
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  error,
  className,
  ...select
}: SelectFieldProps<T>) {
  return (
    <FieldShell label={label} hint={hint} error={error} className={className}>
      {(control) => (
        <select
          {...select}
          {...control}
          value={value}
          onChange={(event) => onChange(event.target.value as T)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  )
}
