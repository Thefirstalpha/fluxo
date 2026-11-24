import './styles/index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { getApi } from './lib/api'
import { installGlobalErrorHandlers, reportError } from './lib/error-reporting'
import { initSettings } from './stores/settings'
import { initVault } from './stores/vault'

installGlobalErrorHandlers()

function mount(): ReturnType<typeof createRoot> {
  const container = document.getElementById('root')
  if (!container) throw new Error('Élément #root introuvable.')
  return createRoot(container)
}

async function bootstrap(): Promise<void> {
  document.documentElement.dataset.platform = getApi().platform
  await Promise.all([initSettings(), initVault()])
  mount().render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}

bootstrap().catch((error: unknown) => {
  reportError('bootstrap', error)
  // Préférences indisponibles : on affiche quand même l'écran d'erreur (valeurs par défaut).
  const Fail = () => {
    throw error
  }
  mount().render(
    <ErrorBoundary>
      <Fail />
    </ErrorBoundary>,
  )
})
