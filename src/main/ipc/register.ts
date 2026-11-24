import { app, shell } from 'electron'
import { z } from 'zod'
import { EXTERNAL_LINK_HOSTS } from '@shared/app-meta'
import { ERROR_REPORT_LIMITS, IPC_CHANNELS, type AppInfo } from '@shared/ipc'
import { settingsPatchSchema } from '@shared/settings-schema'
import { logger } from '../logger'
import { isAllowedExternalUrl } from '../security/url'
import type { SettingsStore } from '../settings/settings-store'
import type { VaultManager } from '../vault/vault-manager'
import { createHandleFactory, type TrustedSenderCheck } from './handle'
import { createRateLimiter } from './rate-limit'
import {
  changePasswordSchema,
  createVaultSchema,
  currentPasswordSchema,
  errorReportSchema,
  unlockSchema,
} from './schemas'

interface IpcDependencies {
  settings: SettingsStore
  vault: VaultManager
  isTrustedSender: TrustedSenderCheck
}

const noInput = z.undefined()

export function registerIpcHandlers({ settings, vault, isTrustedSender }: IpcDependencies): void {
  const handle = createHandleFactory(isTrustedSender)

  handle(IPC_CHANNELS.settingsGet, noInput, () => settings.get())

  handle(IPC_CHANNELS.settingsUpdate, settingsPatchSchema, (patch) => settings.update(patch))

  handle(IPC_CHANNELS.appGetInfo, noInput, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    packaged: app.isPackaged,
  }))

  handle(IPC_CHANNELS.appOpenExternal, z.string().max(2048), async (url) => {
    if (!isAllowedExternalUrl(url, EXTERNAL_LINK_HOSTS)) return false
    await shell.openExternal(url)
    return true
  })

  // Erreurs de l'interface → journal local (expurgé par le logger), débit borné.
  const allowErrorReport = createRateLimiter(ERROR_REPORT_LIMITS.perMinute, 60_000)
  handle(IPC_CHANNELS.appReportError, errorReportSchema, (report) => {
    if (!allowErrorReport()) return
    const details = [report.stack, report.componentStack].filter(Boolean).join('\n')
    logger.error(`Erreur de l’interface (${report.source}) : ${report.message}\n${details}`)
  })

  // Coffre : les secrets saisis transitent vers le service de données, jamais vers le journal.
  handle(IPC_CHANNELS.vaultGetStatus, noInput, () => vault.status())
  handle(IPC_CHANNELS.vaultCreate, createVaultSchema, (input) => vault.create(input))
  handle(IPC_CHANNELS.vaultUnlock, unlockSchema, (input) => vault.unlock(input))
  handle(IPC_CHANNELS.vaultLock, noInput, () => vault.lock('demande de l’utilisateur'))
  handle(IPC_CHANNELS.vaultChangePassword, changePasswordSchema, (input) =>
    vault.changePassword(input),
  )
  handle(IPC_CHANNELS.vaultEnableSession, currentPasswordSchema, (input) =>
    vault.enableSessionMode(input),
  )
  handle(IPC_CHANNELS.vaultCreateRecovery, currentPasswordSchema, (input) =>
    vault.createRecoveryCode(input),
  )
  handle(IPC_CHANNELS.vaultRemoveRecovery, currentPasswordSchema, (input) =>
    vault.removeRecoveryCode(input),
  )
}
