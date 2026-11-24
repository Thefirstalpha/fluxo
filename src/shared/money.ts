/**
 * Montants monétaires.
 *
 * Règle d'or : un montant est TOUJOURS un entier en unités mineures (centimes).
 * 12,34 € → 1234. Jamais de flottants pour stocker ou additionner de l'argent.
 */
export type MinorUnits = number

export interface MoneyFormatOptions {
  currency: string
  locale: string
  signDisplay?: 'auto' | 'always' | 'exceptZero' | 'never'
  /** Notation compacte (« 12,5 k€ ») pour les axes de graphiques. */
  compact?: boolean
}

const formatters = new Map<string, Intl.NumberFormat>()

function getFormatter({
  currency,
  locale,
  signDisplay = 'auto',
  compact = false,
}: MoneyFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${currency}|${signDisplay}|${compact}`
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      signDisplay,
      ...(compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}),
    })
    formatters.set(key, formatter)
  }
  return formatter
}

export function formatMoney(amount: MinorUnits, options: MoneyFormatOptions): string {
  return getFormatter(options).format(amount / 100)
}

/**
 * Convertit un montant textuel (saisie, CSV, PDF) en centimes.
 * Gère : « 1 234,56 », « 1,234.56 », « 1.234,56 », « 1'234.50 » (CH), « -45,90 »,
 * « 45,90- », « (12,00) » (notation comptable), symboles et codes devise.
 * Retourne `null` si la chaîne n'est pas un montant non ambigu.
 */
export function parseAmount(input: string): MinorUnits | null {
  let text = input.trim()
  if (!text) return null

  let negative = false
  if (text.startsWith('(') && text.endsWith(')')) {
    negative = true
    text = text.slice(1, -1)
  }
  text = text.replace(/[\s']/g, '').replace(/[€$£]|EUR|CHF|USD|GBP|CAD/gi, '')
  if (text.endsWith('-')) {
    negative = !negative
    text = text.slice(0, -1)
  }
  if (text.startsWith('-') || text.startsWith('−')) {
    negative = !negative
    text = text.slice(1)
  } else if (text.startsWith('+')) {
    text = text.slice(1)
  }

  const value = parseUnsignedAmount(text)
  if (value === null) return null
  return negative && value !== 0 ? -value : value
}

/**
 * Le dernier « , » ou « . » suivi de 1 ou 2 chiffres est le séparateur décimal.
 * Les séparateurs de milliers doivent être homogènes, différents du séparateur décimal,
 * et délimiter des groupes de 3 chiffres (« 1.234,56 » oui, « 12,345,6 » non).
 */
function parseUnsignedAmount(text: string): MinorUnits | null {
  const last = Math.max(text.lastIndexOf(','), text.lastIndexOf('.'))
  let integerPart = text
  let fraction = ''
  let decimalSeparator: string | undefined
  if (last >= 0 && /^\d{1,2}$/.test(text.slice(last + 1))) {
    decimalSeparator = text[last]
    integerPart = text.slice(0, last)
    fraction = text.slice(last + 1)
  }

  const groupSeparators = new Set(integerPart.match(/[.,]/g) ?? [])
  if (groupSeparators.size > 1) return null
  if (decimalSeparator !== undefined && groupSeparators.has(decimalSeparator)) return null

  const grouped = groupSeparators.size === 1
  const [head, ...tail] = grouped ? integerPart.split(/[.,]/) : [integerPart]
  if (!head || !(grouped ? /^\d{1,3}$/ : /^\d+$/).test(head)) return null
  if (tail.some((group) => !/^\d{3}$/.test(group))) return null

  const value = Number(head + tail.join('')) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(value) ? value : null
}

/** Part (0..1) de `part` dans `total` ; `null` si le total est nul. */
export function ratio(part: MinorUnits, total: MinorUnits): number | null {
  return total === 0 ? null : part / total
}

export function sum(values: Iterable<MinorUnits>): MinorUnits {
  let total = 0
  for (const value of values) total += value
  return total
}
