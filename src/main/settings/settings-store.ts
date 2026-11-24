import type { Settings, SettingsPatch } from '@shared/settings'
import { settingsFileSchema } from '@shared/settings-schema'
import { logger } from '../logger'
import { loadSettingsFile, saveSettingsFile } from './settings-file'

type Listener = (settings: Settings) => void

/** Source de vérité des préférences, côté process main. Les écritures sont sérialisées. */
export class SettingsStore {
  private current: Settings
  private readonly listeners = new Set<Listener>()
  private pendingWrite: Promise<void> = Promise.resolve()

  private constructor(
    private readonly filePath: string,
    initial: Settings,
  ) {
    this.current = initial
  }

  static async open(filePath: string): Promise<SettingsStore> {
    const { settings, status } = await loadSettingsFile(filePath)
    if (status === 'recovered') {
      logger.warn('Préférences illisibles : fichier mis de côté, valeurs par défaut restaurées.')
    }
    return new SettingsStore(filePath, settings)
  }

  get(): Settings {
    return this.current
  }

  async update(patch: SettingsPatch): Promise<Settings> {
    const defined = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    )
    const next = settingsFileSchema.parse({ ...this.current, ...defined })
    this.current = next
    for (const listener of this.listeners) listener(next)

    const write = this.pendingWrite.then(() => saveSettingsFile(this.filePath, next))
    this.pendingWrite = write.catch((error: unknown) => {
      logger.error('Échec d’écriture des préférences', error)
    })
    await write
    return next
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}
