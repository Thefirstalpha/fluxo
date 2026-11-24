/**
 * Normalisation canonique des libellés bancaires français/européens :
 * retire les préfixes de moyen de paiement, dates, références carte/SEPA, codes postaux et villes
 * pour isoler le marchand ou motif significatif.
 */

const PREFIX_RE =
  /^(?:paiement\s+(?:par\s+)?cb|achat\s+cb|carte\s+(?:x\d{4}\s+)?|cb\*?\d*\s+|prlv\s+sepa\s+|prelevement\s+(?:sepa\s+)?|prlv\s+|vir(?:ement)?\s+(?:sepa\s+|inst(?:antane)?\s+)?|chq\s+|cheque\s+|ret(?:rait)?\s+dab\s+|f\s+cotis\s+)/i

const CARD_MASK_RE = /\b(?:carte\s*)?(?:x+|\*+)\d{3,6}\b|\bcb\*\d+\b/gi
const DATE_TOKEN_RE = /\b\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b/g
const TIME_TOKEN_RE = /\b\d{1,2}h\d{2}\b/gi
const LONG_REF_RE = /\b(?:ref|id|e2e|num|n°)?\s*[a-z]*\d{5,}[a-z0-9-]*\b/gi
const POSTAL_CITY_SUFFIX_RE =
  /(?:\s+\d{2,5}(?:\s+[a-z]{3,})?)?\s+(?:paris|lyon|marseille|toulouse|nice|nantes|strasbourg|montpellier|bordeaux|lille|rennes|france|fr)(?:\s+\d{1,2})?$/i

export interface CleanedLabel {
  /** Chaîne normalisée en minuscules sans accents pour la correspondance et l'apprentissage. */
  canonical: string
  /** Libellé lisible nettoyé (casse titre) pour l'affichage. */
  display: string
}

const NON_ASCII_RE = /[^\x20-\x7e]/

export function stripDiacritics(input: string): string {
  if (!NON_ASCII_RE.test(input)) return input
  return input.normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

function toDisplayCase(text: string): string {
  if (!text) return ''
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 2 && /^[a-z]+$/.test(word)) return word.toLowerCase()
      return word[0]!.toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

function extractCanonical(rawLabel: string): { canonical: string; emptyStrip: boolean } {
  let text = stripDiacritics(rawLabel)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Retire successivement les préfixes bancaires courants (ex. "CARTE 12/11 CB*1234").
  for (let i = 0; i < 3; i++) {
    const next = text.replace(PREFIX_RE, '').trim()
    if (next === text) break
    text = next
  }

  text = text
    .replace(CARD_MASK_RE, ' ')
    .replace(DATE_TOKEN_RE, ' ')
    .replace(TIME_TOKEN_RE, ' ')
    .replace(LONG_REF_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  text = text.replace(POSTAL_CITY_SUFFIX_RE, '').trim()

  const canonical = text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!canonical) {
    return {
      canonical: stripDiacritics(rawLabel).toLowerCase().replace(/\s+/g, ' ').trim(),
      emptyStrip: true,
    }
  }
  return { canonical, emptyStrip: false }
}

/** Retourne uniquement la forme canonique normalisée, sans mise en forme d'affichage. */
export function canonicalTransactionLabel(rawLabel: string): string {
  return extractCanonical(rawLabel).canonical
}

export function cleanTransactionLabel(rawLabel: string): CleanedLabel {
  const { canonical, emptyStrip } = extractCanonical(rawLabel)
  if (emptyStrip) {
    return { canonical, display: rawLabel.trim() }
  }
  return {
    canonical,
    display: toDisplayCase(canonical),
  }
}

export function tokenizeForLearning(canonical: string): string[] {
  return canonical
    .split(/[\s'-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
}
