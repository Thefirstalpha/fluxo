import type { Locale } from '@shared/settings'
import { useSettingsStore } from '../stores/settings'
import { en } from './en'
import { fr, type Dictionary } from './fr'

const DICTIONARIES: Readonly<Record<Locale, Dictionary>> = { 'fr-FR': fr, 'en-US': en }

export const LOCALE_LABELS: Readonly<Record<Locale, string>> = {
  'fr-FR': 'Français',
  'en-US': 'English',
}

export function dictionaryFor(locale: Locale): Dictionary {
  return DICTIONARIES[locale]
}

/** Dictionnaire de la langue active, typé : `t.nav.dashboard`, `t.dashboard.subtitle(mois)`. */
export function useT(): Dictionary {
  return dictionaryFor(useSettingsStore((state) => state.settings.locale))
}

export type { Dictionary }
