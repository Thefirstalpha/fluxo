import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC_CHANNELS, type AppInfo, type FluxoApi } from '@shared/ipc'
import type { Settings } from '@shared/settings'

/**
 * Pont minimal et typé entre le renderer (sandboxé) et le process main.
 * Règles : pas d'accès générique à ipcRenderer, une fonction par besoin métier,
 * aucune API Node exposée. Toute entrée est revalidée côté main.
 */
const api: FluxoApi = {
  platform: process.platform,
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet) as Promise<Settings>,
    update: (patch) => ipcRenderer.invoke(IPC_CHANNELS.settingsUpdate, patch) as Promise<Settings>,
    onChange: (listener) => {
      const handler = (_event: IpcRendererEvent, settings: Settings): void => listener(settings)
      ipcRenderer.on(IPC_CHANNELS.settingsChanged, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.settingsChanged, handler)
      }
    },
  },
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.appGetInfo) as Promise<AppInfo>,
    openExternal: (url) =>
      ipcRenderer.invoke(IPC_CHANNELS.appOpenExternal, url) as Promise<boolean>,
  },
}

contextBridge.exposeInMainWorld('fluxo', api)
