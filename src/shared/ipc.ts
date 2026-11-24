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
  appReportError: 'fluxo:app:report-error',
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
}
