import { createHash } from 'node:crypto'
import { BrowserWindow, dialog } from 'electron'
import type { DialogLabels } from '@shared/i18n/dialogs'
import type {
  CsvProfile,
  CsvProfileConfig,
  ImportBatchSummary,
  ImportCommitInput,
  ImportCommitResult,
  ImportPreviewOutcome,
  ParseInspectResult,
  StageImportFileResult,
  StatementFormat,
} from '@shared/imports/model'
import type { LedgerResult } from '@shared/ledger/model'
import { detectFormat } from '../../imports/detect'
import type { DataServiceClient } from '../data/data-service'
import type { VaultManager } from '../vault/vault-manager'
import {
  readBoundedStatementBytes,
  StagedImportStore,
  validateStatementFilePath,
} from './file-guard'
import type { ImportParserHost } from './parser-host'

export class ImportManager {
  private readonly staged = new StagedImportStore()

  constructor(
    private readonly vault: VaultManager,
    private readonly service: DataServiceClient,
    private readonly parser: ImportParserHost,
    private readonly labels: () => DialogLabels,
  ) {
    vault.onStatusChange((status) => {
      if (status.state !== 'unlocked') this.staged.clear()
    })
  }

  async pickFile(): Promise<StageImportFileResult> {
    const l = this.labels()
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const options: Electron.OpenDialogOptions = {
      title: l.chooseStatementFile,
      properties: ['openFile'],
      filters: [
        {
          name: l.statementFilterAll,
          extensions: [
            'csv',
            'tsv',
            'txt',
            'ofx',
            'qfx',
            'qif',
            'xml',
            'camt',
            'mt940',
            'sta',
            '940',
          ],
        },
        { name: l.statementFilterCsv, extensions: ['csv', 'tsv', 'txt'] },
        { name: l.statementFilterOfx, extensions: ['ofx', 'qfx'] },
        { name: l.statementFilterQif, extensions: ['qif'] },
        { name: l.statementFilterCamt, extensions: ['xml', 'camt'] },
        { name: l.statementFilterMt940, extensions: ['mt940', 'sta', '940'] },
      ],
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) {
      return { ok: false, reason: 'cancelled' }
    }
    return this.stagePath(result.filePaths[0])
  }

  stagePath(rawPath: string): StageImportFileResult {
    const validated = validateStatementFilePath(rawPath)
    if (!validated.ok) return validated

    const bounded = readBoundedStatementBytes(validated.file.filePath)
    if (!bounded.ok) return bounded

    const detectedFormat = detectFormat(bounded.bytes.subarray(0, 8192), validated.file.fileName)
    const token = this.staged.stage(validated.file)
    return {
      ok: true,
      token,
      fileName: validated.file.fileName,
      extension: validated.file.extension,
      sizeBytes: validated.file.sizeBytes,
      detectedFormat,
    }
  }

  async inspect(input: {
    token: string
    csvConfig?: CsvProfileConfig
  }): Promise<ParseInspectResult> {
    const staged = this.staged.get(input.token)
    if (!staged) return { ok: false, reason: 'not-found' }

    const bounded = readBoundedStatementBytes(staged.filePath)
    if (!bounded.ok) return bounded

    return this.parser.inspect({
      fileName: staged.fileName,
      bytes: bounded.bytes,
      csvConfig: input.csvConfig,
    })
  }

  async preview(input: {
    token: string
    accountId: string
    csvConfig?: CsvProfileConfig
    profileName?: string | null
    forcedFormat?: StatementFormat
  }): Promise<ImportPreviewOutcome> {
    if ((await this.vault.status()).state !== 'unlocked') {
      return { ok: false, reason: 'vault-locked' }
    }

    const staged = this.staged.get(input.token)
    if (!staged) return { ok: false, reason: 'not-found' }

    const bounded = readBoundedStatementBytes(staged.filePath)
    if (!bounded.ok) return bounded

    const parsed = await this.parser.parse({
      fileName: staged.fileName,
      bytes: bounded.bytes,
      csvConfig: input.csvConfig,
      forcedFormat: input.forcedFormat,
    })
    if (!parsed.ok) return parsed

    const fileHash = createHash('sha256').update(bounded.bytes).digest('hex')
    const profileLabel =
      input.profileName ?? parsed.statement.csvInspection?.suggestedProfileId ?? null

    const res = await this.service.call('importPreview', {
      accountId: input.accountId,
      fileName: staged.fileName,
      fileHash,
      profile: profileLabel,
      statement: parsed.statement,
    })
    if (!res.ok) {
      return {
        ok: false,
        reason: res.error === 'valuation-account' ? 'valuation-account' : 'invalid-file',
      }
    }
    return { ok: true, preview: res.value }
  }

  commit(input: ImportCommitInput): Promise<LedgerResult<ImportCommitResult>> {
    return this.service.call('importCommit', input)
  }

  batchesList(input: {
    accountId?: string
    limit?: number
  }): Promise<LedgerResult<ImportBatchSummary[]>> {
    return this.service.call('importBatchesList', input)
  }

  revert(input: {
    batchId: string
  }): Promise<LedgerResult<{ batchId: string; removedCount: number }>> {
    return this.service.call('importRevert', input)
  }

  profilesList(): Promise<LedgerResult<CsvProfile[]>> {
    return this.service.call('csvProfilesList')
  }

  profileSave(input: {
    id?: string
    name: string
    bank: string | null
    config: CsvProfileConfig
  }): Promise<LedgerResult<CsvProfile>> {
    return this.service.call('csvProfileSave', input)
  }

  profileDelete(input: { id: string }): Promise<LedgerResult<{ deleted: true }>> {
    return this.service.call('csvProfileDelete', input)
  }
}
