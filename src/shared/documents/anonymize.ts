import type { RedactionCount } from './model'

export interface AnonymizationResult {
  anonymizedText: string
  redactions: RedactionCount[]
}

export interface AnonymizeOptions {
  /** Noms connus du coffre (employeurs, titulaires, tiers nominatifs) à remplacer si présents. */
  knownNames?: readonly string[]
}

const EMAIL_RE = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/gi
const IBAN_RE =
  /\b[A-Z]{2}\d{2}(?:[A-Z0-9]{10,30}|(?:[ -]+[A-Z]{2,4})?(?:[ -]+\d{2,4}){2,7}(?:[ -]+\d{1,4})?)\b/g
const FR_NIR_RE =
  /\b[12]\s?\d{2}\s?(?:0[1-9]|1[0-2]|[2-9]\d)\s?(?:\d{2}|2[ABab])\s?\d{3}\s?\d{3}(?:\s?\d{2})?\b/g
const LABELED_SIRET_RE =
  /\b(?:SIRET|SIREN)\s*[:.]?\s*(\d{3}[ .]?\d{3}[ .]?\d{3}(?:[ .]?\d{5})?)\b/gi
const BARE_SIRET_RE = /\b\d{3}\s\d{3}\s\d{3}\s\d{5}\b/g
const CARD_NUMBER_RE = /\b(?:\d{4}[ -]?){3}\d{4}\b|\b\d{4}[*Xx]{4,8}\d{4}\b/g
const PHONE_RE = /(?<!\d)(?:\+33\s?[1-9]|0[1-9])(?:[ .-]\d{2}){4}(?!\d)/g
const HONORIFIC_NAME_RE =
  /\b(?:M\.|Mr|Mme|Mlle|Monsieur|Madame)\s+[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'-]{1,30}(?:\s+[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'-]{1,30}){1,2}\b/g
const STREET_ADDRESS_RE =
  /\b\d{1,5}(?:\s*(?:bis|ter|quater))?(?:\s*,)?\s+(?:rue|avenue|av\.?|boulevard|bd\.?|all[eé]e|impasse|chemin|place|route|cours|quai|passage|square|voie|sentier)\s+[^\n]{3,70}?(?=\n|$|,|\s+\d{5}\b)/gi
const POSTAL_CITY_RE = /\b\d{5}\s+[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þa-zà-öø-ÿ' -]{1,35}\b/g

function escapeRegExp(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createReplacer() {
  const counts = new Map<RedactionCount['category'], number>()
  const assigned = new Map<string, string>()

  const tagFor = (category: RedactionCount['category'], prefix: string, raw: string): string => {
    const key = `${category}:${raw.replace(/\s+/g, ' ').trim().toLowerCase()}`
    const existing = assigned.get(key)
    if (existing) {
      counts.set(category, (counts.get(category) ?? 0) + 1)
      return existing
    }
    const index = (counts.get(category) ?? 0) + 1
    counts.set(category, index)
    const token = `[${prefix}_${index}]`
    assigned.set(key, token)
    return token
  }

  return {
    replace(
      input: string,
      re: RegExp,
      category: RedactionCount['category'],
      prefix: string,
    ): string {
      return input.replace(re, (match) => tagFor(category, prefix, match))
    },
    counts(): RedactionCount[] {
      return [...counts.entries()].map(([category, count]) => ({ category, count }))
    },
  }
}

/**
 * Expurge les données directement identifiantes d'un texte financier avant un envoi optionnel vers
 * une IA (ADR-022 / M7) tout en préservant les libellés d'opérations et les montants nécessaires à
 * l'analyse.
 */
export function anonymizeDocumentText(
  text: string,
  options: AnonymizeOptions = {},
): AnonymizationResult {
  const tracker = createReplacer()
  let out = text

  // 1. Identifiants réglementaires et moyens de paiement.
  out = tracker.replace(out, FR_NIR_RE, 'nir', 'NIR')
  out = tracker.replace(out, IBAN_RE, 'iban', 'IBAN')
  out = tracker.replace(out, EMAIL_RE, 'email', 'EMAIL')
  out = out.replace(LABELED_SIRET_RE, (full, digits: string) => {
    const label = full.slice(0, full.length - digits.length).trim()
    return `${label} ${tracker.replace(digits, /.+/, 'siret', 'SIRET')}`
  })
  out = tracker.replace(out, BARE_SIRET_RE, 'siret', 'SIRET')
  out = tracker.replace(out, CARD_NUMBER_RE, 'card', 'CARTE')
  out = tracker.replace(out, PHONE_RE, 'phone', 'TEL')

  // 2. Adresses postales et noms.
  out = tracker.replace(out, STREET_ADDRESS_RE, 'address', 'ADRESSE')
  out = tracker.replace(out, POSTAL_CITY_RE, 'address', 'ADRESSE')
  out = tracker.replace(out, HONORIFIC_NAME_RE, 'name', 'NOM')

  // 3. Noms explicites connus du coffre (triés du plus long au plus court).
  const names = [
    ...new Set((options.knownNames ?? []).map((n) => n.trim()).filter((n) => n.length >= 3)),
  ].sort((a, b) => b.length - a.length)
  for (const name of names) {
    const re = new RegExp(`(?<!\\p{L})${escapeRegExp(name)}(?!\\p{L})`, 'giu')
    out = tracker.replace(out, re, 'name', 'NOM')
  }

  return {
    anonymizedText: out,
    redactions: tracker.counts(),
  }
}

export interface AnonymizedCategorySample {
  index: number
  direction: 'expense' | 'income'
  amountBucket: string
  label: string
}

function bucketAmount(amountCents: number): string {
  const abs = Math.abs(amountCents)
  if (abs < 1_000) return '<10'
  if (abs < 5_000) return '10-50'
  if (abs < 20_000) return '50-200'
  if (abs < 100_000) return '200-1000'
  return '>1000'
}

/**
 * Prépare un lot strictement anonymisé d'opérations pour suggérer des catégories via IA :
 * aucune date exacte, aucun montant précis, aucun IBAN/NIR/nom personnel ne quitte l'appareil.
 */
export function anonymizeTransactionsForCategorization(
  items: readonly {
    transactionId: string
    labelRaw: string
    payee: string | null
    amount: number
  }[],
  options: AnonymizeOptions = {},
): {
  samples: AnonymizedCategorySample[]
  redactions: RedactionCount[]
} {
  const totals = new Map<RedactionCount['category'], number>()
  const samples: AnonymizedCategorySample[] = items.map((item, index) => {
    const joined = item.payee ? `${item.labelRaw} (${item.payee})` : item.labelRaw
    const res = anonymizeDocumentText(joined, options)
    for (const r of res.redactions) {
      totals.set(r.category, (totals.get(r.category) ?? 0) + r.count)
    }
    return {
      index,
      direction: item.amount < 0 ? 'expense' : 'income',
      amountBucket: bucketAmount(item.amount),
      label: res.anonymizedText.replace(/\s+/g, ' ').trim().slice(0, 160),
    }
  })
  return {
    samples,
    redactions: [...totals.entries()].map(([category, count]) => ({ category, count })),
  }
}
