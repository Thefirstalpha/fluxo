import { Check, Plus, RefreshCw, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CategorizationQueueItem } from '@shared/categorization/model'
import type { AccountSummary, CategorySummary, TagSummary } from '@shared/ledger/model'
import { CategorySelect } from '../../components/CategorySelect'
import { LinkedAccountStatusHint } from '../../components/LinkedAccountStatusHint'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { useT } from '../../i18n'
import { cx } from '../../lib/cx'
import { useFormatters } from '../../lib/format'
import { ledgerErrorCode, useLedgerMutation, useLedgerQuery } from '../../lib/ledger'
import { CreateRuleFromTxDialog } from './CreateRuleFromTxDialog'

interface DraftSelection {
  categoryId: string
  tagIds: string[]
}

/** Boîte « À valider » avec validation clavier rapide (1–9, Entrée, Suppr, R, ↑/↓). */
export function ValidationQueueTab({
  accounts = [],
  categories,
  tags,
  onNotice,
  onError,
}: {
  accounts?: readonly AccountSummary[]
  categories: readonly CategorySummary[]
  tags: readonly TagSummary[]
  onNotice: (message: string) => void
  onError: (message: string | null) => void
}) {
  const t = useT()
  const q = t.categorization.queue
  const fmt = useFormatters()

  const queueQuery = useLedgerQuery('categorizationQueueList', { limit: 100 })
  const statusQuery = useLedgerQuery('classifierStatus', {})

  const runAuto = useLedgerMutation('categorizeAutoRun')
  const retrain = useLedgerMutation('classifierRetrain')
  const setThreshold = useLedgerMutation('categorizationThresholdSet')
  const acceptMutation = useLedgerMutation('categorizationAccept')
  const rejectMutation = useLedgerMutation('categorizationReject')
  const updateAccount = useLedgerMutation('accountUpdate')

  const items = useMemo(() => queueQuery.data ?? [], [queueQuery.data])
  const [activeIndex, setActiveIndex] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, DraftSelection>>({})
  const [thresholdDraft, setThresholdDraft] = useState<number | null>(null)
  const [ruleSourceItem, setRuleSourceItem] = useState<CategorizationQueueItem | null>(null)

  const serverThreshold = statusQuery.data?.threshold ?? 0.85
  const effectiveThreshold = thresholdDraft ?? serverThreshold

  // Top 9 catégories feuille actives pour les raccourcis clavier 1..9.
  const quickCategories = useMemo(() => {
    const active = categories.filter((c) => !c.archived && c.kind !== 'transfer')
    const leaves = active.filter((c) => c.parentId !== null)
    const pool = leaves.length >= 9 ? leaves : active
    return pool.slice(0, 9)
  }, [categories])

  const boundedIndex = items.length === 0 ? 0 : Math.min(activeIndex, items.length - 1)
  const activeItem = items[boundedIndex] ?? null

  const getDraft = (item: CategorizationQueueItem): DraftSelection => {
    const existing = drafts[item.transactionId]
    if (existing) return existing
    return {
      categoryId: item.suggestion?.categoryId ?? '',
      tagIds: item.suggestion?.tagIds ?? item.currentTagIds,
    }
  }

  const updateDraft = (txId: string, patch: Partial<DraftSelection>, fallback: DraftSelection) => {
    setDrafts((prev) => ({
      ...prev,
      [txId]: { ...(prev[txId] ?? fallback), ...patch },
    }))
  }

  const handleAccept = async (item: CategorizationQueueItem, overrideCategoryId?: string) => {
    onError(null)
    const draft = getDraft(item)
    const chosenCategory = overrideCategoryId ?? draft.categoryId
    try {
      await acceptMutation.mutateAsync({
        transactionId: item.transactionId,
        categoryId: chosenCategory || null,
        tagIds: draft.tagIds,
      })
      onNotice(q.acceptedNotice)
    } catch (failure) {
      onError(t.ledger.errors[ledgerErrorCode(failure)])
    }
  }

  const handleReject = async (item: CategorizationQueueItem) => {
    onError(null)
    try {
      await rejectMutation.mutateAsync({ transactionId: item.transactionId })
      onNotice(q.rejectedNotice)
    } catch (failure) {
      onError(t.ledger.errors[ledgerErrorCode(failure)])
    }
  }

  const keyStateRef = useRef({
    items,
    boundedIndex,
    quickCategories,
    ruleSourceItem,
    handleAccept,
    handleReject,
  })
  useEffect(() => {
    keyStateRef.current = {
      items,
      boundedIndex,
      quickCategories,
      ruleSourceItem,
      handleAccept,
      handleReject,
    }
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const state = keyStateRef.current
      if (state.ruleSourceItem || state.items.length === 0) return

      const current = state.items[state.boundedIndex]
      if (!current) return

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((prev) => Math.min(state.items.length - 1, prev + 1))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((prev) => Math.max(0, prev - 1))
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        void state.handleAccept(current)
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        void state.handleReject(current)
        return
      }
      if (event.key.toLowerCase() === 'r') {
        event.preventDefault()
        setRuleSourceItem(current)
        return
      }
      if (/^[1-9]$/.test(event.key)) {
        const quickCat = state.quickCategories[Number(event.key) - 1]
        if (quickCat) {
          event.preventDefault()
          void state.handleAccept(current, quickCat.id)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const pctThreshold = Math.round(effectiveThreshold * 100)

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-fg">
            {q.classifierSummary(
              statusQuery.data?.sampleCount ?? 0,
              statusQuery.data?.categoryCount ?? 0,
            )}
          </p>
          <p className="text-xs text-muted">{q.shortcutsHint}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-fg-2">
            <span>{q.thresholdLabel}</span>
            <input
              type="range"
              min={50}
              max={99}
              step={1}
              value={pctThreshold}
              onChange={(event) => setThresholdDraft(Number(event.target.value) / 100)}
              onMouseUp={(event) => {
                const value = Number((event.target as HTMLInputElement).value) / 100
                void setThreshold
                  .mutateAsync({ threshold: value })
                  .then(() => setThresholdDraft(null))
              }}
              onBlur={(event) => {
                const value = Number(event.target.value) / 100
                if (thresholdDraft !== null) {
                  void setThreshold
                    .mutateAsync({ threshold: value })
                    .then(() => setThresholdDraft(null))
                }
              }}
              className="w-24 accent-pink"
            />
            <span className="w-9 font-semibold text-fg tabular-nums">
              {q.thresholdValue(pctThreshold)}
            </span>
          </label>

          <Button
            disabled={retrain.isPending}
            onClick={() => {
              onError(null)
              void retrain
                .mutateAsync({})
                .then((res) => onNotice(q.retrainedSummary(res.sampleCount, res.categoryCount)))
                .catch((failure: unknown) => onError(t.ledger.errors[ledgerErrorCode(failure)]))
            }}
          >
            <RefreshCw size={14} aria-hidden />
            {retrain.isPending ? q.retraining : q.retrain}
          </Button>

          <Button
            variant="primary"
            disabled={runAuto.isPending}
            onClick={() => {
              onError(null)
              void (async () => {
                if (thresholdDraft !== null) {
                  await setThreshold.mutateAsync({ threshold: thresholdDraft })
                  setThresholdDraft(null)
                }
                const res = await runAuto.mutateAsync({})
                onNotice(
                  q.autoSummary(
                    res.evaluatedCount,
                    res.autoAppliedCount,
                    res.queuedCount,
                    res.durationMs,
                  ),
                )
              })().catch((failure: unknown) => onError(t.ledger.errors[ledgerErrorCode(failure)]))
            }}
          >
            <Sparkles size={14} aria-hidden />
            {runAuto.isPending ? q.running : q.runAuto}
          </Button>
        </div>
      </Card>

      {items.length > 0 && quickCategories.length > 0 ? (
        <div
          aria-label={q.quickKeysTitle}
          className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs"
        >
          <span className="mr-1 font-medium text-muted">{q.quickKeysTitle} :</span>
          {quickCategories.map((cat, idx) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                if (activeItem) void handleAccept(activeItem, cat.id)
              }}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-0.5 text-xs text-fg-2 transition-colors hover:border-pink hover:text-fg"
            >
              <kbd className="font-mono text-[10px] font-semibold text-pink">{idx + 1}</kbd>
              <span>{cat.name}</span>
            </button>
          ))}
        </div>
      ) : null}

      {queueQuery.isPending ? (
        <Card>
          <p className="text-sm text-muted">{t.common.loading}</p>
        </Card>
      ) : items.length === 0 ? (
        <Card className="space-y-1 p-6 text-center">
          <p className="text-sm font-medium text-fg">{q.empty}</p>
          <p className="text-xs text-muted">{q.emptyHint}</p>
        </Card>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item, idx) => {
            const isActive = idx === boundedIndex
            const draft = getDraft(item)
            return (
              <li key={item.transactionId} onClick={() => setActiveIndex(idx)}>
                <Card
                  className={cx(
                    'space-y-3 p-4 transition-colors',
                    isActive && 'ring-2 ring-pink/50',
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-fg">
                          {item.suggestion?.suggestedLabel ??
                            item.cleanedLabel ??
                            item.labelDisplay}
                        </span>
                        <Badge>{item.accountName}</Badge>
                        <span className="text-xs text-muted tabular-nums">
                          {fmt.date(item.bookingDate)}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-muted">
                        {q.rawLabel} {item.labelRaw}
                      </p>
                      {item.suggestion ? (
                        <p className="flex flex-wrap items-center gap-1.5 text-xs text-fg-2">
                          <Badge tone="accent">{q.sources[item.suggestion.source]}</Badge>
                          <span>{item.suggestion.reason}</span>
                        </p>
                      ) : null}
                    </div>
                    <p
                      className={cx(
                        'text-base font-semibold tabular-nums',
                        item.amount < 0 ? 'text-fg' : 'text-income',
                      )}
                    >
                      {fmt.money(item.amount, { signed: true, currency: item.currency })}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    <div className="min-w-[210px] flex-1">
                      <CategorySelect
                        aria-label={q.categoryPlaceholder}
                        categories={categories}
                        value={draft.categoryId}
                        onChange={(value) =>
                          updateDraft(item.transactionId, { categoryId: value }, draft)
                        }
                        emptyLabel={q.categoryPlaceholder}
                        className="h-8 text-xs"
                      />
                    </div>

                    {tags.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1">
                        {tags.map((tag) => {
                          const selected = draft.tagIds.includes(tag.id)
                          return (
                            <button
                              key={tag.id}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => {
                                const nextTags = selected
                                  ? draft.tagIds.filter((id) => id !== tag.id)
                                  : [...draft.tagIds, tag.id]
                                updateDraft(item.transactionId, { tagIds: nextTags }, draft)
                              }}
                              className={cx(
                                'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
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
                    ) : null}

                    <div className="ml-auto flex flex-wrap items-center gap-1.5">
                      <Button
                        className="h-8 px-2.5 text-xs"
                        onClick={(event) => {
                          event.stopPropagation()
                          setRuleSourceItem(item)
                        }}
                      >
                        <Plus size={13} aria-hidden />
                        {q.createRule}
                      </Button>
                      <Button
                        className="h-8 px-2.5 text-xs"
                        disabled={rejectMutation.isPending}
                        onClick={(event) => {
                          event.stopPropagation()
                          void handleReject(item)
                        }}
                      >
                        <X size={13} aria-hidden />
                        {q.reject}
                      </Button>
                      <Button
                        variant="primary"
                        className="h-8 px-3 text-xs"
                        disabled={acceptMutation.isPending}
                        onClick={(event) => {
                          event.stopPropagation()
                          void handleAccept(item)
                        }}
                      >
                        <Check size={13} aria-hidden />
                        {q.accept}
                      </Button>
                    </div>
                  </div>
                  <LinkedAccountStatusHint
                    categoryId={draft.categoryId || null}
                    categories={categories}
                    accounts={accounts}
                    sourceAccountId={item.accountId}
                    switching={updateAccount.isPending}
                    onSwitchToManual={(target) => {
                      onError(null)
                      void updateAccount
                        .mutateAsync({ id: target.id, patch: { trackingMode: 'manual' } })
                        .then(() => onNotice(q.linkedSwitchedNotice(target.name)))
                        .catch((failure: unknown) =>
                          onError(t.ledger.errors[ledgerErrorCode(failure)]),
                        )
                    }}
                  />
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {ruleSourceItem ? (
        <CreateRuleFromTxDialog
          transactionId={ruleSourceItem.transactionId}
          rawLabel={ruleSourceItem.labelRaw}
          defaultCategoryId={getDraft(ruleSourceItem).categoryId || null}
          defaultTagIds={getDraft(ruleSourceItem).tagIds}
          categories={categories}
          tags={tags}
          onClose={() => setRuleSourceItem(null)}
          onCreated={(ruleName) => {
            setRuleSourceItem(null)
            onNotice(t.transactions.detail.createRuleCreated(ruleName))
          }}
        />
      ) : null}
    </div>
  )
}
