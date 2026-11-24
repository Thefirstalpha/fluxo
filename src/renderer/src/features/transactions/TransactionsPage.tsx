import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { History, Plus, Redo2, Trash2, Undo2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import {
  TRANSACTION_STATUSES,
  type TransactionRow,
  type TransactionStatus,
} from '@shared/ledger/model'
import { CategorySelect } from '../../components/CategorySelect'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { INPUT_CLASS } from '../../components/ui/Field'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatTile } from '../../components/ui/StatTile'
import { useT } from '../../i18n'
import { cx } from '../../lib/cx'
import { capitalize, useFormatters } from '../../lib/format'
import { callLedger, ledgerErrorCode, useLedgerMutation, useLedgerQuery } from '../../lib/ledger'
import { useRegisterStore } from '../../stores/register'
import { useSettingsStore } from '../../stores/settings'
import { buildRegisterItems } from './grouping'
import { TransactionDetailPanel } from './TransactionDetailPanel'
import { TransactionFilters } from './TransactionFilters'
import { TransactionTable } from './TransactionTable'

const PAGE_SIZE = 200

/** Registre complet des opérations (M2) : tableau virtualisé, filtres, saisie et panneau de détail. */
export default function TransactionsPage() {
  const t = useT()
  const fmt = useFormatters()
  const refCurrency = useSettingsStore((state) => state.settings.currency)
  const client = useQueryClient()
  const searchInputRef = useRef<HTMLInputElement>(null)

  const filter = useRegisterStore((state) => state.filter)
  const sort = useRegisterStore((state) => state.sort)
  const grouping = useRegisterStore((state) => state.grouping)
  const visibleColumns = useRegisterStore((state) => state.visibleColumns)
  const selectedId = useRegisterStore((state) => state.selectedTransactionId)
  const setFilter = useRegisterStore((state) => state.setFilter)
  const resetFilter = useRegisterStore((state) => state.resetFilter)
  const setSort = useRegisterStore((state) => state.setSort)
  const setGrouping = useRegisterStore((state) => state.setGrouping)
  const toggleColumn = useRegisterStore((state) => state.toggleColumn)
  const setSelectedId = useRegisterStore((state) => state.setSelectedTransactionId)
  const setQuickEntryOpen = useRegisterStore((state) => state.setQuickEntryOpen)
  const setAuditOpen = useRegisterStore((state) => state.setAuditOpen)

  const accounts = useLedgerQuery('accountsList', { includeArchived: true })
  const categories = useLedgerQuery('categoriesList', { includeArchived: true })
  const tags = useLedgerQuery('tagsList', {})
  const summary = useLedgerQuery('transactionsSummary', { filter })
  const history = useLedgerQuery('ledgerHistoryStatus', {})

  const listQuery = useInfiniteQuery({
    queryKey: ['ledger', 'transactionsList', { filter, sort }] as const,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      callLedger('transactionsList', {
        filter,
        sort,
        cursor: pageParam,
        limit: PAGE_SIZE,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })

  const updateTx = useLedgerMutation('transactionUpdate')
  const categorizeBulk = useLedgerMutation('transactionsCategorize')
  const tagBulk = useLedgerMutation('transactionsTag')
  const statusBulk = useLedgerMutation('transactionsSetStatus')
  const deleteBulk = useLedgerMutation('transactionsDelete')

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [lastClickedId, setLastClickedId] = useState<string | null>(null)
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rows = useMemo(
    () => listQuery.data?.pages.flatMap((page) => page.rows) ?? [],
    [listQuery.data],
  )
  const items = useMemo(
    () =>
      buildRegisterItems(
        rows,
        grouping,
        (date) => capitalize(fmt.date(date)),
        (month) => capitalize(fmt.month(month)),
      ),
    [rows, grouping, fmt],
  )

  const runAction = async (fn: () => Promise<unknown>, message?: string) => {
    setError(null)
    try {
      await fn()
      if (message) setNotice(message)
    } catch (failure) {
      setError(t.ledger.errors[ledgerErrorCode(failure)])
    }
  }

  const handleUndoRedo = async (direction: 'undo' | 'redo') => {
    await runAction(
      async () => {
        await callLedger(direction === 'undo' ? 'ledgerUndo' : 'ledgerRedo', {})
        await client.invalidateQueries({ queryKey: ['ledger'] })
      },
      direction === 'undo' ? t.transactions.undone : t.transactions.redone,
    )
  }

  const toggleSelect = (id: string, shiftKey: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (shiftKey && lastClickedId) {
        const start = rows.findIndex((r) => r.id === lastClickedId)
        const end = rows.findIndex((r) => r.id === id)
        if (start >= 0 && end >= 0) {
          const [lo, hi] = start <= end ? [start, end] : [end, start]
          for (let i = lo; i <= hi; i += 1) {
            const target = rows[i]
            if (target) next.add(target.id)
          }
          return next
        }
      }
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setLastClickedId(id)
  }

  const toggleAll = () => {
    const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
    setSelectedIds(allSelected ? new Set() : new Set(rows.map((r) => r.id)))
  }

  const bulkIds = [...selectedIds]
  const accountById = useMemo(
    () => new Map((accounts.data ?? []).map((a) => [a.id, a])),
    [accounts.data],
  )
  const canBulkDelete =
    bulkIds.length > 0 &&
    bulkIds.every((id) => {
      const row = rows.find((r) => r.id === id)
      return row && !row.imported && accountById.get(row.accountId)?.trackingMode === 'manual'
    })

  const sum = summary.data
  const singleCurrency = sum && sum.currencies.length === 1 ? sum.currencies[0] : refCurrency
  const mixedCurrencies = sum && sum.currencies.length > 1

  return (
    <>
      <PageHeader
        title={t.transactions.title}
        subtitle={t.transactions.subtitle(sum?.count ?? rows.length)}
        actions={
          <>
            <Button
              variant="ghost"
              disabled={!history.data?.canUndo}
              onClick={() => void handleUndoRedo('undo')}
              title={t.transactions.undo}
            >
              <Undo2 size={15} aria-hidden />
              {t.transactions.undo}
            </Button>
            <Button
              variant="ghost"
              disabled={!history.data?.canRedo}
              onClick={() => void handleUndoRedo('redo')}
              title={t.transactions.redo}
            >
              <Redo2 size={15} aria-hidden />
              {t.transactions.redo}
            </Button>
            <Button variant="ghost" onClick={() => setAuditOpen(true)}>
              <History size={15} aria-hidden />
              {t.transactions.auditLog}
            </Button>
            <Button variant="primary" onClick={() => setQuickEntryOpen(true)}>
              <Plus size={15} aria-hidden />
              {t.transactions.add}
            </Button>
          </>
        }
      />

      {sum ? (
        <section
          aria-label={t.transactions.summary.net}
          className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <StatTile label={t.transactions.summary.count} value={fmt.count(sum.count)} />
          <StatTile
            label={t.transactions.summary.inflow}
            value={
              mixedCurrencies
                ? '—'
                : fmt.money(sum.inflow, { signed: true, currency: singleCurrency })
            }
          />
          <StatTile
            label={t.transactions.summary.outflow}
            value={
              mixedCurrencies
                ? '—'
                : fmt.money(sum.outflow, { signed: true, currency: singleCurrency })
            }
          />
          <StatTile
            label={t.transactions.summary.net}
            value={
              mixedCurrencies
                ? t.transactions.summary.mixedCurrencies(sum.currencies.join(', '))
                : fmt.money(sum.total, { signed: true, currency: singleCurrency })
            }
          />
        </section>
      ) : null}

      <TransactionFilters
        filter={filter}
        sort={sort}
        grouping={grouping}
        visibleColumns={visibleColumns}
        accounts={accounts.data ?? []}
        categories={categories.data ?? []}
        tags={tags.data ?? []}
        searchInputRef={searchInputRef}
        onFilterChange={(next) => {
          setSelectedIds(new Set())
          setFilter(next)
        }}
        onReset={() => {
          setSelectedIds(new Set())
          resetFilter()
        }}
        onSortChange={setSort}
        onGroupingChange={setGrouping}
        onToggleColumn={toggleColumn}
      />

      <div aria-live="polite" className="empty:hidden mb-3 text-sm text-fg-2">
        {notice}
      </div>
      {error ? (
        <p role="alert" className="mb-3 text-sm font-medium text-expense">
          {error}
        </p>
      ) : null}

      {bulkIds.length > 0 ? (
        <div
          role="region"
          aria-label={t.transactions.bulk.selected(bulkIds.length)}
          className="fx-frame mb-3 flex flex-wrap items-center gap-2 rounded-xl px-4 py-2.5"
        >
          <span className="text-xs font-semibold text-fg">
            {t.transactions.bulk.selected(bulkIds.length)}
          </span>
          <CategorySelect
            aria-label={t.transactions.bulk.categorize}
            categories={categories.data ?? []}
            value=""
            onChange={(value) => {
              if (!value) return
              void runAction(async () => {
                const res = await categorizeBulk.mutateAsync({
                  ids: bulkIds,
                  categoryId: value === '__clear__' ? null : value,
                })
                setNotice(t.transactions.bulk.categorizedResult(res.updated, res.skipped))
              })
            }}
            emptyLabel={t.transactions.bulk.categorize}
            extraOptions={[{ value: '__clear__', label: t.transactions.filters.uncategorized }]}
            className="h-8 w-auto text-xs"
          />

          {(tags.data ?? []).length > 0 ? (
            <>
              <select
                aria-label={t.transactions.bulk.addTag}
                value=""
                onChange={(event) => {
                  const tagId = event.target.value
                  if (!tagId) return
                  void runAction(() =>
                    tagBulk.mutateAsync({ ids: bulkIds, add: [tagId], remove: [] }),
                  )
                }}
                className={cx(INPUT_CLASS, 'h-8 w-auto border-border-strong text-xs')}
              >
                <option value="">{t.transactions.bulk.addTag}</option>
                {(tags.data ?? []).map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
              <select
                aria-label={t.transactions.bulk.removeTag}
                value=""
                onChange={(event) => {
                  const tagId = event.target.value
                  if (!tagId) return
                  void runAction(() =>
                    tagBulk.mutateAsync({ ids: bulkIds, add: [], remove: [tagId] }),
                  )
                }}
                className={cx(INPUT_CLASS, 'h-8 w-auto border-border-strong text-xs')}
              >
                <option value="">{t.transactions.bulk.removeTag}</option>
                {(tags.data ?? []).map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </>
          ) : null}

          <select
            aria-label={t.transactions.bulk.setStatus}
            value=""
            onChange={(event) => {
              const status = event.target.value as TransactionStatus
              if (!status) return
              void runAction(() => statusBulk.mutateAsync({ ids: bulkIds, status }))
            }}
            className={cx(INPUT_CLASS, 'h-8 w-auto border-border-strong text-xs')}
          >
            <option value="">{t.transactions.bulk.setStatus}</option>
            {TRANSACTION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t.transactions.statuses[status]}
              </option>
            ))}
          </select>

          {canBulkDelete ? (
            <Button
              onClick={() => setBulkDeleteConfirm(true)}
              className="h-8 px-2.5 text-xs text-expense"
            >
              <Trash2 size={13} aria-hidden />
              {t.transactions.bulk.deleteSelected}
            </Button>
          ) : null}

          <Button
            variant="ghost"
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto h-8 px-2.5 text-xs"
          >
            {t.transactions.bulk.clearSelection}
          </Button>
        </div>
      ) : null}

      {listQuery.isPending ? (
        <p role="status" className="text-sm text-muted">
          {t.common.loading}
        </p>
      ) : rows.length === 0 ? (
        <Card accent>
          <div className="py-6 text-center">
            <h2 className="text-base font-semibold text-fg">{t.transactions.emptyTitle}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-fg-2">
              {t.transactions.emptyDescription}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="primary" onClick={() => setQuickEntryOpen(true)}>
                <Plus size={15} aria-hidden />
                {t.transactions.add}
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <TransactionTable
            items={items}
            rows={rows}
            totalCount={sum?.count ?? rows.length}
            accounts={accounts.data ?? []}
            categories={categories.data ?? []}
            tags={tags.data ?? []}
            visibleColumns={visibleColumns}
            sort={sort}
            selectedIds={selectedIds}
            activeId={selectedId}
            hasMore={Boolean(listQuery.hasNextPage)}
            isFetchingNextPage={listQuery.isFetchingNextPage}
            onLoadMore={() => void listQuery.fetchNextPage()}
            onActivateRow={(id) => setSelectedId(id)}
            onToggleSelect={toggleSelect}
            onToggleAll={toggleAll}
            onToggleFavorite={(row: TransactionRow) =>
              void runAction(() =>
                updateTx.mutateAsync({ id: row.id, patch: { favorite: !row.favorite } }),
              )
            }
            onQuickCategory={(row: TransactionRow, categoryId: string | null) =>
              void runAction(() => categorizeBulk.mutateAsync({ ids: [row.id], categoryId }))
            }
            onQuickStatus={(row: TransactionRow, status: TransactionStatus) =>
              void runAction(() => statusBulk.mutateAsync({ ids: [row.id], status }))
            }
            onSortChange={setSort}
          />

          {selectedId ? (
            <TransactionDetailPanel
              transactionId={selectedId}
              accounts={accounts.data ?? []}
              categories={categories.data ?? []}
              tags={tags.data ?? []}
              onClose={() => setSelectedId(null)}
              onDeleted={() => {
                setSelectedId(null)
                setNotice(t.transactions.detail.saved)
              }}
              onNotice={setNotice}
            />
          ) : null}
        </div>
      )}

      {bulkDeleteConfirm ? (
        <ConfirmDialog
          title={t.transactions.bulk.confirmDeleteTitle}
          message={t.transactions.bulk.confirmDelete(bulkIds.length)}
          confirmLabel={t.transactions.bulk.deleteSelected}
          onClose={() => setBulkDeleteConfirm(false)}
          onConfirm={() =>
            void runAction(async () => {
              await deleteBulk.mutateAsync({ ids: bulkIds })
              setSelectedIds(new Set())
              if (selectedId && selectedIds.has(selectedId)) setSelectedId(null)
            })
          }
        />
      ) : null}
    </>
  )
}
