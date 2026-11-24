import { describe, expect, it } from 'vitest'
import { sameName } from './names'

describe('sameName', () => {
  it('ignore la casse, y compris accentuée, mais pas les accents', () => {
    expect(sameName('Énergie', 'énergie')).toBe(true)
    expect(sameName('ÉTÉ 2026', 'été 2026')).toBe(true)
    expect(sameName('Pâte', 'Pate')).toBe(false)
    // Formes composée et décomposée d'un même caractère.
    expect(sameName('café', 'café')).toBe(true)
  })
})
