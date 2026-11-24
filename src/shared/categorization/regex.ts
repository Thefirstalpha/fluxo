/**
 * Validation statique d'expressions régulières fournies par l'utilisateur afin de bloquer
 * tout risque de ReDoS (catastrophic backtracking) avant enregistrement ou exécution.
 */

const MAX_PATTERN_LENGTH = 180
const MAX_INPUT_SLICE = 500

export type RegexCheckResult = { ok: true; regex: RegExp } | { ok: false; error: string }

/**
 * Détecte les schémas notoirement explosifs : quantificateurs imbriqués (`(a+)+`, `(.*)*`,
 * `(?:[a-z]+)*`), backreferences (`\1`) ou répétitions démesurées (`{200}`).
 */
export function validateSafeRegex(pattern: string, caseSensitive = false): RegexCheckResult {
  if (!pattern || pattern.length > MAX_PATTERN_LENGTH) {
    return { ok: false, error: 'Motif trop long ou vide' }
  }
  if (/\\[1-9]/.test(pattern)) {
    return { ok: false, error: 'Références arrière non autorisées' }
  }
  if (/\{\d{3,}/.test(pattern)) {
    return { ok: false, error: 'Répétiteur numérique trop élevé' }
  }

  // Suivi simple des groupes contenant un quantificateur interne et suivis d'un quantificateur externe.
  const groupHasQuantifier: boolean[] = []
  let escaped = false
  let inCharClass = false

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = true
      continue
    }
    if (inCharClass) {
      if (ch === ']') inCharClass = false
      continue
    }
    if (ch === '[') {
      inCharClass = true
      continue
    }
    if (ch === '(') {
      // Bloque les assertions lookaround complexes qui favorisent les retours arrière coûteux
      if (pattern[i + 1] === '?' && /[<>=!]/.test(pattern[i + 2] ?? '')) {
        return { ok: false, error: 'Lookarounds non autorisés' }
      }
      groupHasQuantifier.push(false)
      continue
    }
    if (ch === ')') {
      const innerQuant = groupHasQuantifier.pop() ?? false
      const next = pattern[i + 1]
      const outerQuant = next === '+' || next === '*' || next === '?' || next === '{'
      if (innerQuant && outerQuant) {
        return { ok: false, error: 'Quantificateurs imbriqués interdits (risque ReDoS)' }
      }
      if ((innerQuant || outerQuant) && groupHasQuantifier.length > 0) {
        groupHasQuantifier[groupHasQuantifier.length - 1] = true
      }
      continue
    }
    if (ch === '+' || ch === '*' || ch === '{') {
      const prev = pattern[i - 1]
      if (prev === '+' || prev === '*') {
        return { ok: false, error: 'Quantificateurs consécutifs interdits' }
      }
      if (groupHasQuantifier.length > 0) {
        groupHasQuantifier[groupHasQuantifier.length - 1] = true
      }
    }
  }

  try {
    const flags = caseSensitive ? 'u' : 'iu'
    return { ok: true, regex: new RegExp(pattern, flags) }
  } catch {
    return { ok: false, error: 'Expression régulière invalide' }
  }
}

export function safeRegexTest(regex: RegExp, input: string): boolean {
  regex.lastIndex = 0
  return regex.test(input.slice(0, MAX_INPUT_SLICE))
}
