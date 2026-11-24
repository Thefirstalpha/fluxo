import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/settings'
import type { VaultStatus } from '@shared/vault'
import { useSettingsStore } from '../../stores/settings'
import { useVaultStore } from '../../stores/vault'
import { installFakeApi, UNLOCKED_STATUS } from '../../test/fake-api'
import { VaultGate } from './VaultGate'

const ABSENT: VaultStatus = {
  ...UNLOCKED_STATUS,
  state: 'absent',
  mode: null,
  hasRecoveryCode: false,
}
const LOCKED_PASSWORD: VaultStatus = { ...UNLOCKED_STATUS, state: 'locked', mode: 'password' }

function renderGate(status: VaultStatus) {
  useVaultStore.setState({ status, pendingRecoveryCode: null, setupInProgress: false })
  return render(
    <VaultGate>
      <p>application</p>
    </VaultGate>,
  )
}

/** Simule la notification d'état envoyée par le process main. */
function broadcast(status: VaultStatus) {
  act(() => useVaultStore.setState({ status }))
}

beforeEach(() => {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, ready: true })
})

describe('VaultGate — création', () => {
  it('propose le mode session par défaut, puis affiche le code de récupération une fois', async () => {
    const api = installFakeApi()
    renderGate(ABSENT)
    expect(screen.queryByText('application')).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Avec ma session/ })).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: 'Créer mon coffre' }))
    await waitFor(() => expect(api.vault.create).toHaveBeenCalledWith({ mode: 'session' }))
    await waitFor(() => expect(api.vault.createRecoveryCode).toHaveBeenCalledWith({}))
    broadcast(UNLOCKED_STATUS)

    const code = 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789'
    expect(
      await screen.findByText(
        (_, element) => element?.tagName === 'P' && element.textContent === code,
      ),
    ).toBeInTheDocument()
    const proceed = screen.getByRole('button', { name: 'Continuer' })
    expect(proceed).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'J’ai mis ce code en lieu sûr' }))
    fireEvent.click(proceed)
    expect(screen.getByText('application')).toBeInTheDocument()
  })

  it('mode mot de passe : vérifie longueur et confirmation avant d’appeler le main', async () => {
    const api = installFakeApi()
    renderGate(ABSENT)
    fireEvent.click(screen.getByRole('radio', { name: /^Avec un mot de passe maître/ }))
    fireEvent.change(screen.getByLabelText('Mot de passe maître'), { target: { value: 'court' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon coffre' }))
    expect(screen.getByRole('alert')).toHaveTextContent('au moins 10 caractères')

    fireEvent.change(screen.getByLabelText('Mot de passe maître'), {
      target: { value: 'une phrase de passe' },
    })
    fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), {
      target: { value: 'une phrase de passe' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /code de récupération/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon coffre' }))
    await waitFor(() =>
      expect(api.vault.create).toHaveBeenCalledWith({
        mode: 'password',
        password: 'une phrase de passe',
      }),
    )
    expect(api.vault.createRecoveryCode).not.toHaveBeenCalled()
  })

  it('sans trousseau sûr, le mode session est désactivé et expliqué', () => {
    installFakeApi()
    renderGate({
      ...ABSENT,
      sessionAvailable: false,
      sessionUnavailableReason: 'no-secure-storage',
    })
    expect(screen.getByRole('radio', { name: /Avec ma session/ })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /^Avec un mot de passe maître/ })).toBeChecked()
    expect(screen.getByText(/Aucun trousseau sécurisé/)).toBeInTheDocument()
  })
})

describe('VaultGate — déverrouillage', () => {
  it('mode session : un clic suffit', async () => {
    const api = installFakeApi()
    renderGate({ ...LOCKED_PASSWORD, mode: 'session' })
    fireEvent.click(screen.getByRole('button', { name: 'Déverrouiller' }))
    await waitFor(() => expect(api.vault.unlock).toHaveBeenCalledWith({ method: 'session' }))
  })

  it('mot de passe faux, puis délai imposé', async () => {
    const api = installFakeApi()
    api.vault.unlock
      .mockResolvedValueOnce({ ok: false, reason: 'wrong-credentials', retryAfterMs: 0 } as never)
      .mockResolvedValueOnce({ ok: false, reason: 'locked-out', retryAfterMs: 4000 } as never)
    renderGate(LOCKED_PASSWORD)
    const field = screen.getByLabelText('Mot de passe maître')

    fireEvent.change(field, { target: { value: 'pas le bon' } })
    fireEvent.click(screen.getByRole('button', { name: 'Déverrouiller' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Mot de passe incorrect')

    fireEvent.change(screen.getByLabelText('Mot de passe maître'), { target: { value: 'encore' } })
    fireEvent.click(screen.getByRole('button', { name: 'Déverrouiller' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Trop d’essais'))
    expect(screen.getByRole('button', { name: 'Déverrouiller' })).toBeDisabled()
  })

  it('code de récupération, puis nouveau mot de passe obligatoire', async () => {
    const api = installFakeApi()
    renderGate(LOCKED_PASSWORD)
    fireEvent.click(screen.getByRole('button', { name: /Utiliser le code de récupération/ }))
    fireEvent.change(screen.getByLabelText('Code de récupération'), {
      target: { value: 'abcd efgh' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Déverrouiller' }))
    await waitFor(() =>
      expect(api.vault.unlock).toHaveBeenCalledWith({ method: 'recovery', code: 'abcd efgh' }),
    )

    broadcast({ ...UNLOCKED_STATUS, mode: 'password', needsNewPassword: true })
    expect(
      screen.getByRole('heading', { name: 'Choisissez un nouveau mot de passe' }),
    ).toBeVisible()
    expect(screen.queryByText('application')).not.toBeInTheDocument()
  })

  it('sans code de récupération, le lien n’est pas proposé', () => {
    installFakeApi()
    renderGate({ ...LOCKED_PASSWORD, hasRecoveryCode: false })
    expect(screen.queryByRole('button', { name: /code de récupération/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Aucun code de récupération/)).toBeInTheDocument()
  })
})
