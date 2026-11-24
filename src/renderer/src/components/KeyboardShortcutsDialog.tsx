import { useT } from '../i18n'
import { Button } from './ui/Button'
import { Dialog } from './ui/Dialog'

/** Aide des raccourcis clavier (touche `?`). */
export function KeyboardShortcutsDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  return (
    <Dialog title={t.shortcuts.title} description={t.shortcuts.description} onClose={onClose}>
      <ul className="divide-y divide-border">
        {t.shortcuts.items.map((item) => (
          <li
            key={item.keys}
            className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
          >
            <span className="text-sm text-fg-2">{item.label}</span>
            <kbd className="shrink-0 rounded border border-border-strong bg-surface-2 px-2 py-0.5 font-mono text-xs text-fg">
              {item.keys}
            </kbd>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex justify-end">
        <Button variant="primary" onClick={onClose}>
          {t.common.close}
        </Button>
      </div>
    </Dialog>
  )
}
