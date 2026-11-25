import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { useSettingsStore } from '../../stores/settings'
import { useVaultStore } from '../../stores/vault'
import { installFakeApi as installApi, UNLOCKED_STATUS } from '../../test/fake-api'
import { renderWithQuery } from '../../test/render'
import SettingsPage from './SettingsPage'

/** Remplace le preload par un double de test : le renderer ne voit que cette API. */
function installFakeApi() {
  const api = installApi()
  return {
    update: api.settings.update,
    openExternal: api.app.openExternal,
    vault: api.vault,
    ledger: api.ledger,
  }
}

beforeEach(() => {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, ready: true })
  useVaultStore.setState({ status: { ...UNLOCKED_STATUS }, pendingRecoveryCode: null })
})

describe('SettingsPage', () => {
  it('demande au process main d’appliquer le thème sombre', async () => {
    const { update } = installFakeApi()
    renderWithQuery(<SettingsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Sombre' }))

    await waitFor(() => expect(update).toHaveBeenCalledWith({ theme: 'dark' }))
    expect(screen.getByRole('button', { name: 'Sombre' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Système' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('propose le masquage des montants sous forme d’interrupteur accessible', async () => {
    const { update } = installFakeApi()
    renderWithQuery(<SettingsPage />)

    const toggle = screen.getByRole('switch', { name: 'Masquer les montants' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(toggle)

    await waitFor(() => expect(update).toHaveBeenCalledWith({ hideAmounts: true }))
  })

  it('affiche la version fournie par le process main', async () => {
    installFakeApi()
    renderWithQuery(<SettingsPage />)
    expect(await screen.findByText('0.1.0')).toBeInTheDocument()
  })

  it('mode mot de passe : exige le mot de passe actuel pour en choisir un nouveau', async () => {
    const { vault } = installFakeApi()
    useVaultStore.setState({ status: { ...UNLOCKED_STATUS, mode: 'password' } })
    renderWithQuery(<SettingsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Changer le mot de passe' }))
    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), {
      target: { value: 'ancienne phrase' },
    })
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), {
      target: { value: 'nouvelle phrase de passe' },
    })
    fireEvent.change(screen.getByLabelText('Confirmer le nouveau mot de passe'), {
      target: { value: 'nouvelle phrase de passe' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))

    await waitFor(() =>
      expect(vault.changePassword).toHaveBeenCalledWith({
        currentPassword: 'ancienne phrase',
        newPassword: 'nouvelle phrase de passe',
      }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Modification enregistrée')
  })

  it('refuse une confirmation différente sans appeler le process main', () => {
    const { vault } = installFakeApi()
    renderWithQuery(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Exiger un mot de passe maître' }))
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), {
      target: { value: 'une phrase de passe' },
    })
    fireEvent.change(screen.getByLabelText('Confirmer le nouveau mot de passe'), {
      target: { value: 'une autre phrase' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    expect(screen.getByRole('alert')).toHaveTextContent('ne correspondent pas')
    expect(vault.changePassword).not.toHaveBeenCalled()
  })

  it('règle le verrouillage automatique', async () => {
    const { update } = installFakeApi()
    renderWithQuery(<SettingsPage />)
    fireEvent.change(screen.getByLabelText('Verrouillage automatique après inactivité'), {
      target: { value: '30' },
    })
    await waitFor(() => expect(update).toHaveBeenCalledWith({ autoLockMinutes: 30 }))
  })

  it('réinitialise la catégorisation et le modèle après confirmation', async () => {
    const { ledger } = installFakeApi()
    ledger.classifierStatus.mockResolvedValue({
      ok: true,
      value: {
        sampleCount: 42,
        categoryCount: 6,
        updatedAt: '2026-11-24T10:00:00.000Z',
        threshold: 0.85,
      },
    })
    ledger.categorizationReset.mockResolvedValue({
      ok: true,
      value: {
        clearedTransactions: 18,
        clearedSuggestions: 24,
        clearedModelSamples: 42,
      },
    })
    renderWithQuery(<SettingsPage />)

    expect(await screen.findByText('42 opérations apprises sur 6 catégories.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser la catégorisation…' }))
    const dialog = within(
      await screen.findByRole('dialog', {
        name: 'Réinitialiser la catégorisation et le modèle ?',
      }),
    )
    fireEvent.click(dialog.getByRole('button', { name: 'Réinitialiser' }))

    await waitFor(() => expect(ledger.categorizationReset).toHaveBeenCalledWith({}))
    expect(await screen.findByRole('status')).toHaveTextContent(
      '18 opération(s) déclassée(s), 24 suggestion(s) vidée(s) et modèle remis à zéro (42 exemple(s) effacé(s)).',
    )
  })
})
