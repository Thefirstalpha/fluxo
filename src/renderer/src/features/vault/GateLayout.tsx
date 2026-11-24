import type { ReactNode } from 'react'
import { LogoMark, Wordmark } from '../../components/Logo'

/** Mise en page des écrans du coffre (création, déverrouillage) : la fenêtre reste déplaçable. */
export function GateLayout({
  title,
  description,
  children,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="fx-titlebar flex shrink-0 items-center gap-2 border-b border-border bg-titlebar pl-3">
        <LogoMark size={22} />
        <Wordmark className="pt-0.5 text-[22px]" />
      </header>
      <main className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-6 py-10">
        <section
          className="fx-card fx-card--accent w-full max-w-lg p-7"
          aria-labelledby="gate-title"
        >
          <h1 id="gate-title" className="fx-display fx-gradient-text pt-1 text-[34px]">
            {title}
          </h1>
          {description ? <p className="mt-2 text-sm text-fg-2">{description}</p> : null}
          <div className="mt-6">{children}</div>
        </section>
      </main>
    </div>
  )
}
