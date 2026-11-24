/**
 * Normalisation et similarité de libellés bancaires pour la déduplication.
 * Fonctionnement pur sans dépendance Node afin d'être partagé entre les analyseurs
 * isolés et le service de données.
 */

const DIACRITICS_RE = /\p{Diacritic}/gu
const PUNCTUATION_RE = /[^\p{L}\p{N}]+/gu

export function normalizeImportLabel(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .toLocaleLowerCase('en')
    .replace(PUNCTUATION_RE, ' ')
    .trim()
}

function tokenize(normalized: string): string[] {
  if (!normalized) return []
  return normalized.split(/\s+/).filter((token) => token.length >= 2)
}

/**
 * Indice de similarité [0, 1] entre deux libellés normalisés : combine inclusion,
 * recouvrement de jetons (Jaccard) et distance de Levenshtein bornée pour tolérer
 * les troncatures ou numéros de carte variables entre relevés.
 */
export function labelSimilarity(aRaw: string, bRaw: string): number {
  const a = normalizeImportLabel(aRaw)
  const b = normalizeImportLabel(bRaw)
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length)
    const longer = Math.max(a.length, b.length)
    if (shorter >= 4 && shorter / longer >= 0.5) return 0.9
  }

  const tokensA = new Set(tokenize(a))
  const tokensB = new Set(tokenize(b))
  if (tokensA.size > 0 && tokensB.size > 0) {
    let intersection = 0
    for (const token of tokensA) {
      if (tokensB.has(token)) intersection++
    }
    const union = tokensA.size + tokensB.size - intersection
    if (union > 0 && intersection / union >= 0.6) {
      return intersection / union
    }
  }

  const maxLen = Math.max(a.length, b.length)
  if (maxLen > 120) return 0
  const distance = levenshtein(a, b)
  return Math.max(0, 1 - distance / maxLen)
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  let prev = new Array<number>(n + 1)
  let curr = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j

  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min((prev[j] ?? 0) + 1, (curr[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost)
    }
    const tmp = prev
    prev = curr
    curr = tmp
  }
  return prev[n] ?? 0
}

/** Différence signée en jours calendaires entre deux dates ISO `AAAA-MM-JJ`. */
export function daysBetweenIso(a: string, b: string): number {
  const timeA = Date.parse(`${a}T00:00:00Z`)
  const timeB = Date.parse(`${b}T00:00:00Z`)
  return Math.round((timeA - timeB) / 86_400_000)
}
