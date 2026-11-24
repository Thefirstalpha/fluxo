/**
 * Contrat du service de données (process utilitaire) vu par le process main.
 * Chaque méthode est validée côté service par un schéma (voir `methods.ts`).
 * Ce module ne contient que des types : il est importé par le main et par le service.
 */
import type {
  BackupInfo,
  BackupNowResult,
  ChangePasswordInput,
  CurrentPasswordInput,
  ExportResult,
  PickBackupResult,
  RecoveryCodeResult,
  RestorePreviewResult,
  RestoreSecret,
  VaultFailure,
  VaultMode,
  VaultResult,
  VaultState,
} from '@shared/vault'

export interface ServiceStatus {
  state: VaultState
  mode: VaultMode | null
  hasRecoveryCode: boolean
  retryAfterMs: number
  needsNewPassword: boolean
}

/** Création : en mode session, la clé est tirée et enveloppée par le main (`safeStorage`). */
export type CreateParams =
  { mode: 'session'; key: Uint8Array; sessionBlob: string } | { mode: 'password'; password: string }

export type UnlockParams =
  | { method: 'key'; key: Uint8Array }
  | { method: 'password'; password: string }
  | { method: 'recovery'; code: string }

export type UnlockOutcome = { ok: true; viaRecovery: boolean } | VaultFailure

/** Copie de la clé remise au main pour l'envelopper par `safeStorage` (passage en mode session). */
export type ExportKeyOutcome = { ok: true; key: Uint8Array } | VaultFailure

export interface DataServiceApi {
  status(): ServiceStatus
  /** Enveloppe `safeStorage` du mode session (`null` en mode mot de passe). */
  sessionBlob(): Promise<string | null>
  create(params: CreateParams): Promise<ServiceStatus>
  unlock(params: UnlockParams): Promise<UnlockOutcome>
  lock(): ServiceStatus
  changePassword(params: ChangePasswordInput): Promise<VaultResult>
  exportKeyForSession(params: CurrentPasswordInput): Promise<ExportKeyOutcome>
  /** Doit suivre `exportKeyForSession` : enregistre l'enveloppe et retire le mot de passe. */
  setSessionMode(params: { sessionBlob: string }): Promise<VaultResult>
  createRecoveryCode(params: CurrentPasswordInput): Promise<RecoveryCodeResult>
  removeRecoveryCode(params: CurrentPasswordInput): Promise<VaultResult>
  backupNow(): Promise<BackupNowResult>
  /** Sauvegarde automatique si la dernière a plus de 24 h ; `true` si une sauvegarde a été faite. */
  autoBackupIfDue(): Promise<boolean>
  backupInfo(): Promise<BackupInfo>
  /** `null` : dossier par défaut. Le chemin vient d'une boîte de dialogue du main. */
  setBackupDirectory(params: { directory: string | null }): Promise<BackupInfo>
  setAutoBackup(params: { enabled: boolean }): Promise<BackupInfo>
  inspectBackup(params: { file: string }): Promise<PickBackupResult>
  previewRestore(params: { token: string; secret?: RestoreSecret }): Promise<RestorePreviewResult>
  confirmRestore(params: { token: string }): Promise<VaultResult>
  cancelRestore(): void
  exportData(params: { directory: string }): ExportResult
  eraseAll(params: CurrentPasswordInput): Promise<VaultResult>
}

export type DataServiceMethod = keyof DataServiceApi
export type MethodParams<M extends DataServiceMethod> = Parameters<DataServiceApi[M]>[0]
export type MethodResult<M extends DataServiceMethod> = Awaited<ReturnType<DataServiceApi[M]>>

/** Message d'initialisation envoyé par le main avec le port de communication. */
export interface ServiceInit {
  kind: 'init'
  /** Dossier du coffre (base, enveloppe de clé, sauvegardes par défaut). */
  vaultDirectory: string
  appVersion: string
}
