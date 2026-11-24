import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AccountSummary } from '@shared/ledger/model'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { useSettingsStore } from '../../stores/settings'
import { installFakeApi } from '../../test/fake-api'
import { renderWithQuery } from '../../test/render'
import AccountsPage from './AccountsPage'

const CHECKING: AccountSummary = {
  id: '0192f0c8-0000-7000-8000-000000000001',
  name: 'Compte joint',
  type: 'checking',
  trackingMode: 'statement',
  institution: 'Banque du Centre',
  currency: 'EUR',
  openingBalance: 100_00,
  openingDate: null,
  ibanMasked: 'FR76 •••• •••• 0189',
  color: '#0977cb',
  icon: 'landmark',
  archived: false,
  sortOrder: 0,
  balance: 1_520_40,
  reconciledBalance: 1_200_00,
  transactionCount: 12,
  lastTransactionDate: '2026-11-20',
}

beforeEach(() => {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, ready: true })
})

async function openCreateDialog() {
  const [button] = await screen.findAllByRole('button', { name: 'Nouveau compte' })
  if (!button) throw new Error('bouton absent')
  fireEvent.click(button)
  return within(await screen.findByRole('dialog', { name: 'Nouveau compte' }))
}

describe('AccountsPage', () => {
  it('invite à créer un premier compte', async () => {
    installFakeApi()
    renderWithQuery(<AccountsPage />)
    expect(await screen.findByText('Aucun compte pour l’instant')).toBeVisible()
  })

  it('affiche soldes, part rapprochée, IBAN masqué et totaux', async () => {
    const api = installFakeApi()
    api.ledger.accountsList.mockResolvedValue({ ok: true, value: [CHECKING] })
    renderWithQuery(<AccountsPage />)
    const row = (await screen.findByText('Compte joint')).closest('li')
    if (!row) throw new Error('ligne absente')
    const scope = within(row)
    expect(scope.getByText(/^1\s520,40\s€$/)).toBeVisible()
    expect(scope.getByText(/Rapproché : 1\s200,00\s€/)).toBeVisible()
    expect(scope.getByText(/FR76 •••• •••• 0189/)).toBeVisible()
    expect(scope.getByText('Relevé importé')).toBeVisible()
    // Un compte avec des opérations ne se supprime pas : il s'archive.
    expect(scope.queryByRole('button', { name: 'Supprimer Compte joint' })).toBeNull()
    expect(screen.getByText('Disponibilités').parentElement).toHaveTextContent(/1\s520,40/)
  })

  it('crée un compte : montant converti en centimes, mode par défaut selon le type', async () => {
    const api = installFakeApi()
    renderWithQuery(<AccountsPage />)
    const form = await openCreateDialog()
    fireEvent.change(form.getByLabelText('Nom du compte'), { target: { value: 'Espèces' } })
    fireEvent.change(form.getByLabelText('Type'), { target: { value: 'cash' } })
    expect(form.getByRole('radio', { name: /Saisie manuelle/ })).toBeChecked()
    fireEvent.change(form.getByLabelText('Solde d’ouverture'), { target: { value: '45,50' } })
    fireEvent.click(form.getByRole('button', { name: 'Créer le compte' }))
    await waitFor(() =>
      expect(api.ledger.accountCreate).toHaveBeenCalledWith({
        name: 'Espèces',
        type: 'cash',
        trackingMode: 'manual',
        institution: null,
        currency: 'EUR',
        openingBalance: 45_50,
        openingDate: null,
        iban: null,
        color: null,
        icon: null,
      }),
    )
  })

  it('signale un IBAN invalide sans rien envoyer', async () => {
    const api = installFakeApi()
    renderWithQuery(<AccountsPage />)
    const form = await openCreateDialog()
    fireEvent.change(form.getByLabelText('Nom du compte'), { target: { value: 'Courant' } })
    fireEvent.change(form.getByLabelText('IBAN'), {
      target: { value: 'FR76 3000 6000 0112 3456 7890 188' },
    })
    fireEvent.click(form.getByRole('button', { name: 'Créer le compte' }))
    expect(await form.findByText(/IBAN invalide/)).toBeVisible()
    expect(api.ledger.accountCreate).not.toHaveBeenCalled()
  })

  it('affiche l’échec renvoyé par le service', async () => {
    const api = installFakeApi()
    api.ledger.accountsList.mockResolvedValue({ ok: true, value: [CHECKING] })
    api.ledger.accountUpdate.mockResolvedValue({ ok: false, error: 'tracking-mode-locked' })
    renderWithQuery(<AccountsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier Compte joint' }))
    const form = within(await screen.findByRole('dialog', { name: 'Modifier le compte' }))
    expect(form.getByLabelText('Devise')).toBeDisabled()
    fireEvent.click(form.getByRole('button', { name: 'Enregistrer' }))
    expect(await form.findByRole('alert')).toHaveTextContent(/mode de suivi ne change plus/)
  })
})
