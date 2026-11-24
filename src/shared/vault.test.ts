import { describe, expect, it } from 'vitest'
import {
  checkPassword,
  formatRecoveryCode,
  normalizeRecoveryCode,
  PASSWORD_MIN_LENGTH,
  RECOVERY_CODE_LENGTH,
} from './vault'

describe('checkPassword', () => {
  it('exige une longueur minimale, sans règle de composition', () => {
    expect(checkPassword('court')).toBe('too-short')
    expect(checkPassword('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe('too-short')
    expect(checkPassword('une phrase de passe')).toBeNull()
    expect(checkPassword('x'.repeat(2000))).toBe('too-long')
  })

  it('compte les caractères, pas les unités UTF-16', () => {
    // 10 émojis = 20 unités UTF-16, mais 10 caractères.
    expect(checkPassword('🔐'.repeat(10))).toBeNull()
    expect(checkPassword('🔐'.repeat(9))).toBe('too-short')
  })
})

describe('code de récupération', () => {
  const bytes = Uint8Array.from({ length: 20 }, (_, index) => (index * 37 + 11) & 0xff)

  it('produit 8 groupes de 4 caractères Crockford (160 bits)', () => {
    const code = formatRecoveryCode(bytes)
    expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/)
    expect(code.replace(/-/g, '')).toHaveLength(RECOVERY_CODE_LENGTH)
  })

  it('relit le code malgré la casse, les espaces et les lettres ambiguës', () => {
    const code = formatRecoveryCode(bytes)
    const canonical = code.replace(/-/g, '')
    expect(normalizeRecoveryCode(code)).toBe(canonical)
    expect(normalizeRecoveryCode(` ${code.toLowerCase().replace(/-/g, ' ')} `)).toBe(canonical)
    const withAmbiguous = canonical.replace(/1/g, 'l').replace(/0/g, 'o')
    expect(normalizeRecoveryCode(withAmbiguous)).toBe(canonical)
  })

  it('refuse une saisie de mauvaise longueur ou hors alphabet', () => {
    expect(normalizeRecoveryCode('ABCD-EFGH')).toBeNull()
    expect(normalizeRecoveryCode('U'.repeat(RECOVERY_CODE_LENGTH))).toBeNull()
  })

  it('refuse un aléa insuffisant', () => {
    expect(() => formatRecoveryCode(new Uint8Array(10))).toThrow()
  })
})
