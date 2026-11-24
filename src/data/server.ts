import type { z } from 'zod'
import {
  isRpcRequest,
  ServiceError,
  type PortLike,
  type RpcLog,
  type RpcResponse,
  type ServiceErrorCode,
} from './rpc'

export interface MethodDefinition<TSchema extends z.ZodType = z.ZodType> {
  schema: TSchema
  run: (params: z.output<TSchema>) => unknown
}

export type MethodTable = Readonly<Record<string, MethodDefinition>>

export function defineMethod<TSchema extends z.ZodType>(
  schema: TSchema,
  run: (params: z.output<TSchema>) => unknown,
): MethodDefinition {
  return { schema, run: run as (params: unknown) => unknown }
}

export type ServiceLogger = (level: RpcLog['level'], message: string) => void

/** Journal du service : relayé au process main, qui l'expurge avant écriture. */
export function createPortLogger(port: PortLike): ServiceLogger {
  return (level, message) => {
    const log: RpcLog = { kind: 'log', level, message }
    port.postMessage(log)
  }
}

/**
 * Sert les méthodes sur le port. Les requêtes sont traitées **une par une** : SQLite est
 * synchrone et les opérations longues (dérivation de clé, sauvegarde) ne doivent pas s'entrelacer.
 */
export function serveMethods(port: PortLike, methods: MethodTable, log: ServiceLogger): void {
  let queue: Promise<void> = Promise.resolve()

  const reply = (response: RpcResponse): void => port.postMessage(response)

  const handle = async (data: unknown): Promise<void> => {
    if (!isRpcRequest(data)) {
      log('warn', 'Message ignoré : requête mal formée.')
      return
    }
    const fail = (code: ServiceErrorCode): void =>
      reply({ kind: 'response', id: data.id, ok: false, code })

    const method = Object.hasOwn(methods, data.method) ? methods[data.method] : undefined
    if (!method) return fail('UNKNOWN_METHOD')
    const parsed = method.schema.safeParse(data.params)
    if (!parsed.success) {
      log('warn', `Requête « ${data.method} » rejetée : paramètres invalides.`)
      return fail('INVALID_REQUEST')
    }
    try {
      const result = await method.run(parsed.data)
      reply({ kind: 'response', id: data.id, ok: true, result })
    } catch (error) {
      if (error instanceof ServiceError) return fail(error.code)
      log('error', `Méthode « ${data.method} » en échec : ${describeError(error)}`)
      fail('INTERNAL_ERROR')
    }
  }

  port.on('message', (event) => {
    queue = queue.then(() => handle(event.data))
  })
  port.start?.()
}

/** Nom et code d'une erreur, sans son message (qui pourrait contenir une donnée). */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return 'valeur non-Error'
  const code = 'code' in error && typeof error.code === 'string' ? ` (${error.code})` : ''
  return `${error.name}${code}`
}
