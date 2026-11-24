import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { useSettingsStore } from '../../stores/settings'
import { useVaultStore } from '../../stores/vault'
import { installFakeApi, UNLOCKED_STATUS } from '../../test/fake-api'
import { DataSettings } from './DataSettings'

beforeEach(() => {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, ready: true })
  useVaultStore.setState({ status: { ...UNLOCKED_STATUS } })
})

describe('DataSettings', () => {
  it('affiche l’état des sauvegardes et en crée une à la demande', async () => {
    const api = installFakeApi()
    render(<DataSettings />)
    expect(await screen.findByText(/4 sauvegarde\(s\)/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sauvegarder maintenant' }))
    await waitFor(() => expect(api.vault.backupNow).toHaveBeenCalled())
    expect(await screen.findByRole('status')).toHaveTextContent('Sauvegarde créée')
  })

  it('signale des sauvegardes non portables (session sans code de récupération)', async () => {
    const api = installFakeApi()
    api.vault.backupInfo.mockResolvedValue({
      directory: '/tmp',
      isDefault: true,
      auto: true,
      lastAutomaticAt: null,
      count: 0,
      portable: false,
    })
    render(<DataSettings />)
    expect(await screen.findByText(/ne pourront être restaurées que dans ce coffre/)).toBeVisible()
  })

  it('restauration du même coffre : aperçu vérifié, puis confirmation', async () => {
    const api = installFakeApi()
    render(<DataSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Restaurer une sauvegarde…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choisir le fichier…' }))
    await waitFor(() =>
      expect(api.vault.previewRestore).toHaveBeenCalledWith({ token: 'a'.repeat(32) }),
    )
    expect(await screen.findByText('1 250')).toBeInTheDocument()
    expect(screen.getByText(/du 1 juin 2025 au 19 nov\. 2026/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restaurer' }))
    await waitFor(() => expect(api.vault.confirmRestore).toHaveBeenCalledWith('a'.repeat(32)))
  })

  it('restauration d’un autre coffre : le secret est demandé avant l’aperçu', async () => {
    const api = installFakeApi()
    api.vault.pickBackup.mockResolvedValueOnce({
      ok: true,
      token: 'b'.repeat(32),
      summary: {
        createdAt: '2026-11-20T08:00:00.000Z',
        kind: 'manual',
        appVersion: '0.2.0',
        sameVault: false,
        methods: ['password', 'recovery'],
      },
    })
    render(<DataSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Restaurer une sauvegarde…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choisir le fichier…' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Code de récupération' }))
    fireEvent.change(screen.getByLabelText('Code de récupération'), {
      target: { value: 'ABCD EFGH' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier la sauvegarde' }))
    await waitFor(() =>
      expect(api.vault.previewRestore).toHaveBeenCalledWith({
        token: 'b'.repeat(32),
        secret: { method: 'recovery', value: 'ABCD EFGH' },
      }),
    )
  })

  it('« Tout effacer » exige le mot de confirmation', async () => {
    const api = installFakeApi()
    render(<DataSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Tout effacer…' }))
    const button = screen.getByRole('button', { name: 'Effacer définitivement' })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Pour confirmer, saisissez EFFACER'), {
      target: { value: 'effacer' },
    })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    await waitFor(() => expect(api.vault.eraseAll).toHaveBeenCalledWith({}))
  })
})
