import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Lockout, remainingDelayMs, retryDelayMs } from './lockout'

describe('retryDelayMs', () => {
  it('laisse 3 essais libres puis double le délai, plafonné à 5 minutes', () => {
    expect([0, 1, 2].map(retryDelayMs)).toEqual([0, 0, 0])
    expect([3, 4, 5, 6].map(retryDelayMs)).toEqual([1000, 2000, 4000, 8000])
    expect(retryDelayMs(20)).toBe(300_000)
    expect(retryDelayMs(10_000)).toBe(300_000)
  })

  it('décompte le temps restant depuis le dernier échec', () => {
    expect(remainingDelayMs({ failures: 4, lastFailureAt: 10_000 }, 10_500)).toBe(1500)
    expect(remainingDelayMs({ failures: 4, lastFailureAt: 10_000 }, 13_000)).toBe(0)
  })
})

describe('Lockout', () => {
  let directory: string
  let file: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'fluxo-lockout-'))
    file = join(directory, 'lockout.json')
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('conserve le compteur entre deux lancements', async () => {
    const first = await Lockout.load(file)
    for (let i = 0; i < 4; i += 1) await first.recordFailure(1_000)
    const second = await Lockout.load(file)
    expect(second.remaining(1_500)).toBe(1500)
    await second.reset()
    expect((await Lockout.load(file)).remaining(1_500)).toBe(0)
  })

  it('applique le plafond si le fichier a été altéré (pas de remise à zéro)', async () => {
    await writeFile(file, '{"failures": -5}')
    const lockout = await Lockout.load(file)
    expect(lockout.remaining()).toBeGreaterThan(0)
  })
})
