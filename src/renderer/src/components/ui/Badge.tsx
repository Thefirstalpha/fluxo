import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'accent'
  children: ReactNode
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
        tone === 'accent' ? 'fx-frame text-pink' : 'border border-border text-fg-2',
      )}
    >
      {children}
    </span>
  )
}
