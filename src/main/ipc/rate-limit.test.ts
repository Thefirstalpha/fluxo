import { describe, expect, it } from 'vitest'
import { createRateLimiter } from './rate-limit'

describe('createRateLimiter', () => {
  it('accepte jusqu’à la limite puis refuse jusqu’à la fin de la fenêtre', () => {
    let time = 0
    const allow = createRateLimiter(3, 60_000, () => time)
    expect([allow(), allow(), allow(), allow()]).toEqual([true, true, true, false])
    time = 59_999
    expect(allow()).toBe(false)
    time = 60_000
    expect(allow()).toBe(true)
  })

  it('libère les places au fil de l’eau (fenêtre glissante)', () => {
    let time = 0
    const allow = createRateLimiter(2, 1_000, () => time)
    expect(allow()).toBe(true)
    time = 500
    expect(allow()).toBe(true)
    time = 1_000
    expect(allow()).toBe(true) // le premier appel est sorti de la fenêtre
    expect(allow()).toBe(false)
  })
})
