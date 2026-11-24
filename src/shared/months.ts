/** Mois calendaires au format `AAAA-MM` (indépendants du fuseau horaire). */

export function parseMonth(month: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  const value = match ? Number(match[2]) : 0
  if (!match || value < 1 || value > 12) throw new RangeError(`Mois invalide : ${month}`)
  return { year: Number(match[1]), month: value }
}

export function addMonths(month: string, delta: number): string {
  const { year, month: m } = parseMonth(month)
  const date = new Date(Date.UTC(year, m - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Mois local de la date donnée. */
export function monthOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** Premier jour du mois, à minuit UTC — pour le formatage avec `timeZone: 'UTC'`. */
export function monthToUtcDate(month: string): Date {
  const { year, month: m } = parseMonth(month)
  return new Date(Date.UTC(year, m - 1, 1))
}
