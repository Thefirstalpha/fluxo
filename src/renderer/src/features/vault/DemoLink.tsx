import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useT } from '../../i18n'
import { getApi } from '../../lib/api'

/** Entrée dans le coffre de démonstration (écrans de création et de déverrouillage). */
export function DemoLink() {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <div className="grid gap-1">
      <button
        type="button"
        disabled={busy}
        className="flex items-center gap-1.5 justify-self-start text-sm text-teal underline-offset-2 hover:underline disabled:opacity-60"
        onClick={() => {
          setBusy(true)
          setFailed(false)
          getApi()
            .vault.enterDemo()
            .catch(() => setFailed(true))
            .finally(() => setBusy(false))
        }}
      >
        <Sparkles size={14} aria-hidden />
        {t.vault.demo.enter}
      </button>
      <p className="text-xs text-muted">{t.vault.demo.enterHint}</p>
      {failed ? (
        <p role="alert" className="text-xs font-medium text-expense">
          {t.vault.errors.generic}
        </p>
      ) : null}
    </div>
  )
}
