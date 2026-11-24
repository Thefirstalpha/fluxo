import { z } from 'zod'
import {
  CURRENCIES,
  DEFAULT_SETTINGS,
  LOCALES,
  THEME_PREFERENCES,
  type Settings,
  type SettingsPatch,
} from './settings'

/**
 * Lecture du fichier de préférences : tolérante. Une valeur absente ou invalide
 * retombe sur sa valeur par défaut au lieu de faire échouer le démarrage.
 */
export const settingsFileSchema = z.object({
  schemaVersion: z.literal(1).catch(1),
  theme: z.enum(THEME_PREFERENCES).catch(DEFAULT_SETTINGS.theme),
  locale: z.enum(LOCALES).catch(DEFAULT_SETTINGS.locale),
  currency: z.enum(CURRENCIES).catch(DEFAULT_SETTINGS.currency),
  hideAmounts: z.boolean().catch(DEFAULT_SETTINGS.hideAmounts),
  contentProtection: z.boolean().catch(DEFAULT_SETTINGS.contentProtection),
}) satisfies z.ZodType<Settings>

/**
 * Mise à jour demandée par le renderer : stricte. Clé inconnue ou type invalide → rejet.
 * (Le renderer est considéré comme non fiable : il ne fait que proposer.)
 */
export const settingsPatchSchema = z.strictObject({
  theme: z.enum(THEME_PREFERENCES).optional(),
  locale: z.enum(LOCALES).optional(),
  currency: z.enum(CURRENCIES).optional(),
  hideAmounts: z.boolean().optional(),
  contentProtection: z.boolean().optional(),
}) satisfies z.ZodType<SettingsPatch>
