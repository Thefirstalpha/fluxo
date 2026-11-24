import './styles/index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { getApi } from './lib/api'
import { initSettings } from './stores/settings'

async function bootstrap(): Promise<void> {
  document.documentElement.dataset.platform = getApi().platform
  await initSettings()
  const container = document.getElementById('root')
  if (!container) throw new Error('Élément #root introuvable.')
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

bootstrap().catch((error: unknown) => {
  console.error('Démarrage de l’interface impossible', error)
})
