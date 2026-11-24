import type {
  ImportWarning,
  ParsedStatement,
  ParsedTransaction,
  ResolvedEncoding,
  StatementFormat,
} from '@shared/imports/model'
import { parseAmount, type MinorUnits } from '@shared/money'
import { parseStatementDate } from './dates'
import {
  decodeXmlEntities,
  findChild,
  findChildren,
  parseSafeXml,
  UnsafeXmlError,
  type XmlNode,
} from './xml'

export interface OfxHeaderMeta {
  encoding?: 'utf-8' | 'windows-1252' | 'iso-8859-1'
  bodyOffset: number
  isXml: boolean
}

export function inspectOfxHeader(rawAsciiSample: string): OfxHeaderMeta {
  const ofxIndex = rawAsciiSample.search(/<OFX[\s>]/i)
  const xmlIndex = rawAsciiSample.indexOf('<?xml')
  const headerText = ofxIndex >= 0 ? rawAsciiSample.slice(0, ofxIndex) : rawAsciiSample
  const charsetMatch = /CHARSET\s*:\s*([^\r\n]+)/i.exec(headerText)
  const encMatch = /ENCODING\s*:\s*([^\r\n]+)/i.exec(headerText)
  const charset = charsetMatch?.[1]?.trim().toUpperCase()
  const enc = encMatch?.[1]?.trim().toUpperCase()

  let encoding: OfxHeaderMeta['encoding']
  if (charset === '1252' || charset === 'WINDOWS-1252') encoding = 'windows-1252'
  else if (charset === 'ISO-8859-1') encoding = 'iso-8859-1'
  else if (charset === 'UTF-8' || enc === 'UTF-8') encoding = 'utf-8'

  const isXml = xmlIndex >= 0 || /OFXHEADER\s*=\s*["']?2/i.test(headerText)
  return { encoding, bodyOffset: Math.max(0, ofxIndex), isXml }
}

function parseSgmlOfxTree(sgml: string): XmlNode {
  if (/<!(?:DOCTYPE|ENTITY)/i.test(sgml)) {
    throw new UnsafeXmlError('Déclaration DOCTYPE/ENTITY interdite')
  }

  const stack: XmlNode[] = []
  let root: XmlNode | null = null
  const tokenRe = /<([^>]+)>([^<]*)/g
  let match: RegExpExecArray | null

  while ((match = tokenRe.exec(sgml)) !== null) {
    const rawTag = match[1]!.trim()
    const trailingText = decodeXmlEntities(match[2] ?? '').trim()

    if (rawTag.startsWith('?') || rawTag.startsWith('!')) continue

    if (rawTag.startsWith('/')) {
      const closeName = rawTag.slice(1).trim().toUpperCase()
      // En SGML OFX, des balises feuilles restent ouvertes sans </TAG> jusqu'au parent fermé.
      while (stack.length > 0 && stack[stack.length - 1]!.name !== closeName) {
        stack.pop()
      }
      if (stack.length > 0 && stack[stack.length - 1]!.name === closeName) {
        stack.pop()
      }
      continue
    }

    const name = rawTag.split(/\s+/)[0]!.toUpperCase()
    // Une balise précédente contenant déjà du texte est forcément une feuille SGML.
    while (
      stack.length > 0 &&
      stack[stack.length - 1]!.text.length > 0 &&
      stack[stack.length - 1]!.children.length === 0
    ) {
      stack.pop()
    }

    const node: XmlNode = { name, attributes: {}, children: [], text: trailingText }
    if (stack.length === 0) {
      if (!root) root = node
    } else {
      stack[stack.length - 1]!.children.push(node)
    }
    stack.push(node)
  }

  if (!root) throw new Error('Bloc <OFX> introuvable')
  return root
}

function collectNodes(node: XmlNode, targetUpperName: string, out: XmlNode[] = []): XmlNode[] {
  if (node.name.toUpperCase() === targetUpperName) out.push(node)
  for (const child of node.children) collectNodes(child, targetUpperName, out)
  return out
}

function textCI(node: XmlNode | undefined, childName: string): string | null {
  if (!node) return null
  const upper = childName.toUpperCase()
  const child = node.children.find((c) => c.name.toUpperCase() === upper)
  const val = child?.text.trim()
  return val && val.length > 0 ? val : null
}

function childCI(node: XmlNode | undefined, childName: string): XmlNode | undefined {
  if (!node) return undefined
  const upper = childName.toUpperCase()
  return node.children.find((c) => c.name.toUpperCase() === upper)
}

function maskAccountHint(raw: string | null): string | null {
  if (!raw) return null
  const compact = raw.replace(/\s+/g, '')
  if (compact.length <= 4) return compact
  return `•••• ${compact.slice(-4)}`
}

export function parseOfxStatement(
  text: string,
  format: Extract<StatementFormat, 'ofx' | 'qfx'>,
  encoding: ResolvedEncoding,
): ParsedStatement {
  const meta = inspectOfxHeader(text.slice(0, 4096))
  const ofxStart = text.search(/<OFX[\s>]/i)
  if (ofxStart < 0) {
    throw new Error('En-tête <OFX> introuvable')
  }
  const xmlSlice = meta.isXml ? text.slice(Math.max(0, text.indexOf('<'))) : text.slice(ofxStart)
  const root = meta.isXml ? parseSafeXml(xmlSlice) : parseSgmlOfxTree(xmlSlice)

  const bankStmts = collectNodes(root, 'STMTRS')
  const cardStmts = collectNodes(root, 'CCSTMTRS')
  const stmts = [...bankStmts, ...cardStmts]
  if (stmts.length === 0) {
    // Tolérance : certains exports utilisent <OFX> simplifié.
    const direct = findChild(root, 'BANKMSGSRSV1') ?? findChild(root, 'CREDITCARDMSGSRSV1')
    if (direct) stmts.push(...findChildren(direct, 'STMTRS'))
  }

  const rows: ParsedTransaction[] = []
  const warnings: ImportWarning[] = []
  let skippedLines = 0
  let currency: string | null = null
  let accountHint: string | null = null
  let periodStart: string | null = null
  let periodEnd: string | null = null
  let closingBalance: MinorUnits | null = null

  for (const stmt of stmts) {
    const stmtCur = textCI(stmt, 'CURDEF')?.toUpperCase()
    if (stmtCur && /^[A-Z]{3}$/.test(stmtCur) && !currency) currency = stmtCur

    const acct = childCI(stmt, 'BANKACCTFROM') ?? childCI(stmt, 'CCACCTFROM')
    if (!accountHint) accountHint = maskAccountHint(textCI(acct, 'ACCTID'))

    const tranList = childCI(stmt, 'BANKTRANLIST')
    const dtStart = parseStatementDate(textCI(tranList, 'DTSTART') ?? '', 'auto')
    const dtEnd = parseStatementDate(textCI(tranList, 'DTEND') ?? '', 'auto')
    if (dtStart && (!periodStart || dtStart < periodStart)) periodStart = dtStart
    if (dtEnd && (!periodEnd || dtEnd > periodEnd)) periodEnd = dtEnd

    const txNodes = collectNodes(tranList ?? stmt, 'STMTTRN')
    for (const trn of txNodes) {
      const bookingDate = parseStatementDate(textCI(trn, 'DTPOSTED') ?? '', 'auto')
      const rawAmt = textCI(trn, 'TRNAMT')
      const amount = rawAmt ? parseAmount(rawAmt) : null
      if (!bookingDate || amount === null) {
        skippedLines++
        warnings.push({ code: 'skipped-line', detail: 'Transaction OFX sans date ou montant' })
        continue
      }

      const valueDate = parseStatementDate(textCI(trn, 'DTUSER') ?? '', 'auto')
      const name = textCI(trn, 'NAME')
      const memo = textCI(trn, 'MEMO')
      const trnType = textCI(trn, 'TRNTYPE')?.toUpperCase()
      const fitid = textCI(trn, 'FITID')

      const parts = [name, memo && memo !== name ? memo : null].filter((v): v is string =>
        Boolean(v),
      )
      const labelRaw = (parts.join(' · ') || trnType || 'Opération OFX').slice(0, 240)
      const status = trnType === 'PENDING' ? 'pending' : 'cleared'

      rows.push({
        index: rows.length,
        bookingDate,
        valueDate,
        amount,
        currency: stmtCur && /^[A-Z]{3}$/.test(stmtCur) ? stmtCur : null,
        labelRaw,
        payee: name ? name.slice(0, 120) : null,
        note: memo && memo !== name ? memo.slice(0, 1000) : null,
        status,
        externalId: fitid,
        runningBalance: null,
      })
    }

    const ledgerBal = childCI(stmt, 'LEDGERBAL')
    const balAmtRaw = textCI(ledgerBal, 'BALAMT')
    const balAmt = balAmtRaw ? parseAmount(balAmtRaw) : null
    if (balAmt !== null) closingBalance = balAmt
  }

  const dates = rows.map((r) => r.bookingDate).sort()
  if (!periodStart) periodStart = dates[0] ?? null
  if (!periodEnd) periodEnd = dates[dates.length - 1] ?? null

  return {
    format,
    encoding,
    currency,
    accountHint,
    accountTypeHint: cardStmts.length > 0 && bankStmts.length === 0 ? 'deferred_card' : null,
    periodStart,
    periodEnd,
    openingBalance: null,
    closingBalance,
    rows,
    skippedLines,
    warnings,
  }
}
