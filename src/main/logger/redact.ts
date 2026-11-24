/**
 * Masquage des données personnelles avant écriture dans les journaux.
 * Règle complémentaire : on ne journalise JAMAIS le contenu d'un document ou d'une transaction.
 */
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
const IBAN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/g
/** Numéro de sécurité sociale français (NIR), avec ou sans espaces, clé facultative. */
const FR_NIR =
  /\b[12] ?\d{2} ?(?:0[1-9]|1[0-2]|[2-9]\d) ?(?:\d{2}|2[AB]) ?\d{3} ?\d{3}(?: ?\d{2})?\b/g
/** Numéros de carte et autres longues suites de chiffres. */
const LONG_NUMBER = /\b(?:\d[ -]?){12,18}\d\b/g

export interface RedactOptions {
  /** Dossier personnel de l'utilisateur, remplacé par `~` (il contient souvent son nom). */
  homeDir?: string
}

export function redact(text: string, { homeDir }: RedactOptions = {}): string {
  let result = text
  if (homeDir && homeDir.length > 1) result = result.split(homeDir).join('~')
  return result
    .replace(EMAIL, '[email]')
    .replace(IBAN, '[iban]')
    .replace(FR_NIR, '[nir]')
    .replace(LONG_NUMBER, '[numéro]')
}
