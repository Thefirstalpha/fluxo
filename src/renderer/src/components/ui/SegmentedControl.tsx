import type { LucideIcon } from 'lucide-react'
import { useRef, type KeyboardEvent } from 'react'
import { cx } from '../../lib/cx'

export interface SegmentOption<T extends string | number> {
  value: T
  label: string
  icon?: LucideIcon
}

interface SegmentedControlProps<T extends string | number> {
  options: readonly SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
}

/** Groupe de boutons radio (sémantique ARIA radiogroup, flèches du clavier). */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    if (!step) return
    event.preventDefault()
    const current = options.findIndex((option) => option.value === value)
    const next = (current + step + options.length) % options.length
    const target = options[next]
    if (!target) return
    onChange(target.value)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className="fx-no-drag inline-flex rounded-lg border border-border bg-surface-2 p-0.5"
    >
      {options.map((option, index) => {
        const selected = option.value === value
        const Icon = option.icon
        return (
          <button
            key={String(option.value)}
            ref={(element) => {
              refs.current[index] = element
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cx(
              'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
              selected ? 'fx-frame text-fg shadow-sm' : 'text-fg-2 hover:text-fg',
            )}
          >
            {Icon ? <Icon size={14} aria-hidden /> : null}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
