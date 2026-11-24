import { Lock, ShieldCheck, Sparkles } from 'lucide-react'
import { useT } from '../i18n'
import { useVaultStore } from '../stores/vault'

/** Barre d'état façon éditeur de code, sur le dégradé d'action (contraste validé ≥ 5:1). */
export function StatusBar() {
  const t = useT()
  const demo = useVaultStore((state) => state.status?.demo ?? false)
  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 bg-[image:var(--fx-gradient-action)] px-3 text-[11px] font-semibold text-[color:var(--fx-on-action)]">
      <span className="flex items-center gap-1.5">
        <ShieldCheck size={13} aria-hidden />
        {t.app.localData}
      </span>
      <span className="flex items-center gap-1.5">
        <Lock size={12} aria-hidden />
        {t.app.encrypted}
      </span>
      {demo ? (
        <span className="ml-auto flex items-center gap-1.5">
          <Sparkles size={12} aria-hidden />
          {t.app.demoMode}
        </span>
      ) : null}
    </footer>
  )
}
