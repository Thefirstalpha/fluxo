import {
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, ArrowLeftRight, Star } from 'lucide-react'
import { useEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent } from 'react'
import type {
  AccountSummary,
  CategorySummary,
  TagSummary,
  TransactionRow,
  TransactionSort,
  TransactionStatus,
} from '@shared/ledger/model'
import { CategorySelect } from '../../components/CategorySelect'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useT } from '../../i18n'
import { cx } from '../../lib/cx'
import { useFormatters } from '../../lib/format'
import type { RegisterColumn } from '../../stores/register'
import type { RegisterItem } from './grouping'

const features = tableFeatures({ columnSizingFeature, columnVisibilityFeature })
const columnHelper = createColumnHelper<typeof features, RegisterItem>()

interface TransactionTableProps {
  items: readonly RegisterItem[]
  rows: readonly TransactionRow[]
  totalCount: number
  accounts: readonly AccountSummary[]
  categories: readonly CategorySummary[]
  tags: readonly TagSummary[]
  visibleColumns: readonly RegisterColumn[]
  sort: TransactionSort
  selectedIds: ReadonlySet<string>
  activeId: string | null
  hasMore: boolean
  isFetchingNextPage: boolean
  onLoadMore: () => void
  onActivateRow: (id: string) => void
  onToggleSelect: (id: string, shiftKey: boolean) => void
  onToggleAll: () => void
  onToggleFavorite: (row: TransactionRow) => void
  onQuickCategory: (row: TransactionRow, categoryId: string | null) => void
  onQuickStatus: (row: TransactionRow, status: TransactionStatus) => void
  onSortChange: (sort: TransactionSort) => void
}

const NEXT_STATUS: Record<TransactionStatus, TransactionStatus> = {
  pending: 'cleared',
  cleared: 'reconciled',
  reconciled: 'pending',
}

/**
 * Tableau virtualisé du registre (TanStack Table v9 + TanStack Virtual).
 * Gère 50 000 lignes sans ralentissement grâce au défilement virtualisé et au chargement par curseur.
 */
export function TransactionTable({
  items,
  rows,
  totalCount,
  accounts,
  categories,
  tags,
  visibleColumns,
  sort,
  selectedIds,
  activeId,
  hasMore,
  isFetchingNextPage,
  onLoadMore,
  onActivateRow,
  onToggleSelect,
  onToggleAll,
  onToggleFavorite,
  onQuickCategory,
  onQuickStatus,
  onSortChange,
}: TransactionTableProps) {
  const t = useT()
  const fmt = useFormatters()
  const scrollRef = useRef<HTMLDivElement>(null)

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const tagById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags])

  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id))

  const columnVisibility = useMemo(
    () => ({
      date: visibleColumns.includes('date'),
      account: visibleColumns.includes('account'),
      label: true,
      payee: visibleColumns.includes('payee'),
      category: visibleColumns.includes('category'),
      tags: visibleColumns.includes('tags'),
      status: visibleColumns.includes('status'),
      favorite: visibleColumns.includes('favorite'),
      amount: true,
    }),
    [visibleColumns],
  )

  const toggleSort = (kind: 'date' | 'amount') => {
    if (kind === 'date') onSortChange(sort === 'date-desc' ? 'date-asc' : 'date-desc')
    else onSortChange(sort === 'amount-desc' ? 'amount-asc' : 'amount-desc')
  }

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'select',
        size: 36,
        header: () => (
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onToggleAll}
            aria-label={t.transactions.row.selectAll}
            className="accent-pink"
          />
        ),
        cell: ({ row }) => {
          const item = row.original
          if (item.kind !== 'row') return null
          return (
            <input
              type="checkbox"
              checked={selectedIds.has(item.row.id)}
              onClick={(event: MouseEvent<HTMLInputElement>) => {
                event.stopPropagation()
                onToggleSelect(item.row.id, event.shiftKey)
              }}
              onChange={() => undefined}
              aria-label={t.transactions.row.select(item.row.label)}
              className="accent-pink"
            />
          )
        },
      }),
      columnHelper.display({
        id: 'date',
        size: 112,
        header: () => (
          <button
            type="button"
            onClick={() => toggleSort('date')}
            className="inline-flex items-center gap-1 font-medium hover:text-fg"
          >
            {t.transactions.columns.date}
            {sort === 'date-desc' ? (
              <ArrowDown size={12} aria-hidden />
            ) : sort === 'date-asc' ? (
              <ArrowUp size={12} aria-hidden />
            ) : null}
          </button>
        ),
        cell: ({ row }) => {
          const item = row.original
          if (item.kind !== 'row') return null
          return (
            <span className="text-xs text-fg-2 tabular-nums">{fmt.date(item.row.bookingDate)}</span>
          )
        },
      }),
      columnHelper.display({
        id: 'account',
        size: 135,
        header: () => t.transactions.columns.account,
        cell: ({ row }) => {
          const item = row.original
          if (item.kind !== 'row') return null
          return (
            <span className="truncate text-xs text-fg-2">
              {accountById.get(item.row.accountId)?.name ?? '—'}
            </span>
          )
        },
      }),
      columnHelper.display({
        id: 'label',
        size: 250,
        header: () => t.transactions.columns.label,
        cell: ({ row }) => {
          const item = row.original
          if (item.kind !== 'row') return null
          const tx = item.row
          return (
            <div className="flex min-w-0 items-center gap-1.5">
              {tx.transferId ? (
                <ArrowLeftRight size={13} aria-hidden className="shrink-0 text-teal" />
              ) : null}
              <span className="truncate text-sm font-medium text-fg">{tx.label}</span>
              {tx.nature === 'adjustment' ? (
                <Badge tone="accent">{t.transactions.natures.adjustment}</Badge>
              ) : null}
            </div>
          )
        },
      }),
      columnHelper.display({
        id: 'payee',
        size: 140,
        header: () => t.transactions.columns.payee,
        cell: ({ row }) => {
          const item = row.original
          if (item.kind !== 'row') return null
          return <span className="truncate text-xs text-fg-2">{item.row.payee ?? '—'}</span>
        },
      }),
      columnHelper.display({
        id: 'category',
        size: 165,
        header: () => t.transactions.columns.category,
        cell: ({ row }) => {
          const item = row.original
          if (item.kind !== 'row') return null
          const tx = item.row
          if (tx.splitCount > 1) {
            return <Badge>{t.transactions.badges.split(tx.splitCount)}</Badge>
          }
          const currentCatId = tx.categoryIds[0] ?? ''
          const currentCat = currentCatId ? categoryById.get(currentCatId) : undefined
          if (currentCat?.archived) {
            return <span className="truncate text-xs text-muted">{currentCat.name}</span>
          }
          return (
            <CategorySelect
              categories={categories}
              value={currentCatId ?? ''}
              aria-label={t.transactions.row.quickCategory(tx.label)}
              emptyLabel={t.transactions.filters.uncategorized}
              onClick={(event) => event.stopPropagation()}
              onChange={(value) => onQuickCategory(tx, value || null)}
              className="h-7 px-1.5 text-xs"
            />
          )
        },
      }),
      columnHelper.display({
        id: 'tags',
        size: 130,
        header: () => t.transactions.columns.tags,
        cell: ({ row }) => {
          const item = row.original
          if (item.kind !== 'row') return null
          const txTags = item.row.tagIds
          if (txTags.length === 0) return null
          return (
            <div className="flex min-w-0 items-center gap-1 overflow-hidden">
              {txTags.slice(0, 2).map((tagId) => (
                <Badge key={tagId}>{tagById.get(tagId)?.name ?? '…'}</Badge>
              ))}
              {txTags.length > 2 ? (
                <span className="text-[11px] text-muted">+{txTags.length - 2}</span>
              ) : null}
            </div>
          )
        },
      }),
      columnHelper.display({
        id: 'status',
        size: 105,
        header: () => t.transactions.columns.status,
        cell: ({ row }) => {
          const item = row.original
          if (item.kind !== 'row') return null
          const tx = item.row
          return (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onQuickStatus(tx, NEXT_STATUS[tx.status])
              }}
              className="rounded px-1.5 py-0.5 text-left text-xs text-fg-2 hover:bg-surface-2 hover:text-fg"
            >
              {t.transactions.statuses[tx.status]}
            </button>
          )
        },
      }),
      columnHelper.display({
        id: 'favorite',
        size: 42,
        header: () => <span className="sr-only">{t.transactions.columns.favorite}</span>,
        cell: ({ row }) => {
          const item = row.original
          if (item.kind !== 'row') return null
          const tx = item.row
          return (
            <button
              type="button"
              aria-pressed={tx.favorite}
              aria-label={t.transactions.row.toggleFavorite(tx.label)}
              onClick={(event) => {
                event.stopPropagation()
                onToggleFavorite(tx)
              }}
              className={cx(
                'flex size-7 items-center justify-center rounded hover:bg-surface-2',
                tx.favorite ? 'text-gold' : 'text-muted',
              )}
            >
              <Star size={14} fill={tx.favorite ? 'currentColor' : 'none'} aria-hidden />
            </button>
          )
        },
      }),
      columnHelper.display({
        id: 'amount',
        size: 120,
        header: () => (
          <button
            type="button"
            onClick={() => toggleSort('amount')}
            className="ml-auto inline-flex items-center gap-1 font-medium hover:text-fg"
          >
            {t.transactions.columns.amount}
            {sort === 'amount-desc' ? (
              <ArrowDown size={12} aria-hidden />
            ) : sort === 'amount-asc' ? (
              <ArrowUp size={12} aria-hidden />
            ) : null}
          </button>
        ),
        cell: ({ row }) => {
          const item = row.original
          if (item.kind !== 'row') return null
          const tx = item.row
          const tone =
            tx.transferId !== null
              ? 'text-fg-2'
              : tx.amount > 0
                ? 'text-income'
                : tx.amount < 0
                  ? 'text-expense'
                  : 'text-fg'
          return (
            <span className={cx('block text-right text-sm font-semibold tabular-nums', tone)}>
              {fmt.money(tx.amount, { signed: true, currency: tx.currency })}
            </span>
          )
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dépendances stables suffisantes pour les colonnes
    [allSelected, selectedIds, sort, accountById, categoryById, tagById, categories, t, fmt],
  )

  const data = useMemo(() => [...items], [items])
  const table = useTable({
    features,
    columns,
    data,
    getRowId: (item) => (item.kind === 'group' ? `g:${item.key}` : item.row.id),
    state: { columnVisibility },
  })

  const tableRows = table.getRowModel().rows

  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 44,
    getItemKey: (index) => tableRows[index]?.id ?? index,
    overscan: 10,
    initialRect: { width: 920, height: 480 },
    observeElementRect: (instance, cb) => {
      const element = instance.scrollElement
      if (!element) return
      const measure = () => {
        const rect = element.getBoundingClientRect()
        cb({ width: rect.width || 920, height: rect.height || 480 })
      }
      measure()
      if (typeof ResizeObserver === 'undefined') return
      const observer = new ResizeObserver(measure)
      observer.observe(element)
      return () => observer.disconnect()
    },
  })

  const virtualItems = virtualizer.getVirtualItems()
  const lastVirtualIndex = virtualItems.at(-1)?.index ?? -1

  useEffect(() => {
    if (hasMore && !isFetchingNextPage && lastVirtualIndex >= tableRows.length - 25) {
      onLoadMore()
    }
  }, [hasMore, isFetchingNextPage, lastVirtualIndex, tableRows.length, onLoadMore])

  const onTableKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0) return
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)
      return
    const currentIndex = activeId ? rows.findIndex((r) => r.id === activeId) : -1
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      const next = rows[Math.min(rows.length - 1, currentIndex + 1)]
      if (next) onActivateRow(next.id)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      const prev = rows[Math.max(0, currentIndex <= 0 ? 0 : currentIndex - 1)]
      if (prev) onActivateRow(prev.id)
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <div
        ref={scrollRef}
        tabIndex={0}
        onKeyDown={onTableKeyDown}
        role="region"
        aria-label={t.transactions.title}
        className="max-h-[580px] min-h-[360px] overflow-auto focus-visible:outline-none"
      >
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 border-b border-border bg-surface-2 text-xs text-muted">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="flex items-center px-3 py-2">
                {group.headers.map((header) => {
                  const grow = header.column.id === 'label'
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      style={grow ? undefined : { width: header.getSize(), flexShrink: 0 }}
                      className={cx(
                        'flex items-center px-1.5 font-medium',
                        grow && 'min-w-[180px] flex-1',
                        header.column.id === 'amount' && 'justify-end',
                      )}
                    >
                      {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody
            style={{ height: virtualizer.getTotalSize(), position: 'relative', display: 'block' }}
          >
            {virtualItems.map((virtualItem) => {
              const row = tableRows[virtualItem.index]
              if (!row) return null
              const item = row.original
              if (item.kind === 'group') {
                return (
                  <tr
                    key={row.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                    className="flex items-center justify-between border-b border-border bg-surface-2/80 px-4 text-xs font-semibold text-fg-2"
                  >
                    <td>
                      {item.label} <span className="font-normal text-muted">({item.count})</span>
                    </td>
                    <td className="tabular-nums">{fmt.money(item.total, { signed: true })}</td>
                  </tr>
                )
              }

              const tx = item.row
              const isActive = tx.id === activeId
              return (
                <tr
                  key={row.id}
                  data-index={virtualItem.index}
                  onClick={() => onActivateRow(tx.id)}
                  aria-selected={isActive}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                  className={cx(
                    'flex cursor-pointer items-center border-b border-border px-3 transition-colors',
                    isActive
                      ? 'bg-pink/10'
                      : selectedIds.has(tx.id)
                        ? 'bg-surface-2'
                        : 'hover:bg-surface-2/60',
                  )}
                >
                  {row.getVisibleCells().map((cell) => {
                    const grow = cell.column.id === 'label'
                    return (
                      <td
                        key={cell.id}
                        style={grow ? undefined : { width: cell.column.getSize(), flexShrink: 0 }}
                        className={cx(
                          'flex items-center overflow-hidden px-1.5',
                          grow && 'min-w-[180px] flex-1',
                          cell.column.id === 'amount' && 'justify-end',
                        )}
                      >
                        <table.FlexRender cell={cell} />
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <footer className="flex items-center justify-between border-t border-border bg-surface-2 px-4 py-2 text-xs text-muted">
        <span className="tabular-nums">
          {t.transactions.row.loadedCount(rows.length, totalCount)}
        </span>
        {hasMore ? (
          <Button
            variant="ghost"
            onClick={onLoadMore}
            disabled={isFetchingNextPage}
            className="h-7 px-2.5 text-xs"
          >
            {isFetchingNextPage ? t.common.loading : t.transactions.row.loadMore}
          </Button>
        ) : null}
      </footer>
    </div>
  )
}
