/**
 * Préférences utilisateur. Ce module ne contient que des constantes et des types :
 * il peut être importé par le renderer sans embarquer de bibliothèque de validation.
 * La validation (zod) vit dans settings-schema.ts, utilisé par le process main.
 */

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const
export type ThemePreference = (typeof THEME_PREFERENCES)[number]
export type ResolvedTheme = 'light' | 'dark'

export const LOCALES = ['fr-FR', 'en-US'] as const
export type Locale = (typeof LOCALES)[number]

/** Devise de référence pour l'affichage des synthèses (les transactions gardent leur devise). */
export const CURRENCIES = ['EUR', 'CHF', 'USD', 'GBP', 'CAD'] as const
export type Currency = (typeof CURRENCIES)[number]

export interface Settings {
  schemaVersion: 1
  theme: ThemePreference
  locale: Locale
  currency: Currency
  /** Masque tous les montants à l'écran (partage d'écran, lieu public). */
  hideAmounts: boolean
  /** Exclut la fenêtre des captures et partages d'écran (Windows, macOS). */
  contentProtection: boolean
}

export type SettingsPatch = Partial<Omit<Settings, 'schemaVersion'>>

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  schemaVersion: 1,
  theme: 'system',
  locale: 'fr-FR',
  currency: 'EUR',
  hideAmounts: false,
  contentProtection: false,
})
