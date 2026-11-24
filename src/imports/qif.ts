import type {
  CsvDateFormat,
  ImportWarning,
  ParsedStatement,
  ParsedTransaction,
  ResolvedEncoding,
} from '@shared/imports/model'
import { parseAmount } from '@shared/money'
import { parseStatementDate } from './dates'

interface QifRecord {
  date?: string
  amount?: string
  payee?: string
  memo?: string
  status?: string
  number?: string
  category?: string
}

function inferQifDateFormat(records: readonly QifRecord[]): CsvDateFormat {
  for (const rec of records) {
    if (!rec.date) continue
    const parts = /^(\d{1,2})[/.\-'](\d{1,2})/.exec(rec.date.trim())
    if (!parts) continue
    const a = Number(parts[1])
    const b = Number(parts[2])
    if (a > 12) return 'DD/MM/YYYY'
    if (b > 12) return 'MM/DD/YYYY'
  }
  return 'DD/MM/YYYY'
}

export function parseQifStatement(text: string, encoding: ResolvedEncoding): ParsedStatement {
  const lines = text.split(/\r?\n/)
  const records: QifRecord[] = []
  let current: QifRecord = {}
  let accountTypeHint: ParsedStatement['accountTypeHint'] = null
  let inAccountBlock = false

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line.trim()) continue

    if (line.startsWith('!')) {
      const upper = line.toUpperCase()
      inAccountBlock = upper.startsWith('!ACCOUNT')
      if (upper.includes('CCARD')) accountTypeHint = 'deferred_card'
      continue
    }

    if (line === '^') {
      if (!inAccountBlock && (current.date || current.amount || current.payee || current.memo)) {
        records.push(current)
      }
      current = {}
      inAccountBlock = false
      continue
    }

    if (inAccountBlock) continue

    const code = line[0]!
    const value = line.slice(1).trim()
    switch (code) {
      case 'D':
        current.date = value
        break
      case 'T':
      case 'U':
        current.amount ??= value
        break
      case 'P':
        current.payee = value
        break
      case 'M':
        current.memo = value
        break
      case 'C':
        current.status = value
        break
      case 'N':
        current.number = value
        break
      case 'L':
        current.category = value
        break
      default:
        break
    }
  }

  if (!inAccountBlock && (current.date || current.amount || current.payee || current.memo)) {
    records.push(current)
  }

  const dateFormat = inferQifDateFormat(records)
  const rows: ParsedTransaction[] = []
  const warnings: ImportWarning[] = []
  let skippedLines = 0

  for (const rec of records) {
    const bookingDate = rec.date ? parseStatementDate(rec.date, dateFormat) : null
    const amount = rec.amount ? parseAmount(rec.amount) : null
    if (!bookingDate || amount === null) {
      skippedLines++
      warnings.push({ code: 'skipped-line', detail: 'Enregistrement QIF sans date ou montant' })
      continue
    }

    const labelParts = [rec.payee, rec.memo].filter((v): v is string => Boolean(v && v.length > 0))
    const labelRaw = (labelParts.join(' · ') || 'Opération QIF').slice(0, 240)
    const statusFlag = (rec.status ?? '').trim().toUpperCase()
    const status =
      statusFlag === 'X' || statusFlag === 'R'
        ? 'reconciled'
        : statusFlag === 'P'
          ? 'pending'
          : 'cleared'

    rows.push({
      index: rows.length,
      bookingDate,
      valueDate: null,
      amount,
      currency: null,
      labelRaw,
      payee: rec.payee ? rec.payee.slice(0, 120) : null,
      note: rec.memo && rec.memo !== rec.payee ? rec.memo.slice(0, 1000) : null,
      status,
      externalId: rec.number || null,
      runningBalance: null,
    })
  }

  const dates = rows.map((r) => r.bookingDate).sort()
  return {
    format: 'qif',
    encoding,
    currency: null,
    accountHint: null,
    accountTypeHint,
    periodStart: dates[0] ?? null,
    periodEnd: dates[dates.length - 1] ?? null,
    openingBalance: null,
    closingBalance: null,
    rows,
    skippedLines,
    warnings,
  }
}
