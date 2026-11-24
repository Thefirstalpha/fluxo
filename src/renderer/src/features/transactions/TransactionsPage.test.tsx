import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AccountSummary, CategorySummary, TransactionRow } from '@shared/ledger/model'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { useRegisterStore } from '../../stores/register'
import { useSettingsStore } from '../../stores/settings'
import { installFakeApi } from '../../test/fake-api'
import { renderWithQuery } from '../../test/render'
import {
  buildRegisterItems,
  convertedFromRate,
  rateFromConverted,
  splitRemainder,
} from './grouping'
import TransactionsPage from './TransactionsPage'

const CASH_ACCOUNT: AccountSummary = {
  id: '0192f0c8-0000-7000-8000-000000000001',
  name: 'Espèces',
  type: 'cash',
  trackingMode: 'manual',
  institution: null,
  currency: 'EUR',
  openingBalance: 100_00,
  openingDate: null,
  ibanMasked: null,
  color: '#dca81c',
  icon: 'banknote',
  archived: false,
  sortOrder: 0,
  balance: 87_50,
  reconciledBalance: 0,
  transactionCount: 1,
  lastTransactionDate: '2026-11-20',
}

const FOOD_CAT: CategorySummary = {
  id: '0192f0c8-0000-7000-8000-000000000010',
  parentId: null,
  name: 'Alimentation',
  kind: 'expense',
  icon: 'shopping-cart',
  color: '#e5690c',
  sortOrder: 0,
  archived: false,
  transactionCount: 1,
  total: -12_50,
}

const ROW_1: TransactionRow = {
  id: '0192f0c8-0000-7000-8000-000000000002',
  accountId: CASH_ACCOUNT.id,
  bookingDate: '2026-11-20',
  valueDate: null,
  amount: -12_50,
  currency: 'EUR',
  convertedAmount: null,
  label: 'Boulangerie',
  labelRaw: 'Boulangerie',
  customLabel: null,
  payee: 'Artisan',
  status: 'cleared',
  nature: 'operation',
  note: null,
  favorite: false,
  imported: false,
  transferId: null,
  transferAccountId: null,
  categoryIds: [FOOD_CAT.id],
  tagIds: [],
  splitCount: 1,
}

beforeEach(() => {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, ready: true })
  useRegisterStore.getState().clearSession()
})

describe('grouping et conversions', () => {
  it('regroupe par jour ou par mois avec sous-totaux', () => {
    const row2: TransactionRow = { ...ROW_1, id: 'id-2', bookingDate: '2026-11-20', amount: -5_00 }
    const row3: TransactionRow = { ...ROW_1, id: 'id-3', bookingDate: '2026-10-02', amount: 30_00 }
    const byDay = buildRegisterItems(
      [ROW_1, row2, row3],
      'day',
      (d) => `Jour ${d}`,
      (m) => m,
    )
    expect(byDay[0]).toEqual({
      kind: 'group',
      key: '2026-11-20',
      label: 'Jour 2026-11-20',
      count: 2,
      total: -17_50,
    })
    const byMonth = buildRegisterItems(
      [ROW_1, row2, row3],
      'month',
      (d) => d,
      (m) => `Mois ${m}`,
    )
    expect(byMonth.filter((i) => i.kind === 'group')).toHaveLength(2)
  })

  it('calcule le reste de ventilation et la conversion par taux entier', () => {
    expect(splitRemainder(-10_00, [{ amount: -6_00 }, { amount: -3_00 }])).toBe(-1_00)
    expect(splitRemainder(-10_00, [{ amount: -6_00 }, { amount: -4_00 }])).toBe(0)
    expect(convertedFromRate(-100_00, '1,05')).toBe(-105_00)
    expect(convertedFromRate(-100_00, '-1')).toBeNull()
    expect(rateFromConverted(-100_00, -105_00)).toBe('1.05')
  })
})

describe('TransactionsPage', () => {
  it('affiche les opérations, le résumé et ouvre le panneau de détail au clic', async () => {
    const api = installFakeApi()
    api.ledger.accountsList.mockResolvedValue({ ok: true, value: [CASH_ACCOUNT] })
    api.ledger.categoriesList.mockResolvedValue({ ok: true, value: [FOOD_CAT] })
    api.ledger.transactionsSummary.mockResolvedValue({
      ok: true,
      value: { count: 1, total: -12_50, inflow: 0, outflow: -12_50, currencies: ['EUR'] },
    })
    api.ledger.transactionsList.mockResolvedValue({
      ok: true,
      value: { rows: [ROW_1], nextCursor: null },
    })
    api.ledger.transactionGet.mockResolvedValue({
      ok: true,
      value: {
        ...ROW_1,
        splits: [{ id: 's1', categoryId: FOOD_CAT.id, amount: -12_50, note: null, tagIds: [] }],
      },
    })

    renderWithQuery(<TransactionsPage />)
    expect(await screen.findByText('Boulangerie')).toBeVisible()
    expect(screen.getByText('Artisan')).toBeVisible()

    fireEvent.click(screen.getByText('Boulangerie'))
    expect(await screen.findByRole('heading', { name: 'Détail de l’opération' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Basculer favori pour Boulangerie' }))
    await waitFor(() =>
      expect(api.ledger.transactionUpdate).toHaveBeenCalledWith({
        id: ROW_1.id,
        patch: { favorite: true },
      }),
    )
  })
})
