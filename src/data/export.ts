import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Db } from './db/connection'
import { schemaVersion } from './db/migrations'

/**
 * Export complet, **non chiffré**, dans un format ouvert : un dossier contenant `fluxo.json`
 * (toutes les tables) et un fichier CSV par table. Les valeurs sont celles de la base
 * (montants en centimes, dates `AAAA-MM-JJ`, champs JSON tels quels).
 */
export const EXPORTED_TABLES = [
  'meta',
  'account',
  'category',
  'payee',
  'tag',
  'import_batch',
  'csv_profile',
  'transactions',
  'split',
  'split_tag',
  'rule',
  'classifier_state',
  'categorization_suggestion',
  'recurring_dismissed',
  'employer',
  'contract',
  'payslip',
  'payslip_line',
  'saved_filter',
  'audit_entry',
] as const

/**
 * Cellule CSV (RFC 4180) : guillemets si nécessaire, et neutralisation des formules — un texte
 * commençant par `=`, `+`, `-`, `@`, une tabulation ou un retour chariot est préfixé d'une
 * apostrophe pour qu'un tableur ne l'exécute pas (injection de formule). Les nombres restent tels quels.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  let text = typeof value === 'string' ? value : JSON.stringify(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
): string {
  const lines = [columns.map(csvCell).join(',')]
  for (const row of rows) lines.push(columns.map((column) => csvCell(row[column])).join(','))
  return `${lines.join('\r\n')}\r\n`
}

export interface ExportResult {
  folderName: string
  rows: number
}

export function exportDatabase(
  db: Db,
  directory: string,
  { now, appVersion }: { now: Date; appVersion: string },
): ExportResult {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  const folderName = `Fluxo-export-${stamp}`
  const folder = join(directory, folderName)
  mkdirSync(folder, { recursive: false, mode: 0o700 })

  const tables: Record<string, Record<string, unknown>[]> = {}
  let rows = 0
  for (const table of EXPORTED_TABLES) {
    const columns = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
      (column) => column.name,
    )
    const data = db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all() as Record<string, unknown>[]
    tables[table] = data
    rows += data.length
    writeFileSync(join(folder, `${table}.csv`), toCsv(columns, data), { mode: 0o600 })
  }
  const document = {
    format: 'fluxo-export',
    version: 1,
    exportedAt: now.toISOString(),
    appVersion,
    schemaVersion: schemaVersion(db),
    amounts: 'Entiers en unités mineures (centimes) de la devise indiquée.',
    tables,
  }
  writeFileSync(join(folder, 'fluxo.json'), `${JSON.stringify(document, null, 2)}\n`, {
    mode: 0o600,
  })
  return { folderName, rows }
}
