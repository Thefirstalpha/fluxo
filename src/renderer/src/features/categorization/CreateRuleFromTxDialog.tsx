import { useState, type FormEvent } from 'react'
import { cleanTransactionLabel } from '@shared/categorization/normalize'
import type { CategorySummary, TagSummary } from '@shared/ledger/model'
import { CategorySelect } from '../../components/CategorySelect'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { INPUT_CLASS } from '../../components/ui/Field'
import { useT } from '../../i18n'
import { cx } from '../../lib/cx'
import { ledgerErrorCode, useLedgerMutation } from '../../lib/ledger'

interface CreateRuleFromTxDialogProps {
  transactionId: string
  rawLabel: string
  defaultCategoryId?: string | null
  defaultTagIds?: readonly string[]
  categories: readonly CategorySummary[]
  tags: readonly TagSummary[]
  onClose: () => void
  onCreated: (ruleName: string) => void
}

/** Création rapide d’une règle à partir d’une opération ou d’une correction. */
export function CreateRuleFromTxDialog({
  transactionId,
  rawLabel,
  defaultCategoryId = null,
  defaultTagIds = [],
  categories,
  tags,
  onClose,
  onCreated,
}: CreateRuleFromTxDialogProps) {
  const t = useT()
  const d = t.transactions.detail
  const cleaned = cleanTransactionLabel(rawLabel)

  const [name, setName] = useState(cleaned.display || rawLabel.slice(0, 80))
  const [pattern, setPattern] = useState(cleaned.canonical || rawLabel.trim())
  const [categoryId, setCategoryId] = useState<string>(defaultCategoryId ?? '')
  const [tagIds, setTagIds] = useState<string[]>([...defaultTagIds])
  const [customLabel, setCustomLabel] = useState('')
  const [applyRetroactively, setApplyRetroactively] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const createRule = useLedgerMutation('ruleCreateFromTransaction')

  const toggleTag = (tagId: string) => {
    setTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    )
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!name.trim() || !pattern.trim()) {
      setError(t.ledger.errors.invalid)
      return
    }
    try {
      const rule = await createRule.mutateAsync({
        transactionId,
        name: name.trim(),
        pattern: pattern.trim(),
        categoryId: categoryId || null,
        tagIds,
        customLabel: customLabel.trim() || null,
        applyRetroactively,
      })
      onCreated(rule.name)
    } catch (failure) {
      setError(t.ledger.errors[ledgerErrorCode(failure)])
    }
  }

  return (
    <Dialog title={d.createRuleTitle} onClose={onClose}>
      <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-3.5">
        {error ? (
          <p role="alert" className="text-xs font-medium text-expense">
            {error}
          </p>
        ) : null}

        <label className="block text-xs text-fg-2">
          <span className="mb-1 block font-medium">{d.createRuleName}</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            className={cx(INPUT_CLASS, 'h-9 border-border-strong text-sm')}
          />
        </label>

        <label className="block text-xs text-fg-2">
          <span className="mb-1 block font-medium">{d.createRulePattern}</span>
          <input
            type="text"
            value={pattern}
            onChange={(event) => setPattern(event.target.value)}
            maxLength={240}
            className={cx(INPUT_CLASS, 'h-9 border-border-strong font-mono text-xs')}
          />
        </label>

        <label className="block text-xs text-fg-2">
          <span className="mb-1 block font-medium">{d.createRuleCategory}</span>
          <CategorySelect
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
            emptyLabel={t.categorization.rules.fields.keepCategory}
            className="h-9 text-sm"
          />
        </label>

        {tags.length > 0 ? (
          <div>
            <span className="mb-1.5 block text-xs font-medium text-fg-2">
              {t.categorization.rules.fields.tags}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => {
                const active = tagIds.includes(tag.id)
                return (
                  <button
                    key={tag.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleTag(tag.id)}
                    className={cx(
                      'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                      active
                        ? 'border-pink bg-pink/15 font-medium text-fg'
                        : 'border-border bg-surface-2 text-muted hover:text-fg',
                    )}
                  >
                    {tag.name}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        <label className="block text-xs text-fg-2">
          <span className="mb-1 block font-medium">{d.createRuleCustomLabel}</span>
          <input
            type="text"
            value={customLabel}
            onChange={(event) => setCustomLabel(event.target.value)}
            maxLength={500}
            placeholder={t.categorization.rules.fields.customLabelPlaceholder}
            className={cx(INPUT_CLASS, 'h-9 border-border-strong text-sm')}
          />
        </label>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-2">
          <input
            type="checkbox"
            checked={applyRetroactively}
            onChange={(event) => setApplyRetroactively(event.target.checked)}
            className="accent-pink"
          />
          {d.createRuleRetroactive}
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button type="submit" variant="primary" disabled={createRule.isPending}>
            {d.createRuleSave}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
