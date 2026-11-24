import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query'
import {
  LEDGER_QUERIES,
  type LedgerInput,
  type LedgerMethod,
  type LedgerOutput,
} from '@shared/ledger/api'
import type { LedgerError, LedgerResult } from '@shared/ledger/model'
import { getApi } from './api'

/**
 * Couche de données du renderer : cache des lectures du registre (TanStack Query), invalidé
 * après chaque écriture. Toute écriture passe par l'API validée du service de données ; le cache
 * est vidé au verrouillage et à l'entrée ou la sortie de la démonstration.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: false, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
})

/** Échec attendu du registre (`not-found`, `statement-account`…). */
export class LedgerRequestError extends Error {
  constructor(readonly code: LedgerError) {
    super(code)
    this.name = 'LedgerRequestError'
  }
}

export async function callLedger<M extends LedgerMethod>(
  method: M,
  input: LedgerInput<M>,
): Promise<LedgerOutput<M>> {
  // Le type de chaque fonction est fixé par `LedgerClient` ; TypeScript ne sait pas corréler
  // une méthode générique à son entrée, d'où la conversion locale.
  const call = getApi().ledger[method] as unknown as (
    input: LedgerInput<M>,
  ) => Promise<LedgerResult<LedgerOutput<M>>>
  const result = await call(input)
  if (!result.ok) throw new LedgerRequestError(result.error)
  return result.value
}

/** Code d'erreur à afficher : échec attendu, ou erreur générique (IPC, service). */
export function ledgerErrorCode(error: unknown): LedgerError | 'generic' {
  return error instanceof LedgerRequestError ? error.code : 'generic'
}

export const ledgerKey = <M extends LedgerMethod>(method: M, input?: LedgerInput<M>) =>
  input === undefined ? ['ledger', method] : ['ledger', method, input]

export function useLedgerQuery<M extends LedgerMethod>(
  method: M,
  input: LedgerInput<M>,
  options: Omit<UseQueryOptions<LedgerOutput<M>>, 'queryKey' | 'queryFn'> = {},
) {
  return useQuery<LedgerOutput<M>>({
    queryKey: ledgerKey(method, input),
    queryFn: () => callLedger(method, input),
    ...options,
  })
}

/** Écriture : invalide toutes les lectures du registre une fois réussie. */
export function useLedgerMutation<M extends LedgerMethod>(method: M) {
  const client = useQueryClient()
  return useMutation<LedgerOutput<M>, unknown, LedgerInput<M>>({
    mutationFn: (input) => callLedger(method, input),
    onSuccess: async () => {
      if (!LEDGER_QUERIES.has(method)) await client.invalidateQueries({ queryKey: ['ledger'] })
    },
  })
}
