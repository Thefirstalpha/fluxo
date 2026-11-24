import { describe, expect, it } from 'vitest'
import { formatMoney, parseAmount, ratio, sum } from './money'

/** Normalise les espaces insécables produits par Intl (fr-FR) pour des assertions lisibles. */
const plain = (text: string): string => text.replace(/\s/g, ' ')

describe('parseAmount', () => {
  it.each([
    ['1234,56', 123456],
    ['1 234,56', 123456],
    ['1.234,56', 123456],
    ['1,234.56', 123456],
    ["1'234.50", 123450],
    ['12.5', 1250],
    ['-45,90', -4590],
    ['45,90-', -4590],
    ['(12,00)', -1200],
    ['+3,00 €', 300],
    ['EUR 99', 9900],
    ['0', 0],
    ['-0,00', 0],
  ])('« %s » → %i centimes', (input, expected) => {
    expect(parseAmount(input)).toBe(expected)
  })

  it.each(['', '   ', 'abc', '1,2,3', '12,345,6', '--5', '1e5'])('rejette « %s »', (input) => {
    expect(parseAmount(input)).toBeNull()
  })

  it('accepte les espaces insécables produits par les exports bancaires', () => {
    expect(parseAmount(formatMoney(123456, { locale: 'fr-FR', currency: 'EUR' }))).toBe(123456)
  })
})

describe('formatMoney', () => {
  it('formate en euros, à la française', () => {
    expect(plain(formatMoney(123456, { locale: 'fr-FR', currency: 'EUR' }))).toBe('1 234,56 €')
  })

  it('affiche le signe à la demande', () => {
    const text = formatMoney(-4590, { locale: 'fr-FR', currency: 'EUR', signDisplay: 'exceptZero' })
    expect(plain(text)).toMatch(/^[-−]45,90 €$/)
  })

  it('propose une notation compacte pour les axes', () => {
    expect(plain(formatMoney(1_250_000, { locale: 'en-US', currency: 'USD', compact: true }))).toBe(
      '$12.5K',
    )
  })
})

describe('ratio & sum', () => {
  it('calcule une part et gère le total nul', () => {
    expect(ratio(25, 100)).toBe(0.25)
    expect(ratio(10, 0)).toBeNull()
  })

  it('additionne des centimes sans erreur flottante', () => {
    expect(sum([10, 20, 70])).toBe(100)
    expect(sum([])).toBe(0)
  })
})
