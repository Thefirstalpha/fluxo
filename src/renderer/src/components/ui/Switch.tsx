import { useId } from 'react'
import { cx } from '../../lib/cx'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
}

export function Switch({ checked, onChange, label, description }: SwitchProps) {
  const id = useId()
  const descriptionId = `${id}-description`
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="mt-0.5 text-xs text-muted">
            {description}
          </p>
        ) : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? descriptionId : undefined}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors',
          checked
            ? 'border-transparent bg-[image:var(--fx-gradient-action)]'
            : 'border-border-strong bg-surface-3',
        )}
      >
        <span
          aria-hidden
          className={cx(
            'absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full bg-white shadow transition-[left]',
            checked ? 'left-[18px]' : 'left-[3px]',
          )}
        />
      </button>
    </div>
  )
}
