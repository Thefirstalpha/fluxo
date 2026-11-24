import type {
  ImportWarning,
  ParsedStatement,
  ParsedTransaction,
  ResolvedEncoding,
} from '@shared/imports/model'
import { maskIban } from '@shared/ledger/iban'
import { parseAmount, type MinorUnits } from '@shared/money'
import { parseMt940Date, toValidIsoDate } from './dates'

interface MtTag {
  tag: string
  value: string
}

function splitMt940Tags(text: string): MtTag[] {
  const tags: MtTag[] = []
  let current: MtTag | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd()
    if (!line || line === '-' || line.startsWith('{') || line === '-}') {
      if (line.startsWith('{-') || line === '-}' || line === '-') {
        if (current) {
          tags.push(current)
          current = null
        }
      }
      continue
    }

    const tagMatch = /^:(\d{2}[A-Z]?):(.*)$/.exec(line)
    if (tagMatch) {
      if (current) tags.push(current)
      current = { tag: tagMatch[1]!, value: tagMatch[2]! }
    } else if (current) {
      current.value = `${current.value}\n${line}`
    }
  }

  if (current) tags.push(current)
  return tags
}

function parseBalanceTag(raw: string): {
  currency: string | null
  amount: MinorUnits | null
  date: string | null
} {
  const m = /^([CD])(\d{6})([A-Z]{3})([0-9.,]+)$/.exec(raw.trim())
  if (!m) return { currency: null, amount: null, date: null }
  const sign = m[1] === 'D' ? -1 : 1
  const date = parseMt940Date(m[2]!)
  const currency = m[3]!
  const abs = parseAmount(m[4]!)
  if (abs === null) return { currency, amount: null, date }
  return { currency, amount: sign * Math.abs(abs), date }
}

function parseEntryDate(valueDateIso: string, mmdd: string | undefined): string {
  if (!mmdd) return valueDateIso
  const baseYear = Number(valueDateIso.slice(0, 4))
  const valueMonth = Number(valueDateIso.slice(5, 7))
  const entryMonth = Number(mmdd.slice(0, 2))
  const entryDay = Number(mmdd.slice(2, 4))

  let year = baseYear
  if (valueMonth === 12 && entryMonth === 1) year += 1
  else if (valueMonth === 1 && entryMonth === 12) year -= 1

  return toValidIsoDate(year, entryMonth, entryDay) ?? valueDateIso
}

function parseTag86Narrative(raw: string): {
  label: string
  payee: string | null
  note: string | null
} {
  const collapsed = raw.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim()
  if (!collapsed) return { label: 'Opération MT940', payee: null, note: null }

  // Détection de sous-champs allemands/SEPA `?20 ... ?32 ...`
  if (/^\?\d{2}/.test(collapsed) || /\?\d{2}/.test(collapsed)) {
    const parts = collapsed.split(/(\?\d{2})/)
    const fields = new Map<string, string>()
    let currentCode: string | null = null
    for (const part of parts) {
      if (/^\?\d{2}$/.test(part)) {
        currentCode = part
      } else if (currentCode) {
        const prev = fields.get(currentCode) ?? ''
        fields.set(currentCode, `${prev} ${part}`.trim())
      }
    }
    const payeeParts = [fields.get('?32'), fields.get('?33')].filter((v): v is string => Boolean(v))
    const payee = payeeParts.join(' ').trim() || null
    const descParts: string[] = []
    for (let code = 20; code <= 29; code++) {
      const text = fields.get(`?${code}`)
      if (text) descParts.push(text)
    }
    const gvc = fields.get('?00')
    const label = (descParts.join(' ') || payee || gvc || collapsed).trim()
    return {
      label: label.slice(0, 240),
      payee: payee ? payee.slice(0, 120) : null,
      note: gvc ? gvc.slice(0, 1000) : null,
    }
  }

  return { label: collapsed.slice(0, 240), payee: null, note: null }
}

export function parseMt940Statement(text: string, encoding: ResolvedEncoding): ParsedStatement {
  const tags = splitMt940Tags(text)
  if (tags.length === 0) {
    throw new Error('Aucune balise SWIFT MT940 reconnue')
  }

  const rows: ParsedTransaction[] = []
  const warnings: ImportWarning[] = []
  let skippedLines = 0
  let currency: string | null = null
  let accountHint: string | null = null
  let openingBalance: MinorUnits | null = null
  let closingBalance: MinorUnits | null = null
  let pendingEntry: {
    bookingDate: string
    valueDate: string
    amount: MinorUnits
    externalId: string | null
    rawLineRef: string | null
  } | null = null

  const flushPending = (narrative?: string) => {
    if (!pendingEntry) return
    const info = narrative
      ? parseTag86Narrative(narrative)
      : { label: pendingEntry.rawLineRef || 'Opération MT940', payee: null, note: null }
    rows.push({
      index: rows.length,
      bookingDate: pendingEntry.bookingDate,
      valueDate: pendingEntry.valueDate,
      amount: pendingEntry.amount,
      currency,
      labelRaw: info.label,
      payee: info.payee,
      note: info.note,
      status: 'cleared',
      externalId: pendingEntry.externalId,
      runningBalance: null,
    })
    pendingEntry = null
  }

  for (const item of tags) {
    if (item.tag === '25') {
      const cleaned = item.value.trim()
      if (cleaned && !accountHint) accountHint = maskIban(cleaned)
    } else if (item.tag === '60F' || item.tag === '60M') {
      flushPending()
      const bal = parseBalanceTag(item.value)
      if (bal.currency && !currency) currency = bal.currency
      if (item.tag === '60F' && openingBalance === null && bal.amount !== null) {
        openingBalance = bal.amount
      } else if (openingBalance === null && bal.amount !== null) {
        openingBalance = bal.amount
      }
    } else if (item.tag === '62F' || item.tag === '62M') {
      flushPending()
      const bal = parseBalanceTag(item.value)
      if (bal.currency && !currency) currency = bal.currency
      if (bal.amount !== null) closingBalance = bal.amount
    } else if (item.tag === '61') {
      flushPending()
      const firstLine = item.value.split(/\r?\n/)[0]!.trim()
      const m = /^(\d{6})(\d{4})?(RC|RD|C|D)([A-Z])?(\d+(?:[.,]\d{1,2})?)([A-Z0-9]{4})?(.*)$/.exec(
        firstLine,
      )
      if (!m) {
        skippedLines++
        warnings.push({ code: 'skipped-line', detail: 'Ligne :61: MT940 non reconnue' })
        continue
      }
      const valueDate = parseMt940Date(m[1]!)
      const rawAmt = parseAmount(m[5]!)
      if (!valueDate || rawAmt === null) {
        skippedLines++
        warnings.push({ code: 'skipped-line', detail: 'Date ou montant :61: invalide' })
        continue
      }
      const bookingDate = parseEntryDate(valueDate, m[2])
      const ind = m[3]!
      const sign = ind === 'D' || ind === 'RC' ? -1 : 1
      const rest = m[7] ?? ''
      const slashIdx = rest.indexOf('//')
      const extRef = slashIdx >= 0 ? rest.slice(slashIdx + 2).trim() : null
      const customerRef = slashIdx >= 0 ? rest.slice(0, slashIdx).trim() : rest.trim()
      const extraLines = item.value.split(/\r?\n/).slice(1).join(' ').trim()

      pendingEntry = {
        bookingDate,
        valueDate,
        amount: sign * Math.abs(rawAmt),
        externalId: extRef || (customerRef && customerRef !== 'NONREF' ? customerRef : null),
        rawLineRef: extraLines || (customerRef && customerRef !== 'NONREF' ? customerRef : null),
      }
    } else if (item.tag === '86') {
      if (pendingEntry) {
        flushPending(item.value)
      }
    }
  }

  flushPending()

  const dates = rows.map((r) => r.bookingDate).sort()
  return {
    format: 'mt940',
    encoding,
    currency,
    accountHint,
    accountTypeHint: null,
    periodStart: dates[0] ?? null,
    periodEnd: dates[dates.length - 1] ?? null,
    openingBalance,
    closingBalance,
    rows,
    skippedLines,
    warnings,
  }
}
