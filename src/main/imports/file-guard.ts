import { randomBytes } from 'node:crypto'
import { closeSync, fstatSync, openSync, readSync, statSync } from 'node:fs'
import { basename, extname, isAbsolute, resolve } from 'node:path'
import {
  IMPORT_EXTENSIONS,
  MAX_IMPORT_BYTES,
  type ImportFileFailureReason,
} from '@shared/imports/model'

export interface ValidatedImportFile {
  filePath: string
  fileName: string
  extension: string
  sizeBytes: number
}

export type ValidateFileOutcome =
  { ok: true; file: ValidatedImportFile } | { ok: false; reason: ImportFileFailureReason }

const ALLOWED_SET = new Set<string>(IMPORT_EXTENSIONS)

/**
 * Revalide côté main tout chemin issu d'un dialogue natif ou d'un glisser-déposer
 * (`webUtils.getPathForFile`) : chemin non vide, extension autorisée, fichier régulier et taille bornée.
 */
export function validateStatementFilePath(rawPath: string): ValidateFileOutcome {
  if (!rawPath || rawPath.includes('\0')) {
    return { ok: false, reason: 'invalid-file' }
  }
  const resolved = resolve(rawPath)
  if (!isAbsolute(resolved)) {
    return { ok: false, reason: 'invalid-file' }
  }

  const ext = extname(resolved).toLowerCase()
  if (!ALLOWED_SET.has(ext)) {
    return { ok: false, reason: 'unsupported-extension' }
  }

  try {
    const stat = statSync(resolved)
    if (!stat.isFile() || stat.size <= 0) {
      return { ok: false, reason: 'invalid-file' }
    }
    if (stat.size > MAX_IMPORT_BYTES) {
      return { ok: false, reason: 'file-too-large' }
    }
    return {
      ok: true,
      file: {
        filePath: resolved,
        fileName: basename(resolved),
        extension: ext,
        sizeBytes: stat.size,
      },
    }
  } catch {
    return { ok: false, reason: 'invalid-file' }
  }
}

/** Lit un fichier validé en bornant l'allocation à `MAX_IMPORT_BYTES` (protection TOCTOU). */
export function readBoundedStatementBytes(
  filePath: string,
): { ok: true; bytes: Uint8Array } | { ok: false; reason: ImportFileFailureReason } {
  let fd: number | null = null
  try {
    fd = openSync(filePath, 'r')
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.size <= 0) {
      return { ok: false, reason: 'invalid-file' }
    }
    if (stat.size > MAX_IMPORT_BYTES) {
      return { ok: false, reason: 'file-too-large' }
    }
    const buf = Buffer.allocUnsafe(stat.size + 1)
    let totalRead = 0
    while (totalRead < buf.length) {
      const n = readSync(fd, buf, totalRead, buf.length - totalRead, totalRead)
      if (n === 0) break
      totalRead += n
      if (totalRead > MAX_IMPORT_BYTES) {
        return { ok: false, reason: 'file-too-large' }
      }
    }
    if (totalRead === 0) return { ok: false, reason: 'invalid-file' }
    return { ok: true, bytes: new Uint8Array(buf.buffer, buf.byteOffset, totalRead) }
  } catch {
    return { ok: false, reason: 'invalid-file' }
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

const MAX_STAGED_FILES = 16

/** Table de jetons opaques en mémoire du main : le renderer ne manipule jamais de chemin disque. */
export class StagedImportStore {
  private readonly files = new Map<string, ValidatedImportFile>()

  stage(file: ValidatedImportFile): string {
    if (this.files.size >= MAX_STAGED_FILES) {
      const oldest = this.files.keys().next().value
      if (oldest) this.files.delete(oldest)
    }
    const token = randomBytes(16).toString('hex')
    this.files.set(token, file)
    return token
  }

  get(token: string): ValidatedImportFile | undefined {
    return this.files.get(token)
  }

  clear(): void {
    this.files.clear()
  }
}
