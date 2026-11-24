import { describe, expect, it } from 'vitest'
import { addMonths, monthOf, parseMonth } from './months'

describe('months', () => {
  it('ajoute et retire des mois à travers les années', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-06', -18)).toBe('2024-12')
  })

  it('rejette les mois invalides', () => {
    expect(() => parseMonth('2026-13')).toThrow(RangeError)
    expect(() => parseMonth('2026-1')).toThrow(RangeError)
    expect(() => parseMonth('novembre')).toThrow(RangeError)
  })

  it('donne le mois local d’une date', () => {
    expect(monthOf(new Date(2026, 10, 24))).toBe('2026-11')
  })
})
