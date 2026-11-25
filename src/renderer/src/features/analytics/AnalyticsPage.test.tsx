import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AnalyticsOverview } from '@shared/analytics/model'
import type { AccountSummary, CategorySummary } from '@shared/ledger/model'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { useAnalyticsStore } from '../../stores/analytics'
import { useSettingsStore } from '../../stores/settings'
import { installFakeApi } from '../../test/fake-api'
import { renderWithQuery } from '../../test/render'
import AnalyticsPage from './AnalyticsPage'

const ACCOUNT: AccountSummary = {
  id: '0192f0c8-0000-7000-8000-000000000001',
  name: 'Courant',
  type: 'checking',
  trackingMode: 'statement',
  institution: null,
  currency: 'EUR',
  openingBalance: 1000_00,
  openingDate: null,
  ibanMasked: null,
  color: '#dca81c',
  icon: 'landmark',
  archived: false,
  sortOrder: 0,
  balance: 2100_00,
  reconciledBalance: 0,
  transactionCount: 4,
  lastTransactionDate: '2026-11-18',
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
  linkedAccountId: null,
  transactionCount: 2,
  total: -320_00,
}

const OVERVIEW: AnalyticsOverview = {
  filterRange: { from: '2026-01-01', to: '2026-11-30', focusMonth: '2026-11' },
  hasTransactions: true,
  otherCurrencies: [],
  kpis: {
    income: 2800_00,
    expenses: 920_00,
    savings: 300_00,
    net: 1880_00,
    savingsRate: 1880 / 2800,
    transactionCount: 5,
  },
  monthlySeries: [
    {
      month: '2026-10',
      income: 2700_00,
      expenses: 600_00,
      savings: 250_00,
      net: 2100_00,
      ma3Expense: null,
      ma6Expense: null,
      ma12Expense: null,
    },
    {
      month: '2026-11',
      income: 2800_00,
      expenses: 920_00,
      savings: 300_00,
      net: 1880_00,
      ma3Expense: 760_00,
      ma6Expense: null,
      ma12Expense: null,
    },
  ],
  categoryEvolution: {
    months: ['2026-10', '2026-11'],
    series: [
      {
        categoryId: FOOD_CAT.id,
        name: 'Alimentation',
        color: '#e5690c',
        isOther: false,
        totalsByMonth: [200_00, 320_00],
        total: 520_00,
      },
    ],
  },
  categoryBreakdown: [
    {
      categoryId: FOOD_CAT.id,
      parentId: null,
      name: 'Alimentation',
      color: '#e5690c',
      amount: 320_00,
      share: 1,
      transactionCount: 2,
    },
  ],
  sankey: {
    nodes: [
      { name: 'budget', kind: 'budget' },
      { name: 'out:' + FOOD_CAT.id, kind: 'expense', categoryId: FOOD_CAT.id },
    ],
    links: [{ source: 'budget', target: 'out:' + FOOD_CAT.id, value: 320_00 }],
  },
  calendarHeatmap: {
    year: '2026',
    days: [{ date: '2026-11-12', outflow: 320_00, inflow: 0, txCount: 1 }],
    maxOutflow: 320_00,
  },
  amountHistogram: [{ key: 'xxl', min: 250_00, max: 500_00, count: 1, total: 320_00 }],
  monthlySynthesis: {
    month: '2026-11',
    availableMonths: ['2026-11', '2026-10'],
    income: 2800_00,
    expenses: 920_00,
    savings: 300_00,
    net: 1880_00,
    savingsRate: 1880 / 2800,
    transactionCount: 3,
    vsPrevMonth: {
      referenceMonth: '2026-10',
      incomeDiff: 100_00,
      expenseDiff: 320_00,
      expensePct: 53,
      savingsDiff: 50_00,
    },
    vsLastYear: null,
    topCategories: [
      {
        categoryId: FOOD_CAT.id,
        parentId: null,
        name: 'Alimentation',
        color: '#e5690c',
        amount: 320_00,
        share: 0.35,
        transactionCount: 2,
      },
    ],
    topMerchants: [{ name: 'Carrefour', total: 320_00, transactionCount: 2 }],
    largestExpenses: [
      {
        id: 'tx-1',
        bookingDate: '2026-11-12',
        label: 'Courses semaine',
        amount: 320_00,
        currency: 'EUR',
        accountName: 'Courant',
        categoryName: 'Alimentation',
      },
    ],
    recurringInMonth: [{ merchant: 'Fibre Optique', amount: 29_99, frequency: 'monthly' }],
    payslipSummary: { count: 1, totalIncome: 2800_00 },
    insights: [
      {
        kind: 'category-increase',
        categoryName: 'Alimentation',
        delta: 120_00,
        percent: 60,
      },
    ],
  },
  anomalies: [],
}

beforeEach(() => {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, ready: true })
  useAnalyticsStore.getState().clearSession()
})

describe('AnalyticsPage', () => {
  it('affiche la synthèse mensuelle, bascule vers les vues tableau des graphiques et masque les montants', async () => {
    const api = installFakeApi()
    api.ledger.accountsList.mockResolvedValue({ ok: true, value: [ACCOUNT] })
    api.ledger.categoriesList.mockResolvedValue({ ok: true, value: [FOOD_CAT] })
    api.ledger.tagsList.mockResolvedValue({ ok: true, value: [] })
    api.ledger.analyticsOverview.mockResolvedValue({ ok: true, value: OVERVIEW })
    api.ledger.analyticsAnomalies.mockResolvedValue({
      ok: true,
      value: [
        {
          id: 'anom-1',
          kind: 'duplicate-charge',
          date: '2026-11-15',
          title: 'Salle Sport',
          accountName: 'Courant',
          amount: 45_00,
          currency: 'EUR',
          count: 2,
          transactionIds: ['t1', 't2'],
        },
      ],
    })

    renderWithQuery(<AnalyticsPage />)

    expect(await screen.findByText(/Alimentation en hausse/)).toBeVisible()
    expect(screen.getByText('Carrefour')).toBeVisible()
    expect(screen.getByText('Salle Sport')).toBeVisible()

    // Bascule sur l'onglet Graphiques & exploration et passe le graphique d'évolution en vue tableau
    fireEvent.click(screen.getByRole('radio', { name: 'Graphiques & exploration' }))
    expect(await screen.findByText('Évolution des dépenses par catégorie')).toBeVisible()
    const tableRadios = screen.getAllByRole('radio', { name: 'Tableau' })
    fireEvent.click(tableRadios[0]!)
    expect(await screen.findByRole('table')).toBeVisible()

    // Vérifie le masquage des montants (bouton œil global)
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, hideAmounts: true },
      ready: true,
    })
    await waitFor(() => {
      expect(screen.getAllByText('••••••').length).toBeGreaterThan(0)
    })
  })
})
