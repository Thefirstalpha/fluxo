import { join } from 'node:path'
import { utilityProcess, type UtilityProcess } from 'electron'
import type { OcrLanguage } from '@shared/documents/model'
import type { DocumentWorkerRequest, DocumentWorkerResponse } from '../../documents/index'
import type { OcrExtractOutcome } from '../../documents/ocr'
import type { PdfExtractOutcome } from '../../documents/pdf'
import { logger } from '../logger'

const PARSE_TIMEOUT_MS = 45_000

interface PendingJob {
  resolve: (value: DocumentWorkerResponse['result']) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Pilote le processus isolé d'extraction de documents (`document-parser.js`).
 * Tout dépassement de délai ou plantage tue le worker et retourne une erreur contrôlée.
 */
export class DocumentParserHost {
  private child: UtilityProcess | null = null
  private nextId = 1
  private readonly pending = new Map<number, PendingJob>()

  private ensureWorker(): UtilityProcess {
    if (this.child) return this.child
    const child = utilityProcess.fork(join(__dirname, 'document-parser.js'), [], {
      serviceName: 'Fluxo — extracteur de documents',
      stdio: 'ignore',
    })
    child.on('message', (data: unknown) => {
      const msg = data as Partial<DocumentWorkerResponse> | null
      if (!msg || typeof msg.id !== 'number' || !msg.result) return
      const entry = this.pending.get(msg.id)
      if (!entry) return
      this.pending.delete(msg.id)
      clearTimeout(entry.timer)
      entry.resolve(msg.result)
    })
    child.once('exit', (code) => {
      if (this.child !== child) return
      if (code !== 0) logger.warn(`Extracteur de documents arrêté (code ${code}).`)
      this.child = null
      for (const [id, entry] of this.pending.entries()) {
        clearTimeout(entry.timer)
        entry.resolve({ ok: false, reason: 'parse-failed' })
        this.pending.delete(id)
      }
    })
    this.child = child
    return child
  }

  extractPdf(bytes: Uint8Array): Promise<PdfExtractOutcome> {
    return this.run({ op: 'extract-pdf', bytes }) as Promise<PdfExtractOutcome>
  }

  extractOcr(params: {
    bytes: Uint8Array
    language: OcrLanguage
    traineddataBytes: Uint8Array
  }): Promise<OcrExtractOutcome> {
    return this.run({
      op: 'extract-ocr',
      bytes: params.bytes,
      language: params.language,
      traineddataBytes: params.traineddataBytes,
    }) as Promise<OcrExtractOutcome>
  }

  private run(
    payload:
      | { op: 'extract-pdf'; bytes: Uint8Array }
      | {
          op: 'extract-ocr'
          bytes: Uint8Array
          language: OcrLanguage
          traineddataBytes: Uint8Array
        },
  ): Promise<DocumentWorkerResponse['result']> {
    const child = this.ensureWorker()
    const id = this.nextId++
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (!this.pending.delete(id)) return
        logger.warn('Extracteur de documents : délai dépassé, arrêt du processus isolé.')
        const dying = this.child
        this.child = null
        dying?.kill()
        resolve({ ok: false, reason: 'parse-failed' })
      }, PARSE_TIMEOUT_MS)

      this.pending.set(id, { resolve, timer })
      const request: DocumentWorkerRequest =
        payload.op === 'extract-pdf'
          ? { id, op: 'extract-pdf', bytes: payload.bytes }
          : {
              id,
              op: 'extract-ocr',
              bytes: payload.bytes,
              language: payload.language,
              traineddataBytes: payload.traineddataBytes,
            }
      child.postMessage(request)
    })
  }

  dispose(): void {
    for (const [id, entry] of this.pending.entries()) {
      clearTimeout(entry.timer)
      entry.resolve({ ok: false, reason: 'parse-failed' })
      this.pending.delete(id)
    }
    this.child?.kill()
    this.child = null
  }
}
