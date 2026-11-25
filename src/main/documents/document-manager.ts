import { writeFileSync } from 'node:fs'
import { BrowserWindow, dialog } from 'electron'
import { anonymizeTransactionsForCategorization } from '@shared/documents/anonymize'
import { classifyDocument } from '@shared/documents/classify'
import type {
  AiAssistOutcome,
  AiCategorizeApplyOutcome,
  AiConfigPatch,
  AiConfigPublic,
  AiSendLogEntry,
  AiSendPreview,
  DocumentBatchPayslipCommitOutcome,
  DocumentCommitOutcome,
  DocumentCommitPayslipInput,
  DocumentCommitStatementInput,
  DocumentDetail,
  DocumentExtractionMethod,
  DocumentKind,
  DocumentListItem,
  DocumentStageOutcome,
  ExtractedDocumentDraft,
  ExtractedPage,
  ExtractedPayslipDraft,
  ExtractedStatementDraft,
  OcrDownloadOutcome,
  OcrLanguage,
  OcrLanguageStatus,
  DocumentOriginalExportOutcome,
} from '@shared/documents/model'
import {
  aiCategorizationStructuredOutputSchema,
  aiPayslipStructuredOutputSchema,
  aiStatementStructuredOutputSchema,
} from '@shared/documents/schemas'
import {
  extractFrenchPayslip,
  extractOtherDocument,
  extractPdfBankStatement,
} from '@shared/documents/templates'
import type { DialogLabels } from '@shared/i18n/dialogs'
import type { ParsedStatement } from '@shared/imports/model'
import { checkPayslipDetailed, type PayslipSourceOrigin } from '@shared/payslip'
import type { DataServiceClient } from '../data/data-service'
import type { VaultManager } from '../vault/vault-manager'
import type { AiConfigStore } from './ai/config-store'
import { AiGateway } from './ai/gateway'
import {
  resolveOrUpdateContractForPayslip,
  type ContractResolutionResult,
} from './contract-resolver'
import type { AiSecretStore } from './ai/secrets'
import { readBoundedDocumentFile, StagedOriginalBytesStore } from './file-guard'
import type { OcrModelManager } from './model-manager'
import type { DocumentParserHost } from './parser-host'

interface CategorizationPreviewMeta {
  transactionIds: string[]
  samples: { transactionId: string; amount: number; label: string }[]
  categories: { id: string; name: string; kind: string }[]
}

/**
 * Orchestrateur principal M7 (documents, OCR local, passage IA anonymisé et validation).
 * Garantit :
 * - aucune rétention d'octets originaux par défaut (ADR-018 : purge sur validation/rejet/verrouillage) ;
 * - aucune requête réseau sans aperçu + consentement explicite de l'utilisateur (ADR-022) ;
 * - extraction PDF/OCR isolée dans un `utilityProcess` dédié.
 */
export class DocumentManager {
  private readonly staged = new StagedOriginalBytesStore()
  private readonly pagesCache = new Map<string, ExtractedPage[]>()
  private readonly catMetaByToken = new Map<string, CategorizationPreviewMeta>()
  private readonly gateway: AiGateway

  constructor(
    private readonly vault: VaultManager,
    private readonly service: DataServiceClient,
    private readonly parser: DocumentParserHost,
    private readonly models: OcrModelManager,
    private readonly aiConfigStore: AiConfigStore,
    private readonly aiSecrets: AiSecretStore,
    private readonly labels: () => DialogLabels,
    fetcher: typeof fetch = fetch,
  ) {
    this.gateway = new AiGateway(
      () => this.aiConfigStore.get(),
      this.aiSecrets,
      async () => {
        const res = await this.service.call('aiMonthlySpend')
        return res.ok ? res.value : 0
      },
      fetcher,
    )
    vault.onStatusChange((status) => {
      if (status.state !== 'unlocked') {
        this.staged.clear()
        this.pagesCache.clear()
        this.catMetaByToken.clear()
        this.gateway.clearPending()
      }
    })
  }

  private hydrate(detail: DocumentDetail): DocumentDetail {
    return {
      ...detail,
      pages: this.pagesCache.get(detail.id) ?? detail.pages,
      hasOriginalBytes: this.staged.has(detail.id),
      previewImageDataUrl: this.staged.getImageDataUrl(detail.id),
    }
  }

  private purgeStaged(documentId: string): void {
    this.staged.purge(documentId)
    this.pagesCache.delete(documentId)
  }

  private async openDocumentDialog(multi: boolean): Promise<string[] | null> {
    const l = this.labels()
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const options: Electron.OpenDialogOptions = {
      title: l.chooseDocumentFile,
      properties: multi ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: [
        { name: l.documentFilterAll, extensions: ['pdf', 'png', 'jpg', 'jpeg'] },
        { name: l.pdfFilter, extensions: ['pdf'] },
        { name: l.pngJpegFilter, extensions: ['png', 'jpg', 'jpeg'] },
      ],
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths
  }

  async pickFile(): Promise<DocumentStageOutcome> {
    const paths = await this.openDocumentDialog(false)
    if (!paths || !paths[0]) {
      return { ok: false, reason: 'cancelled' }
    }
    return this.stagePath(paths[0])
  }

  async pickFiles(): Promise<DocumentStageOutcome[]> {
    const paths = await this.openDocumentDialog(true)
    if (!paths) {
      return [{ ok: false, reason: 'cancelled' }]
    }
    const outcomes: DocumentStageOutcome[] = []
    for (const filePath of paths) {
      outcomes.push(await this.stagePath(filePath))
    }
    return outcomes
  }

  async stagePath(rawPath: string): Promise<DocumentStageOutcome> {
    const status = await this.vault.status()
    if (status.state !== 'unlocked') {
      return { ok: false, reason: 'vault-locked' }
    }

    const file = readBoundedDocumentFile(rawPath)
    if (!file.ok) return { ok: false, reason: file.reason }

    const dupRes = await this.service.call('documentFindByHash', { sha256: file.sha256 })
    if (!dupRes.ok) return { ok: false, reason: 'vault-locked' }
    if (dupRes.value) {
      const existing = await this.service.call('documentGet', { id: dupRes.value.id })
      if (existing.ok && existing.value) {
        return {
          ok: true,
          document: this.hydrate(existing.value),
          duplicateOf: dupRes.value,
          ocrMissingLanguage: null,
        }
      }
    }

    let pages: ExtractedPage[] = []
    let pageCount = 1
    let extractionMethod: DocumentExtractionMethod = 'pdf-text'
    let ocrMissingLanguage: OcrLanguage | null = null
    let ocrConfidence: number | null = null

    if (file.mimeType === 'application/pdf') {
      const pdfRes = await this.parser.extractPdf(file.bytes)
      if (!pdfRes.ok) return { ok: false, reason: pdfRes.reason }
      pages = pdfRes.pages
      pageCount = pdfRes.pageCount
      if (pdfRes.textLength < 20) {
        extractionMethod = 'ocr'
      }
    } else {
      extractionMethod = 'ocr'
      const lang: OcrLanguage = 'fra'
      const traineddata = this.models.readLanguageBytes(lang)
      if (!traineddata) {
        ocrMissingLanguage = lang
      } else {
        const ocrRes = await this.parser.extractOcr({
          bytes: file.bytes,
          language: lang,
          traineddataBytes: traineddata,
        })
        if (ocrRes.ok) {
          pages = ocrRes.pages
          ocrConfidence = ocrRes.confidence
        }
      }
    }

    const { draft, kind, confidence, needsReview } = this.runTemplates(pages, file.fileName)
    const finalConfidence =
      ocrConfidence !== null ? Math.min(confidence, Math.max(0.35, ocrConfidence)) : confidence

    const savedRes = await this.service.call('documentUpsert', {
      kind,
      fileName: file.fileName,
      mimeType: file.mimeType,
      sha256: file.sha256,
      pageCount,
      status: ocrMissingLanguage || needsReview ? 'needs_review' : 'extracted',
      extractionMethod,
      confidence: finalConfidence,
      draft,
    })
    if (!savedRes.ok) return { ok: false, reason: 'vault-locked' }

    const docId = savedRes.value.id
    this.staged.put(docId, {
      fileName: file.fileName,
      mimeType: file.mimeType,
      bytes: file.bytes,
    })
    this.pagesCache.set(docId, pages)

    const detailRes = await this.service.call('documentGet', { id: docId })
    const detail: DocumentDetail =
      detailRes.ok && detailRes.value
        ? detailRes.value
        : {
            ...savedRes.value,
            draft,
            pages,
            hasOriginalBytes: true,
            previewImageDataUrl: null,
          }

    return {
      ok: true,
      document: this.hydrate(detail),
      duplicateOf: null,
      ocrMissingLanguage,
    }
  }

  private runTemplates(
    pages: readonly ExtractedPage[],
    fileName: string,
    kindOverride?: DocumentKind,
  ): {
    kind: DocumentKind
    draft: ExtractedDocumentDraft
    confidence: number
    needsReview: boolean
  } {
    const kind = kindOverride ?? classifyDocument(pages, fileName).kind
    if (kind === 'payslip') {
      const draft = extractFrenchPayslip(pages)
      return {
        kind: 'payslip',
        draft,
        confidence: draft.overallConfidence,
        needsReview: draft.needsAiAssist,
      }
    }
    if (kind === 'statement') {
      const draft = extractPdfBankStatement(pages)
      return {
        kind: 'statement',
        draft,
        confidence: draft.overallConfidence,
        needsReview: draft.needsAiAssist,
      }
    }
    const draft = extractOtherDocument(pages, fileName)
    return {
      kind: 'other',
      draft,
      confidence: draft.overallConfidence,
      needsReview: draft.needsAiAssist,
    }
  }

  async rerunExtraction(params: {
    documentId: string
    kindOverride?: DocumentKind
    ocrLanguage?: OcrLanguage
  }): Promise<DocumentStageOutcome> {
    const detailRes = await this.service.call('documentGet', { id: params.documentId })
    if (!detailRes.ok || !detailRes.value) return { ok: false, reason: 'not-found' }
    const existing = detailRes.value

    let pages = this.pagesCache.get(existing.id) ?? []
    let extractionMethod = existing.extractionMethod
    let ocrMissingLanguage: OcrLanguage | null = null
    const original = this.staged.get(existing.id)

    if (
      original &&
      (existing.mimeType === 'image/png' || existing.mimeType === 'image/jpeg') &&
      (pages.length === 0 || params.ocrLanguage)
    ) {
      const lang = params.ocrLanguage ?? 'fra'
      const traineddata = this.models.readLanguageBytes(lang)
      if (!traineddata) {
        ocrMissingLanguage = lang
      } else {
        const ocrRes = await this.parser.extractOcr({
          bytes: original.bytes,
          language: lang,
          traineddataBytes: traineddata,
        })
        if (ocrRes.ok) {
          pages = ocrRes.pages
          extractionMethod = 'ocr'
          this.pagesCache.set(existing.id, pages)
        }
      }
    }

    const { draft, kind, confidence, needsReview } = this.runTemplates(
      pages,
      existing.fileName,
      params.kindOverride ?? existing.kind,
    )

    const updatedRes = await this.service.call('documentUpsert', {
      id: existing.id,
      kind,
      fileName: existing.fileName,
      mimeType: existing.mimeType,
      sha256: existing.sha256,
      pageCount: existing.pageCount,
      status: ocrMissingLanguage || needsReview ? 'needs_review' : 'extracted',
      extractionMethod,
      confidence,
      draft,
    })
    if (!updatedRes.ok) return { ok: false, reason: 'vault-locked' }

    const refreshed = await this.service.call('documentGet', { id: existing.id })
    if (!refreshed.ok || !refreshed.value) return { ok: false, reason: 'not-found' }
    return {
      ok: true,
      document: this.hydrate(refreshed.value),
      duplicateOf: null,
      ocrMissingLanguage,
    }
  }

  async list(): Promise<DocumentListItem[]> {
    const res = await this.service.call('documentsList', { limit: 100 })
    return res.ok ? res.value : []
  }

  async get(documentId: string): Promise<DocumentDetail | null> {
    const res = await this.service.call('documentGet', { id: documentId })
    if (!res.ok || !res.value) return null
    return this.hydrate(res.value)
  }

  async updateDraft(params: {
    documentId: string
    draft: ExtractedDocumentDraft
  }): Promise<DocumentListItem | null> {
    const res = await this.service.call('documentUpdateDraft', {
      id: params.documentId,
      draft: params.draft,
    })
    return res.ok ? res.value : null
  }

  async exportOriginal(documentId: string): Promise<DocumentOriginalExportOutcome> {
    const status = await this.vault.status()
    if (status.state !== 'unlocked') return { ok: false, reason: 'vault-locked' }
    const original = this.staged.get(documentId)
    if (!original) return { ok: false, reason: 'no-original' }

    const l = this.labels()
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const options: Electron.SaveDialogOptions = {
      title: l.saveOriginalDocumentTitle,
      defaultPath: original.fileName,
    }
    const picked = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options)
    if (picked.canceled || !picked.filePath) {
      return { ok: false, reason: 'cancelled' }
    }
    writeFileSync(picked.filePath, original.bytes)
    return { ok: true, fileName: original.fileName }
  }

  private async commitPayslipWithStats(input: DocumentCommitPayslipInput): Promise<{
    outcome: DocumentCommitOutcome
    resolved?: ContractResolutionResult
  }> {
    const docRes = await this.service.call('documentGet', { id: input.documentId })
    if (!docRes.ok || !docRes.value) return { outcome: { ok: false, reason: 'not-found' } }
    const doc = docRes.value

    const resolved = await resolveOrUpdateContractForPayslip(this.vault, {
      contractId: input.contractId,
      employerName: input.employerName,
      employerSiret: input.employerSiret,
      contractTitle: input.contractTitle,
      contractStartDate: input.contractStartDate,
      contractEndDate: input.contractEndDate,
      draft: input.draft,
    })
    if (!resolved) return { outcome: { ok: false, reason: 'commit-failed' } }
    const contractId = resolved.contractId

    const sourceOrigin: PayslipSourceOrigin =
      doc.extractionMethod === 'ai-claude'
        ? 'ia:anthropic'
        : doc.extractionMethod === 'ai-local'
          ? 'ia:local'
          : 'document'

    const period =
      input.draft.period ??
      input.draft.paymentDate?.slice(0, 7) ??
      input.draft.contractEndDate?.slice(0, 7) ??
      new Date().toISOString().slice(0, 7)
    const saved = await this.vault.ledger('payslipSave', {
      contractId,
      period,
      paymentDate: input.draft.paymentDate,
      countryPack: 'fr',
      currency: input.draft.currency,
      totalsOnly: input.draft.lines.filter((l) => l.section === 'contribution').length === 0,
      baseHoursHundredths: input.draft.baseHoursHundredths,
      hourlyRate: input.draft.hourlyRate,
      baseSalary: input.draft.baseSalary,
      gross: input.draft.gross,
      employeeContributions: input.draft.employeeContributions,
      employerContributions: input.draft.employerContributions,
      netBeforeTax: input.draft.netBeforeTax,
      taxableNet: input.draft.taxableNet,
      socialNet: input.draft.socialNet,
      withholdingRateMicros: input.draft.withholdingRateMicros,
      withholdingPersonalized: input.draft.withholdingPersonalized,
      withholdingBase: input.draft.withholdingBase,
      withholdingTax: input.draft.withholdingTax,
      otherAdjustments: input.draft.otherAdjustments,
      netPaid: input.draft.netPaid,
      ytdGross: input.draft.ytdGross,
      ytdTaxableNet: input.draft.ytdTaxableNet,
      ytdWithholding: input.draft.ytdWithholding,
      ytdHoursHundredths: input.draft.ytdHoursHundredths,
      employeeNir: null,
      employeeAddress: null,
      transactionId: input.linkTransactionId ?? null,
      sourceOrigin,
      notes: input.notes ?? null,
      lines: input.draft.lines,
    })
    if (!saved.ok) return { outcome: { ok: false, reason: 'commit-failed' } }

    const committed = await this.service.call('documentMarkCommitted', {
      id: doc.id,
      linkedEntityType: 'payslip',
      linkedEntityId: saved.value.id,
      draft: input.draft,
    })
    if (!committed.ok) return { outcome: { ok: false, reason: 'commit-failed' } }

    // ADR-018 : purge immédiate des octets originaux en RAM après intégration.
    this.purgeStaged(doc.id)
    return {
      outcome: {
        ok: true,
        document: committed.value,
        linkedEntityType: 'payslip',
        linkedEntityId: saved.value.id,
      },
      resolved,
    }
  }

  async commitPayslip(input: DocumentCommitPayslipInput): Promise<DocumentCommitOutcome> {
    const res = await this.commitPayslipWithStats(input)
    return res.outcome
  }

  async commitPayslipBatch(documentIds: string[]): Promise<DocumentBatchPayslipCommitOutcome> {
    const eligible: Array<{ id: string; draft: ExtractedPayslipDraft }> = []
    let skippedCount = 0
    const failedIds: string[] = []
    const results: DocumentCommitOutcome[] = []

    for (const documentId of documentIds) {
      const docRes = await this.service.call('documentGet', { id: documentId })
      if (!docRes.ok || !docRes.value) {
        failedIds.push(documentId)
        skippedCount += 1
        continue
      }
      const doc = docRes.value
      if (
        doc.status === 'committed' ||
        doc.status === 'rejected' ||
        doc.draft?.kind !== 'payslip'
      ) {
        skippedCount += 1
        continue
      }
      const draft = doc.draft
      const fallbackPeriod =
        draft.period ?? draft.paymentDate?.slice(0, 7) ?? draft.contractEndDate?.slice(0, 7) ?? null
      if (!fallbackPeriod) {
        failedIds.push(documentId)
        skippedCount += 1
        continue
      }
      eligible.push({
        id: documentId,
        draft: draft.period ? draft : { ...draft, period: fallbackPeriod },
      })
    }

    // Traitement chronologique ascendant pour créer la date d'entrée sur les premiers bulletins
    // puis clôturer avec la date de sortie du solde de tout compte.
    eligible.sort((a, b) => {
      const pa = a.draft.period ?? '9999-12'
      const pb = b.draft.period ?? '9999-12'
      if (pa !== pb) return pa.localeCompare(pb)
      return (a.draft.isFinalSettlement ? 1 : 0) - (b.draft.isFinalSettlement ? 1 : 0)
    })

    let committedCount = 0
    let createdEmployers = 0
    let createdContracts = 0
    let updatedContracts = 0

    for (const item of eligible) {
      const { outcome, resolved } = await this.commitPayslipWithStats({
        documentId: item.id,
        contractId: null,
        employerName: item.draft.employerName ?? undefined,
        employerSiret: item.draft.employerSiret,
        contractTitle: item.draft.contractTitle ?? undefined,
        contractStartDate: item.draft.contractStartDate,
        contractEndDate: item.draft.contractEndDate,
        draft: item.draft,
      })
      results.push(outcome)
      if (!outcome.ok) {
        failedIds.push(item.id)
        continue
      }
      committedCount += 1
      if (resolved) {
        if (resolved.createdEmployer) createdEmployers += 1
        if (resolved.createdContract) createdContracts += 1
        if (resolved.updatedContract) updatedContracts += 1
      }
    }

    return {
      committedCount,
      createdEmployers,
      createdContracts,
      updatedContracts,
      skippedCount,
      failedIds,
      results,
    }
  }

  async commitStatement(input: DocumentCommitStatementInput): Promise<DocumentCommitOutcome> {
    const docRes = await this.service.call('documentGet', { id: input.documentId })
    if (!docRes.ok || !docRes.value) return { ok: false, reason: 'not-found' }
    const doc = docRes.value

    const statement: ParsedStatement = {
      format: 'pdf',
      encoding: 'utf-8',
      currency: input.draft.currency,
      accountHint: input.draft.accountHint,
      accountTypeHint: null,
      periodStart: input.draft.periodStart,
      periodEnd: input.draft.periodEnd,
      openingBalance: input.draft.openingBalance,
      closingBalance: input.draft.closingBalance,
      rows: input.draft.rows.map((r, index) => ({
        index,
        bookingDate: r.bookingDate,
        valueDate: r.valueDate,
        amount: r.amount,
        currency: r.currency ?? input.draft.currency,
        labelRaw: r.labelRaw,
        payee: r.payee,
        note: r.note,
        status: r.status,
        externalId: r.externalId,
        runningBalance: r.runningBalance,
      })),
      skippedLines: 0,
      warnings: [],
    }

    const previewRes = await this.service.call('importPreview', {
      accountId: input.accountId,
      fileName: doc.fileName,
      fileHash: doc.sha256,
      profile: null,
      statement,
    })
    if (!previewRes.ok) return { ok: false, reason: 'commit-failed' }

    const commitRes = await this.service.call('importCommit', {
      previewId: previewRes.value.previewId,
      rowDecisions: previewRes.value.rows.map((row) => ({
        index: row.index,
        action: row.defaultAction,
      })),
    })
    if (!commitRes.ok) return { ok: false, reason: 'commit-failed' }

    const committed = await this.service.call('documentMarkCommitted', {
      id: doc.id,
      linkedEntityType: 'import_batch',
      linkedEntityId: commitRes.value.batchId,
      draft: input.draft,
    })
    if (!committed.ok) return { ok: false, reason: 'commit-failed' }

    this.purgeStaged(doc.id)
    return {
      ok: true,
      document: committed.value,
      linkedEntityType: 'import_batch',
      linkedEntityId: commitRes.value.batchId,
      importedInserted: commitRes.value.insertedCount,
    }
  }

  async reject(documentId: string): Promise<DocumentListItem | null> {
    const res = await this.service.call('documentReject', { id: documentId })
    this.purgeStaged(documentId)
    return res.ok ? res.value : null
  }

  async delete(documentId: string): Promise<boolean> {
    const res = await this.service.call('documentDelete', { id: documentId })
    this.purgeStaged(documentId)
    return res.ok
  }

  // ——— Configuration IA & OCR ——————————————————————————————————————————

  async aiConfig(): Promise<AiConfigPublic> {
    const spentRes = await this.service.call('aiMonthlySpend').catch(() => null)
    const spent = spentRes && spentRes.ok ? spentRes.value : 0
    return this.aiConfigStore.toPublic({
      hasAnthropicKey: this.aiSecrets.hasKey(),
      spentThisMonthMicroUsd: spent,
      ocrLanguages: this.models.status(),
    })
  }

  async aiUpdateConfig(patch: AiConfigPatch): Promise<AiConfigPublic> {
    this.aiConfigStore.update(patch)
    return this.aiConfig()
  }

  async aiSetApiKey(apiKey: string): Promise<{ ok: boolean; config: AiConfigPublic }> {
    const ok = this.aiSecrets.setKey(apiKey)
    return { ok, config: await this.aiConfig() }
  }

  async aiClearApiKey(): Promise<AiConfigPublic> {
    this.aiSecrets.clearKey()
    return this.aiConfig()
  }

  async aiSendLogList(): Promise<AiSendLogEntry[]> {
    const res = await this.service.call('aiSendLogList', { limit: 60 })
    return res.ok ? res.value : []
  }

  downloadOcrLanguage(language: OcrLanguage): Promise<OcrDownloadOutcome> {
    return this.models.downloadLanguage(language)
  }

  removeOcrLanguage(language: OcrLanguage): OcrLanguageStatus {
    return this.models.removeLanguage(language)
  }

  // ——— Assistance IA anonymisée avec aperçu et consentement ————————————

  async aiPreviewAssist(
    documentId: string,
  ): Promise<
    | { ok: true; preview: AiSendPreview }
    | { ok: false; reason: 'not-found' | 'disabled' | 'missing-key' }
  > {
    const detailRes = await this.service.call('documentGet', { id: documentId })
    if (!detailRes.ok || !detailRes.value) return { ok: false, reason: 'not-found' }
    const doc = detailRes.value
    const pages = this.pagesCache.get(doc.id) ?? []
    const rawText =
      pages.length > 0
        ? pages.map((p) => `--- Page ${p.pageNumber} ---\n${p.text}`).join('\n')
        : JSON.stringify(doc.draft ?? {})

    const namesRes = await this.service.call('documentKnownNames')
    const knownNames = namesRes.ok ? namesRes.value : []
    const purpose = doc.kind === 'statement' ? 'statement' : 'payslip'

    return this.gateway.createPreview({
      purpose,
      documentId: doc.id,
      rawText,
      anonymize: { knownNames },
    })
  }

  async aiExecuteAssist(params: {
    documentId: string
    previewToken: string
    consentConfirmed: true
  }): Promise<AiAssistOutcome> {
    const detailRes = await this.service.call('documentGet', { id: params.documentId })
    if (!detailRes.ok || !detailRes.value) return { ok: false, reason: 'not-found' }
    const doc = detailRes.value
    const method: DocumentExtractionMethod =
      this.aiConfigStore.get().provider === 'anthropic' ? 'ai-claude' : 'ai-local'

    if (doc.kind === 'statement') {
      const execRes = await this.gateway.executeConsented({
        previewToken: params.previewToken,
        consentConfirmed: params.consentConfirmed,
        schema: aiStatementStructuredOutputSchema,
        embeddedFallback: (anonText) => {
          const parsed = extractPdfBankStatement([
            { pageNumber: 1, width: 595, height: 842, text: anonText, items: [] },
          ])
          return {
            currency: parsed.currency,
            periodStart: parsed.periodStart,
            periodEnd: parsed.periodEnd,
            openingBalanceCents: parsed.openingBalance,
            closingBalanceCents: parsed.closingBalance,
            rows: parsed.rows.map((r) => ({
              bookingDate: r.bookingDate,
              amountCents: r.amount,
              labelRaw: r.labelRaw,
              payee: r.payee,
            })),
            confidence: parsed.overallConfidence,
          }
        },
      })

      if (!execRes.ok) {
        if (execRes.audit) {
          await this.service.call('aiSendLogRecord', execRes.audit)
        }
        return { ok: false, reason: execRes.reason }
      }

      const logRes = await this.service.call('aiSendLogRecord', {
        ...execRes.audit,
        status: 'sent',
      })
      if (!logRes.ok) return { ok: false, reason: 'network-error' }

      const aiData = execRes.data
      const rows = aiData.rows.map((r, index) => ({
        index,
        bookingDate: r.bookingDate,
        valueDate: null,
        amount: r.amountCents,
        currency: aiData.currency,
        labelRaw: r.labelRaw,
        payee: r.payee,
        note: null,
        status: 'cleared' as const,
        externalId: null,
        runningBalance: null,
        confidence: aiData.confidence,
        sourceZone: null,
      }))
      const discrepancy =
        aiData.openingBalanceCents !== null && aiData.closingBalanceCents !== null
          ? aiData.closingBalanceCents -
            (aiData.openingBalanceCents + rows.reduce((s, r) => s + r.amount, 0))
          : null

      const nextDraft: ExtractedStatementDraft = {
        kind: 'statement',
        currency: aiData.currency,
        accountHint: doc.draft?.kind === 'statement' ? doc.draft.accountHint : null,
        periodStart: aiData.periodStart,
        periodEnd: aiData.periodEnd,
        openingBalance: aiData.openingBalanceCents,
        closingBalance: aiData.closingBalanceCents,
        rows,
        balanceDiscrepancy: discrepancy,
        overallConfidence: aiData.confidence,
        needsAiAssist: rows.length === 0 || discrepancy !== 0,
      }

      await this.service.call('documentUpsert', {
        id: doc.id,
        kind: 'statement',
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        sha256: doc.sha256,
        pageCount: doc.pageCount,
        status: nextDraft.needsAiAssist ? 'needs_review' : 'extracted',
        extractionMethod: method,
        confidence: nextDraft.overallConfidence,
        draft: nextDraft,
      })
      const refreshed = await this.get(doc.id)
      if (!refreshed) return { ok: false, reason: 'not-found' }
      return { ok: true, document: refreshed, logEntry: logRes.value }
    }

    const execRes = await this.gateway.executeConsented({
      previewToken: params.previewToken,
      consentConfirmed: params.consentConfirmed,
      schema: aiPayslipStructuredOutputSchema,
      embeddedFallback: (anonText) => {
        const parsed = extractFrenchPayslip([
          { pageNumber: 1, width: 595, height: 842, text: anonText, items: [] },
        ])
        return {
          employerName: parsed.employerName,
          contractTitle: parsed.contractTitle,
          contractStartDate: parsed.contractStartDate,
          contractEndDate: parsed.contractEndDate,
          isFinalSettlement: parsed.isFinalSettlement,
          period: parsed.period,
          paymentDate: parsed.paymentDate,
          baseSalaryCents: parsed.baseSalary,
          grossCents: parsed.gross,
          employeeContributionsCents: parsed.employeeContributions,
          employerContributionsCents: parsed.employerContributions,
          netBeforeTaxCents: parsed.netBeforeTax,
          taxableNetCents: parsed.taxableNet,
          socialNetCents: parsed.socialNet,
          withholdingTaxCents: parsed.withholdingTax,
          withholdingRateMicros: parsed.withholdingRateMicros,
          otherAdjustmentsCents: parsed.otherAdjustments,
          netPaidCents: parsed.netPaid,
          confidence: parsed.overallConfidence,
        }
      },
    })

    if (!execRes.ok) {
      if (execRes.audit) await this.service.call('aiSendLogRecord', execRes.audit)
      return { ok: false, reason: execRes.reason }
    }

    const logRes = await this.service.call('aiSendLogRecord', {
      ...execRes.audit,
      status: 'sent',
    })
    if (!logRes.ok) return { ok: false, reason: 'network-error' }

    const prev = doc.draft?.kind === 'payslip' ? doc.draft : null
    const aiData = execRes.data
    const lines = prev?.lines ?? []
    const issues = checkPayslipDetailed({
      countryPack: 'fr',
      period: aiData.period ?? prev?.period ?? '2026-01',
      totalsOnly: lines.filter((l) => l.section === 'contribution').length === 0,
      baseHoursHundredths: prev?.baseHoursHundredths ?? null,
      hourlyRate: prev?.hourlyRate ?? null,
      baseSalary: aiData.baseSalaryCents,
      gross: aiData.grossCents,
      employeeContributions: aiData.employeeContributionsCents,
      employerContributions: aiData.employerContributionsCents,
      netBeforeTax: aiData.netBeforeTaxCents,
      taxableNet: aiData.taxableNetCents,
      socialNet: aiData.socialNetCents,
      withholdingRateMicros: aiData.withholdingRateMicros,
      withholdingBase: aiData.taxableNetCents,
      withholdingTax: aiData.withholdingTaxCents,
      otherAdjustments: aiData.otherAdjustmentsCents,
      netPaid: aiData.netPaidCents,
      ytdGross: prev?.ytdGross ?? null,
      ytdTaxableNet: prev?.ytdTaxableNet ?? null,
      ytdWithholding: prev?.ytdWithholding ?? null,
      ytdHoursHundredths: prev?.ytdHoursHundredths ?? null,
      lines,
    })
    const errors = issues.filter((i) => i.severity === 'error').length
    const nextDraft: ExtractedPayslipDraft = {
      kind: 'payslip',
      employerName: aiData.employerName ?? prev?.employerName ?? null,
      employerSiret: prev?.employerSiret ?? null,
      contractTitle: aiData.contractTitle ?? prev?.contractTitle ?? null,
      contractType: prev?.contractType ?? null,
      executiveStatus: prev?.executiveStatus ?? null,
      collectiveAgreement: prev?.collectiveAgreement ?? null,
      contractStartDate: aiData.contractStartDate ?? prev?.contractStartDate ?? null,
      contractEndDate: aiData.contractEndDate ?? prev?.contractEndDate ?? null,
      isFinalSettlement: aiData.isFinalSettlement ?? prev?.isFinalSettlement ?? false,
      period: aiData.period ?? prev?.period ?? null,
      paymentDate: aiData.paymentDate ?? prev?.paymentDate ?? null,
      currency: prev?.currency ?? 'EUR',
      baseHoursHundredths: prev?.baseHoursHundredths ?? null,
      hourlyRate: prev?.hourlyRate ?? null,
      baseSalary: aiData.baseSalaryCents,
      gross: aiData.grossCents,
      employeeContributions: aiData.employeeContributionsCents,
      employerContributions: aiData.employerContributionsCents,
      netBeforeTax: aiData.netBeforeTaxCents,
      taxableNet: aiData.taxableNetCents,
      socialNet: aiData.socialNetCents,
      withholdingRateMicros: aiData.withholdingRateMicros,
      withholdingPersonalized: prev?.withholdingPersonalized ?? true,
      withholdingBase: aiData.taxableNetCents,
      withholdingTax: aiData.withholdingTaxCents,
      otherAdjustments: aiData.otherAdjustmentsCents,
      netPaid: aiData.netPaidCents,
      ytdGross: prev?.ytdGross ?? null,
      ytdTaxableNet: prev?.ytdTaxableNet ?? null,
      ytdWithholding: prev?.ytdWithholding ?? null,
      ytdHoursHundredths: prev?.ytdHoursHundredths ?? null,
      lines,
      fieldZones: prev?.fieldZones ?? {},
      missingFields: aiData.period ? [] : ['period'],
      overallConfidence: aiData.confidence,
      needsAiAssist: errors > 0 || !aiData.period,
    }

    await this.service.call('documentUpsert', {
      id: doc.id,
      kind: 'payslip',
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      sha256: doc.sha256,
      pageCount: doc.pageCount,
      status: nextDraft.needsAiAssist ? 'needs_review' : 'extracted',
      extractionMethod: method,
      confidence: nextDraft.overallConfidence,
      draft: nextDraft,
    })
    const refreshed = await this.get(doc.id)
    if (!refreshed) return { ok: false, reason: 'not-found' }
    return { ok: true, document: refreshed, logEntry: logRes.value }
  }

  async aiPreviewCategorize(
    transactionIds: string[],
  ): Promise<
    | { ok: true; preview: AiSendPreview }
    | { ok: false; reason: 'disabled' | 'missing-key' | 'empty' }
  > {
    const queueRes = await this.vault.ledger('categorizationQueueList', { limit: 150 })
    const catRes = await this.vault.ledger('categoriesList', {})
    const namesRes = await this.service.call('documentKnownNames')
    if (!queueRes.ok || !catRes.ok) return { ok: false, reason: 'empty' }

    const wanted = new Set(transactionIds)
    const rows = queueRes.value.filter((q) => wanted.has(q.transactionId)).slice(0, 40)
    if (rows.length === 0) return { ok: false, reason: 'empty' }

    const activeCategories = catRes.value
      .filter((c) => !c.archived && c.kind !== 'transfer')
      .map((c) => ({ id: c.id, name: c.name, kind: c.kind }))

    const anon = anonymizeTransactionsForCategorization(
      rows.map((r) => ({
        transactionId: r.transactionId,
        labelRaw: r.labelRaw,
        payee: r.payee,
        amount: r.amount,
      })),
      { knownNames: namesRes.ok ? namesRes.value : [] },
    )

    const payloadJson = JSON.stringify(
      { categories: activeCategories, transactions: anon.samples },
      null,
      2,
    )

    const previewRes = await this.gateway.createPreview({
      purpose: 'categorization',
      documentId: null,
      rawText: payloadJson,
      preAnonymized: { text: payloadJson, redactions: anon.redactions },
    })
    if (!previewRes.ok) return previewRes

    this.catMetaByToken.set(previewRes.preview.token, {
      transactionIds: rows.map((r) => r.transactionId),
      samples: rows.map((r) => ({
        transactionId: r.transactionId,
        amount: r.amount,
        label: r.cleanedLabel || r.labelRaw,
      })),
      categories: activeCategories,
    })

    return previewRes
  }

  async aiExecuteCategorize(params: {
    previewToken: string
    consentConfirmed: true
  }): Promise<AiCategorizeApplyOutcome> {
    const meta = this.catMetaByToken.get(params.previewToken)
    if (!meta) return { ok: false, reason: 'consent-required' }
    this.catMetaByToken.delete(params.previewToken)

    const execRes = await this.gateway.executeConsented({
      previewToken: params.previewToken,
      consentConfirmed: params.consentConfirmed,
      schema: aiCategorizationStructuredOutputSchema,
      embeddedFallback: () => ({
        suggestions: meta.samples.map((sample, index) => {
          const lower = sample.label.toLowerCase()
          const matched = meta.categories.find((c) => lower.includes(c.name.toLowerCase()))
          return {
            index,
            categoryId: matched ? matched.id : null,
            suggestedLabel: sample.label,
            confidence: matched ? 0.72 : 0.4,
            reason: matched ? `Correspondance locale (${matched.name})` : 'Libellé nettoyé',
          }
        }),
      }),
    })

    if (!execRes.ok) {
      if (execRes.audit) await this.service.call('aiSendLogRecord', execRes.audit)
      return { ok: false, reason: execRes.reason }
    }

    const logRes = await this.service.call('aiSendLogRecord', {
      ...execRes.audit,
      status: 'sent',
    })
    if (!logRes.ok) return { ok: false, reason: 'network-error' }

    const items = execRes.data.suggestions
      .map((s) => {
        const sample = meta.samples[s.index]
        if (!sample) return null
        return {
          transactionId: sample.transactionId,
          categoryId: s.categoryId,
          suggestedLabel: s.suggestedLabel,
          confidence: s.confidence,
          reason: s.reason,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    if (items.length === 0) {
      return { ok: true, appliedCount: 0, logEntry: logRes.value }
    }

    const applyRes = await this.service.call('aiApplyCategorization', { items })
    if (!applyRes.ok) return { ok: false, reason: 'network-error' }

    return {
      ok: true,
      appliedCount: applyRes.value.appliedCount,
      logEntry: logRes.value,
    }
  }
}
