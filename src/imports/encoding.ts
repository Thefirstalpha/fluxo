import type { CsvEncoding, ResolvedEncoding } from '@shared/imports/model'

/** Comptage rapide des sauts de ligne sans allouer un tableau géant de chaînes. */
export function countLines(bytes: Uint8Array, maxLines: number): number {
  let lines = bytes.length > 0 ? 1 : 0
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x0a) {
      lines++
      if (lines > maxLines) return lines
    }
  }
  return lines
}

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
}

function hasUtf16LeBom(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe
}

function hasUtf16BeBom(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff
}

function hasWindows1252C1Bytes(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!
    if (b >= 0x80 && b <= 0x9f) return true
  }
  return false
}

export function normalizeDeclaredEncoding(declared: string | undefined): CsvEncoding | undefined {
  if (!declared) return undefined
  const lower = declared.trim().toLowerCase()
  if (lower === 'utf-8' || lower === 'utf8') return 'utf-8'
  if (lower === 'windows-1252' || lower === 'cp1252' || lower === '1252' || lower === 'ansi') {
    return 'windows-1252'
  }
  if (lower === 'iso-8859-1' || lower === 'latin1' || lower === 'iso8859-1') {
    return 'iso-8859-1'
  }
  return undefined
}

export interface DecodedBytes {
  text: string
  encoding: ResolvedEncoding
  fallback: boolean
}

/**
 * Décode des octets bruts en texte UTF-16 JS avec détection d'encodage
 * (UTF-8 BOM / strict → Windows-1252 / ISO-8859-1).
 */
export function decodeBytes(bytes: Uint8Array, preferred: CsvEncoding = 'auto'): DecodedBytes {
  if (hasUtf16LeBom(bytes)) {
    const text = new TextDecoder('utf-16le').decode(bytes.subarray(2))
    return { text, encoding: 'utf-8', fallback: false }
  }
  if (hasUtf16BeBom(bytes)) {
    const text = new TextDecoder('utf-16be').decode(bytes.subarray(2))
    return { text, encoding: 'utf-8', fallback: false }
  }
  if (hasUtf8Bom(bytes)) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(3))
    return { text, encoding: 'utf-8', fallback: false }
  }

  if (preferred === 'windows-1252' || preferred === 'iso-8859-1') {
    return {
      text: new TextDecoder(preferred).decode(bytes),
      encoding: preferred,
      fallback: false,
    }
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { text, encoding: 'utf-8', fallback: false }
  } catch {
    const fallbackEncoding: ResolvedEncoding = hasWindows1252C1Bytes(bytes)
      ? 'windows-1252'
      : 'iso-8859-1'
    return {
      text: new TextDecoder(fallbackEncoding).decode(bytes),
      encoding: fallbackEncoding,
      fallback: preferred === 'utf-8',
    }
  }
}
