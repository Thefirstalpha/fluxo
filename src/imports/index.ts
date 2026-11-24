/**
 * Processus isolé (`utilityProcess`) dédié à l'analyse de relevés bancaires.
 * Ne détient aucune clé, aucun accès SQLite, aucune permission réseau ni lecture disque :
 * reçoit les octets bornés depuis le main via `parentPort` et renvoie des données normalisées.
 */
import type { CsvProfileConfig, StatementFormat } from '@shared/imports/model'
import { inspectStatementBytes, parseStatementBytes } from './parse'

export interface ParserWorkerRequest {
  id: number
  op: 'inspect' | 'parse'
  fileName: string
  bytes: Uint8Array
  csvConfig?: CsvProfileConfig
  forcedFormat?: StatementFormat
}

export interface ParserWorkerResponse {
  id: number
  result: ReturnType<typeof inspectStatementBytes> | ReturnType<typeof parseStatementBytes>
}

function isRequest(value: unknown): value is ParserWorkerRequest {
  if (typeof value !== 'object' || value === null) return false
  const rec = value as Record<string, unknown>
  return (
    typeof rec.id === 'number' &&
    (rec.op === 'inspect' || rec.op === 'parse') &&
    typeof rec.fileName === 'string' &&
    rec.bytes instanceof Uint8Array
  )
}

process.parentPort.on('message', (event: { data: unknown }) => {
  const payload = event.data
  if (!isRequest(payload)) return

  const request = {
    bytes: payload.bytes,
    fileName: payload.fileName,
    csvConfig: payload.csvConfig,
    forcedFormat: payload.forcedFormat,
  }

  const result =
    payload.op === 'inspect' ? inspectStatementBytes(request) : parseStatementBytes(request)

  const response: ParserWorkerResponse = { id: payload.id, result }
  process.parentPort.postMessage(response)
})
