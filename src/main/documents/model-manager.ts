import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { OCR_MODEL_SPECS } from '@shared/documents/ai'
import {
  OCR_LANGUAGES,
  type OcrDownloadOutcome,
  type OcrLanguage,
  type OcrLanguageStatus,
} from '@shared/documents/model'

const MAX_MODEL_BYTES = 16 * 1024 * 1024

/**
 * Gère les modèles locaux Tesseract (`fra`, `eng`) sous `userData/ocr-models/`.
 * Règle stricte : aucun téléchargement automatique en arrière-plan ; uniquement à la demande
 * explicite de l'utilisateur, avec vérification SHA-256 avant écriture.
 */
export class OcrModelManager {
  constructor(private readonly directory: string) {}

  private modelPath(language: OcrLanguage): string {
    return join(this.directory, `${language}.traineddata`)
  }

  status(): Record<OcrLanguage, OcrLanguageStatus> {
    const out = {} as Record<OcrLanguage, OcrLanguageStatus>
    for (const language of OCR_LANGUAGES) {
      const spec = OCR_MODEL_SPECS[language]
      const file = this.modelPath(language)
      let sizeBytes = 0
      let installed = false
      try {
        const st = statSync(file)
        if (st.isFile() && st.size > 0) {
          sizeBytes = st.size
          installed = true
        }
      } catch {
        // Absent = non installé
      }
      out[language] = {
        language,
        installed,
        sizeBytes,
        expectedBytes: spec.expectedBytes,
        sha256: spec.sha256,
      }
    }
    return out
  }

  readLanguageBytes(language: OcrLanguage): Uint8Array | null {
    try {
      const bytes = new Uint8Array(readFileSync(this.modelPath(language)))
      if (bytes.byteLength === 0) return null
      const hash = createHash('sha256').update(bytes).digest('hex')
      if (hash !== OCR_MODEL_SPECS[language].sha256) return null
      return bytes
    } catch {
      return null
    }
  }

  async downloadLanguage(
    language: OcrLanguage,
    fetcher: typeof fetch = fetch,
  ): Promise<OcrDownloadOutcome> {
    const spec = OCR_MODEL_SPECS[language]
    try {
      const response = await fetcher(spec.url, { method: 'GET' })
      if (!response.ok) return { ok: false, reason: 'download-failed' }
      const arrayBuf = await response.arrayBuffer()
      if (arrayBuf.byteLength === 0 || arrayBuf.byteLength > MAX_MODEL_BYTES) {
        return { ok: false, reason: 'download-failed' }
      }
      const bytes = new Uint8Array(arrayBuf)
      const digest = createHash('sha256').update(bytes).digest('hex')
      if (digest !== spec.sha256) {
        return { ok: false, reason: 'checksum-mismatch' }
      }
      mkdirSync(this.directory, { recursive: true })
      writeFileSync(this.modelPath(language), bytes)
      return { ok: true, status: this.status()[language] }
    } catch {
      return { ok: false, reason: 'download-failed' }
    }
  }

  removeLanguage(language: OcrLanguage): OcrLanguageStatus {
    try {
      rmSync(this.modelPath(language), { force: true })
    } catch {
      // Ignore
    }
    return this.status()[language]
  }
}
