import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC_CHANNELS, type AppInfo, type FluxoApi } from '@shared/ipc'
import type { Settings } from '@shared/settings'
import type { RecoveryCodeResult, VaultResult, VaultStatus } from '@shared/vault'

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
    reportError: (report) =>
      ipcRenderer.invoke(IPC_CHANNELS.appReportError, report) as Promise<void>,
  },
  vault: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.vaultGetStatus) as Promise<VaultStatus>,
    onStatusChange: (listener) => {
      const handler = (_event: IpcRendererEvent, status: VaultStatus): void => listener(status)
      ipcRenderer.on(IPC_CHANNELS.vaultStatusChanged, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.vaultStatusChanged, handler)
      }
    },
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.vaultCreate, input) as Promise<VaultResult>,
    unlock: (input) => ipcRenderer.invoke(IPC_CHANNELS.vaultUnlock, input) as Promise<VaultResult>,
    lock: () => ipcRenderer.invoke(IPC_CHANNELS.vaultLock) as Promise<void>,
    changePassword: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.vaultChangePassword, input) as Promise<VaultResult>,
    enableSessionMode: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.vaultEnableSession, input) as Promise<VaultResult>,
    createRecoveryCode: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.vaultCreateRecovery, input) as Promise<RecoveryCodeResult>,
    removeRecoveryCode: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.vaultRemoveRecovery, input) as Promise<VaultResult>,
  },
}

contextBridge.exposeInMainWorld('fluxo', api)
