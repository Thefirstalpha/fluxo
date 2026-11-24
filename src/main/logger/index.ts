import { createWriteStream, mkdirSync, renameSync, statSync, type WriteStream } from 'node:fs'
import { join } from 'node:path'
import { format } from 'node:util'
import { redact } from './redact'

type Level = 'debug' | 'info' | 'warn' | 'error'
const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const MAX_LOG_BYTES = 1_000_000

let stream: WriteStream | null = null
let minLevel: Level = 'info'
let homeDir: string | undefined

export interface FileLoggingOptions {
  homeDir?: string
  debug?: boolean
}

/** Journal local (dossier de données de l'app), une rotation simple à 1 Mo. Rien n'est envoyé en ligne. */
export function initFileLogging(directory: string, options: FileLoggingOptions = {}): void {
  homeDir = options.homeDir
  minLevel = options.debug ? 'debug' : 'info'
  mkdirSync(directory, { recursive: true })
  const file = join(directory, 'fluxo.log')
  try {
    if (statSync(file).size > MAX_LOG_BYTES) renameSync(file, join(directory, 'fluxo.1.log'))
  } catch {
    // Pas encore de journal : rien à faire.
  }
  stream = createWriteStream(file, { flags: 'a', mode: 0o600 })
}

function write(level: Level, args: unknown[]): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return
  const line = `${new Date().toISOString()} [${level}] ${redact(format(...args), { homeDir })}`
  if (level === 'warn' || level === 'error') console.error(line)
  else console.log(line)
  stream?.write(`${line}\n`)
}

export const logger = {
  debug: (...args: unknown[]): void => write('debug', args),
  info: (...args: unknown[]): void => write('info', args),
  warn: (...args: unknown[]): void => write('warn', args),
  error: (...args: unknown[]): void => write('error', args),
}
