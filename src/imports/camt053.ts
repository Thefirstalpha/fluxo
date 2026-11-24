import type {
  ImportWarning,
  ParsedStatement,
  ParsedTransaction,
  ResolvedEncoding,
} from '@shared/imports/model'
import { maskIban } from '@shared/ledger/iban'
import { parseAmount, type MinorUnits } from '@shared/money'
import { parseStatementDate } from './dates'
import { childText, findChild, findChildren, parseSafeXml, type XmlNode } from './xml'

function extractBalance(balNode: XmlNode): { code: string | null; amount: MinorUnits | null } {
  const code =
    childText(balNode, 'Tp', 'CdOrPrtry', 'Cd') ?? childText(balNode, 'Tp', 'CdOrPrtry', 'Prtry')
  const amtText = childText(balNode, 'Amt')
  const ind = childText(balNode, 'CdtDbtInd')
  const raw = amtText ? parseAmount(amtText) : null
  if (raw === null) return { code, amount: null }
  const signed = ind === 'DBIT' ? -Math.abs(raw) : Math.abs(raw)
  return { code, amount: signed }
}

function collectUstrd(node: XmlNode | undefined): string[] {
  if (!node) return []
  return findChildren(node, 'Ustrd')
    .map((child) => child.text.trim())
    .filter((t) => t.length > 0)
}

export function parseCamt053Statement(text: string, encoding: ResolvedEncoding): ParsedStatement {
  const root = parseSafeXml(text)
  const container = root.name === 'BkToCstmrStmt' ? root : findChild(root, 'BkToCstmrStmt')
  if (!container) {
    throw new Error('Élément <BkToCstmrStmt> introuvable dans le fichier CAMT.053')
  }

  const stmts = findChildren(container, 'Stmt')
  if (stmts.length === 0) {
    throw new Error('Aucun relevé <Stmt> dans le document CAMT.053')
  }

  const rows: ParsedTransaction[] = []
  const warnings: ImportWarning[] = []
  let skippedLines = 0
  let currency: string | null = null
  let accountHint: string | null = null
  let periodStart: string | null = null
  let periodEnd: string | null = null
  let openingBalance: MinorUnits | null = null
  let closingBalance: MinorUnits | null = null

  for (const stmt of stmts) {
    const acct = findChild(stmt, 'Acct')
    const ccy = childText(acct, 'Ccy')?.toUpperCase()
    if (ccy && /^[A-Z]{3}$/.test(ccy) && !currency) currency = ccy

    const iban = childText(acct, 'Id', 'IBAN')
    if (iban && !accountHint) accountHint = maskIban(iban)

    const frDt = parseStatementDate(childText(stmt, 'FrToDt', 'FrDtTm') ?? '', 'auto')
    const toDt = parseStatementDate(childText(stmt, 'FrToDt', 'ToDtTm') ?? '', 'auto')
    if (frDt && (!periodStart || frDt < periodStart)) periodStart = frDt
    if (toDt && (!periodEnd || toDt > periodEnd)) periodEnd = toDt

    for (const bal of findChildren(stmt, 'Bal')) {
      const { code, amount } = extractBalance(bal)
      if (amount === null) continue
      if (code === 'OPBD' || code === 'PRCD') {
        if (openingBalance === null) openingBalance = amount
      } else if (code === 'CLBD') {
        closingBalance = amount
      }
    }

    for (const ntry of findChildren(stmt, 'Ntry')) {
      const amtNode = findChild(ntry, 'Amt')
      const rawAmount = amtNode ? parseAmount(amtNode.text) : null
      const bookingDate = parseStatementDate(
        childText(ntry, 'BookgDt', 'Dt') ?? childText(ntry, 'BookgDt', 'DtTm') ?? '',
        'auto',
      )
      if (rawAmount === null || !bookingDate) {
        skippedLines++
        warnings.push({ code: 'skipped-line', detail: 'Écriture CAMT sans montant ou date' })
        continue
      }

      const ind = childText(ntry, 'CdtDbtInd')
      const amount = ind === 'DBIT' ? -Math.abs(rawAmount) : Math.abs(rawAmount)
      const entryCcy = amtNode?.attributes.Ccy?.toUpperCase()
      const rowCcy = entryCcy && /^[A-Z]{3}$/.test(entryCcy) ? entryCcy : (currency ?? null)
      if (rowCcy && !currency) currency = rowCcy

      const valueDate = parseStatementDate(
        childText(ntry, 'ValDt', 'Dt') ?? childText(ntry, 'ValDt', 'DtTm') ?? '',
        'auto',
      )

      const statusCode = (
        childText(ntry, 'Sts', 'Cd') ??
        childText(ntry, 'Sts') ??
        ''
      ).toUpperCase()
      const status = statusCode === 'PDNG' ? 'pending' : 'cleared'

      const txDtls = findChild(findChild(ntry, 'NtryDtls'), 'TxDtls')
      const endToEndId = childText(txDtls, 'Refs', 'EndToEndId')
      const acctSvcrRef = childText(ntry, 'AcctSvcrRef') ?? childText(ntry, 'NtryRef')
      const externalId =
        acctSvcrRef ?? (endToEndId && endToEndId !== 'NOTPROVIDED' ? endToEndId : null)

      const rltdPties = findChild(txDtls, 'RltdPties')
      const payee =
        ind === 'DBIT'
          ? (childText(rltdPties, 'Cdtr', 'Nm') ?? childText(rltdPties, 'Dbtr', 'Nm'))
          : (childText(rltdPties, 'Dbtr', 'Nm') ?? childText(rltdPties, 'Cdtr', 'Nm'))

      const ustrd = [
        ...collectUstrd(findChild(txDtls, 'RmtInf')),
        ...collectUstrd(findChild(ntry, 'RmtInf')),
      ]
      const addtl = childText(txDtls, 'AddtlTxInf') ?? childText(ntry, 'AddtlNtryInf')
      const labelParts = [
        ...ustrd,
        addtl && !ustrd.includes(addtl) ? addtl : null,
        payee && ustrd.length === 0 && !addtl ? payee : null,
      ].filter((v): v is string => Boolean(v))

      rows.push({
        index: rows.length,
        bookingDate,
        valueDate,
        amount,
        currency: rowCcy,
        labelRaw: (labelParts.join(' · ') || 'Opération CAMT.053').slice(0, 240),
        payee: payee ? payee.slice(0, 120) : null,
        note:
          endToEndId && endToEndId !== 'NOTPROVIDED' ? `Réf. ${endToEndId}`.slice(0, 1000) : null,
        status,
        externalId,
        runningBalance: null,
      })
    }
  }

  const dates = rows.map((r) => r.bookingDate).sort()
  if (!periodStart) periodStart = dates[0] ?? null
  if (!periodEnd) periodEnd = dates[dates.length - 1] ?? null

  return {
    format: 'camt053',
    encoding,
    currency,
    accountHint,
    accountTypeHint: null,
    periodStart,
    periodEnd,
    openingBalance,
    closingBalance,
    rows,
    skippedLines,
    warnings,
  }
}
