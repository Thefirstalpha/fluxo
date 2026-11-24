import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { Redirect, Route, Router, Switch, useLocation } from 'wouter'
import { useHashLocation } from 'wouter/use-hash-location'
import { AppShell } from './app/AppShell'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ComingSoonPage } from './features/roadmap/ComingSoonPage'
import { useResolvedTheme } from './lib/theme'
import { useSettingsStore } from './stores/settings'

// Pages lourdes chargées à la demande (ECharts vit dans son propre chunk).
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage'))
const SettingsPage = lazy(() => import('./features/settings/SettingsPage'))

/** Reflète langue et thème résolu sur <html> (lecteurs d'écran, tests, sélecteurs CSS). */
function useDocumentAttributes(): void {
  const locale = useSettingsStore((state) => state.settings.locale)
  const theme = useResolvedTheme()
  useEffect(() => {
    document.documentElement.lang = locale.slice(0, 2)
    document.documentElement.dataset.theme = theme
  }, [locale, theme])
}

/** Une page en échec n'emporte pas la coque : la navigation reste utilisable. */
function PageBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation()
  return (
    <ErrorBoundary key={location} scope="page">
      {children}
    </ErrorBoundary>
  )
}

export function App() {
  useDocumentAttributes()
  return (
    <Router hook={useHashLocation}>
      <AppShell>
        <PageBoundary>
          <Suspense fallback={null}>
            <Switch>
              <Route path="/">
                <DashboardPage />
              </Route>
              <Route path="/transactions">
                <ComingSoonPage section="transactions" />
              </Route>
              <Route path="/imports">
                <ComingSoonPage section="imports" />
              </Route>
              <Route path="/analytics">
                <ComingSoonPage section="analytics" />
              </Route>
              <Route path="/payslips">
                <ComingSoonPage section="payslips" />
              </Route>
              <Route path="/documents">
                <ComingSoonPage section="documents" />
              </Route>
              <Route path="/budgets">
                <ComingSoonPage section="budgets" />
              </Route>
              <Route path="/settings">
                <SettingsPage />
              </Route>
              <Route>
                <Redirect to="/" />
              </Route>
            </Switch>
          </Suspense>
        </PageBoundary>
      </AppShell>
    </Router>
  )
}
