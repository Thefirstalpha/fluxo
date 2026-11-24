import type { Locale } from '@shared/settings'
import { useSettingsStore } from '../stores/settings'
import type { Dictionary } from './fr'

const LOADED: Partial<Record<Locale, Dictionary>> = {}

export const LOCALE_LABELS: Readonly<Record<Locale, string>> = {
  'fr-FR': 'Français',
  'en-US': 'English',
}

/** Charge le dictionnaire de la langue demandée à la demande (évite d'alourdir le JS initial). */
export async function loadLocale(locale: Locale): Promise<Dictionary> {
  const existing = LOADED[locale]
  if (existing) return existing
  const loaded = locale === 'en-US' ? (await import('./en')).en : (await import('./fr')).fr
  LOADED[locale] = loaded
  return loaded
}

export function loadedDictionary(locale: Locale): Dictionary | undefined {
  return LOADED[locale] ?? LOADED['fr-FR'] ?? LOADED['en-US']
}

export function dictionaryFor(locale: Locale): Dictionary {
  const dict = loadedDictionary(locale)
  if (!dict) throw new Error(`Dictionnaire non chargé pour ${locale}.`)
  return dict
}

/** Dictionnaire de la langue active, typé : `t.nav.dashboard`, `t.dashboard.subtitle(mois)`. */
export function useT(): Dictionary {
  return dictionaryFor(useSettingsStore((state) => state.settings.locale))
}

export type { Dictionary }
