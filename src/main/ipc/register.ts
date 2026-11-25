import { app, shell } from 'electron'
import { z } from 'zod'
import {
  exportAnalyticsCsvSchema,
  exportAnalyticsImageSchema,
  exportAnalyticsPdfSchema,
} from '@shared/analytics/schemas'
import {
  aiConfigPatchSchema,
  aiExecuteAssistSchema,
  aiExecuteCategorizeSchema,
  aiPreviewAssistSchema,
  aiPreviewCategorizeSchema,
  anthropicApiKeySchema,
  documentCommitPayslipBatchSchema,
  documentCommitPayslipSchema,
  documentCommitStatementSchema,
  documentIdSchema,
  documentRunExtractionSchema,
  documentUpdateDraftSchema,
  ocrLanguageSchema,
} from '@shared/documents/schemas'
import { EXTERNAL_LINK_HOSTS } from '@shared/app-meta'
import { DIALOG_LABELS } from '@shared/i18n/dialogs'
import { ERROR_REPORT_LIMITS, IPC_CHANNELS, type AppInfo } from '@shared/ipc'
import { LEDGER_METHODS, ledgerChannel } from '@shared/ledger/api'
import {
  csvProfileDeleteSchema,
  csvProfileSaveSchema,
  importBatchesListSchema,
  importCommitSchema,
  importInspectSchema,
  importParseRequestSchema,
  importRevertSchema,
} from '@shared/imports/schemas'
import { LEDGER_INPUTS } from '@shared/ledger/schemas'
import { settingsPatchSchema } from '@shared/settings-schema'
import {
  exportAnalyticsCsv,
  exportAnalyticsImage,
  exportMonthlyPdfReport,
} from '../analytics/export'
import type { DocumentManager } from '../documents/document-manager'
import type { ImportManager } from '../imports/import-manager'
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
  previewRestoreSchema,
  restoreTokenSchema,
  unlockSchema,
} from './schemas'

interface IpcDependencies {
  settings: SettingsStore
  vault: VaultManager
  imports: ImportManager
  documents: DocumentManager
  isTrustedSender: TrustedSenderCheck
}

const noInput = z.undefined()

export function registerIpcHandlers({
  settings,
  vault,
  imports,
  documents,
  isTrustedSender,
}: IpcDependencies): void {
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
  handle(IPC_CHANNELS.vaultCreate, createVaultSchema, (input) =>
    vault.create(input, settings.get().locale),
  )
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

  // Sauvegardes, restauration, export, effacement : les chemins viennent des boîtes de dialogue.
  handle(IPC_CHANNELS.vaultBackupNow, noInput, () => vault.backupNow())
  handle(IPC_CHANNELS.vaultBackupInfo, noInput, () => vault.backupInfo())
  handle(IPC_CHANNELS.vaultChooseBackupDirectory, noInput, () => vault.chooseBackupDirectory())
  handle(IPC_CHANNELS.vaultResetBackupDirectory, noInput, () => vault.resetBackupDirectory())
  handle(IPC_CHANNELS.vaultSetAutoBackup, z.boolean(), (enabled) => vault.setAutoBackup(enabled))
  handle(IPC_CHANNELS.vaultPickBackup, noInput, () => vault.pickBackup())
  handle(IPC_CHANNELS.vaultPreviewRestore, previewRestoreSchema, (input) =>
    vault.previewRestore(input),
  )
  handle(IPC_CHANNELS.vaultConfirmRestore, restoreTokenSchema, (token) =>
    vault.confirmRestore(token),
  )
  handle(IPC_CHANNELS.vaultCancelRestore, noInput, () => vault.cancelRestore())
  handle(IPC_CHANNELS.vaultExport, noInput, () => vault.exportData())
  handle(IPC_CHANNELS.vaultEraseAll, currentPasswordSchema, (input) => vault.eraseAll(input))

  // Registre : un canal par méthode, chacun avec le schéma d'entrée de sa méthode.
  for (const method of LEDGER_METHODS) {
    handle(ledgerChannel(method), LEDGER_INPUTS[method], (input) => vault.ledger(method, input))
  }

  // Démonstration : coffre séparé, libellés dans la langue de l'interface.
  handle(IPC_CHANNELS.vaultEnterDemo, noInput, () => vault.enterDemo(settings.get().locale))
  handle(IPC_CHANNELS.vaultExitDemo, noInput, () => vault.exitDemo())

  // Import de relevés : boîtes de dialogue et analyseur isolé.
  handle(IPC_CHANNELS.importsPickFile, noInput, () => imports.pickFile())
  handle(IPC_CHANNELS.importsStagePath, z.string().min(1).max(4096), (path) =>
    imports.stagePath(path),
  )
  handle(IPC_CHANNELS.importsInspect, importInspectSchema, (input) => imports.inspect(input))
  handle(IPC_CHANNELS.importsPreview, importParseRequestSchema, (input) => imports.preview(input))
  handle(IPC_CHANNELS.importsCommit, importCommitSchema, (input) => imports.commit(input))
  handle(IPC_CHANNELS.importsBatchesList, importBatchesListSchema, (input) =>
    imports.batchesList(input),
  )
  handle(IPC_CHANNELS.importsRevert, importRevertSchema, (input) => imports.revert(input))
  handle(IPC_CHANNELS.importsProfilesList, noInput, () => imports.profilesList())
  handle(IPC_CHANNELS.importsProfileSave, csvProfileSaveSchema, (input) =>
    imports.profileSave(input),
  )
  handle(IPC_CHANNELS.importsProfileDelete, csvProfileDeleteSchema, (input) =>
    imports.profileDelete(input),
  )

  // Analyses (M5) : exports CSV filtré, images PNG/SVG et rapport PDF via boîte de dialogue.
  const labels = () => DIALOG_LABELS[settings.get().locale]
  handle(IPC_CHANNELS.analyticsExportCsv, exportAnalyticsCsvSchema, (input) =>
    exportAnalyticsCsv(vault, input.filter, labels()),
  )
  handle(IPC_CHANNELS.analyticsExportImage, exportAnalyticsImageSchema, (input) =>
    exportAnalyticsImage(input, labels()),
  )
  handle(IPC_CHANNELS.analyticsExportMonthlyPdf, exportAnalyticsPdfSchema, (input) =>
    exportMonthlyPdfReport(vault, input.filter, settings.get(), labels()),
  )

  // Documents, OCR local et passage IA anonymisé (M7).
  handle(IPC_CHANNELS.documentsPickFile, noInput, () => documents.pickFile())
  handle(IPC_CHANNELS.documentsPickFiles, noInput, () => documents.pickFiles())
  handle(IPC_CHANNELS.documentsStagePath, z.string().min(1).max(4096), (path) =>
    documents.stagePath(path),
  )
  handle(IPC_CHANNELS.documentsRerunExtraction, documentRunExtractionSchema, (input) =>
    documents.rerunExtraction(input),
  )
  handle(IPC_CHANNELS.documentsList, noInput, () => documents.list())
  handle(IPC_CHANNELS.documentsGet, documentIdSchema, (input) => documents.get(input.documentId))
  handle(IPC_CHANNELS.documentsUpdateDraft, documentUpdateDraftSchema, (input) =>
    documents.updateDraft(input),
  )
  handle(IPC_CHANNELS.documentsExportOriginal, documentIdSchema, (input) =>
    documents.exportOriginal(input.documentId),
  )
  handle(IPC_CHANNELS.documentsCommitPayslip, documentCommitPayslipSchema, (input) =>
    documents.commitPayslip(input),
  )
  handle(IPC_CHANNELS.documentsCommitPayslipBatch, documentCommitPayslipBatchSchema, (input) =>
    documents.commitPayslipBatch(input.documentIds),
  )
  handle(IPC_CHANNELS.documentsCommitStatement, documentCommitStatementSchema, (input) =>
    documents.commitStatement(input),
  )
  handle(IPC_CHANNELS.documentsReject, documentIdSchema, (input) =>
    documents.reject(input.documentId),
  )
  handle(IPC_CHANNELS.documentsDelete, documentIdSchema, (input) =>
    documents.delete(input.documentId),
  )
  handle(IPC_CHANNELS.documentsAiConfigGet, noInput, () => documents.aiConfig())
  handle(IPC_CHANNELS.documentsAiConfigUpdate, aiConfigPatchSchema, (patch) =>
    documents.aiUpdateConfig(patch),
  )
  handle(IPC_CHANNELS.documentsAiSetKey, anthropicApiKeySchema, (input) =>
    documents.aiSetApiKey(input.apiKey),
  )
  handle(IPC_CHANNELS.documentsAiClearKey, noInput, () => documents.aiClearApiKey())
  handle(IPC_CHANNELS.documentsAiSendLogs, noInput, () => documents.aiSendLogList())
  handle(IPC_CHANNELS.documentsOcrDownload, ocrLanguageSchema, (input) =>
    documents.downloadOcrLanguage(input.language),
  )
  handle(IPC_CHANNELS.documentsOcrRemove, ocrLanguageSchema, (input) =>
    documents.removeOcrLanguage(input.language),
  )
  handle(IPC_CHANNELS.documentsAiPreviewAssist, aiPreviewAssistSchema, (input) =>
    documents.aiPreviewAssist(input.documentId),
  )
  handle(IPC_CHANNELS.documentsAiExecuteAssist, aiExecuteAssistSchema, (input) =>
    documents.aiExecuteAssist(input),
  )
  handle(IPC_CHANNELS.documentsAiPreviewCategorize, aiPreviewCategorizeSchema, (input) =>
    documents.aiPreviewCategorize(input.transactionIds),
  )
  handle(IPC_CHANNELS.documentsAiExecuteCategorize, aiExecuteCategorizeSchema, (input) =>
    documents.aiExecuteCategorize(input),
  )
}
