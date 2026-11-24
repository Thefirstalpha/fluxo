import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './settings'
import { settingsFileSchema, settingsPatchSchema } from './settings-schema'

describe('settingsFileSchema (lecture tolérante)', () => {
  it('complète un fichier vide avec les valeurs par défaut', () => {
    expect(settingsFileSchema.parse({})).toEqual(DEFAULT_SETTINGS)
  })

  it('remplace une valeur invalide sans perdre les autres', () => {
    const parsed = settingsFileSchema.parse({ theme: 'neon', locale: 'en-US', hideAmounts: 'yes' })
    expect(parsed).toEqual({ ...DEFAULT_SETTINGS, locale: 'en-US' })
  })

  it('ignore les clés inconnues', () => {
    expect(settingsFileSchema.parse({ theme: 'dark', injected: true })).not.toHaveProperty(
      'injected',
    )
  })
})

describe('settingsPatchSchema (entrée du renderer, stricte)', () => {
  it('accepte une mise à jour partielle valide', () => {
    expect(settingsPatchSchema.parse({ theme: 'dark' })).toEqual({ theme: 'dark' })
  })

  it.each([
    [{ theme: 'neon' }],
    [{ hideAmounts: 'true' }],
    [{ schemaVersion: 2 }],
    [{ __proto__: { polluted: true }, theme: 'light', extra: 1 }],
    ['dark'],
    [null],
  ])('rejette %j', (payload) => {
    expect(settingsPatchSchema.safeParse(payload).success).toBe(false)
  })
})
