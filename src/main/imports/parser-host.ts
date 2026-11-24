import { join } from 'node:path'
import { utilityProcess, type UtilityProcess } from 'electron'
import type { CsvProfileConfig, ParseInspectResult, StatementFormat } from '@shared/imports/model'
import type { ParserWorkerRequest, ParserWorkerResponse } from '../../imports/index'
import type { ParseBytesOutcome } from '../../imports/parse'
import { logger } from '../logger'

const PARSE_TIMEOUT_MS = 15_000

interface PendingParse {
  resolve: (value: ParserWorkerResponse['result']) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Pilote le processus isolé d'analyse de relevés (`import-parser.js`).
 * Tout délai dépassé ou plantage tue le processus enfant et retourne une erreur contrôlée.
 */
export class ImportParserHost {
  private child: UtilityProcess | null = null
  private nextId = 1
  private readonly pending = new Map<number, PendingParse>()

  private ensureWorker(): UtilityProcess {
    if (this.child) return this.child
    const child = utilityProcess.fork(join(__dirname, 'import-parser.js'), [], {
      serviceName: 'Fluxo — analyseur de relevés',
      stdio: 'ignore',
    })
    child.on('message', (data: unknown) => {
      const msg = data as Partial<ParserWorkerResponse> | null
      if (!msg || typeof msg.id !== 'number' || !msg.result) return
      const entry = this.pending.get(msg.id)
      if (!entry) return
      this.pending.delete(msg.id)
      clearTimeout(entry.timer)
      entry.resolve(msg.result)
    })
    child.once('exit', (code) => {
      if (this.child !== child) return
      if (code !== 0) logger.warn(`Analyseur de relevés arrêté (code ${code}).`)
      this.child = null
      for (const [id, entry] of this.pending.entries()) {
        clearTimeout(entry.timer)
        entry.resolve({ ok: false, reason: 'parse-failed' })
        this.pending.delete(id)
      }
    })
    this.child = child
    return child
  }

  inspect(params: {
    fileName: string
    bytes: Uint8Array
    csvConfig?: CsvProfileConfig
    forcedFormat?: StatementFormat
  }): Promise<ParseInspectResult> {
    return this.run('inspect', params) as Promise<ParseInspectResult>
  }

  parse(params: {
    fileName: string
    bytes: Uint8Array
    csvConfig?: CsvProfileConfig
    forcedFormat?: StatementFormat
  }): Promise<ParseBytesOutcome> {
    return this.run('parse', params) as Promise<ParseBytesOutcome>
  }

  private run(
    op: ParserWorkerRequest['op'],
    params: {
      fileName: string
      bytes: Uint8Array
      csvConfig?: CsvProfileConfig
      forcedFormat?: StatementFormat
    },
  ): Promise<ParserWorkerResponse['result']> {
    const child = this.ensureWorker()
    const id = this.nextId++
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        logger.warn('Analyse du relevé interrompue : délai maximal dépassé.')
        this.dispose()
        resolve({ ok: false, reason: 'timeout' })
      }, PARSE_TIMEOUT_MS)

      this.pending.set(id, { resolve, timer })
      const req: ParserWorkerRequest = {
        id,
        op,
        fileName: params.fileName,
        bytes: params.bytes,
        csvConfig: params.csvConfig,
        forcedFormat: params.forcedFormat,
      }
      child.postMessage(req)
    })
  }

  dispose(): void {
    const child = this.child
    this.child = null
    for (const [id, entry] of this.pending.entries()) {
      clearTimeout(entry.timer)
      entry.resolve({ ok: false, reason: 'parse-failed' })
      this.pending.delete(id)
    }
    child?.kill()
  }
}
