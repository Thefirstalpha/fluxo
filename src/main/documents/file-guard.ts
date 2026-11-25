import { createHash } from 'node:crypto'
import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import { basename, extname, isAbsolute, resolve } from 'node:path'
import {
  DOCUMENT_EXTENSIONS,
  MAX_DOCUMENT_BYTES,
  type DocumentMimeType,
} from '@shared/documents/model'

export type DocumentReadOutcome =
  | {
      ok: true
      fileName: string
      mimeType: DocumentMimeType
      sha256: string
      bytes: Uint8Array
    }
  | {
      ok: false
      reason: 'invalid-file' | 'too-large'
    }

const ALLOWED_EXT = new Set<string>(DOCUMENT_EXTENSIONS)

export function detectDocumentMimeFromMagic(bytes: Uint8Array): DocumentMimeType | null {
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return 'application/pdf'
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  return null
}

/**
 * Lit un document sélectionné ou déposé depuis le système de fichiers :
 * extension vérifiée, ouverture unique sans TOCTOU, taille <= 32 Mio, en-tête magique contrôlé.
 */
export function readBoundedDocumentFile(rawPath: string): DocumentReadOutcome {
  if (!rawPath || rawPath.includes('\0')) return { ok: false, reason: 'invalid-file' }
  const resolved = resolve(rawPath)
  if (!isAbsolute(resolved)) return { ok: false, reason: 'invalid-file' }
  const ext = extname(resolved).toLowerCase()
  if (!ALLOWED_EXT.has(ext)) return { ok: false, reason: 'invalid-file' }

  let fd: number | null = null
  try {
    fd = openSync(resolved, 'r')
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.size <= 0) return { ok: false, reason: 'invalid-file' }
    if (stat.size > MAX_DOCUMENT_BYTES) return { ok: false, reason: 'too-large' }

    const buf = Buffer.allocUnsafe(stat.size + 1)
    let totalRead = 0
    while (totalRead < buf.length) {
      const n = readSync(fd, buf, totalRead, buf.length - totalRead, totalRead)
      if (n === 0) break
      totalRead += n
    }
    if (totalRead > MAX_DOCUMENT_BYTES) return { ok: false, reason: 'too-large' }

    const bytes = new Uint8Array(buf.subarray(0, totalRead))
    const mimeType = detectDocumentMimeFromMagic(bytes)
    if (!mimeType) return { ok: false, reason: 'invalid-file' }

    const sha256 = createHash('sha256').update(bytes).digest('hex')
    return {
      ok: true,
      fileName: basename(resolved).slice(0, 260),
      mimeType,
      sha256,
      bytes,
    }
  } catch {
    return { ok: false, reason: 'invalid-file' }
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

export interface StagedOriginal {
  fileName: string
  mimeType: DocumentMimeType
  bytes: Uint8Array
}

/**
 * Conserve transitoirement en RAM (processus main) les octets originaux d'un document en attente
 * de validation (ADR-018 : zéro conservation par défaut en base ni sur disque).
 * Toute validation, rejet ou verrouillage du coffre efface et remet à zéro les tampons.
 */
export class StagedOriginalBytesStore {
  private readonly items = new Map<string, StagedOriginal>()

  put(documentId: string, entry: StagedOriginal): void {
    this.purge(documentId)
    this.items.set(documentId, entry)
  }

  get(documentId: string): StagedOriginal | null {
    return this.items.get(documentId) ?? null
  }

  has(documentId: string): boolean {
    return this.items.has(documentId)
  }

  getImageDataUrl(documentId: string): string | null {
    const entry = this.items.get(documentId)
    if (!entry) return null
    if (entry.mimeType !== 'image/png' && entry.mimeType !== 'image/jpeg') return null
    const base64 = Buffer.from(entry.bytes).toString('base64')
    return `data:${entry.mimeType};base64,${base64}`
  }

  purge(documentId: string): boolean {
    const existing = this.items.get(documentId)
    if (!existing) return false
    existing.bytes.fill(0)
    this.items.delete(documentId)
    return true
  }

  clear(): void {
    for (const entry of this.items.values()) {
      entry.bytes.fill(0)
    }
    this.items.clear()
  }
}
