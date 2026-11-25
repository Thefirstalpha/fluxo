import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type {
  CategorizationQueueItem,
  RuleSummary,
  SubscriptionsOverview,
  TransferMatchCandidate,
} from '@shared/categorization/model'
import type { AccountSummary, CategorySummary, TagSummary } from '@shared/ledger/model'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { useSettingsStore } from '../../stores/settings'
import { installFakeApi } from '../../test/fake-api'
import { renderWithQuery } from '../../test/render'
import CategorizationPage from './CategorizationPage'

const ACCOUNT: AccountSummary = {
  id: '0192f0c8-0000-7000-8000-000000000001',
  name: 'Compte Courant',
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
  balance: 950_00,
  reconciledBalance: 0,
  transactionCount: 2,
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
  linkedAccountId: null,
  transactionCount: 1,
  total: -20_00,
}

const LEISURE_CAT: CategorySummary = {
  id: '0192f0c8-0000-7000-8000-000000000011',
  parentId: FOOD_CAT.id,
  name: 'Restaurants',
  kind: 'expense',
  icon: 'utensils',
  color: '#dd2a80',
  sortOrder: 1,
  archived: false,
  linkedAccountId: null,
  transactionCount: 0,
  total: 0,
}

const TAG_PRO: TagSummary = {
  id: '0192f0c8-0000-7000-8000-000000000020',
  name: 'Pro',
  color: null,
  total: 0,
  transactionCount: 0,
}

const QUEUE_ITEM: CategorizationQueueItem = {
  transactionId: '0192f0c8-0000-7000-8000-000000000030',
  accountId: ACCOUNT.id,
  accountName: ACCOUNT.name,
  bookingDate: '2026-11-18',
  amount: -38_00,
  currency: 'EUR',
  labelRaw: 'CB ATELIER CERAMIQUE 18/11 LYON',
  labelDisplay: 'CB ATELIER CERAMIQUE 18/11 LYON',
  cleanedLabel: 'Atelier Ceramique',
  payee: null,
  currentCategoryId: null,
  currentTagIds: [],
  suggestion: {
    categoryId: LEISURE_CAT.id,
    categoryName: LEISURE_CAT.name,
    tagIds: [],
    suggestedLabel: 'Atelier Ceramique',
    suggestedPayee: null,
    source: 'naive-bayes',
    ruleId: null,
    confidence: 0.72,
    reason: 'Apprentissage local : 72 % (atelier)',
  },
}

const RULE_ONE: RuleSummary = {
  id: '0192f0c8-0000-7000-8000-000000000040',
  name: 'Télécom Fibre',
  conditions: {
    labelOp: 'contains',
    labelValue: 'FIBRE',
    direction: 'expense',
    amountOp: 'any',
  },
  actions: {
    categoryId: FOOD_CAT.id,
    tagIds: [TAG_PRO.id],
    customLabel: 'Fibre bureau',
  },
  priority: 0,
  active: true,
  appliedCount: 3,
  lastAppliedAt: null,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
}

const SUBSCRIPTIONS: SubscriptionsOverview = {
  subscriptions: [
    {
      signature: 'sub:orange:monthly',
      merchant: 'Téléphone mobile',
      accountId: ACCOUNT.id,
      accountName: ACCOUNT.name,
      currency: 'EUR',
      frequency: 'monthly',
      expectedAmount: 19_99,
      latestAmount: 24_99,
      monthlyEquivalent: 24_99,
      annualEquivalent: 299_88,
      occurrenceCount: 4,
      lastDate: '2026-11-05',
      nextExpectedDate: '2026-12-05',
      dormant: false,
      priceIncrease: {
        previousAmount: 19_99,
        currentAmount: 24_99,
        delta: 5_00,
        percent: 25,
      },
      categoryId: FOOD_CAT.id,
      categoryName: FOOD_CAT.name,
    },
  ],
  totalMonthlyCost: 24_99,
  totalAnnualCost: 299_88,
  priceIncreaseCount: 1,
  dormantCount: 0,
  currency: 'EUR',
}

const TRANSFER_PAIR: TransferMatchCandidate = {
  id: 'pair-1',
  fromTransaction: {
    id: '0192f0c8-0000-7000-8000-000000000051',
    accountId: ACCOUNT.id,
    accountName: 'Compte Courant',
    bookingDate: '2026-11-10',
    amount: -200_00,
    currency: 'EUR',
    label: 'VIR LIVRET A',
  },
  toTransaction: {
    id: '0192f0c8-0000-7000-8000-000000000052',
    accountId: '0192f0c8-0000-7000-8000-000000000002',
    accountName: 'Livret A',
    bookingDate: '2026-11-11',
    amount: 200_00,
    currency: 'EUR',
    label: 'VIR RECU',
  },
  dayDiff: 1,
  isSavingsTransfer: true,
}

beforeEach(() => {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, ready: true })
})

describe('CategorizationPage', () => {
  it('valide une suggestion par raccourci clavier, affiche règles, hausses et virements', async () => {
    const calls: string[] = []
    let queue = [QUEUE_ITEM]

    const api = installFakeApi()
    api.ledger.accountsList.mockResolvedValue({ ok: true, value: [ACCOUNT] })
    api.ledger.categoriesList.mockResolvedValue({ ok: true, value: [FOOD_CAT, LEISURE_CAT] })
    api.ledger.tagsList.mockResolvedValue({ ok: true, value: [TAG_PRO] })
    api.ledger.categorizationQueueList.mockImplementation(() =>
      Promise.resolve({ ok: true, value: queue }),
    )
    api.ledger.classifierStatus.mockResolvedValue({
      ok: true,
      value: {
        sampleCount: 15,
        categoryCount: 4,
        updatedAt: '2026-11-20T10:00:00.000Z',
        threshold: 0.85,
      },
    })
    api.ledger.categorizationAccept.mockImplementation((input) => {
      calls.push(`accept:${input.transactionId}:${input.categoryId}`)
      queue = []
      return Promise.resolve({ ok: true, value: null })
    })
    api.ledger.rulesList.mockResolvedValue({ ok: true, value: [RULE_ONE] })
    api.ledger.subscriptionsOverview.mockResolvedValue({ ok: true, value: SUBSCRIPTIONS })
    api.ledger.transferCandidatesList.mockResolvedValue({ ok: true, value: [TRANSFER_PAIR] })
    api.ledger.subscriptionDismissAlert.mockImplementation((input) => {
      calls.push(`dismiss:${input.signature}`)
      return Promise.resolve({ ok: true, value: null })
    })

    renderWithQuery(<CategorizationPage />)

    expect(await screen.findByText('Atelier Ceramique')).toBeVisible()
    expect(screen.getByText(/Apprentissage local : 72 %/)).toBeVisible()

    // Valide l'élément actif via Entrée
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() =>
      expect(calls).toContain(`accept:${QUEUE_ITEM.transactionId}:${LEISURE_CAT.id}`),
    )

    // Onglet Règles
    fireEvent.click(screen.getByRole('radio', { name: /Règles \(1\)/ }))
    expect(await screen.findByText('Télécom Fibre')).toBeVisible()

    // Onglet Abonnements & virements
    fireEvent.click(screen.getByRole('radio', { name: /Abonnements & virements \(2\)/ }))
    expect(await screen.findByText('Téléphone mobile')).toBeVisible()
    expect(screen.getByText(/Hausse de prix/)).toBeVisible()
    expect(screen.getByText(/Compte Courant → Livret A/)).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Masquer l’alerte' }))
    await waitFor(() => expect(calls).toContain('dismiss:sub:orange:monthly'))
  })

  it('propose de passer un livret sans opération en suivi manuel lors de sa sélection dans la file', async () => {
    const livretEmpty: AccountSummary = {
      ...ACCOUNT,
      id: '0192f0c8-0000-7000-8000-000000000009',
      name: 'Livret A',
      type: 'savings',
      trackingMode: 'statement',
      transactionCount: 0,
      balance: 1000_00,
    }
    const savingsParent: CategorySummary = {
      id: '0192f0c8-0000-7000-8000-000000000018',
      parentId: null,
      name: 'Épargne',
      kind: 'savings',
      icon: 'piggy-bank',
      color: '#0e9b8f',
      sortOrder: 1,
      archived: false,
      linkedAccountId: null,
      transactionCount: 0,
      total: 0,
    }
    const livretLinked: CategorySummary = {
      id: '0192f0c8-0000-7000-8000-000000000019',
      parentId: savingsParent.id,
      name: 'Transfert ↔ Livret A',
      kind: 'savings',
      icon: null,
      color: null,
      sortOrder: 0,
      archived: false,
      linkedAccountId: livretEmpty.id,
      transactionCount: 0,
      total: 0,
    }

    const api = installFakeApi()
    api.ledger.accountsList.mockResolvedValue({ ok: true, value: [ACCOUNT, livretEmpty] })
    api.ledger.categoriesList.mockResolvedValue({
      ok: true,
      value: [FOOD_CAT, savingsParent, livretLinked],
    })
    api.ledger.categorizationQueueList.mockResolvedValue({
      ok: true,
      value: [
        {
          ...QUEUE_ITEM,
          amount: 500_00,
          labelRaw: 'VIR DE LIVRET A',
          labelDisplay: 'VIR DE LIVRET A',
          cleanedLabel: 'Vir De Livret A',
          suggestion: null,
        },
      ],
    })
    api.ledger.classifierStatus.mockResolvedValue({
      ok: true,
      value: { sampleCount: 0, categoryCount: 0, updatedAt: null, threshold: 0.85 },
    })

    renderWithQuery(<CategorizationPage />)
    const select = await screen.findByLabelText('Choisir une catégorie…')
    fireEvent.change(select, { target: { value: livretLinked.id } })

    const switchBtn = await screen.findByRole('button', {
      name: 'Passer « Livret A » en suivi manuel',
    })
    fireEvent.click(switchBtn)

    await waitFor(() =>
      expect(api.ledger.accountUpdate).toHaveBeenCalledWith({
        id: livretEmpty.id,
        patch: { trackingMode: 'manual' },
      }),
    )
  })

  it('déclenche la réinitialisation confirmée depuis l’onglet À valider', async () => {
    const api = installFakeApi()
    api.ledger.categorizationReset.mockResolvedValue({
      ok: true,
      value: { clearedTransactions: 5, clearedSuggestions: 7, clearedModelSamples: 10 },
    })

    renderWithQuery(<CategorizationPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Réinitialiser…' }))
    const dialog = within(
      await screen.findByRole('dialog', {
        name: 'Réinitialiser la catégorisation et le modèle ?',
      }),
    )
    fireEvent.click(dialog.getByRole('button', { name: 'Réinitialiser' }))

    await waitFor(() => expect(api.ledger.categorizationReset).toHaveBeenCalledWith({}))
    expect(await screen.findByRole('status')).toHaveTextContent(
      '5 opération(s) déclassée(s), 7 suggestion(s) vidée(s) et modèle remis à zéro (10 exemple(s) effacé(s)).',
    )
  })
})
