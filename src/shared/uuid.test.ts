import { describe, expect, it } from 'vitest'
import { createUuidV7Generator, UUID_PATTERN, uuidv7, uuidv7Timestamp } from './uuid'

describe('uuidv7', () => {
  it('respecte le format RFC 9562 (version 7, variante 10)', () => {
    for (let i = 0; i < 100; i += 1) expect(uuidv7()).toMatch(UUID_PATTERN)
  })

  it('encode l’instant de création', () => {
    const at = Date.UTC(2026, 10, 24, 12, 0, 0, 123)
    const next = createUuidV7Generator(() => at)
    expect(uuidv7Timestamp(next())).toBe(at)
  })

  it('reste trié dans l’ordre de création, même dans une seule milliseconde', () => {
    const next = createUuidV7Generator(() => 1_700_000_000_000)
    const ids = Array.from({ length: 5000 }, () => next())
    expect([...ids].sort()).toEqual(ids)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(UUID_PATTERN)
  })

  it('reste monotone si l’horloge recule', () => {
    let time = 2_000_000
    const next = createUuidV7Generator(() => time)
    const first = next()
    time = 1_000_000
    const second = next()
    expect(second > first).toBe(true)
  })

  it('trie aussi d’une milliseconde à l’autre', () => {
    let time = 1_000
    const next = createUuidV7Generator(() => time)
    const ids: string[] = []
    for (let i = 0; i < 50; i += 1) {
      ids.push(next())
      time += 1
    }
    expect([...ids].sort()).toEqual(ids)
  })
})
