/**
 * Validation et masquage du numéro de sécurité sociale français (NIR) et des adresses
 * présents sur les bulletins de paie. Aucun NIR ni aucune adresse complète n'apparaît dans
 * les journaux ni dans l'affichage par défaut.
 */

export function normalizeNir(raw: string): string {
  return raw.replace(/[\s.-]/g, '').toUpperCase()
}

/**
 * Contrôle syntaxique et clé de contrôle modulo 97 d'un NIR français (13 ou 15 caractères,
 * Corse 2A/2B prise en charge). Refuse les chaînes manifestement invalides.
 */
export function isValidNir(raw: string): boolean {
  const clean = normalizeNir(raw)
  if (!/^[1278]\d{2}(?:0[1-9]|1[0-2]|[2-9]\d)(?:\d{2}|2[AB])\d{6}(?:\d{2})?$/.test(clean)) {
    return false
  }
  if (clean.length === 13) return true
  const bodyText = clean.slice(0, 13).replace('2A', '19').replace('2B', '18')
  const key = Number(clean.slice(13, 15))
  const numericBody = Number(bodyText)
  if (!Number.isSafeInteger(numericBody)) return false
  return 97 - (numericBody % 97) === key
}

/**
 * Masque un NIR : conserve uniquement le sexe, l'année de naissance et les 2 derniers chiffres
 * de la clé (ou du rang), en remplaçant le département, la commune et le numéro d'ordre.
 */
export function maskNir(raw: string): string {
  const clean = normalizeNir(raw)
  if (clean.length < 5) return '•'.repeat(Math.max(4, clean.length))
  const head = `${clean[0]} ${clean.slice(1, 3)}`
  const tail = clean.length >= 15 ? clean.slice(13, 15) : clean.slice(-2)
  return `${head} •• •• ••• ••• ${tail}`
}

/** Masque une adresse postale (conserve la fin éventuelle : code postal / ville, masque la rue). */
export function maskAddress(raw: string): string {
  const lines = raw
    .split(/\r?\n|,/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (lines.length <= 1) return '••••••'
  return `••••••, ${lines[lines.length - 1]}`
}
