import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { DEFAULT_SETTINGS, type Settings } from '@shared/settings'
import { settingsFileSchema } from '@shared/settings-schema'

export type SettingsLoadStatus = 'loaded' | 'missing' | 'recovered'

export interface SettingsLoadResult {
  settings: Settings
  status: SettingsLoadStatus
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
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
    if (isMissingFile(error)) return { settings: { ...DEFAULT_SETTINGS }, status: 'missing' }
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
  await mkdir(dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp`
  await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })
  await rename(temporary, filePath)
}
