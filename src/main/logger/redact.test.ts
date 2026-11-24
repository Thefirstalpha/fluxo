import { describe, expect, it } from 'vitest'
import { redact } from './redact'

describe('redact', () => {
  it('masque les IBAN, compacts ou espacés', () => {
    expect(redact('virement FR7630006000011234567890189 reçu')).toBe('virement [iban] reçu')
    expect(redact('IBAN FR76 3000 6000 0112 3456 7890 189')).toBe('IBAN [iban]')
    expect(redact('CH93 0076 2011 6238 5295 7')).toBe('[iban]')
  })

  it('masque les numéros de sécurité sociale français', () => {
    expect(redact('NIR 1 85 05 78 006 084 36')).toBe('NIR [nir]')
    expect(redact('n° 285052A00608436')).toBe('n° [nir]')
  })

  it('masque les e-mails et les numéros de carte', () => {
    expect(redact('contact jane.doe+bank@example.fr')).toBe('contact [email]')
    expect(redact('carte 4111 1111 1111 1111')).toBe('carte [numéro]')
  })

  it('remplace le dossier personnel (qui contient souvent le nom)', () => {
    expect(
      redact('C:\\Users\\jdupont\\AppData\\fluxo.log', { homeDir: 'C:\\Users\\jdupont' }),
    ).toBe('~\\AppData\\fluxo.log')
  })

  it('laisse intacts les messages ordinaires', () => {
    expect(redact('Fluxo 0.1.0 démarré (win32/x64), 12 fenêtres')).toBe(
      'Fluxo 0.1.0 démarré (win32/x64), 12 fenêtres',
    )
  })
})
