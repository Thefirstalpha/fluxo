import { Bookmark, Columns3, Filter, RotateCcw, Search, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import {
  TRANSACTION_SORTS,
  TRANSACTION_STATUSES,
  UNCATEGORIZED,
  type AccountSummary,
  type CategorySummary,
  type SavedFilter,
  type TagSummary,
  type TransactionFilter,
  type TransactionSort,
  type TransactionStatus,
} from '@shared/ledger/model'
import { parseAmount } from '@shared/money'
import { CategorySelect } from '../../components/CategorySelect'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { INPUT_CLASS } from '../../components/ui/Field'
import { useT } from '../../i18n'
import { cx } from '../../lib/cx'
import { ledgerErrorCode, useLedgerMutation, useLedgerQuery } from '../../lib/ledger'
import type { RegisterColumn } from '../../stores/register'
import type { GroupingMode } from './grouping'

const TOGGLEABLE_COLUMNS: readonly RegisterColumn[] = [
  'date',
  'account',
  'payee',
  'category',
  'tags',
  'status',
  'favorite',
]

interface TransactionFiltersProps {
  filter: TransactionFilter
  sort: TransactionSort
  grouping: GroupingMode
  visibleColumns: readonly RegisterColumn[]
  accounts: readonly AccountSummary[]
  categories: readonly CategorySummary[]
  tags: readonly TagSummary[]
  searchInputRef: RefObject<HTMLInputElement | null>
  onFilterChange: (next: TransactionFilter) => void
  onReset: () => void
  onSortChange: (next: TransactionSort) => void
  onGroupingChange: (next: GroupingMode) => void
  onToggleColumn: (column: RegisterColumn) => void
}

function hasActiveFilters(filter: TransactionFilter): boolean {
  return Boolean(
    filter.search ||
    filter.accountIds?.length ||
    filter.from ||
    filter.to ||
    filter.categoryIds?.length ||
    filter.tagIds?.length ||
    filter.minAmount !== undefined ||
    filter.maxAmount !== undefined ||
    filter.direction ||
    filter.statuses?.length ||
    filter.favorite,
  )
}

/** Barre de filtres combinables, recherche plein texte (FTS5), filtres enregistrés et colonnes. */
export function TransactionFilters({
  filter,
  sort,
  grouping,
  visibleColumns,
  accounts,
  categories,
  tags,
  searchInputRef,
  onFilterChange,
  onReset,
  onSortChange,
  onGroupingChange,
  onToggleColumn,
}: TransactionFiltersProps) {
  const t = useT()
  const f = t.transactions.filters
  const savedFilters = useLedgerQuery('savedFiltersList', {})
  const saveFilter = useLedgerMutation('savedFilterSave')
  const deleteSavedFilter = useLedgerMutation('savedFilterDelete')

  const [draftSearch, setDraftSearch] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [draftMin, setDraftMin] = useState<string | null>(null)
  const [draftMax, setDraftMax] = useState<string | null>(null)
  const [saveName, setSaveName] = useState('')
  const [saveNotice, setSaveNotice] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const searchText = draftSearch ?? filter.search ?? ''
  const minInput =
    draftMin ?? (filter.minAmount !== undefined ? (filter.minAmount / 100).toString() : '')
  const maxInput =
    draftMax ?? (filter.maxAmount !== undefined ? (filter.maxAmount / 100).toString() : '')

  const handleSearchChange = (value: string) => {
    setDraftSearch(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const trimmed = value.trim() || undefined
      setDraftSearch(null)
      if (trimmed !== filter.search) onFilterChange({ ...filter, search: trimmed })
    }, 150)
  }

  const patch = (next: Partial<TransactionFilter>) => onFilterChange({ ...filter, ...next })

  const toggleTag = (tagId: string) => {
    const current = filter.tagIds ?? []
    const next = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId]
    patch({ tagIds: next.length ? next : undefined })
  }

  const toggleStatus = (status: TransactionStatus) => {
    const current = filter.statuses ?? []
    const next = current.includes(status)
      ? current.filter((item) => item !== status)
      : [...current, status]
    patch({ statuses: next.length ? next : undefined })
  }

  const applyAmountBound = (kind: 'min' | 'max', raw: string) => {
    if (kind === 'min') setDraftMin(null)
    else setDraftMax(null)
    if (!raw.trim()) {
      patch(kind === 'min' ? { minAmount: undefined } : { maxAmount: undefined })
      return
    }
    const parsed = parseAmount(raw)
    if (parsed !== null) {
      const abs = Math.abs(parsed)
      patch(kind === 'min' ? { minAmount: abs } : { maxAmount: abs })
    }
  }

  const handleSaveFilter = async () => {
    const name = saveName.trim()
    if (!name) return
    setSaveError(null)
    setSaveNotice(null)
    try {
      await saveFilter.mutateAsync({ name, filter })
      setSaveName('')
      setSaveNotice(f.savedNotice(name))
    } catch (failure) {
      setSaveError(t.ledger.errors[ledgerErrorCode(failure)])
    }
  }

  const applySaved = (saved: SavedFilter) => {
    clearTimeout(debounceRef.current)
    setDraftSearch(null)
    setDraftMin(null)
    setDraftMax(null)
    onFilterChange(saved.filter)
  }

  const savedList = savedFilters.data ?? []
  const tagById = new Map(tags.map((tag) => [tag.id, tag]))
  const active = hasActiveFilters(filter)

  return (
    <section
      aria-label={f.searchLabel}
      className="mb-4 space-y-3 rounded-xl border border-border bg-surface p-3.5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search
            size={15}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted"
          />
          <input
            ref={searchInputRef}
            type="search"
            value={searchText}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder={f.searchPlaceholder}
            aria-label={f.searchLabel}
            className={cx(INPUT_CLASS, 'border-border-strong pl-8')}
          />
        </div>

        <select
          aria-label={f.accountLabel}
          value={filter.accountIds?.[0] ?? ''}
          onChange={(event) =>
            patch({ accountIds: event.target.value ? [event.target.value] : undefined })
          }
          className={cx(INPUT_CLASS, 'w-auto min-w-[155px] border-border-strong')}
        >
          <option value="">{f.allAccounts}</option>
          {accounts
            .filter((a) => !a.archived)
            .map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
        </select>

        <CategorySelect
          aria-label={f.categoryLabel}
          categories={categories}
          value={filter.categoryIds?.[0] ?? ''}
          onChange={(value) => patch({ categoryIds: value ? [value] : undefined })}
          emptyLabel={f.allCategories}
          extraOptions={[{ value: UNCATEGORIZED, label: f.uncategorized }]}
          className="w-auto min-w-[165px]"
        />

        <select
          aria-label={f.tagLabel}
          value=""
          onChange={(event) => {
            if (event.target.value) toggleTag(event.target.value)
          }}
          className={cx(INPUT_CLASS, 'w-auto min-w-[140px] border-border-strong')}
        >
          <option value="">{f.allTags}</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>

        <select
          aria-label={t.transactions.sort.label}
          value={sort}
          onChange={(event) => onSortChange(event.target.value as TransactionSort)}
          className={cx(INPUT_CLASS, 'w-auto border-border-strong')}
        >
          {TRANSACTION_SORTS.map((value) => (
            <option key={value} value={value}>
              {t.transactions.sort[value]}
            </option>
          ))}
        </select>

        <select
          aria-label={t.transactions.grouping.label}
          value={grouping}
          onChange={(event) => onGroupingChange(event.target.value as GroupingMode)}
          className={cx(INPUT_CLASS, 'w-auto border-border-strong')}
        >
          {(['none', 'day', 'month'] as const).map((value) => (
            <option key={value} value={value}>
              {t.transactions.grouping[value]}
            </option>
          ))}
        </select>

        <Button
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className={expanded ? 'fx-frame' : undefined}
        >
          <Filter size={14} aria-hidden />
          {expanded ? f.less : f.more}
        </Button>

        <div className="relative">
          <Button aria-expanded={columnsOpen} onClick={() => setColumnsOpen((value) => !value)}>
            <Columns3 size={14} aria-hidden />
            {t.transactions.columns.button}
          </Button>
          {columnsOpen ? (
            <div
              role="group"
              aria-label={t.transactions.columns.button}
              className="absolute right-0 z-20 mt-1.5 w-48 rounded-lg border border-border-strong bg-surface p-2.5 shadow-lg"
            >
              {TOGGLEABLE_COLUMNS.map((column) => (
                <label
                  key={column}
                  className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs text-fg hover:bg-surface-2"
                >
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes(column)}
                    onChange={() => onToggleColumn(column)}
                    className="accent-pink"
                  />
                  {t.transactions.columns[column]}
                </label>
              ))}
            </div>
          ) : null}
        </div>

        {active ? (
          <Button
            variant="ghost"
            onClick={() => {
              clearTimeout(debounceRef.current)
              setDraftSearch(null)
              setDraftMin(null)
              setDraftMax(null)
              onReset()
            }}
            title={t.transactions.resetFilters}
          >
            <RotateCcw size={14} aria-hidden />
            {t.transactions.resetFilters}
          </Button>
        ) : null}
      </div>

      {filter.tagIds?.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {filter.tagIds.map((tagId) => {
            const tag = tagById.get(tagId)
            return (
              <button
                key={tagId}
                type="button"
                onClick={() => toggleTag(tagId)}
                className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-fg hover:border-pink"
              >
                <Badge tone="accent">{tag?.name ?? tagId.slice(0, 6)}</Badge>
                <span aria-hidden>×</span>
              </button>
            )
          })}
        </div>
      ) : null}

      {expanded ? (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-xs text-fg-2">
              <span className="mb-1 block font-medium">{f.from}</span>
              <input
                type="date"
                value={filter.from ?? ''}
                onChange={(event) => patch({ from: event.target.value || undefined })}
                className={cx(INPUT_CLASS, 'border-border-strong')}
              />
            </label>
            <label className="text-xs text-fg-2">
              <span className="mb-1 block font-medium">{f.to}</span>
              <input
                type="date"
                value={filter.to ?? ''}
                onChange={(event) => patch({ to: event.target.value || undefined })}
                className={cx(INPUT_CLASS, 'border-border-strong')}
              />
            </label>
            <label className="text-xs text-fg-2">
              <span className="mb-1 block font-medium">{f.directionLabel}</span>
              <select
                value={filter.direction ?? ''}
                onChange={(event) =>
                  patch({
                    direction: event.target.value
                      ? (event.target.value as 'in' | 'out')
                      : undefined,
                  })
                }
                className={cx(INPUT_CLASS, 'border-border-strong')}
              >
                <option value="">{f.directionAll}</option>
                <option value="in">{f.directionIn}</option>
                <option value="out">{f.directionOut}</option>
              </select>
            </label>
            <label className="text-xs text-fg-2">
              <span className="mb-1 block font-medium">{f.minAmount}</span>
              <input
                type="text"
                value={minInput}
                onChange={(event) => setDraftMin(event.target.value)}
                onBlur={() => applyAmountBound('min', minInput)}
                placeholder="0,00"
                className={cx(INPUT_CLASS, 'border-border-strong tabular-nums')}
              />
            </label>
            <label className="text-xs text-fg-2">
              <span className="mb-1 block font-medium">{f.maxAmount}</span>
              <input
                type="text"
                value={maxInput}
                onChange={(event) => setDraftMax(event.target.value)}
                onBlur={() => applyAmountBound('max', maxInput)}
                placeholder="500,00"
                className={cx(INPUT_CLASS, 'border-border-strong tabular-nums')}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {TRANSACTION_STATUSES.map((status) => (
                <label
                  key={status}
                  className="flex cursor-pointer items-center gap-1.5 text-xs text-fg-2"
                >
                  <input
                    type="checkbox"
                    checked={filter.statuses?.includes(status) ?? false}
                    onChange={() => toggleStatus(status)}
                    className="accent-pink"
                  />
                  {t.transactions.statuses[status]}
                </label>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-fg-2">
              <input
                type="checkbox"
                checked={filter.favorite === true}
                onChange={(event) => patch({ favorite: event.target.checked ? true : undefined })}
                className="accent-pink"
              />
              {f.favoritesOnly}
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Bookmark size={14} aria-hidden className="text-muted" />
            <span className="text-xs font-medium text-fg-2">{f.saved}</span>
            {savedList.map((saved) => (
              <span
                key={saved.id}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
              >
                <button
                  type="button"
                  onClick={() => applySaved(saved)}
                  className="font-medium text-fg hover:text-pink"
                >
                  {saved.name}
                </button>
                <button
                  type="button"
                  aria-label={f.deleteSaved(saved.name)}
                  onClick={() => void deleteSavedFilter.mutateAsync({ id: saved.id })}
                  className="text-muted hover:text-expense"
                >
                  <Trash2 size={12} aria-hidden />
                </button>
              </span>
            ))}

            <div className="ml-auto flex items-center gap-2">
              <input
                type="text"
                value={saveName}
                onChange={(event) => setSaveName(event.target.value)}
                placeholder={f.savePromptName}
                aria-label={f.savePromptName}
                maxLength={100}
                className={cx(INPUT_CLASS, 'h-8 w-44 border-border-strong text-xs')}
              />
              <Button
                onClick={() => void handleSaveFilter()}
                disabled={!saveName.trim() || saveFilter.isPending}
                className="h-8 px-2.5 text-xs"
              >
                {f.saveCurrent}
              </Button>
            </div>
          </div>
          {saveNotice ? (
            <p aria-live="polite" className="text-xs text-fg-2">
              {saveNotice}
            </p>
          ) : null}
          {saveError ? (
            <p role="alert" className="text-xs text-expense">
              {saveError}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
