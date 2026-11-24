import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppInfo, FluxoApi } from '@shared/ipc'
import { DEFAULT_SETTINGS, type Settings, type SettingsPatch } from '@shared/settings'
import { useSettingsStore } from '../../stores/settings'
import SettingsPage from './SettingsPage'

const info: AppInfo = {
  name: 'Fluxo',
  version: '0.1.0',
  electron: '45.3.3',
  chrome: '146.0.0.0',
  node: '24.12.0',
  platform: 'linux',
  arch: 'x64',
  packaged: false,
}

/** Remplace le preload par un double de test : le renderer ne voit que cette API. */
function installFakeApi() {
  const update = vi.fn((patch: SettingsPatch) =>
    Promise.resolve<Settings>({ ...DEFAULT_SETTINGS, ...patch }),
  )
  const openExternal = vi.fn(() => Promise.resolve(true))
  const api: FluxoApi = {
    platform: 'linux',
    settings: {
      get: () => Promise.resolve({ ...DEFAULT_SETTINGS }),
      update,
      onChange: () => () => undefined,
    },
    app: {
      getInfo: () => Promise.resolve(info),
      openExternal,
      reportError: () => Promise.resolve(),
    },
  }
  Object.defineProperty(window, 'fluxo', { value: api, configurable: true })
  return { update, openExternal }
}

beforeEach(() => {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, ready: true })
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
})
