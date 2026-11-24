import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useT } from '../../i18n'
import { cx } from '../../lib/cx'

interface DialogProps {
  title: string
  description?: ReactNode
  onClose: () => void
  children: ReactNode
  /** Largeur : `md` (formulaires) ou `lg`. */
  size?: 'md' | 'lg'
}

/**
 * Boîte de dialogue modale native (`<dialog>` + `showModal`) : piège du focus, touche Échap,
 * arrière-plan inerte et retour du focus à l'élément d'origine sont assurés par le navigateur.
 */
export function Dialog({ title, description, onClose, children, size = 'md' }: DialogProps) {
  const t = useT()
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    const onCancel = (event: Event) => {
      event.preventDefault()
      closeRef.current()
    }
    dialog.addEventListener('cancel', onCancel)
    return () => {
      dialog.removeEventListener('cancel', onCancel)
      if (dialog.open) dialog.close()
    }
  }, [])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={cx(
        'fx-card m-auto max-h-[calc(100vh-48px)] w-[calc(100vw-48px)] overflow-y-auto p-0 text-fg backdrop:bg-black/40',
        size === 'md' ? 'max-w-[560px]' : 'max-w-[760px]',
      )}
    >
      <header className="flex items-start justify-between gap-4 px-6 pt-5">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold text-fg">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="mt-1 text-sm text-fg-2">
              {description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.common.close}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
        >
          <X size={16} aria-hidden />
        </button>
      </header>
      <div className="px-6 pt-4 pb-6">{children}</div>
    </dialog>
  )
}
