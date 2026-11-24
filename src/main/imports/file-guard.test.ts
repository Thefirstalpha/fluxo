import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_IMPORT_BYTES } from '@shared/imports/model'
import {
  readBoundedStatementBytes,
  StagedImportStore,
  validateStatementFilePath,
} from './file-guard'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fluxo-file-guard-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('file-guard (M3)', () => {
  it('accepte un fichier de relevé régulier et délivre un jeton opaque', () => {
    const csv = join(dir, 'releve.csv')
    writeFileSync(csv, 'date;libelle;montant\n2026-11-10;Test;-10,00\n')
    const res = validateStatementFilePath(csv)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.file.fileName).toBe('releve.csv')

    const store = new StagedImportStore()
    const token = store.stage(res.file)
    expect(token).toMatch(/^[0-9a-f]{32}$/)
    expect(store.get(token)?.filePath).toBe(res.file.filePath)

    const bytes = readBoundedStatementBytes(res.file.filePath)
    expect(bytes.ok).toBe(true)
  })

  it('refuse les extensions non autorisées, dossiers, fichiers vides et injections nulles', () => {
    const exe = join(dir, 'malware.exe')
    writeFileSync(exe, 'MZ...')
    expect(validateStatementFilePath(exe)).toEqual({
      ok: false,
      reason: 'unsupported-extension',
    })

    const empty = join(dir, 'empty.csv')
    writeFileSync(empty, '')
    expect(validateStatementFilePath(empty)).toEqual({ ok: false, reason: 'invalid-file' })
    expect(validateStatementFilePath(dir)).toEqual({ ok: false, reason: 'unsupported-extension' })
    expect(validateStatementFilePath(`${dir}/a.csv\0.exe`)).toEqual({
      ok: false,
      reason: 'invalid-file',
    })
  })

  it('refuse tout fichier dépassant 20 Mio', () => {
    const large = join(dir, 'large.csv')
    writeFileSync(large, Buffer.alloc(MAX_IMPORT_BYTES + 1, 0x41))
    expect(validateStatementFilePath(large)).toEqual({ ok: false, reason: 'file-too-large' })
    expect(readBoundedStatementBytes(large)).toEqual({ ok: false, reason: 'file-too-large' })
  })
})
