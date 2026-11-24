import { QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, type ReactNode } from 'react'
import { Redirect, Route, Router, Switch, useLocation } from 'wouter'
import { useHashLocation } from 'wouter/use-hash-location'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { ComingSoonPage } from '../features/roadmap/ComingSoonPage'
import { queryClient } from '../lib/ledger'
import { useRegisterStore } from '../stores/register'
import { useVaultStore } from '../stores/vault'
import { AppShell } from './AppShell'

// Pages lourdes chargées à la demande (ECharts vit dans son propre chunk).
const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage'))
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'))
const AccountsPage = lazy(() => import('../features/accounts/AccountsPage'))
const CategoriesPage = lazy(() => import('../features/categories/CategoriesPage'))
const TransactionsPage = lazy(() => import('../features/transactions/TransactionsPage'))
const ImportsPage = lazy(() => import('../features/imports/ImportsPage'))

// Verrouillage, démonstration ouverte ou fermée : les données en cache sont celles d'un autre
// coffre (ou d'un coffre fermé) ; on les oublie.
useVaultStore.subscribe((state, previous) => {
  const status = state.status
  if (!status || status.state !== 'unlocked' || previous.status?.demo !== status.demo) {
    queryClient.clear()
    useRegisterStore.getState().clearSession()
  }
})

/** Une page en échec n'emporte pas la coque : la navigation reste utilisable. */
function PageBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation()
  return (
    <ErrorBoundary key={location} scope="page">
      {children}
    </ErrorBoundary>
  )
}

/**
 * Application déverrouillée : chargée à la demande, après l'écran du coffre (qui reste léger).
 * Cache des données du registre, routeur, coque et pages.
 */
export default function UnlockedApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <AppShell>
          <PageBoundary>
            <Suspense fallback={null}>
              <Switch>
                <Route path="/">
                  <DashboardPage />
                </Route>
                <Route path="/accounts">
                  <AccountsPage />
                </Route>
                <Route path="/categories">
                  <CategoriesPage />
                </Route>
                <Route path="/transactions">
                  <TransactionsPage />
                </Route>
                <Route path="/imports">
                  <ImportsPage />
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
    </QueryClientProvider>
  )
}
