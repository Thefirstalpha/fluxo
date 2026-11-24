import { Download, FileSpreadsheet, FileText, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import type { AccountSummary, CategorySummary, TagSummary } from '@shared/ledger/model'
import { parseAmount } from '@shared/money'
import { CategorySelect } from '../../components/CategorySelect'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { INPUT_CLASS } from '../../components/ui/Field'
import { useT } from '../../i18n'
import { cx } from '../../lib/cx'
import {
  buildAnalyticsQueryFilter,
  useAnalyticsStore,
  type PeriodPreset,
} from '../../stores/analytics'
import { useSettingsStore } from '../../stores/settings'

const PRESETS: readonly Exclude<PeriodPreset, 'custom'>[] = ['3m', '6m', '12m', 'ytd', 'all']

/** Barre de filtres globaux partagée entre les onglets d'analyse, avec exports CSV/PDF. */
export function AnalyticsFilterBar({
  accounts,
  categories,
  tags,
  onNotice,
  onError,
  onOpenRegister,
}: {
  accounts: readonly AccountSummary[]
  categories: readonly CategorySummary[]
  tags: readonly TagSummary[]
  onNotice: (message: string) => void
  onError: (message: string | null) => void
  onOpenRegister: () => void
}) {
  const t = useT()
  const f = t.analytics.filters
  const ex = t.analytics.exports
  const currency = useSettingsStore((state) => state.settings.currency)

  const state = useAnalyticsStore()
  const [minText, setMinText] = useState('')
  const [maxText, setMaxText] = useState('')
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null)

  const activeAccounts = accounts.filter((a) => !a.archived)
  const selectedCategoryName =
    state.categoryIds.length === 1
      ? (categories.find((c) => c.id === state.categoryIds[0])?.name ?? null)
      : null

  const applyAmountBounds = (nextMinText: string, nextMaxText: string) => {
    const min = nextMinText.trim() ? parseAmount(nextMinText) : null
    const max = nextMaxText.trim() ? parseAmount(nextMaxText) : null
    state.setAmountBounds(
      min !== null ? Math.abs(min) : undefined,
      max !== null ? Math.abs(max) : undefined,
    )
  }

  const handleExport = async (kind: 'csv' | 'pdf') => {
    onError(null)
    setExporting(kind)
    const filter = buildAnalyticsQueryFilter(state, currency)
    try {
      const outcome =
        kind === 'csv'
          ? await window.fluxo.analytics.exportCsv(filter)
          : await window.fluxo.analytics.exportMonthlyPdf(filter)
      if (outcome.canceled) return
      if (!outcome.ok) {
        onError(ex.failed)
        return
      }
      if (kind === 'csv') {
        onNotice(ex.csvSuccess(outcome.fileName ?? '', outcome.rowCount ?? 0))
      } else {
        onNotice(ex.pdfSuccess(outcome.fileName ?? ''))
      }
    } finally {
      setExporting(null)
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label={f.presetsAria}
          className="flex flex-wrap items-center gap-1.5"
        >
          {PRESETS.map((preset) => (
            <Button
              key={preset}
              variant={state.preset === preset ? 'primary' : 'secondary'}
              className="h-8 px-2.5 text-xs"
              onClick={() => state.setPreset(preset)}
            >
              {f.presets[preset]}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="h-8 px-2.5 text-xs"
            onClick={() => {
              setMinText('')
              setMaxText('')
              state.reset()
            }}
          >
            <RotateCcw size={13} aria-hidden />
            {f.reset}
          </Button>
          <Button
            className="h-8 px-2.5 text-xs"
            disabled={exporting !== null}
            onClick={() => void handleExport('csv')}
          >
            <FileSpreadsheet size={13} aria-hidden />
            {ex.csv}
          </Button>
          <Button
            variant="primary"
            className="h-8 px-3 text-xs"
            disabled={exporting !== null}
            onClick={() => void handleExport('pdf')}
          >
            <FileText size={13} aria-hidden />
            {ex.pdf}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <label className="text-xs text-fg-2">
          <span className="mb-1 block">{f.from}</span>
          <input
            type="date"
            value={state.from ?? ''}
            onChange={(event) => state.setCustomRange(event.target.value || undefined, state.to)}
            className={cx(INPUT_CLASS, 'h-8 border-border-strong text-xs')}
          />
        </label>

        <label className="text-xs text-fg-2">
          <span className="mb-1 block">{f.to}</span>
          <input
            type="date"
            value={state.to ?? ''}
            onChange={(event) => state.setCustomRange(state.from, event.target.value || undefined)}
            className={cx(INPUT_CLASS, 'h-8 border-border-strong text-xs')}
          />
        </label>

        <label className="text-xs text-fg-2">
          <span className="mb-1 block">{f.accounts}</span>
          <select
            aria-label={f.accounts}
            value={state.accountIds[0] ?? ''}
            onChange={(event) =>
              state.setAccountIds(event.target.value ? [event.target.value] : [])
            }
            className={cx(INPUT_CLASS, 'h-8 border-border-strong text-xs')}
          >
            <option value="">{f.allAccounts}</option>
            {activeAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-fg-2">
          <span className="mb-1 block">{f.categories}</span>
          <CategorySelect
            aria-label={f.categories}
            categories={categories}
            value={state.categoryIds[0] ?? ''}
            onChange={(val) => state.setCategoryIds(val ? [val] : [])}
            emptyLabel={f.allCategories}
            className="h-8 text-xs"
          />
        </label>

        {tags.length > 0 ? (
          <label className="text-xs text-fg-2">
            <span className="mb-1 block">{f.tags}</span>
            <select
              aria-label={f.tags}
              value={state.tagIds[0] ?? ''}
              onChange={(event) => state.setTagIds(event.target.value ? [event.target.value] : [])}
              className={cx(INPUT_CLASS, 'h-8 border-border-strong text-xs')}
            >
              <option value="">{f.allTags}</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            <label className="text-xs text-fg-2">
              <span className="mb-1 block">{f.minAmount}</span>
              <input
                type="text"
                value={minText}
                onChange={(event) => {
                  setMinText(event.target.value)
                  applyAmountBounds(event.target.value, maxText)
                }}
                className={cx(INPUT_CLASS, 'h-8 border-border-strong text-xs tabular-nums')}
              />
            </label>
            <label className="text-xs text-fg-2">
              <span className="mb-1 block">{f.maxAmount}</span>
              <input
                type="text"
                value={maxText}
                onChange={(event) => {
                  setMaxText(event.target.value)
                  applyAmountBounds(minText, event.target.value)
                }}
                className={cx(INPUT_CLASS, 'h-8 border-border-strong text-xs tabular-nums')}
              />
            </label>
          </div>
        )}

        <div className="flex items-end pb-1">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-fg-2">
            <input
              type="checkbox"
              checked={state.includeTransfers}
              onChange={(event) => state.setIncludeTransfers(event.target.checked)}
              className="accent-pink"
            />
            {f.includeTransfers}
          </label>
        </div>
      </div>

      {selectedCategoryName ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2 text-xs">
          <Badge tone="accent">{f.filteringByCategory(selectedCategoryName)}</Badge>
          <Button className="h-7 px-2 text-xs" onClick={() => state.setCategoryIds([])}>
            <X size={12} aria-hidden />
            {f.clearCategory}
          </Button>
          <Button className="h-7 px-2 text-xs" onClick={onOpenRegister}>
            <Download size={12} aria-hidden />
            {f.openInTransactions}
          </Button>
        </div>
      ) : null}
    </Card>
  )
}
