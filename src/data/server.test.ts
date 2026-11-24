import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ServiceError, type PortLike, type RpcResponse } from './rpc'
import { defineMethod, describeError, serveMethods } from './server'

/** Port de test : `deliver` simule un message du main, `sent` collecte les réponses. */
function fakePort() {
  const emitter = new EventEmitter()
  const sent: unknown[] = []
  const port: PortLike = {
    postMessage: (message) => sent.push(message),
    on: (event, listener) => emitter.on(event, listener),
  }
  const deliver = (data: unknown) => emitter.emit('message', { data })
  const responses = () =>
    sent.filter((m): m is RpcResponse => (m as RpcResponse).kind === 'response')
  return { port, deliver, sent, responses }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('serveMethods', () => {
  it('valide les paramètres, exécute la méthode et renvoie son résultat', async () => {
    const { port, deliver, responses } = fakePort()
    serveMethods(port, { double: defineMethod(z.number().int(), (n) => n * 2) }, vi.fn())
    deliver({ kind: 'request', id: 1, method: 'double', params: 21 })
    deliver({ kind: 'request', id: 2, method: 'double', params: 'x' })
    deliver({ kind: 'request', id: 3, method: 'toString' })
    await settle()
    expect(responses()).toEqual([
      { kind: 'response', id: 1, ok: true, result: 42 },
      { kind: 'response', id: 2, ok: false, code: 'INVALID_REQUEST' },
      { kind: 'response', id: 3, ok: false, code: 'UNKNOWN_METHOD' },
    ])
  })

  it('ne renvoie qu’un code d’erreur, jamais le message interne', async () => {
    const { port, deliver, responses } = fakePort()
    const log = vi.fn()
    serveMethods(
      port,
      {
        expected: defineMethod(z.undefined(), () => {
          throw new ServiceError('VAULT_LOCKED')
        }),
        unexpected: defineMethod(z.undefined(), () => {
          throw new Error('IBAN FR76… dans un message')
        }),
      },
      log,
    )
    deliver({ kind: 'request', id: 1, method: 'expected' })
    deliver({ kind: 'request', id: 2, method: 'unexpected' })
    await settle()
    expect(responses()).toEqual([
      { kind: 'response', id: 1, ok: false, code: 'VAULT_LOCKED' },
      { kind: 'response', id: 2, ok: false, code: 'INTERNAL_ERROR' },
    ])
    expect(JSON.stringify(log.mock.calls)).not.toContain('FR76')
  })

  it('traite les requêtes une par une, dans l’ordre d’arrivée', async () => {
    const { port, deliver, responses } = fakePort()
    const order: string[] = []
    serveMethods(
      port,
      {
        slow: defineMethod(z.undefined(), async () => {
          order.push('slow:start')
          await new Promise((resolve) => setTimeout(resolve, 20))
          order.push('slow:end')
        }),
        fast: defineMethod(z.undefined(), () => {
          order.push('fast')
        }),
      },
      vi.fn(),
    )
    deliver({ kind: 'request', id: 1, method: 'slow' })
    deliver({ kind: 'request', id: 2, method: 'fast' })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(order).toEqual(['slow:start', 'slow:end', 'fast'])
    expect(responses().map((r) => r.id)).toEqual([1, 2])
  })

  it('ignore un message qui n’est pas une requête', async () => {
    const { port, deliver, sent } = fakePort()
    const log = vi.fn()
    serveMethods(port, {}, log)
    deliver({ hello: 'world' })
    await settle()
    expect(sent).toEqual([])
    expect(log).toHaveBeenCalledWith('warn', expect.any(String))
  })
})

describe('describeError', () => {
  it('ne conserve que le nom et le code', () => {
    const error = Object.assign(new Error('chemin C:\\Users\\alice\\fluxo.db'), {
      code: 'SQLITE_CORRUPT',
    })
    expect(describeError(error)).toBe('Error (SQLITE_CORRUPT)')
  })
})
