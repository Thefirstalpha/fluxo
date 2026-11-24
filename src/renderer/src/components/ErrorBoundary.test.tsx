import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ERROR_REPORT_LIMITS, type FluxoApi } from '@shared/ipc'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { toErrorReport } from '../lib/error-reporting'
import { useSettingsStore } from '../stores/settings'
import { ErrorBoundary } from './ErrorBoundary'

function installFakeApi() {
  const reportError = vi.fn(() => Promise.resolve())
  const api = { platform: 'linux', app: { reportError } } as unknown as FluxoApi
  Object.defineProperty(window, 'fluxo', { value: api, configurable: true })
  return { reportError }
}

let shouldThrow = true
function Fragile() {
  if (shouldThrow) throw new Error('rendu impossible')
  return <p>contenu rétabli</p>
}

beforeEach(() => {
  shouldThrow = true
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, ready: true })
  // React journalise l'erreur interceptée : sans intérêt pour le test.
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('affiche l’écran d’erreur et consigne l’erreur dans le journal local', () => {
    const { reportError } = installFakeApi()
    render(
      <ErrorBoundary scope="page">
        <Fragile />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Un problème est survenu')
    expect(reportError).toHaveBeenCalledTimes(1)
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'render', message: 'Error: rendu impossible' }),
    )
  })

  it('« Réessayer » relance le rendu', () => {
    installFakeApi()
    render(
      <ErrorBoundary>
        <Fragile />
      </ErrorBoundary>,
    )
    shouldThrow = false
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(screen.getByText('contenu rétabli')).toBeInTheDocument()
  })
})

describe('toErrorReport', () => {
  it('tronque les champs aux limites acceptées par le process main', () => {
    const error = new Error('x'.repeat(5_000))
    error.stack = 'y'.repeat(20_000)
    const report = toErrorReport('window', error, 'z'.repeat(20_000))
    expect(report.message).toHaveLength(ERROR_REPORT_LIMITS.message)
    expect(report.stack).toHaveLength(ERROR_REPORT_LIMITS.stack)
    expect(report.componentStack).toHaveLength(ERROR_REPORT_LIMITS.stack)
  })

  it('accepte une valeur levée qui n’est pas une Error', () => {
    expect(toErrorReport('promise', 'refus')).toEqual({ source: 'promise', message: 'refus' })
    expect(toErrorReport('promise', 42)).toEqual({
      source: 'promise',
      message: 'Valeur non-Error levée',
    })
  })
})
