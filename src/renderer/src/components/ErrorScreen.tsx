import { TriangleAlert } from 'lucide-react'
import { useT } from '../i18n'
import { cx } from '../lib/cx'
import { Button } from './ui/Button'

interface ErrorScreenProps {
  scope: 'app' | 'page'
  error: Error
  /** Nouvel essai de rendu (sans recharger l'interface). */
  onRetry: () => void
}

/** Écran affiché à la place d'une interface en échec. Aucune donnée n'est envoyée en ligne. */
export function ErrorScreen({ scope, error, onRetry }: ErrorScreenProps) {
  const t = useT()
  return (
    <div
      role="alert"
      className={cx(
        'flex flex-col items-center justify-center gap-4 p-8 text-center',
        scope === 'app' ? 'h-full bg-bg' : 'min-h-[50vh]',
      )}
    >
      <TriangleAlert size={36} aria-hidden className="text-orange" />
      <div className="max-w-lg">
        <h1 className="text-lg font-semibold text-fg">{t.error.title}</h1>
        <p className="mt-2 text-sm text-fg-2">{t.error.description}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="primary" onClick={onRetry}>
          {t.error.retry}
        </Button>
        <Button onClick={() => window.location.reload()}>{t.error.reload}</Button>
      </div>
      <details className="max-w-lg text-left text-xs text-muted">
        <summary className="cursor-pointer">{t.error.details}</summary>
        <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-surface-2 p-3 font-mono whitespace-pre-wrap">
          {`${error.name}: ${error.message}`}
        </pre>
      </details>
    </div>
  )
}
