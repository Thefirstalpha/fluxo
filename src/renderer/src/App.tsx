import { lazy, Suspense, useEffect } from 'react'
import { VaultGate } from './features/vault/VaultGate'
import { useResolvedTheme } from './lib/theme'
import { useSettingsStore } from './stores/settings'

// Tout ce qui suit le déverrouillage (coque, routes, cache des données) est chargé à la demande :
// l'écran du coffre, seul affiché au démarrage, reste léger.
const UnlockedApp = lazy(() => import('./app/UnlockedApp'))

/** Reflète langue et thème résolu sur <html> (lecteurs d'écran, tests, sélecteurs CSS). */
function useDocumentAttributes(): void {
  const locale = useSettingsStore((state) => state.settings.locale)
  const theme = useResolvedTheme()
  useEffect(() => {
    document.documentElement.lang = locale.slice(0, 2)
    document.documentElement.dataset.theme = theme
  }, [locale, theme])
}

export function App() {
  useDocumentAttributes()
  return (
    <VaultGate>
      <Suspense fallback={null}>
        <UnlockedApp />
      </Suspense>
    </VaultGate>
  )
}
