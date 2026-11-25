import {
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_PAGES,
  type ExtractedPage,
  type ExtractedTextItem,
} from '@shared/documents/model'

export type PdfExtractOutcome =
  | { ok: true; pageCount: number; pages: ExtractedPage[]; textLength: number }
  | { ok: false; reason: 'too-large' | 'too-many-pages' | 'parse-failed' }

interface PdfJsTextItemLike {
  str?: string
  width?: number
  height?: number
  transform?: number[]
}

let workerLoaded = false

async function getPdfJs() {
  if (!workerLoaded) {
    // Précharge le worker en mémoire pour fonctionner dans le bundle isolé `document-parser.js`
    // sans résoudre de fichier externe dans l'archive ASAR.
    const workerModule = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
    ;(globalThis as Record<string, unknown>).pdfjsWorker = workerModule
    workerLoaded = true
  }
  return import('pdfjs-dist/legacy/build/pdf.mjs')
}

/**
 * Extrait texte et boîtes englobantes normalisées (0..1) d'un PDF dans un processus sans réseau
 * ni accès disque. Désactive `isEvalSupported` et les polices système (ADR-017 / sécurité).
 */
export async function extractPdfPages(bytes: Uint8Array): Promise<PdfExtractOutcome> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_DOCUMENT_BYTES) {
    return { ok: false, reason: 'too-large' }
  }

  let loadingTask: ReturnType<Awaited<ReturnType<typeof getPdfJs>>['getDocument']> | null = null
  let doc: Awaited<
    ReturnType<Awaited<ReturnType<typeof getPdfJs>>['getDocument']>['promise']
  > | null = null
  try {
    const pdfjs = await getPdfJs()
    loadingTask = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
      verbosity: 0,
    } as Parameters<typeof pdfjs.getDocument>[0])
    doc = await loadingTask.promise

    const pageCount = doc.numPages
    if (pageCount < 1 || pageCount > MAX_DOCUMENT_PAGES) {
      return { ok: false, reason: 'too-many-pages' }
    }

    const pages: ExtractedPage[] = []
    let textLength = 0

    for (let p = 1; p <= pageCount; p++) {
      const page = await doc.getPage(p)
      const viewport = page.getViewport({ scale: 1.0 })
      const pageWidth = Math.max(1, viewport.width)
      const pageHeight = Math.max(1, viewport.height)

      const textContent = await page.getTextContent()
      const items: ExtractedTextItem[] = []
      const chunks: string[] = []

      for (const rawItem of textContent.items) {
        const candidate = rawItem as PdfJsTextItemLike
        const text = typeof candidate.str === 'string' ? candidate.str : ''
        if (!text.trim()) continue
        chunks.push(text)

        const tr = Array.isArray(candidate.transform) ? candidate.transform : [1, 0, 0, 1, 0, 0]
        const rawX = typeof tr[4] === 'number' ? tr[4] : 0
        const rawY = typeof tr[5] === 'number' ? tr[5] : 0
        const fontHeight = Math.max(
          8,
          typeof candidate.height === 'number' && candidate.height > 0
            ? candidate.height
            : Math.hypot(tr[2] ?? 0, tr[3] ?? 0) || 12,
        )
        const itemWidth = Math.max(
          4,
          typeof candidate.width === 'number' ? candidate.width : text.length * 5,
        )

        // Coordonnées PDF : origine en bas à gauche -> normalisé 0..1 origine en haut à gauche.
        const normX = Math.max(0, Math.min(0.99, rawX / pageWidth))
        const normTopY = Math.max(
          0,
          Math.min(0.98, (pageHeight - rawY - fontHeight * 0.85) / pageHeight),
        )
        const normW = Math.max(0.005, Math.min(1 - normX, itemWidth / pageWidth))
        const normH = Math.max(0.01, Math.min(1 - normTopY, (fontHeight * 1.2) / pageHeight))

        items.push({
          text,
          box: { x: normX, y: normTopY, width: normW, height: normH },
        })
      }

      const joined = chunks.join(' ').trim()
      textLength += joined.length
      pages.push({
        pageNumber: p,
        width: Math.round(pageWidth),
        height: Math.round(pageHeight),
        text: joined,
        items,
      })
      page.cleanup()
    }

    return { ok: true, pageCount, pages, textLength }
  } catch {
    return { ok: false, reason: 'parse-failed' }
  } finally {
    try {
      await loadingTask?.destroy()
    } catch {
      // Ignore PDF cleanup failure
    }
    try {
      await (doc as { cleanup?: () => Promise<void> | void } | null)?.cleanup?.()
    } catch {
      // Ignore PDF cleanup failure
    }
  }
}
