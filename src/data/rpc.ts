/**
 * RPC minimal entre le process main et le service de données, sur un `MessagePort`.
 * Même discipline que l'IPC du renderer : chaque requête est validée par un schéma,
 * les erreurs ne transportent qu'un code (jamais de message interne, de chemin ni de donnée).
 */

/** Codes d'erreur du service. Les échecs attendus (mauvais mot de passe…) sont des résultats, pas des erreurs. */
export const SERVICE_ERROR_CODES = [
  'INVALID_REQUEST',
  'UNKNOWN_METHOD',
  'VAULT_ABSENT',
  'VAULT_EXISTS',
  'VAULT_LOCKED',
  'VAULT_CORRUPT',
  'VAULT_TOO_NEW',
  'NOT_ALLOWED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const
export type ServiceErrorCode = (typeof SERVICE_ERROR_CODES)[number]

export class ServiceError extends Error {
  constructor(readonly code: ServiceErrorCode) {
    super(code)
    this.name = 'ServiceError'
  }
}

export interface RpcRequest {
  kind: 'request'
  id: number
  method: string
  params?: unknown
}

export type RpcResponse =
  | { kind: 'response'; id: number; ok: true; result: unknown }
  | { kind: 'response'; id: number; ok: false; code: ServiceErrorCode }

/** Journal émis par le service, écrit (et expurgé) par le journal du process main. */
export interface RpcLog {
  kind: 'log'
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
}

export type ServiceMessage = RpcResponse | RpcLog

/** Sous-ensemble commun à `MessagePortMain` (Electron) et aux ports de test. */
export interface PortLike {
  postMessage(message: unknown): void
  on(event: 'message', listener: (event: { data: unknown }) => void): unknown
  start?(): void
}

export function isRpcRequest(value: unknown): value is RpcRequest {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    candidate.kind === 'request' &&
    Number.isSafeInteger(candidate.id) &&
    typeof candidate.method === 'string'
  )
}

export function isServiceMessage(value: unknown): value is ServiceMessage {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  if (candidate.kind === 'log') {
    return typeof candidate.message === 'string' && typeof candidate.level === 'string'
  }
  return (
    candidate.kind === 'response' &&
    Number.isSafeInteger(candidate.id) &&
    typeof candidate.ok === 'boolean'
  )
}
