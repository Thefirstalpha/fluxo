import { readFile, rename } from 'node:fs/promises'
import { DEFAULT_SETTINGS, type Settings } from '@shared/settings'
import { settingsFileSchema } from '@shared/settings-schema'
import { isMissingFileError, writeFileAtomic } from '../fs/atomic-write'

export type SettingsLoadStatus = 'loaded' | 'missing' | 'recovered'

export interface SettingsLoadResult {
  settings: Settings
  status: SettingsLoadStatus
}

/**
 * Lit le fichier de préférences. Un fichier illisible n'est jamais écrasé silencieusement :
 * il est renommé en `*.corrupt-<horodatage>` et les valeurs par défaut sont restaurées.
 */
export async function loadSettingsFile(filePath: string): Promise<SettingsLoadResult> {
  let raw: string
  try {
    raw = await readFile(filePath, 'utf8')
  } catch (error) {
    if (isMissingFileError(error)) return { settings: { ...DEFAULT_SETTINGS }, status: 'missing' }
    throw error
  }
  try {
    return { settings: settingsFileSchema.parse(JSON.parse(raw)), status: 'loaded' }
  } catch {
    await rename(filePath, `${filePath}.corrupt-${Date.now()}`).catch(() => undefined)
    return { settings: { ...DEFAULT_SETTINGS }, status: 'recovered' }
  }
}

/** Écriture atomique : fichier temporaire puis renommage (pas de fichier à moitié écrit). */
export async function saveSettingsFile(filePath: string, settings: Settings): Promise<void> {
  await writeFileAtomic(filePath, `${JSON.stringify(settings, null, 2)}\n`)
}
