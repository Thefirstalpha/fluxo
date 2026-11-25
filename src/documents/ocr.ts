import { gunzipSync } from 'node:zlib'
import {
  MAX_DOCUMENT_BYTES,
  type ExtractedPage,
  type ExtractedTextItem,
  type OcrLanguage,
} from '@shared/documents/model'

export type OcrExtractOutcome =
  | { ok: true; pages: ExtractedPage[]; confidence: number }
  | { ok: false; reason: 'too-large' | 'parse-failed' }

interface TessBaseApiInstance {
  Init(datapath: string | null, langs: string, oem: number): number
  SetImageFile(exif?: number, angle?: number): number
  SetPageSegMode?(psm: number): void
  Recognize(monitor?: number): number
  GetUTF8Text(): string
  GetTSVText?(pageNumber?: number): string
  MeanTextConf(): number
  End(): void
}

interface TessModuleLike {
  FS: {
    writeFile(path: string, data: Uint8Array | string): void
    unlink(path: string): void
  }
  TessBaseAPI: new () => TessBaseApiInstance
}

let cachedCoreFactory: ((opts?: Record<string, unknown>) => Promise<TessModuleLike>) | null = null

async function getCoreFactory() {
  if (!cachedCoreFactory) {
    // Version autonome pure WASM+JS (`tesseract-core-lstm.wasm.js`), zéro worker_threads ni CDN.
    const mod = (await import('tesseract.js-core/tesseract-core-lstm.wasm.js')) as {
      default?: (opts?: Record<string, unknown>) => Promise<TessModuleLike>
    }
    cachedCoreFactory =
      mod.default ?? (mod as unknown as (opts?: Record<string, unknown>) => Promise<TessModuleLike>)
  }
  return cachedCoreFactory
}

function maybeGunzip(data: Uint8Array): Uint8Array {
  if (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) {
    return new Uint8Array(gunzipSync(data))
  }
  return data
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
    return null
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return {
    width: Math.max(1, view.getUint32(16, false)),
    height: Math.max(1, view.getUint32(20, false)),
  }
}

function parseTsvToItems(tsv: string, width: number, height: number): ExtractedTextItem[] {
  const items: ExtractedTextItem[] = []
  const lines = tsv.split(/\r?\n/)
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]?.split('\t')
    if (!cols || cols.length < 12) continue
    const level = Number.parseInt(cols[0] ?? '', 10)
    if (level !== 5) continue
    const text = (cols[11] ?? '').trim()
    if (!text) continue

    const left = Number.parseInt(cols[6] ?? '0', 10)
    const top = Number.parseInt(cols[7] ?? '0', 10)
    const w = Number.parseInt(cols[8] ?? '1', 10)
    const h = Number.parseInt(cols[9] ?? '1', 10)
    if (!Number.isFinite(left) || !Number.isFinite(top)) continue

    items.push({
      text,
      box: {
        x: Math.max(0, Math.min(0.99, left / width)),
        y: Math.max(0, Math.min(0.99, top / height)),
        width: Math.max(0.005, Math.min(1, w / width)),
        height: Math.max(0.01, Math.min(1, h / height)),
      },
    })
  }
  return items
}

/**
 * Exécute l'OCR Tesseract localement sur une image PNG/JPEG avec les données de langue fournies
 * en mémoire par le main (aucune requête réseau, aucun accès disque).
 */
export async function runLocalOcr(params: {
  imageBytes: Uint8Array
  language: OcrLanguage
  traineddataBytes: Uint8Array
}): Promise<OcrExtractOutcome> {
  if (params.imageBytes.byteLength === 0 || params.imageBytes.byteLength > MAX_DOCUMENT_BYTES) {
    return { ok: false, reason: 'too-large' }
  }
  if (params.traineddataBytes.byteLength === 0) {
    return { ok: false, reason: 'parse-failed' }
  }

  let tess: TessModuleLike | null = null
  let api: TessBaseApiInstance | null = null
  try {
    const createCore = await getCoreFactory()
    tess = await createCore({})
    const langFile = `/${params.language}.traineddata`
    tess.FS.writeFile(langFile, maybeGunzip(params.traineddataBytes))
    tess.FS.writeFile('/input', params.imageBytes)

    api = new tess.TessBaseAPI()
    // OEM 1 = LSTM_ONLY (correspond aux modèles tessdata_fast).
    const status = api.Init('/', params.language, 1)
    if (status === -1) {
      return { ok: false, reason: 'parse-failed' }
    }

    const imgErr = api.SetImageFile(1, 0)
    if (imgErr === 1) {
      return { ok: false, reason: 'parse-failed' }
    }

    api.Recognize(0)
    const text = (api.GetUTF8Text() ?? '').trim()
    const meanConf = Math.max(0, Math.min(1, (api.MeanTextConf() || 0) / 100))
    const dims = pngDimensions(params.imageBytes) ?? { width: 1000, height: 1414 }
    const tsv = typeof api.GetTSVText === 'function' ? api.GetTSVText(0) : ''
    const items = tsv ? parseTsvToItems(tsv, dims.width, dims.height) : []

    return {
      ok: true,
      confidence: meanConf,
      pages: [
        {
          pageNumber: 1,
          width: dims.width,
          height: dims.height,
          text,
          items,
        },
      ],
    }
  } catch {
    return { ok: false, reason: 'parse-failed' }
  } finally {
    try {
      api?.End()
    } catch {
      // Ignore cleanup errors
    }
    try {
      tess?.FS.unlink('/input')
    } catch {
      // Ignore cleanup errors
    }
  }
}
