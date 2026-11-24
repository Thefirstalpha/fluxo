import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { useSettingsStore } from '../../stores/settings'
import { useVaultStore } from '../../stores/vault'
import { installFakeApi as installApi, UNLOCKED_STATUS } from '../../test/fake-api'
import SettingsPage from './SettingsPage'

/** Remplace le preload par un double de test : le renderer ne voit que cette API. */
function installFakeApi() {
  const api = installApi()
  return { update: api.settings.update, openExternal: api.app.openExternal, vault: api.vault }
}

beforeEach(() => {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, ready: true })
  useVaultStore.setState({ status: { ...UNLOCKED_STATUS }, pendingRecoveryCode: null })
})

describe('SettingsPage', () => {
  it('demande au process main d’appliquer le thème sombre', async () => {
    const { update } = installFakeApi()
    render(<SettingsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Sombre' }))

    await waitFor(() => expect(update).toHaveBeenCalledWith({ theme: 'dark' }))
    expect(screen.getByRole('button', { name: 'Sombre' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Système' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('propose le masquage des montants sous forme d’interrupteur accessible', async () => {
    const { update } = installFakeApi()
    render(<SettingsPage />)

    const toggle = screen.getByRole('switch', { name: 'Masquer les montants' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(toggle)

    await waitFor(() => expect(update).toHaveBeenCalledWith({ hideAmounts: true }))
  })

  it('affiche la version fournie par le process main', async () => {
    installFakeApi()
    render(<SettingsPage />)
    expect(await screen.findByText('0.1.0')).toBeInTheDocument()
  })

  it('mode mot de passe : exige le mot de passe actuel pour en choisir un nouveau', async () => {
    const { vault } = installFakeApi()
    useVaultStore.setState({ status: { ...UNLOCKED_STATUS, mode: 'password' } })
    render(<SettingsPage />)

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
    render(<SettingsPage />)
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
    render(<SettingsPage />)
    fireEvent.change(screen.getByLabelText('Verrouillage automatique après inactivité'), {
      target: { value: '30' },
    })
    await waitFor(() => expect(update).toHaveBeenCalledWith({ autoLockMinutes: 30 }))
  })
})
