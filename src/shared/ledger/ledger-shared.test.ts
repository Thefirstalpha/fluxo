import { describe, expect, it } from 'vitest'
import { LOCALES } from '../settings'
import { LEDGER_METHODS } from './api'
import { CATEGORY_PACK_FR } from './category-pack'
import { formatIban, isValidIban, maskIban, normalizeIban } from './iban'
import { allowedTrackingModes, DEFAULT_TRACKING_MODE } from './model'
import { LEDGER_INPUTS } from './schemas'

describe('IBAN', () => {
  it('normalise, contrôle la clé et masque', () => {
    const iban = normalizeIban('fr76 3000-6000 0112 3456 7890 189')
    expect(iban).toBe('FR7630006000011234567890189')
    expect(isValidIban(iban)).toBe(true)
    expect(isValidIban('FR7630006000011234567890188')).toBe(false)
    expect(isValidIban('GB82WEST12345698765432')).toBe(true)
    expect(isValidIban('FR76')).toBe(false)
    expect(maskIban(iban)).toBe('FR76 •••• •••• 0189')
    expect(formatIban(iban)).toBe('FR76 3000 6000 0112 3456 7890 189')
  })
})

describe('pack de catégories France', () => {
  it('a des clés uniques, deux niveaux et un libellé dans chaque langue', () => {
    const keys = CATEGORY_PACK_FR.flatMap((c) => [c.key, ...c.children.map((child) => child.key)])
    expect(new Set(keys).size).toBe(keys.length)
    for (const category of CATEGORY_PACK_FR) {
      for (const locale of LOCALES) {
        expect(category.names[locale].length).toBeGreaterThan(0)
        for (const child of category.children) expect(child.names[locale].length).toBeGreaterThan(0)
      }
      expect(category.children.every((child) => child.key.startsWith(`${category.key}.`))).toBe(
        true,
      )
    }
    const kinds = new Set(CATEGORY_PACK_FR.map((c) => c.kind))
    expect(kinds).toEqual(new Set(['income', 'expense', 'savings', 'transfer']))
  })

  it('a des noms uniques par niveau (sans distinction de casse)', () => {
    for (const locale of LOCALES) {
      const names = CATEGORY_PACK_FR.map((c) => c.names[locale].toLowerCase())
      expect(new Set(names).size).toBe(names.length)
    }
  })
})

describe('modes de suivi', () => {
  it('propose un mode par défaut permis pour chaque type', () => {
    for (const [type, mode] of Object.entries(DEFAULT_TRACKING_MODE)) {
      expect(allowedTrackingModes(type as keyof typeof DEFAULT_TRACKING_MODE)).toContain(mode)
    }
    expect(allowedTrackingModes('loan')).toEqual(['valuation'])
  })
})

describe('contrat du registre', () => {
  it('a un schéma d’entrée pour chaque méthode, et réciproquement', () => {
    expect(Object.keys(LEDGER_INPUTS).sort()).toEqual([...LEDGER_METHODS].sort())
  })
})
