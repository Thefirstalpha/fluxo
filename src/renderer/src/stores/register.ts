import { create } from 'zustand'
import type { TransactionFilter, TransactionSort } from '@shared/ledger/model'
import type { GroupingMode } from '../features/transactions/grouping'

export type RegisterColumn =
  'date' | 'account' | 'label' | 'payee' | 'category' | 'tags' | 'status' | 'favorite' | 'amount'

export const DEFAULT_VISIBLE_COLUMNS: readonly RegisterColumn[] = [
  'date',
  'account',
  'label',
  'payee',
  'category',
  'tags',
  'status',
  'favorite',
  'amount',
]

interface RegisterState {
  filter: TransactionFilter
  sort: TransactionSort
  grouping: GroupingMode
  visibleColumns: RegisterColumn[]
  selectedTransactionId: string | null
  quickEntryOpen: boolean
  commandPaletteOpen: boolean
  shortcutsOpen: boolean
  auditOpen: boolean
  toast: { message: string; tone: 'info' | 'error' } | null
  setFilter: (filter: TransactionFilter) => void
  patchFilter: (patch: Partial<TransactionFilter>) => void
  resetFilter: () => void
  openRegister: (filter: TransactionFilter, selectedId?: string | null) => void
  setSort: (sort: TransactionSort) => void
  setGrouping: (grouping: GroupingMode) => void
  toggleColumn: (column: RegisterColumn) => void
  setSelectedTransactionId: (id: string | null) => void
  setQuickEntryOpen: (open: boolean) => void
  setCommandPaletteOpen: (open: boolean) => void
  setShortcutsOpen: (open: boolean) => void
  setAuditOpen: (open: boolean) => void
  showToast: (message: string, tone?: 'info' | 'error') => void
  clearSession: () => void
}

export const useRegisterStore = create<RegisterState>((set) => ({
  filter: {},
  sort: 'date-desc',
  grouping: 'none',
  visibleColumns: [...DEFAULT_VISIBLE_COLUMNS],
  selectedTransactionId: null,
  quickEntryOpen: false,
  commandPaletteOpen: false,
  shortcutsOpen: false,
  auditOpen: false,
  toast: null,
  setFilter: (filter) => set({ filter }),
  patchFilter: (patch) => set((state) => ({ filter: { ...state.filter, ...patch } })),
  resetFilter: () => set({ filter: {} }),
  openRegister: (filter, selectedId = null) => set({ filter, selectedTransactionId: selectedId }),
  setSort: (sort) => set({ sort }),
  setGrouping: (grouping) => set({ grouping }),
  toggleColumn: (column) =>
    set((state) => {
      if (column === 'label' || column === 'amount') return state
      const exists = state.visibleColumns.includes(column)
      return {
        visibleColumns: exists
          ? state.visibleColumns.filter((c) => c !== column)
          : [...state.visibleColumns, column],
      }
    }),
  setSelectedTransactionId: (selectedTransactionId) => set({ selectedTransactionId }),
  setQuickEntryOpen: (quickEntryOpen) => set({ quickEntryOpen }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setAuditOpen: (auditOpen) => set({ auditOpen }),
  showToast: (message, tone = 'info') => set({ toast: { message, tone } }),
  clearSession: () =>
    set({
      filter: {},
      selectedTransactionId: null,
      quickEntryOpen: false,
      commandPaletteOpen: false,
      shortcutsOpen: false,
      auditOpen: false,
      toast: null,
    }),
}))
