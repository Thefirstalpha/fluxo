import { useT } from '../../i18n'
import { Button } from './Button'
import { Dialog } from './Dialog'

/** Confirmation d'une action irréversible (le bouton par défaut est « Annuler »). */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
}) {
  const t = useT()
  return (
    <Dialog title={title} description={message} onClose={onClose}>
      <div className="flex justify-end gap-2">
        <Button autoFocus onClick={onClose}>
          {t.common.cancel}
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  )
}
