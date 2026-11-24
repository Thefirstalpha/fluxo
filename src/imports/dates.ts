import type { CsvDateFormat } from '@shared/imports/model'

/** Vérifie qu'un triplet (année, mois 1..12, jour 1..31) existe dans le calendrier grégorien. */
export function toValidIsoDate(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }
  const utc = new Date(Date.UTC(year, month - 1, day))
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() + 1 !== month ||
    utc.getUTCDate() !== day
  ) {
    return null
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function expandTwoDigitYear(yy: number): number {
  return yy >= 70 ? 1900 + yy : 2000 + yy
}

/**
 * Convertit une chaîne date issue d'un CSV, OFX, QIF, CAMT ou MT940 en date ISO `AAAA-MM-JJ`.
 */
export function parseStatementDate(raw: string, format: CsvDateFormat = 'auto'): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  // ISO 8601 avec heure éventuelle : 2026-11-24 ou 2026-11-24T12:30:00Z
  if (format === 'auto' || format === 'YYYY-MM-DD') {
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(trimmed)
    if (iso) {
      return toValidIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))
    }
  }

  // Format YYYY/MM/DD ou YYYY/MM/DD HH:mm:ss
  if (format === 'auto') {
    const slashYmd = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})(?:\s.*)?$/.exec(trimmed)
    if (slashYmd) {
      return toValidIsoDate(Number(slashYmd[1]), Number(slashYmd[2]), Number(slashYmd[3]))
    }
  }

  // Compact OFX / ISO YYYYMMDD[HHMMSS...]
  if (format === 'auto' || format === 'YYYYMMDD') {
    const compact = /^(\d{4})(\d{2})(\d{2})(?:\d{2,6}(?:\[.*\]|Z|[+-]\d{2}:?\d{2})?)?$/.exec(
      trimmed,
    )
    if (compact) {
      return toValidIsoDate(Number(compact[1]), Number(compact[2]), Number(compact[3]))
    }
  }

  // JJ/MM/AAAA, JJ-MM-AAAA, JJ.MM.AAAA ou MM/DD/YYYY (y compris QIF apostrophe `MM/DD'YY`)
  const parts = /^(\d{1,2})[/.\-' ](\d{1,2})[/.\-' ](\d{2,4})(?:\s.*)?$/.exec(trimmed)
  if (!parts) return null

  const first = Number(parts[1])
  const second = Number(parts[2])
  const rawYear = parts[3]!
  const year = rawYear.length === 2 ? expandTwoDigitYear(Number(rawYear)) : Number(rawYear)

  if (format === 'MM/DD/YYYY') {
    return toValidIsoDate(year, first, second)
  }
  if (format === 'DD/MM/YYYY' || format === 'DD-MM-YYYY' || format === 'DD.MM.YYYY') {
    return toValidIsoDate(year, second, first)
  }
  if (format === 'DD/MM/YY') {
    return rawYear.length <= 2
      ? toValidIsoDate(year, second, first)
      : toValidIsoDate(year, second, first)
  }

  // Auto : convention européenne par défaut (JJ/MM/AAAA), bascule si second > 12.
  if (second > 12 && first <= 12) {
    return toValidIsoDate(year, first, second)
  }
  return toValidIsoDate(year, second, first)
}

/** Date SWIFT MT940 (`YYMMDD`) en ISO `AAAA-MM-JJ`. */
export function parseMt940Date(yymmdd: string): string | null {
  const m = /^(\d{2})(\d{2})(\d{2})$/.exec(yymmdd.trim())
  if (!m) return null
  return toValidIsoDate(expandTwoDigitYear(Number(m[1])), Number(m[2]), Number(m[3]))
}
