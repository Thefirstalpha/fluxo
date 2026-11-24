import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'

/** Rendu avec un cache de requêtes neuf (aucune donnée ne passe d'un test à l'autre). */
export function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) }
}
