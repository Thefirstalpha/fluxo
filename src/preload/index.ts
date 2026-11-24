import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type {
  CsvProfile,
  ImportBatchSummary,
  ImportCommitResult,
  ImportPreviewOutcome,
  ParseInspectResult,
  StageImportFileResult,
} from '@shared/imports/model'
import { IPC_CHANNELS, type AppInfo, type FluxoApi } from '@shared/ipc'
import { LEDGER_METHODS, ledgerChannel, type LedgerClient } from '@shared/ledger/api'
import type { LedgerResult } from '@shared/ledger/model'
import type { Settings } from '@shared/settings'
import type {
  BackupInfo,
  BackupInfoResult,
  BackupNowResult,
  ExportResult,
  PickBackupResult,
  RecoveryCodeResult,
  RestorePreviewResult,
  VaultResult,
  VaultStatus,
} from '@shared/vault'

/**
 * Pont minimal et typé entre le renderer (sandboxé) et le process main.
 * Règles : pas d'accès générique à ipcRenderer, une fonction par besoin métier,
 * aucune API Node exposée. Toute entrée est revalidée côté main.
 */
/** Une fonction par méthode du registre, chacune liée à son propre canal (liste fermée). */
const ledger = Object.freeze(
  Object.fromEntries(
    LEDGER_METHODS.map((method) => [
      method,
      (input: unknown) => ipcRenderer.invoke(ledgerChannel(method), input),
    ]),
  ),
) as LedgerClient

const rawImports: FluxoApi['imports'] = {
  pickFile: () =>
    ipcRenderer.invoke(IPC_CHANNELS.importsPickFile) as Promise<StageImportFileResult>,
  registerDroppedFile: (file: File) => {
    const filePath = webUtils.getPathForFile(file)
    if (!filePath) return Promise.resolve({ ok: false as const, reason: 'invalid-file' as const })
    return ipcRenderer.invoke(
      IPC_CHANNELS.importsStagePath,
      filePath,
    ) as Promise<StageImportFileResult>
  },
  inspect: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.importsInspect, input) as Promise<ParseInspectResult>,
  preview: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.importsPreview, input) as Promise<ImportPreviewOutcome>,
  commit: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.importsCommit, input) as Promise<
      LedgerResult<ImportCommitResult>
    >,
  batchesList: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.importsBatchesList, input) as Promise<
      LedgerResult<ImportBatchSummary[]>
    >,
  revert: (batchId) =>
    ipcRenderer.invoke(IPC_CHANNELS.importsRevert, { batchId }) as Promise<
      LedgerResult<{ batchId: string; removedCount: number }>
    >,
  profilesList: () =>
    ipcRenderer.invoke(IPC_CHANNELS.importsProfilesList) as Promise<LedgerResult<CsvProfile[]>>,
  profileSave: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.importsProfileSave, input) as Promise<LedgerResult<CsvProfile>>,
  profileDelete: (id) =>
    ipcRenderer.invoke(IPC_CHANNELS.importsProfileDelete, { id }) as Promise<
      LedgerResult<{ deleted: true }>
    >,
}

const imports = Object.freeze(rawImports)

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
    backupNow: () => ipcRenderer.invoke(IPC_CHANNELS.vaultBackupNow) as Promise<BackupNowResult>,
    backupInfo: () => ipcRenderer.invoke(IPC_CHANNELS.vaultBackupInfo) as Promise<BackupInfo>,
    chooseBackupDirectory: () =>
      ipcRenderer.invoke(IPC_CHANNELS.vaultChooseBackupDirectory) as Promise<BackupInfoResult>,
    resetBackupDirectory: () =>
      ipcRenderer.invoke(IPC_CHANNELS.vaultResetBackupDirectory) as Promise<BackupInfoResult>,
    setAutoBackup: (enabled) =>
      ipcRenderer.invoke(IPC_CHANNELS.vaultSetAutoBackup, enabled) as Promise<BackupInfo>,
    pickBackup: () => ipcRenderer.invoke(IPC_CHANNELS.vaultPickBackup) as Promise<PickBackupResult>,
    previewRestore: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.vaultPreviewRestore, input) as Promise<RestorePreviewResult>,
    confirmRestore: (token) =>
      ipcRenderer.invoke(IPC_CHANNELS.vaultConfirmRestore, token) as Promise<VaultResult>,
    cancelRestore: () => ipcRenderer.invoke(IPC_CHANNELS.vaultCancelRestore) as Promise<void>,
    exportData: () => ipcRenderer.invoke(IPC_CHANNELS.vaultExport) as Promise<ExportResult>,
    eraseAll: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.vaultEraseAll, input) as Promise<VaultResult>,
    enterDemo: () => ipcRenderer.invoke(IPC_CHANNELS.vaultEnterDemo) as Promise<void>,
    exitDemo: () => ipcRenderer.invoke(IPC_CHANNELS.vaultExitDemo) as Promise<void>,
  },
  ledger,
  imports,
}

contextBridge.exposeInMainWorld('fluxo', api)
