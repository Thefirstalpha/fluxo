/**
 * IBAN (ISO 13616) : normalisation, contrôle de la clé (modulo 97) et masquage à l'affichage.
 * L'IBAN est stocké dans la base chiffrée et n'est montré en clair que sur demande explicite.
 */

/** Retire espaces et tirets, passe en majuscules. */
export function normalizeIban(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase()
}

/** IBAN normalisé valide : pays, clé, 11 à 30 caractères de BBAN, modulo 97 = 1. */
export function isValidIban(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  let remainder = 0
  for (const char of rearranged) {
    const digits = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55)
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder === 1
}

/** `FR7630006000011234567890189` → `FR76 •••• •••• 0189`. */
export function maskIban(iban: string): string {
  return `${iban.slice(0, 4)} •••• •••• ${iban.slice(-4)}`
}

/** Groupes de 4 pour l'affichage en clair (copie, vérification). */
export function formatIban(iban: string): string {
  return iban.replace(/(.{4})/g, '$1 ').trim()
}
