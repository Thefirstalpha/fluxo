import type { ReactNode } from 'react'

/** En-tête de page : titre d'affiche en dégradé « coucher de soleil ». */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="fx-display fx-gradient-text pt-1 text-[42px]">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-sm text-fg-2">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  )
}
