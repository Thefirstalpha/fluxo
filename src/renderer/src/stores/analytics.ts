import { create } from 'zustand'
import type { AnalyticsFilter } from '@shared/analytics/model'
import type { MinorUnits } from '@shared/money'
import { addMonths, monthOf } from '@shared/months'

export type PeriodPreset = '3m' | '6m' | '12m' | 'ytd' | 'all' | 'custom'

export interface AnalyticsFilterState {
  preset: PeriodPreset
  from?: string
  to?: string
  accountIds: string[]
  categoryIds: string[]
  tagIds: string[]
  minAmount?: MinorUnits
  maxAmount?: MinorUnits
  includeTransfers: boolean
  focusMonth?: string
  setPreset: (preset: Exclude<PeriodPreset, 'custom'>, now?: Date) => void
  setCustomRange: (from: string | undefined, to: string | undefined) => void
  setAccountIds: (accountIds: string[]) => void
  setCategoryIds: (categoryIds: string[]) => void
  setTagIds: (tagIds: string[]) => void
  setAmountBounds: (minAmount: MinorUnits | undefined, maxAmount: MinorUnits | undefined) => void
  setIncludeTransfers: (include: boolean) => void
  setFocusMonth: (month: string | undefined) => void
  reset: (now?: Date) => void
  clearSession: () => void
}

function endDayIso(month: string): string {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  const day = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${month}-${String(day).padStart(2, '0')}`
}

export function rangeForPreset(
  preset: Exclude<PeriodPreset, 'custom'>,
  now: Date = new Date(),
): { from?: string; to?: string; focusMonth?: string } {
  const curMonth = monthOf(now)
  const to = endDayIso(curMonth)
  if (preset === 'all') return { from: undefined, to: undefined, focusMonth: undefined }
  if (preset === 'ytd') {
    return { from: `${curMonth.slice(0, 4)}-01-01`, to, focusMonth: curMonth }
  }
  const span = preset === '3m' ? 2 : preset === '6m' ? 5 : 11
  return { from: `${addMonths(curMonth, -span)}-01`, to, focusMonth: curMonth }
}

const DEFAULT_RANGE = rangeForPreset('12m')

export const useAnalyticsStore = create<AnalyticsFilterState>((set) => ({
  preset: '12m',
  from: DEFAULT_RANGE.from,
  to: DEFAULT_RANGE.to,
  accountIds: [],
  categoryIds: [],
  tagIds: [],
  minAmount: undefined,
  maxAmount: undefined,
  includeTransfers: false,
  focusMonth: DEFAULT_RANGE.focusMonth,
  setPreset: (preset, now = new Date()) => {
    const r = rangeForPreset(preset, now)
    set({ preset, from: r.from, to: r.to, focusMonth: r.focusMonth })
  },
  setCustomRange: (from, to) => set({ preset: 'custom', from, to }),
  setAccountIds: (accountIds) => set({ accountIds }),
  setCategoryIds: (categoryIds) => set({ categoryIds }),
  setTagIds: (tagIds) => set({ tagIds }),
  setAmountBounds: (minAmount, maxAmount) => set({ minAmount, maxAmount }),
  setIncludeTransfers: (includeTransfers) => set({ includeTransfers }),
  setFocusMonth: (focusMonth) => set({ focusMonth }),
  reset: (now = new Date()) => {
    const r = rangeForPreset('12m', now)
    set({
      preset: '12m',
      from: r.from,
      to: r.to,
      accountIds: [],
      categoryIds: [],
      tagIds: [],
      minAmount: undefined,
      maxAmount: undefined,
      includeTransfers: false,
      focusMonth: r.focusMonth,
    })
  },
  clearSession: () => {
    const r = rangeForPreset('12m')
    set({
      preset: '12m',
      from: r.from,
      to: r.to,
      accountIds: [],
      categoryIds: [],
      tagIds: [],
      minAmount: undefined,
      maxAmount: undefined,
      includeTransfers: false,
      focusMonth: r.focusMonth,
    })
  },
}))

export function buildAnalyticsQueryFilter(
  state: AnalyticsFilterState,
  currency: string,
): AnalyticsFilter {
  return {
    ...(state.from ? { from: state.from } : {}),
    ...(state.to ? { to: state.to } : {}),
    ...(state.accountIds.length > 0 ? { accountIds: state.accountIds } : {}),
    ...(state.categoryIds.length > 0 ? { categoryIds: state.categoryIds } : {}),
    ...(state.tagIds.length > 0 ? { tagIds: state.tagIds } : {}),
    ...(state.minAmount !== undefined ? { minAmount: state.minAmount } : {}),
    ...(state.maxAmount !== undefined ? { maxAmount: state.maxAmount } : {}),
    includeTransfers: state.includeTransfers,
    currency,
    ...(state.focusMonth ? { focusMonth: state.focusMonth } : {}),
  }
}
