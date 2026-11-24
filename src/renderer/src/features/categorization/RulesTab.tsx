import { ArrowDown, ArrowUp, Play, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import {
  RULE_AMOUNT_OPS,
  RULE_DIRECTIONS,
  RULE_LABEL_OPS,
  type RuleActions,
  type RuleAmountOp,
  type RuleConditions,
  type RuleDirection,
  type RuleLabelOp,
  type RuleSummary,
} from '@shared/categorization/model'
import { validateSafeRegex } from '@shared/categorization/regex'
import type { AccountSummary, CategorySummary, TagSummary } from '@shared/ledger/model'
import { parseAmount } from '@shared/money'
import { CategorySelect } from '../../components/CategorySelect'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Dialog } from '../../components/ui/Dialog'
import { INPUT_CLASS } from '../../components/ui/Field'
import { Switch } from '../../components/ui/Switch'
import { useT } from '../../i18n'
import { cx } from '../../lib/cx'
import { useFormatters } from '../../lib/format'
import { ledgerErrorCode, useLedgerMutation, useLedgerQuery } from '../../lib/ledger'
import { useSettingsStore } from '../../stores/settings'
import { amountToInput } from '../accounts/account-groups'

/** Onglet de gestion des règles automatiques (création, priorité, aperçu en direct, application). */
export function RulesTab({
  accounts,
  categories,
  tags,
  onNotice,
  onError,
}: {
  accounts: readonly AccountSummary[]
  categories: readonly CategorySummary[]
  tags: readonly TagSummary[]
  onNotice: (message: string) => void
  onError: (message: string | null) => void
}) {
  const t = useT()
  const r = t.categorization.rules
  const fmt = useFormatters()

  const rulesQuery = useLedgerQuery('rulesList', {})
  const saveRule = useLedgerMutation('ruleSave')
  const applyRule = useLedgerMutation('ruleApply')
  const deleteRule = useLedgerMutation('ruleDelete')

  const [editingRule, setEditingRule] = useState<RuleSummary | 'new' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<RuleSummary | null>(null)

  const rules = rulesQuery.data ?? []
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])
  const tagMap = useMemo(() => new Map(tags.map((tag) => [tag.id, tag.name])), [tags])

  const swapPriority = async (index: number, delta: -1 | 1) => {
    const targetIdx = index + delta
    const current = rules[index]
    const other = rules[targetIdx]
    if (!current || !other) return
    const currentPrio = current.priority
    const otherPrio = other.priority === currentPrio ? currentPrio + delta : other.priority
    onError(null)
    try {
      await saveRule.mutateAsync({
        id: current.id,
        name: current.name,
        conditions: current.conditions,
        actions: current.actions,
        priority: otherPrio,
        active: current.active,
      })
      await saveRule.mutateAsync({
        id: other.id,
        name: other.name,
        conditions: other.conditions,
        actions: other.actions,
        priority: currentPrio,
        active: other.active,
      })
    } catch (failure) {
      onError(t.ledger.errors[ledgerErrorCode(failure)])
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {rules.length > 0 ? (
          <Button
            disabled={applyRule.isPending}
            onClick={() => {
              onError(null)
              void applyRule
                .mutateAsync({ onlyUncategorized: true })
                .then((res) => onNotice(r.appliedNotice(res.appliedCount)))
                .catch((failure: unknown) => onError(t.ledger.errors[ledgerErrorCode(failure)]))
            }}
          >
            <Play size={14} aria-hidden />
            {r.applyAll}
          </Button>
        ) : null}
        <Button variant="primary" onClick={() => setEditingRule('new')}>
          <Plus size={14} aria-hidden />
          {r.newRule}
        </Button>
      </div>

      {rules.length === 0 ? (
        <Card className="space-y-1 p-6 text-center">
          <p className="text-sm font-medium text-fg">{r.empty}</p>
          <p className="text-xs text-muted">{r.emptyHint}</p>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {rules.map((rule, index) => {
            const catName = rule.actions.categoryId
              ? categoryMap.get(rule.actions.categoryId)
              : null
            const ruleTags = (rule.actions.tagIds ?? [])
              .map((id) => tagMap.get(id))
              .filter((name): name is string => Boolean(name))
            return (
              <Card key={rule.id} className="space-y-2.5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-fg">{rule.name}</span>
                      <Badge>{r.priorityBadge(index)}</Badge>
                      <Badge tone={rule.active ? 'accent' : 'neutral'}>
                        {rule.active ? r.active : r.inactive}
                      </Badge>
                    </div>
                    <p className="text-xs text-fg-2">
                      <span className="font-medium">
                        {r.fields.labelOps[rule.conditions.labelOp]}
                      </span>{' '}
                      <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">
                        {rule.conditions.labelValue}
                      </code>
                      {rule.conditions.direction !== 'any'
                        ? ` · ${r.fields.directions[rule.conditions.direction]}`
                        : ''}
                      {catName ? ` → ${catName}` : ''}
                      {rule.actions.customLabel ? ` · « ${rule.actions.customLabel} »` : ''}
                      {rule.actions.markAsTransfer ? ` · ${r.fields.markAsTransfer}` : ''}
                    </p>
                    {ruleTags.length > 0 ? (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {ruleTags.map((tagName) => (
                          <Badge key={tagName}>{tagName}</Badge>
                        ))}
                      </div>
                    ) : null}
                    <p className="text-[11px] text-muted">
                      {r.appliedStats(rule.appliedCount)} ·{' '}
                      {rule.lastAppliedAt ? fmt.dateTime(rule.lastAppliedAt) : r.neverApplied}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      iconOnly
                      aria-label={r.moveUp}
                      disabled={index === 0 || saveRule.isPending}
                      onClick={() => void swapPriority(index, -1)}
                    >
                      <ArrowUp size={14} aria-hidden />
                    </Button>
                    <Button
                      iconOnly
                      aria-label={r.moveDown}
                      disabled={index === rules.length - 1 || saveRule.isPending}
                      onClick={() => void swapPriority(index, 1)}
                    >
                      <ArrowDown size={14} aria-hidden />
                    </Button>
                    <Button
                      className="h-8 px-2.5 text-xs"
                      disabled={saveRule.isPending}
                      onClick={() => {
                        onError(null)
                        void saveRule
                          .mutateAsync({
                            id: rule.id,
                            name: rule.name,
                            conditions: rule.conditions,
                            actions: rule.actions,
                            priority: rule.priority,
                            active: !rule.active,
                          })
                          .catch((failure: unknown) =>
                            onError(t.ledger.errors[ledgerErrorCode(failure)]),
                          )
                      }}
                    >
                      {rule.active ? r.inactive : r.active}
                    </Button>
                    <Button
                      className="h-8 px-2.5 text-xs"
                      disabled={applyRule.isPending}
                      onClick={() => {
                        onError(null)
                        void applyRule
                          .mutateAsync({ ruleId: rule.id, onlyUncategorized: false })
                          .then((res) => onNotice(r.appliedNotice(res.appliedCount)))
                          .catch((failure: unknown) =>
                            onError(t.ledger.errors[ledgerErrorCode(failure)]),
                          )
                      }}
                    >
                      <Play size={13} aria-hidden />
                      {r.applyRule}
                    </Button>
                    <Button className="h-8 px-2.5 text-xs" onClick={() => setEditingRule(rule)}>
                      <SlidersHorizontal size={13} aria-hidden />
                      {r.editRuleShort}
                    </Button>
                    <Button
                      iconOnly
                      aria-label={r.deleteConfirm}
                      onClick={() => setConfirmDelete(rule)}
                      className="text-expense"
                    >
                      <Trash2 size={14} aria-hidden />
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {editingRule ? (
        <RuleEditorDialog
          initial={editingRule === 'new' ? null : editingRule}
          accounts={accounts}
          categories={categories}
          tags={tags}
          onClose={() => setEditingRule(null)}
          onSaved={(name, applied) => {
            setEditingRule(null)
            onNotice(
              applied !== null
                ? `${r.savedNotice(name)} ${r.appliedNotice(applied)}`
                : r.savedNotice(name),
            )
          }}
        />
      ) : null}

      {confirmDelete ? (
        <ConfirmDialog
          title={r.deleteTitle}
          message={r.deleteMessage(confirmDelete.name)}
          confirmLabel={r.deleteConfirm}
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => {
            const targetId = confirmDelete.id
            setConfirmDelete(null)
            void deleteRule
              .mutateAsync({ id: targetId })
              .then(() => onNotice(r.deletedNotice))
              .catch((failure: unknown) => onError(t.ledger.errors[ledgerErrorCode(failure)]))
          }}
        />
      ) : null}
    </div>
  )
}

function RuleEditorDialog({
  initial,
  accounts,
  categories,
  tags,
  onClose,
  onSaved,
}: {
  initial: RuleSummary | null
  accounts: readonly AccountSummary[]
  categories: readonly CategorySummary[]
  tags: readonly TagSummary[]
  onClose: () => void
  onSaved: (name: string, appliedCount: number | null) => void
}) {
  const t = useT()
  const r = t.categorization.rules
  const f = r.fields
  const fmt = useFormatters()
  const locale = useSettingsStore((state) => state.settings.locale)

  const saveRule = useLedgerMutation('ruleSave')
  const applyRule = useLedgerMutation('ruleApply')

  const [name, setName] = useState(initial?.name ?? '')
  const [labelOp, setLabelOp] = useState<RuleLabelOp>(initial?.conditions.labelOp ?? 'contains')
  const [labelValue, setLabelValue] = useState(initial?.conditions.labelValue ?? '')
  const [caseSensitive, setCaseSensitive] = useState(initial?.conditions.caseSensitive ?? false)
  const [direction, setDirection] = useState<RuleDirection>(initial?.conditions.direction ?? 'any')
  const [amountOp, setAmountOp] = useState<RuleAmountOp>(initial?.conditions.amountOp ?? 'any')
  const [amountMinInput, setAmountMinInput] = useState(
    initial?.conditions.amountMin != null
      ? amountToInput(initial.conditions.amountMin, locale)
      : '',
  )
  const [amountMaxInput, setAmountMaxInput] = useState(
    initial?.conditions.amountMax != null
      ? amountToInput(initial.conditions.amountMax, locale)
      : '',
  )
  const [accountIds, setAccountIds] = useState<string[]>(initial?.conditions.accountIds ?? [])
  const [categoryId, setCategoryId] = useState(initial?.actions.categoryId ?? '')
  const [tagIds, setTagIds] = useState<string[]>(initial?.actions.tagIds ?? [])
  const [customLabel, setCustomLabel] = useState(initial?.actions.customLabel ?? '')
  const [payee, setPayee] = useState(initial?.actions.payee ?? '')
  const [markAsTransfer, setMarkAsTransfer] = useState(initial?.actions.markAsTransfer ?? false)
  const [applyOnSave, setApplyOnSave] = useState(initial === null)
  const [error, setError] = useState<string | null>(null)

  const regexCheck = useMemo(() => {
    if (labelOp !== 'regex' || !labelValue.trim()) return { ok: true as const }
    return validateSafeRegex(labelValue.trim(), caseSensitive)
  }, [labelOp, labelValue, caseSensitive])

  const parsedAmountMin = amountMinInput.trim() ? parseAmount(amountMinInput) : null
  const parsedAmountMax = amountMaxInput.trim() ? parseAmount(amountMaxInput) : null

  const conditions: RuleConditions | null = useMemo(() => {
    const trimmed = labelValue.trim()
    if (!trimmed) return null
    if (!regexCheck.ok) return null
    return {
      labelOp,
      labelValue: trimmed,
      caseSensitive,
      direction,
      amountOp,
      amountMin: parsedAmountMin !== null ? Math.abs(parsedAmountMin) : null,
      amountMax: parsedAmountMax !== null ? Math.abs(parsedAmountMax) : null,
      ...(accountIds.length > 0 ? { accountIds } : {}),
    }
  }, [
    labelOp,
    labelValue,
    caseSensitive,
    regexCheck.ok,
    direction,
    amountOp,
    parsedAmountMin,
    parsedAmountMax,
    accountIds,
  ])

  const previewQuery = useLedgerQuery(
    'rulePreview',
    conditions ?? { labelOp: 'contains', labelValue: 'x', direction: 'any', amountOp: 'any' },
    { enabled: conditions !== null },
  )

  const activeAccounts = accounts.filter((a) => !a.archived)

  const toggleId = (list: string[], id: string, setter: (next: string[]) => void) => {
    setter(list.includes(id) ? list.filter((item) => item !== id) : [...list, id])
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!name.trim() || !conditions) {
      setError(regexCheck.ok ? t.ledger.errors.invalid : f.regexInvalid)
      return
    }
    const actions: RuleActions = {
      ...(categoryId ? { categoryId } : {}),
      ...(tagIds.length > 0 ? { tagIds } : {}),
      ...(customLabel.trim() ? { customLabel: customLabel.trim() } : {}),
      ...(payee.trim() ? { payee: payee.trim() } : {}),
      ...(markAsTransfer ? { markAsTransfer: true } : {}),
    }
    if (
      !actions.categoryId &&
      !actions.tagIds?.length &&
      !actions.customLabel &&
      !actions.payee &&
      !actions.markAsTransfer
    ) {
      setError(t.ledger.errors.invalid)
      return
    }

    try {
      const saved = await saveRule.mutateAsync({
        ...(initial ? { id: initial.id, priority: initial.priority, active: initial.active } : {}),
        name: name.trim(),
        conditions,
        actions,
      })
      let appliedCount: number | null = null
      if (applyOnSave) {
        const res = await applyRule.mutateAsync({ ruleId: saved.id, onlyUncategorized: true })
        appliedCount = res.appliedCount
      }
      onSaved(saved.name, appliedCount)
    } catch (failure) {
      setError(t.ledger.errors[ledgerErrorCode(failure)])
    }
  }

  return (
    <Dialog title={initial ? r.editRule : r.newRule} onClose={onClose} size="lg">
      <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-4">
        {error ? (
          <p role="alert" className="text-xs font-medium text-expense">
            {error}
          </p>
        ) : null}

        <label className="block text-xs text-fg-2">
          <span className="mb-1 block font-medium">{f.name}</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={f.namePlaceholder}
            maxLength={120}
            className={cx(INPUT_CLASS, 'h-9 border-border-strong text-sm')}
          />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block text-xs text-fg-2">
            <span className="mb-1 block font-medium">{f.labelOp}</span>
            <select
              value={labelOp}
              onChange={(event) => setLabelOp(event.target.value as RuleLabelOp)}
              className={cx(INPUT_CLASS, 'h-9 border-border-strong text-sm')}
            >
              {RULE_LABEL_OPS.map((op) => (
                <option key={op} value={op}>
                  {f.labelOps[op]}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-fg-2 sm:col-span-2">
            <span className="mb-1 block font-medium">{f.labelValue}</span>
            <input
              type="text"
              value={labelValue}
              onChange={(event) => setLabelValue(event.target.value)}
              placeholder={f.labelPlaceholder}
              maxLength={180}
              className={cx(INPUT_CLASS, 'h-9 border-border-strong font-mono text-xs')}
            />
          </label>
        </div>

        {labelOp === 'regex' && !regexCheck.ok ? (
          <p role="alert" className="text-xs font-medium text-expense">
            {f.regexInvalid}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block text-xs text-fg-2">
            <span className="mb-1 block font-medium">{f.direction}</span>
            <select
              value={direction}
              onChange={(event) => setDirection(event.target.value as RuleDirection)}
              className={cx(INPUT_CLASS, 'h-9 border-border-strong text-sm')}
            >
              {RULE_DIRECTIONS.map((dir) => (
                <option key={dir} value={dir}>
                  {f.directions[dir]}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-fg-2">
            <span className="mb-1 block font-medium">{f.amountOp}</span>
            <select
              value={amountOp}
              onChange={(event) => setAmountOp(event.target.value as RuleAmountOp)}
              className={cx(INPUT_CLASS, 'h-9 border-border-strong text-sm')}
            >
              {RULE_AMOUNT_OPS.map((op) => (
                <option key={op} value={op}>
                  {f.amountOps[op]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-end gap-2 pb-2 text-xs text-fg-2">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(event) => setCaseSensitive(event.target.checked)}
              className="accent-pink"
            />
            {f.caseSensitive}
          </label>
        </div>

        {amountOp !== 'any' ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs text-fg-2">
              <span className="mb-1 block font-medium">{f.amountMin}</span>
              <input
                type="text"
                value={amountMinInput}
                onChange={(event) => setAmountMinInput(event.target.value)}
                className={cx(INPUT_CLASS, 'h-9 border-border-strong text-sm tabular-nums')}
              />
            </label>
            {amountOp === 'between' ? (
              <label className="block text-xs text-fg-2">
                <span className="mb-1 block font-medium">{f.amountMax}</span>
                <input
                  type="text"
                  value={amountMaxInput}
                  onChange={(event) => setAmountMaxInput(event.target.value)}
                  className={cx(INPUT_CLASS, 'h-9 border-border-strong text-sm tabular-nums')}
                />
              </label>
            ) : null}
          </div>
        ) : null}

        {activeAccounts.length > 1 ? (
          <div>
            <span className="mb-1.5 block text-xs font-medium text-fg-2">{f.accounts}</span>
            <div className="flex flex-wrap gap-1.5">
              {activeAccounts.map((acc) => {
                const selected = accountIds.includes(acc.id)
                return (
                  <button
                    key={acc.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleId(accountIds, acc.id, setAccountIds)}
                    className={cx(
                      'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                      selected
                        ? 'border-pink bg-pink/15 font-medium text-fg'
                        : 'border-border bg-surface-2 text-muted hover:text-fg',
                    )}
                  >
                    {acc.name}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        <div className="space-y-3 border-t border-border pt-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs text-fg-2">
              <span className="mb-1 block font-medium">{f.category}</span>
              <CategorySelect
                categories={categories}
                value={categoryId}
                onChange={setCategoryId}
                emptyLabel={f.keepCategory}
                className="h-9 text-sm"
              />
            </label>

            <label className="block text-xs text-fg-2">
              <span className="mb-1 block font-medium">{f.customLabel}</span>
              <input
                type="text"
                value={customLabel}
                onChange={(event) => setCustomLabel(event.target.value)}
                placeholder={f.customLabelPlaceholder}
                maxLength={200}
                className={cx(INPUT_CLASS, 'h-9 border-border-strong text-sm')}
              />
            </label>
          </div>

          <label className="block text-xs text-fg-2">
            <span className="mb-1 block font-medium">{f.payee}</span>
            <input
              type="text"
              value={payee}
              onChange={(event) => setPayee(event.target.value)}
              placeholder={f.customLabelPlaceholder}
              maxLength={120}
              className={cx(INPUT_CLASS, 'h-9 border-border-strong text-sm')}
            />
          </label>

          {tags.length > 0 ? (
            <div>
              <span className="mb-1.5 block text-xs font-medium text-fg-2">{f.tags}</span>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => {
                  const selected = tagIds.includes(tag.id)
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleId(tagIds, tag.id, setTagIds)}
                      className={cx(
                        'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                        selected
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

          <Switch checked={markAsTransfer} onChange={setMarkAsTransfer} label={f.markAsTransfer} />

          <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-2">
            <input
              type="checkbox"
              checked={applyOnSave}
              onChange={(event) => setApplyOnSave(event.target.checked)}
              className="accent-pink"
            />
            {f.applyOnSave}
          </label>
        </div>

        {/* Aperçu en direct */}
        {conditions ? (
          <div className="rounded-lg border border-border bg-surface-2 p-3 text-xs">
            <p className="font-medium text-fg">
              {previewQuery.isFetching
                ? r.previewLoading
                : r.previewTitle(previewQuery.data?.matchCount ?? 0)}
            </p>
            {previewQuery.data && previewQuery.data.samples.length === 0 ? (
              <p className="mt-1 text-muted">{r.previewEmpty}</p>
            ) : previewQuery.data ? (
              <ul className="mt-2 space-y-1 text-fg-2">
                {previewQuery.data.samples.slice(0, 5).map((sample) => (
                  <li key={sample.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {fmt.date(sample.bookingDate)} · {sample.accountName} · {sample.label}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {fmt.money(sample.amount, { signed: true, currency: sample.currency })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button
            type="submit"
            variant="primary"
            disabled={saveRule.isPending || applyRule.isPending}
          >
            {f.save}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
