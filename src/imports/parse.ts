import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_LINES,
  type CsvProfileConfig,
  type ImportFileFailureReason,
  type ParseInspectResult,
  type ParsedStatement,
  type StatementFormat,
} from '@shared/imports/model'
import { parseCamt053Statement } from './camt053'
import { inspectCsvText, parseCsvStatement } from './csv'
import { detectFormat } from './detect'
import { countLines, decodeBytes, normalizeDeclaredEncoding } from './encoding'
import { parseMt940Statement } from './mt940'
import { inspectOfxHeader, parseOfxStatement } from './ofx'
import { parseQifStatement } from './qif'
import { UnsafeXmlError } from './xml'

export interface ParseBytesRequest {
  bytes: Uint8Array
  fileName: string
  csvConfig?: CsvProfileConfig
  forcedFormat?: StatementFormat
}

export type ParseBytesOutcome =
  | { ok: true; statement: ParsedStatement }
  | { ok: false; reason: ImportFileFailureReason; detail?: string }

function detectDeclaredEncoding(
  bytes: Uint8Array,
  format: StatementFormat,
  csvConfig?: CsvProfileConfig,
) {
  if (format === 'csv' && csvConfig?.encoding) {
    return csvConfig.encoding
  }
  const ascii = new TextDecoder('ascii', { fatal: false }).decode(bytes.subarray(0, 2048))
  if (format === 'ofx' || format === 'qfx') {
    const meta = inspectOfxHeader(ascii)
    if (meta.encoding) return meta.encoding
  }
  if (format === 'camt053' || format === 'ofx' || format === 'qfx') {
    const xmlEnc = /<\?xml[^>]+encoding=["']([^"']+)["']/i.exec(ascii)?.[1]
    const norm = normalizeDeclaredEncoding(xmlEnc)
    if (norm) return norm
  }
  return 'auto' as const
}

function checkBounds(bytes: Uint8Array): ParseBytesOutcome | null {
  if (bytes.byteLength === 0) {
    return { ok: false, reason: 'invalid-file', detail: 'Fichier vide' }
  }
  if (bytes.byteLength > MAX_IMPORT_BYTES) {
    return { ok: false, reason: 'file-too-large' }
  }
  if (countLines(bytes, MAX_IMPORT_LINES) > MAX_IMPORT_LINES) {
    return { ok: false, reason: 'too-many-lines' }
  }
  return null
}

/**
 * Inspecte rapidement un fichier pour proposer le format, l'encodage et, en CSV,
 * les en-têtes détectés sans exécuter la normalisation complète.
 */
export function inspectStatementBytes(request: ParseBytesRequest): ParseInspectResult {
  const boundError = checkBounds(request.bytes)
  if (boundError && !boundError.ok) {
    return boundError
  }

  const format = request.forcedFormat ?? detectFormat(request.bytes, request.fileName)
  const preferredEncoding = detectDeclaredEncoding(request.bytes, format, request.csvConfig)
  const decoded = decodeBytes(request.bytes, preferredEncoding)
  const warnings: ParsedStatement['warnings'] = decoded.fallback
    ? [{ code: 'encoding-fallback', detail: decoded.encoding }]
    : []

  if (format === 'csv') {
    const csvInspection = inspectCsvText(
      decoded.text,
      request.csvConfig?.delimiter,
      request.csvConfig?.skipRows,
    )
    return {
      ok: true,
      format,
      encoding: decoded.encoding,
      csvInspection,
      warnings,
    }
  }

  return {
    ok: true,
    format,
    encoding: decoded.encoding,
    warnings,
  }
}

/**
 * Point d'entrée unique des analyseurs de relevés : vérifie les bornes, décode,
 * détecte le format et produit un `ParsedStatement` normalisé (montants en centimes).
 */
export function parseStatementBytes(request: ParseBytesRequest): ParseBytesOutcome {
  const boundError = checkBounds(request.bytes)
  if (boundError) return boundError

  try {
    const format = request.forcedFormat ?? detectFormat(request.bytes, request.fileName)
    const preferredEncoding = detectDeclaredEncoding(request.bytes, format, request.csvConfig)
    const decoded = decodeBytes(request.bytes, preferredEncoding)

    let statement: ParsedStatement
    switch (format) {
      case 'csv':
        statement = parseCsvStatement(decoded.text, decoded.encoding, request.csvConfig)
        break
      case 'ofx':
      case 'qfx':
        statement = parseOfxStatement(decoded.text, format, decoded.encoding)
        break
      case 'qif':
        statement = parseQifStatement(decoded.text, decoded.encoding)
        break
      case 'camt053':
        statement = parseCamt053Statement(decoded.text, decoded.encoding)
        break
      case 'mt940':
        statement = parseMt940Statement(decoded.text, decoded.encoding)
        break
    }

    if (decoded.fallback) {
      statement.warnings.unshift({ code: 'encoding-fallback', detail: decoded.encoding })
    }
    return { ok: true, statement }
  } catch (error) {
    if (error instanceof UnsafeXmlError) {
      return { ok: false, reason: 'unsafe-xml', detail: error.message }
    }
    return {
      ok: false,
      reason: 'parse-failed',
      detail: error instanceof Error ? error.message : 'Erreur d’analyse',
    }
  }
}
