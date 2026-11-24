import { create } from 'zustand'
import { DEFAULT_SETTINGS, type Settings, type SettingsPatch } from '@shared/settings'
import { getApi } from '../lib/api'

interface SettingsState {
  settings: Settings
  ready: boolean
  /** Mise à jour optimiste ; le process main reste la source de vérité. */
  update: (patch: SettingsPatch) => Promise<void>
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  ready: false,
  update: async (patch) => {
    const previous = get().settings
    set({ settings: { ...previous, ...patch } })
    try {
      set({ settings: await getApi().settings.update(patch) })
    } catch (error) {
      set({ settings: previous })
      console.error('Mise à jour des préférences refusée', error)
    }
  },
}))

let unsubscribe: (() => void) | undefined

/** Charge les préférences depuis le process main et suit leurs changements. */
export async function initSettings(): Promise<void> {
  const api = getApi()
  const settings = await api.settings.get()
  useSettingsStore.setState({ settings, ready: true })
  unsubscribe?.()
  unsubscribe = api.settings.onChange((next) => useSettingsStore.setState({ settings: next }))
}
