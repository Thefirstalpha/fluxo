import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'

interface CardProps {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  /** Liseré dégradé en tête de carte. */
  accent?: boolean
  className?: string
  children: ReactNode
}

export function Card({ title, subtitle, actions, accent = false, className, children }: CardProps) {
  return (
    <section className={cx('fx-card', accent && 'fx-card--accent', className)}>
      {(title ?? actions) ? (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            {title ? <h2 className="text-[13px] font-semibold text-fg">{title}</h2> : null}
            {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
          </div>
          {actions}
        </header>
      ) : null}
      <div className="px-5 pt-3 pb-5">{children}</div>
    </section>
  )
}
