import type {
  CsvColumnRef,
  CsvDelimiter,
  CsvInspection,
  CsvProfileConfig,
  ImportWarning,
  ParsedStatement,
  ParsedTransaction,
  ResolvedEncoding,
} from '@shared/imports/model'
import { suggestCsvConfig } from '@shared/imports/profiles'
import { parseAmount, type MinorUnits } from '@shared/money'
import { parseStatementDate } from './dates'

const DELIMITERS: readonly CsvDelimiter[] = [';', ',', '\t', '|']

/** Analyseur CSV conforme RFC 4180 tolérant les champs quotés multi-lignes. */
export function parseCsvRows(text: string, delimiter: CsvDelimiter): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
      continue
    }

    if (ch === '"') {
      if (cell.length === 0) {
        inQuotes = true
      } else {
        cell += ch
      }
    } else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      if (row.some((c) => c.trim().length > 0)) {
        rows.push(row)
      }
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }

  row.push(cell)
  if (row.some((c) => c.trim().length > 0)) {
    rows.push(row)
  }
  return rows
}

export function detectCsvDelimiter(sampleText: string): CsvDelimiter {
  const lines = sampleText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 30)

  let bestDelimiter: CsvDelimiter = ';'
  let bestScore = -1

  for (const delim of DELIMITERS) {
    const counts = lines.map((line) => parseCsvRows(line, delim)[0]?.length ?? 1)
    const multi = counts.filter((c) => c >= 2)
    if (multi.length === 0) continue

    const freq = new Map<number, number>()
    for (const c of multi) freq.set(c, (freq.get(c) ?? 0) + 1)
    let modeCount = 0
    for (const f of freq.values()) if (f > modeCount) modeCount = f

    const maxCols = Math.max(...multi)
    const score = modeCount * 100 + Math.min(maxCols, 20)
    if (score > bestScore) {
      bestScore = score
      bestDelimiter = delim
    }
  }

  return bestDelimiter
}

function looksLikeHeaderRow(cells: readonly string[]): boolean {
  if (cells.length < 2) return false
  const joined = cells
    .join(' ')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en')
  const hasDate = /\bdate\b/.test(joined)
  const hasLabelOrAmount = /\b(libelle|label|description|montant|amount|debit|credit)\b/.test(
    joined,
  )
  return hasDate && hasLabelOrAmount
}

export function detectSkipRows(rows: readonly string[][]): number {
  const limit = Math.min(rows.length, 20)
  for (let i = 0; i < limit; i++) {
    if (looksLikeHeaderRow(rows[i]!)) return i
  }
  // Sinon, ignorer uniquement d'éventuelles lignes de méta-données mono-colonne en tête.
  for (let i = 0; i < Math.min(rows.length - 1, 10); i++) {
    const currentCols = rows[i]!.length
    const nextCols = rows[i + 1]!.length
    if (currentCols === 1 && nextCols >= 3) return i + 1
  }
  return 0
}

export function inspectCsvText(
  text: string,
  overrideDelimiter?: CsvDelimiter,
  overrideSkipRows?: number,
): CsvInspection {
  const delimiter = overrideDelimiter ?? detectCsvDelimiter(text.slice(0, 16_384))
  const rows = parseCsvRows(text, delimiter)
  const skipRows = overrideSkipRows ?? detectSkipRows(rows)
  const headerRow = rows[skipRows] ?? []
  const firstData = rows[skipRows + 1]
  const hasHeader =
    headerRow.length > 0 &&
    !parseStatementDate(headerRow[0]?.trim() ?? '', 'auto') &&
    parseAmount(headerRow[headerRow.length - 1] ?? '') === null

  const headers = hasHeader
    ? headerRow.map((cell, index) => cell.trim() || `Col ${index + 1}`)
    : headerRow.map((_, index) => `Col ${index + 1}`)
  const dataStart = hasHeader ? skipRows + 1 : skipRows
  const sampleRows = rows.slice(dataStart, dataStart + 5)
  const { profileId, config } = suggestCsvConfig(
    hasHeader ? headerRow : headers,
    delimiter,
    skipRows,
    hasHeader,
  )

  return {
    delimiter,
    skipRows,
    hasHeader,
    headers,
    sampleRows,
    suggestedProfileId: profileId,
    suggestedConfig: {
      ...config,
      ...(firstData ? {} : {}),
    },
  }
}

function normColName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en')
    .trim()
}

function resolveColIndex(
  ref: CsvColumnRef | null | undefined,
  headers: readonly string[],
): number | null {
  if (ref === null || ref === undefined) return null
  if (typeof ref === 'number') return ref >= 0 ? ref : null
  const exact = headers.findIndex((h) => h.trim() === ref.trim())
  if (exact >= 0) return exact
  const target = normColName(ref)
  const fuzzy = headers.findIndex((h) => normColName(h) === target)
  return fuzzy >= 0 ? fuzzy : null
}

function readCell(row: readonly string[], index: number | null): string {
  if (index === null || index < 0 || index >= row.length) return ''
  return row[index]!.trim()
}

function parseCsvStatus(raw: string): 'pending' | 'cleared' | 'reconciled' {
  const upper = raw.trim().toUpperCase()
  if (upper.includes('PENDING') || upper.includes('ATTENTE') || upper.includes('EN COURS')) {
    return 'pending'
  }
  if (upper.includes('RECONCIL') || upper.includes('RAPPROCH')) {
    return 'reconciled'
  }
  return 'cleared'
}

function inferCsvBalances(rows: readonly ParsedTransaction[]): {
  openingBalance: MinorUnits | null
  closingBalance: MinorUnits | null
} {
  const withBalance = rows.filter((r) => r.runningBalance !== null)
  if (withBalance.length === 0 || withBalance.length !== rows.length) {
    return { openingBalance: null, closingBalance: null }
  }

  const first = rows[0]!
  const last = rows[rows.length - 1]!
  let descending = false
  if (first.bookingDate > last.bookingDate) {
    descending = true
  } else if (first.bookingDate < last.bookingDate) {
    descending = false
  } else if (rows.length >= 2) {
    const second = rows[1]!
    // Décroissant : solde[0] - montant[0] === solde[1]
    if (
      first.runningBalance !== null &&
      second.runningBalance !== null &&
      first.runningBalance - first.amount === second.runningBalance
    ) {
      descending = true
    }
  }

  const newest = descending ? first : last
  const oldest = descending ? last : first
  return {
    openingBalance: oldest.runningBalance !== null ? oldest.runningBalance - oldest.amount : null,
    closingBalance: newest.runningBalance,
  }
}

export function parseCsvStatement(
  text: string,
  encoding: ResolvedEncoding,
  customConfig?: CsvProfileConfig,
): ParsedStatement {
  const inspection = inspectCsvText(text, customConfig?.delimiter, customConfig?.skipRows)
  const config = customConfig ?? inspection.suggestedConfig
  const allRows = parseCsvRows(text, config.delimiter)
  const headerRow = config.hasHeader ? (allRows[config.skipRows] ?? []) : []
  const dataStart = config.hasHeader ? config.skipRows + 1 : config.skipRows

  const bookingCol = resolveColIndex(config.columns.bookingDate, headerRow)
  const valueCol = resolveColIndex(config.columns.valueDate, headerRow)
  const labelCol = resolveColIndex(config.columns.label, headerRow)
  const labelSecondaryCol = resolveColIndex(config.columns.labelSecondary, headerRow)
  const payeeCol = resolveColIndex(config.columns.payee, headerRow)
  const noteCol = resolveColIndex(config.columns.note, headerRow)
  const amountCol = resolveColIndex(config.columns.amount, headerRow)
  const debitCol = resolveColIndex(config.columns.debit, headerRow)
  const creditCol = resolveColIndex(config.columns.credit, headerRow)
  const dcFlagCol = resolveColIndex(config.columns.debitCreditFlag, headerRow)
  const balanceCol = resolveColIndex(config.columns.balance, headerRow)
  const currencyCol = resolveColIndex(config.columns.currency, headerRow)
  const statusCol = resolveColIndex(config.columns.status, headerRow)

  const parsedRows: ParsedTransaction[] = []
  const warnings: ImportWarning[] = []
  let skippedLines = 0
  let statementCurrency: string | null = null

  for (let i = dataStart; i < allRows.length; i++) {
    const row = allRows[i]!
    const bookingDate = parseStatementDate(readCell(row, bookingCol), config.dateFormat)
    if (!bookingDate) {
      skippedLines++
      warnings.push({ line: i + 1, code: 'skipped-line', detail: 'Date invalide ou absente' })
      continue
    }

    let amount: MinorUnits
    if (config.amountMode === 'split') {
      const debitRaw = readCell(row, debitCol)
      const creditRaw = readCell(row, creditCol)
      const debit = debitRaw ? parseAmount(debitRaw) : 0
      const credit = creditRaw ? parseAmount(creditRaw) : 0
      if (debit === null || credit === null || (!debitRaw && !creditRaw)) {
        skippedLines++
        warnings.push({
          line: i + 1,
          code: 'skipped-line',
          detail: 'Montant débit/crédit invalide',
        })
        continue
      }
      amount = Math.abs(credit) - Math.abs(debit)
    } else {
      const rawAmount = readCell(row, amountCol)
      const parsed = rawAmount ? parseAmount(rawAmount) : null
      if (parsed === null) {
        skippedLines++
        warnings.push({ line: i + 1, code: 'skipped-line', detail: 'Montant invalide' })
        continue
      }
      amount = parsed
      const dcFlag = readCell(row, dcFlagCol).toUpperCase()
      if (dcFlag) {
        if (dcFlag === 'D' || dcFlag === 'DBIT' || dcFlag === 'DEBIT') {
          amount = -Math.abs(amount)
        } else if (dcFlag === 'C' || dcFlag === 'CRDT' || dcFlag === 'CREDIT') {
          amount = Math.abs(amount)
        }
      }
    }

    if (config.negateAmount) amount = -amount

    const mainLabel = readCell(row, labelCol)
    const secondary = readCell(row, labelSecondaryCol)
    const labelRaw =
      [mainLabel, secondary].filter((part) => part.length > 0).join(' — ') || 'Opération'

    const rawValueDate = readCell(row, valueCol)
    const valueDate = rawValueDate ? parseStatementDate(rawValueDate, config.dateFormat) : null
    const payee = readCell(row, payeeCol) || null
    const note = readCell(row, noteCol) || null
    const currencyRaw = readCell(row, currencyCol).toUpperCase()
    const currency = /^[A-Z]{3}$/.test(currencyRaw) ? currencyRaw : null
    if (currency && !statementCurrency) statementCurrency = currency

    const balanceRaw = readCell(row, balanceCol)
    const runningBalance = balanceRaw ? parseAmount(balanceRaw) : null
    const status = statusCol !== null ? parseCsvStatus(readCell(row, statusCol)) : 'cleared'

    parsedRows.push({
      index: parsedRows.length,
      bookingDate,
      valueDate,
      amount,
      currency,
      labelRaw: labelRaw.slice(0, 240),
      payee: payee ? payee.slice(0, 120) : null,
      note: note ? note.slice(0, 1000) : null,
      status,
      externalId: null,
      runningBalance,
    })
  }

  const dates = parsedRows.map((r) => r.bookingDate).sort()
  const { openingBalance, closingBalance } = inferCsvBalances(parsedRows)

  return {
    format: 'csv',
    encoding,
    currency: statementCurrency,
    accountHint: null,
    accountTypeHint: null,
    periodStart: dates[0] ?? null,
    periodEnd: dates[dates.length - 1] ?? null,
    openingBalance,
    closingBalance,
    rows: parsedRows,
    skippedLines,
    warnings,
    csvInspection: inspection,
  }
}
