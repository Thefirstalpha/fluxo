import type { LedgerClient } from './ledger/api'
import type { Settings, SettingsPatch } from './settings'
import type {
  BackupInfo,
  BackupInfoResult,
  BackupNowResult,
  ChangePasswordInput,
  CreateVaultInput,
  CurrentPasswordInput,
  ExportResult,
  PickBackupResult,
  RecoveryCodeResult,
  RestorePreviewResult,
  RestoreSecret,
  UnlockInput,
  VaultResult,
  VaultStatus,
} from './vault'

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
  appReportError: 'fluxo:app:report-error',
  vaultGetStatus: 'fluxo:vault:get-status',
  vaultStatusChanged: 'fluxo:vault:status-changed',
  vaultCreate: 'fluxo:vault:create',
  vaultUnlock: 'fluxo:vault:unlock',
  vaultLock: 'fluxo:vault:lock',
  vaultChangePassword: 'fluxo:vault:change-password',
  vaultEnableSession: 'fluxo:vault:enable-session',
  vaultCreateRecovery: 'fluxo:vault:create-recovery',
  vaultRemoveRecovery: 'fluxo:vault:remove-recovery',
  vaultBackupNow: 'fluxo:vault:backup-now',
  vaultBackupInfo: 'fluxo:vault:backup-info',
  vaultChooseBackupDirectory: 'fluxo:vault:choose-backup-directory',
  vaultResetBackupDirectory: 'fluxo:vault:reset-backup-directory',
  vaultSetAutoBackup: 'fluxo:vault:set-auto-backup',
  vaultPickBackup: 'fluxo:vault:pick-backup',
  vaultPreviewRestore: 'fluxo:vault:preview-restore',
  vaultConfirmRestore: 'fluxo:vault:confirm-restore',
  vaultCancelRestore: 'fluxo:vault:cancel-restore',
  vaultExport: 'fluxo:vault:export',
  vaultEraseAll: 'fluxo:vault:erase-all',
  vaultEnterDemo: 'fluxo:vault:enter-demo',
  vaultExitDemo: 'fluxo:vault:exit-demo',
} as const

/** Origine d'une erreur du renderer remontée au journal local. */
export const ERROR_SOURCES = ['render', 'window', 'promise', 'bootstrap'] as const
export type ErrorSource = (typeof ERROR_SOURCES)[number]

/** Bornes d'un rapport d'erreur : un renderer compromis ne peut pas saturer le journal. */
export const ERROR_REPORT_LIMITS = {
  message: 1_000,
  stack: 8_000,
  perMinute: 20,
} as const

/** Rapport d'erreur du renderer : expurgé par le journal (IBAN, e-mails, chemins…) avant écriture. */
export interface RendererErrorReport {
  source: ErrorSource
  message: string
  stack?: string
  componentStack?: string
}

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
    /** Consigne une erreur de l'interface dans le journal local (jamais envoyée en ligne). */
    reportError(report: RendererErrorReport): Promise<void>
  }
  /** Coffre chiffré : le renderer ne voit jamais la clé, seulement l'état et le résultat des actions. */
  readonly vault: {
    getStatus(): Promise<VaultStatus>
    onStatusChange(listener: (status: VaultStatus) => void): () => void
    create(input: CreateVaultInput): Promise<VaultResult>
    unlock(input: UnlockInput): Promise<VaultResult>
    lock(): Promise<void>
    changePassword(input: ChangePasswordInput): Promise<VaultResult>
    enableSessionMode(input: CurrentPasswordInput): Promise<VaultResult>
    createRecoveryCode(input: CurrentPasswordInput): Promise<RecoveryCodeResult>
    removeRecoveryCode(input: CurrentPasswordInput): Promise<VaultResult>
    backupNow(): Promise<BackupNowResult>
    backupInfo(): Promise<BackupInfo>
    /** Ouvre une boîte de dialogue du système : le renderer ne fournit jamais de chemin. */
    chooseBackupDirectory(): Promise<BackupInfoResult>
    resetBackupDirectory(): Promise<BackupInfoResult>
    setAutoBackup(enabled: boolean): Promise<BackupInfo>
    /** Boîte de dialogue, puis lecture du manifeste ; la sauvegarde est désignée par un jeton. */
    pickBackup(): Promise<PickBackupResult>
    previewRestore(input: { token: string; secret?: RestoreSecret }): Promise<RestorePreviewResult>
    confirmRestore(token: string): Promise<VaultResult>
    cancelRestore(): Promise<void>
    /** Export en clair (JSON, CSV) dans un dossier choisi par boîte de dialogue. */
    exportData(): Promise<ExportResult>
    eraseAll(input: CurrentPasswordInput): Promise<VaultResult>
    /** Coffre de démonstration séparé (données fictives, supprimé à la sortie). */
    enterDemo(): Promise<void>
    exitDemo(): Promise<void>
  }
  /** Registre (comptes, opérations, catégories…) : une fonction par méthode, entrée validée. */
  readonly ledger: LedgerClient
}
