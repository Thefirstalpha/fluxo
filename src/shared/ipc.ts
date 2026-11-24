import type { Settings, SettingsPatch } from './settings'

/**
 * Contrat IPC entre le renderer (non fiable) et le process main (fiable).
 * Chaque canal est validé côté main (émetteur + schéma d'entrée) — voir src/main/ipc/.
 */
export const IPC_CHANNELS = {
  settingsGet: 'fluxo:settings:get',
  settingsUpdate: 'fluxo:settings:update',
  settingsChanged: 'fluxo:settings:changed',
  appGetInfo: 'fluxo:app:get-info',
  appOpenExternal: 'fluxo:app:open-external',
} as const

/** Codes d'erreur renvoyés au renderer : jamais de message interne, de chemin ni de pile. */
export type IpcErrorCode = 'FORBIDDEN' | 'INVALID_INPUT' | 'INTERNAL_ERROR'

export interface AppInfo {
  name: string
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
  arch: string
  packaged: boolean
}

/** API exposée au renderer sous `window.fluxo` par le preload (contextBridge). */
export interface FluxoApi {
  readonly platform: string
  readonly settings: {
    get(): Promise<Settings>
    update(patch: SettingsPatch): Promise<Settings>
    /** Retourne une fonction de désabonnement. */
    onChange(listener: (settings: Settings) => void): () => void
  }
  readonly app: {
    getInfo(): Promise<AppInfo>
    /** Ouvre un lien HTTPS autorisé dans le navigateur système. `false` si refusé. */
    openExternal(url: string): Promise<boolean>
  }
}
