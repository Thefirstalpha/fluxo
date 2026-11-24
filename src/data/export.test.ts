import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { csvCell, exportDatabase, toCsv } from './export'
import { openTestLedger, type TestLedger } from './ledger/testing'

let t: TestLedger
let dir: string

beforeEach(() => {
  t = openTestLedger()
  dir = mkdtempSync(join(tmpdir(), 'fluxo-export-'))
})

afterEach(() => {
  t.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('export CSV et neutralisation des formules', () => {
  it('neutralise les préfixes d’injection de formule (=, +, -, @, tabulation, CR) dans les chaînes CSV', () => {
    expect(csvCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)")
    expect(csvCell('+cmd|"/c calc"!A0')).toBe('"\'+cmd|""/c calc""!A0"')
    expect(csvCell('-10+20')).toBe("'-10+20")
    expect(csvCell('@HYPERLINK("x")')).toBe('"\'@HYPERLINK(""x"")"')
    expect(csvCell('\t=1+1')).toBe("'\t=1+1")
    expect(csvCell('\r=1+1')).toBe('"\'\r=1+1"')
    expect(csvCell(-4250)).toBe('-4250')
    expect(toCsv(['libelle', 'montant'], [{ libelle: '=1+1', montant: -100 }])).toBe(
      "libelle,montant\r\n'=1+1,-100\r\n",
    )
  })

  it('inclut csv_profile et import_batch dans le dossier exporté', () => {
    const res = exportDatabase(t.db, dir, {
      now: new Date('2026-11-24T12:00:00.000Z'),
      appVersion: '0.4.0',
    })
    const json = JSON.parse(readFileSync(join(dir, res.folderName, 'fluxo.json'), 'utf8')) as {
      schemaVersion: number
      tables: Record<string, unknown[]>
    }
    expect(json.schemaVersion).toBeGreaterThanOrEqual(3)
    expect(Array.isArray(json.tables.csv_profile)).toBe(true)
    expect(Array.isArray(json.tables.import_batch)).toBe(true)
  })
})
