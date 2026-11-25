import { ArrowLeftRight } from 'lucide-react'
import type { AccountSummary, CategorySummary } from '@shared/ledger/model'
import { Button } from './ui/Button'
import { useT } from '../i18n'

/**
 * Affiche le comportement de comptabilisation côté compte cible lorsqu'une catégorie associée à
 * un compte (ex. « Épargne › Transfert ↔ Livret A ») est choisie, et propose le passage en suivi
 * manuel lorsque le compte cible est en mode relevé sans opérations importées.
 */
export function LinkedAccountStatusHint({
  categoryId,
  categories,
  accounts,
  sourceAccountId,
  alreadyLinked = false,
  switching = false,
  onSwitchToManual,
  switchLabel,
}: {
  categoryId: string | null | undefined
  categories: readonly CategorySummary[]
  accounts: readonly AccountSummary[]
  sourceAccountId?: string
  alreadyLinked?: boolean
  switching?: boolean
  onSwitchToManual?: (account: AccountSummary) => void
  switchLabel?: string
}) {
  const t = useT()
  if (!categoryId || alreadyLinked) return null

  const category = categories.find((c) => c.id === categoryId)
  if (!category?.linkedAccountId) return null

  const target = accounts.find((a) => a.id === category.linkedAccountId)
  if (!target || target.archived || target.id === sourceAccountId) return null

  const hints = t.categorization.linkedHints

  if (target.trackingMode === 'manual') {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-teal">
        <ArrowLeftRight size={12} aria-hidden className="shrink-0" />
        <span>{hints.manual(target.name)}</span>
      </p>
    )
  }

  if (target.trackingMode === 'valuation') {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-muted">
        <ArrowLeftRight size={12} aria-hidden className="shrink-0" />
        <span>{hints.valuation(target.name)}</span>
      </p>
    )
  }

  if (target.transactionCount === 0 && onSwitchToManual) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-[11px] text-fg-2">
        <span className="flex items-center gap-1.5">
          <ArrowLeftRight size={12} aria-hidden className="shrink-0 text-teal" />
          <span>{hints.statementEmpty(target.name)}</span>
        </span>
        <Button
          type="button"
          className="h-7 px-2.5 text-[11px]"
          disabled={switching}
          onClick={(event) => {
            event.stopPropagation()
            onSwitchToManual(target)
          }}
        >
          {switchLabel ?? hints.switchToManual(target.name)}
        </Button>
      </div>
    )
  }

  return (
    <p className="flex items-center gap-1.5 text-[11px] text-muted">
      <ArrowLeftRight size={12} aria-hidden className="shrink-0" />
      <span>{hints.statement(target.name)}</span>
    </p>
  )
}
