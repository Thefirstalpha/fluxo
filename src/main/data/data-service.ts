import { join } from 'node:path'
import { MessageChannelMain, utilityProcess, type UtilityProcess } from 'electron'
import type { DataServiceMethod, MethodParams, MethodResult, ServiceInit } from '../../data/api'
import {
  isServiceMessage,
  ServiceError,
  type RpcRequest,
  type ServiceMessage,
} from '../../data/rpc'
import { logger } from '../logger'

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}

/**
 * Client du service de données. Le processus est lancé à la première requête et relancé
 * après un arrêt inattendu ; les requêtes en cours échouent alors avec `SERVICE_UNAVAILABLE`
 * (le coffre se retrouve verrouillé : la clé n'existait qu'en mémoire du service).
 */
export class DataServiceClient {
  private child: UtilityProcess | null = null
  private port: Electron.MessagePortMain | null = null
  private nextId = 1
  private readonly pending = new Map<number, Pending>()
  private readonly exitListeners = new Set<() => void>()

  constructor(
    private readonly vaultDirectory: string,
    private readonly appVersion: string,
  ) {}

  call<M extends DataServiceMethod>(
    method: M,
    ...params: MethodParams<M> extends undefined ? [] : [MethodParams<M>]
  ): Promise<MethodResult<M>> {
    const port = this.ensureStarted()
    const id = this.nextId++
    const request: RpcRequest = { kind: 'request', id, method, params: params[0] }
    return new Promise<MethodResult<M>>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      port.postMessage(request)
    })
  }

  /** Appelé quand le service s'arrête (coffre verrouillé de fait). */
  onExit(listener: () => void): () => void {
    this.exitListeners.add(listener)
    return () => this.exitListeners.delete(listener)
  }

  /** Arrêt propre : le service ferme la base (report du WAL) avant de quitter. */
  async stop(): Promise<void> {
    const child = this.child
    if (!child) return
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill()
        resolve()
      }, 3_000)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      this.port?.close()
      child.kill()
    })
  }

  private ensureStarted(): Electron.MessagePortMain {
    if (this.child && this.port) return this.port

    const child = utilityProcess.fork(join(__dirname, 'data-service.js'), [], {
      serviceName: 'Fluxo — service de données',
      stdio: 'ignore',
    })
    const { port1, port2 } = new MessageChannelMain()
    const init: ServiceInit = {
      kind: 'init',
      vaultDirectory: this.vaultDirectory,
      appVersion: this.appVersion,
    }
    child.postMessage(init, [port2])

    port1.on('message', (event) => this.onMessage(event.data))
    port1.start()
    child.once('exit', (code) => this.onChildExit(child, code))

    this.child = child
    this.port = port1
    return port1
  }

  private onMessage(data: unknown): void {
    if (!isServiceMessage(data)) {
      logger.warn('Service de données : message inattendu ignoré.')
      return
    }
    handleServiceMessage(data, this.pending)
  }

  private onChildExit(child: UtilityProcess, code: number): void {
    if (this.child !== child) return
    if (code !== 0) logger.warn(`Service de données arrêté (code ${code}).`)
    this.child = null
    this.port = null
    for (const { reject } of this.pending.values()) {
      reject(new ServiceError('SERVICE_UNAVAILABLE'))
    }
    this.pending.clear()
    for (const listener of this.exitListeners) listener()
  }
}

function handleServiceMessage(message: ServiceMessage, pending: Map<number, Pending>): void {
  if (message.kind === 'log') {
    const level = message.level in logger ? message.level : 'info'
    logger[level](`[données] ${message.message}`)
    return
  }
  const entry = pending.get(message.id)
  if (!entry) return
  pending.delete(message.id)
  if (message.ok) entry.resolve(message.result)
  else entry.reject(new ServiceError(message.code))
}
