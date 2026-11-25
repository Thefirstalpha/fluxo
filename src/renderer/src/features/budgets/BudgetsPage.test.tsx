import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { useSettingsStore } from '../../stores/settings'
import { installFakeApi } from '../../test/fake-api'
import { renderWithQuery } from '../../test/render'
import BudgetsPage from './BudgetsPage'

vi.mock('../../lib/charts/EChart', () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} />,
}))

beforeEach(() => {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, ready: true })
})

describe('BudgetsPage (M8)', () => {
  it('affiche les budgets avec seuil 80 % et permet de créer un budget et un objectif', async () => {
    const api = installFakeApi()
    api.ledger.categoriesList.mockResolvedValue({
      ok: true,
      value: [
        {
          id: 'cat-1',
          parentId: null,
          name: 'Courses',
          kind: 'expense',
          linkedAccountId: null,
          icon: 'shopping-cart',
          color: '#dd2a80',
          sortOrder: 0,
          archived: false,
          transactionCount: 2,
          total: 0,
        },
      ],
    })
    api.ledger.budgetsList.mockResolvedValue({
      ok: true,
      value: [
        {
          id: 'b-1',
          categoryId: 'cat-1',
          categoryName: 'Courses',
          categoryColor: '#dd2a80',
          mode: 'fixed',
          amountCents: 45_000,
          percentMicros: null,
          rollover: false,
          alert80: true,
          alert100: true,
          archived: false,
          effectiveLimitCents: 45_000,
          baseLimitCents: 45_000,
          rolloverCents: 0,
          spentCents: 38_000,
          remainingCents: 7_000,
          ratioMicros: 844_444,
          alertLevel: 'warning_80',
        },
      ],
    })

    renderWithQuery(<BudgetsPage />)
    expect(await screen.findByText('Courses')).toBeInTheDocument()
    expect(screen.getByText('Seuil 80 % atteint')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Enregistrer ce budget/i }))
    await waitFor(() => expect(api.ledger.budgetSave).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('radio', { name: 'Crédits' }))
    expect(await screen.findByText(/Ajouter un crédit/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Patrimoine net' }))
    expect(await screen.findByText(/Valorisation des actifs externes/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /Prévisions & simulation/i }))
    expect(await screen.findByText(/Prévision de fin de mois/i)).toBeInTheDocument()
  })
})
