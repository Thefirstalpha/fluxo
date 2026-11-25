/**
 * Processus isolé (`utilityProcess`) dédié à l'extraction de PDF et d'images (M7).
 * Aucune clé de base de données, aucun accès SQLite, aucun accès réseau ni écriture disque :
 * reçoit les octets bornés depuis le process main via `parentPort` et renvoie le texte + boîtes.
 */
import type { OcrLanguage } from '@shared/documents/model'
import { runLocalOcr, type OcrExtractOutcome } from './ocr'
import { extractPdfPages, type PdfExtractOutcome } from './pdf'

export type DocumentWorkerRequest =
  | {
      id: number
      op: 'extract-pdf'
      bytes: Uint8Array
    }
  | {
      id: number
      op: 'extract-ocr'
      bytes: Uint8Array
      language: OcrLanguage
      traineddataBytes: Uint8Array
    }

export interface DocumentWorkerResponse {
  id: number
  result: PdfExtractOutcome | OcrExtractOutcome
}

function isRequest(value: unknown): value is DocumentWorkerRequest {
  if (typeof value !== 'object' || value === null) return false
  const rec = value as Record<string, unknown>
  if (typeof rec.id !== 'number' || !(rec.bytes instanceof Uint8Array)) return false
  if (rec.op === 'extract-pdf') return true
  if (
    rec.op === 'extract-ocr' &&
    (rec.language === 'fra' || rec.language === 'eng') &&
    rec.traineddataBytes instanceof Uint8Array
  ) {
    return true
  }
  return false
}

process.parentPort.on('message', (event: { data: unknown }) => {
  const payload = event.data
  if (!isRequest(payload)) return

  void (async () => {
    const result =
      payload.op === 'extract-pdf'
        ? await extractPdfPages(payload.bytes)
        : await runLocalOcr({
            imageBytes: payload.bytes,
            language: payload.language,
            traineddataBytes: payload.traineddataBytes,
          })

    const response: DocumentWorkerResponse = { id: payload.id, result }
    process.parentPort.postMessage(response)
  })()
})
