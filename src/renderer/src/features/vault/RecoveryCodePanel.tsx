import { Check, Copy, Printer, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { useT } from '../../i18n'
import { GateLayout } from './GateLayout'

/**
 * Affichage unique du code de récupération. Il n'est conservé nulle part en clair :
 * une fois ce panneau fermé, il ne peut plus être affiché (seulement remplacé).
 */
export function RecoveryCodePanel({ code, onDone }: { code: string; onDone: () => void }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const copy = () => {
    navigator.clipboard
      .writeText(code)
      .then(() => setCopied(true))
      .catch(() => setCopied(false))
  }

  return (
    <GateLayout title={t.vault.recoveryCode.title} description={t.vault.recoveryCode.description}>
      <div className="grid gap-5">
        <p className="fx-print-area rounded-lg border border-border-strong bg-surface-2 p-4 text-center font-mono text-lg font-semibold tracking-wider text-fg select-all">
          {/* Retour à la ligne seulement entre deux groupes (le texte copié reste intact). */}
          {code.split('-').map((group, index, groups) => (
            <span key={index} className="inline-block whitespace-nowrap">
              {index < groups.length - 1 ? `${group}-` : group}
            </span>
          ))}
        </p>
        <div className="flex gap-2">
          <Button onClick={copy}>
            {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            {copied ? t.vault.recoveryCode.copied : t.vault.recoveryCode.copy}
          </Button>
          <Button onClick={() => window.print()}>
            <Printer size={14} aria-hidden />
            {t.vault.recoveryCode.print}
          </Button>
        </div>
        <p className="flex gap-2 text-xs text-fg-2">
          <TriangleAlert size={14} aria-hidden className="mt-0.5 shrink-0 text-orange" />
          {t.vault.recoveryCode.warning}
        </p>
        <label className="flex items-center gap-2.5 text-sm font-medium text-fg">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="accent-[var(--fx-pink)]"
          />
          {t.vault.recoveryCode.confirm}
        </label>
        <Button
          variant="primary"
          disabled={!confirmed}
          onClick={onDone}
          className="justify-self-start"
        >
          {t.vault.recoveryCode.continue}
        </Button>
      </div>
    </GateLayout>
  )
}
