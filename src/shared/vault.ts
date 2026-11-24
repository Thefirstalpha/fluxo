/**
 * Coffre-fort (base chiffrée) : types et règles partagés entre le renderer, le process main
 * et le service de données. Aucune dépendance : importable partout.
 */

/** `session` : clé protégée par le trousseau du système · `password` : mot de passe maître. */
export const VAULT_MODES = ['session', 'password'] as const
export type VaultMode = (typeof VAULT_MODES)[number]

export type VaultState = 'absent' | 'locked' | 'unlocked'

/** Pourquoi le mode session n'est pas proposé sur ce système. */
export type SessionUnavailableReason = 'no-secure-storage' | 'unavailable'

export interface VaultStatus {
  state: VaultState
  /** `null` tant qu'aucun coffre n'existe. */
  mode: VaultMode | null
  hasRecoveryCode: boolean
  /** Délai avant une nouvelle tentative de déverrouillage (après des échecs répétés). */
  retryAfterMs: number
  /** Le coffre ouvert est celui de démonstration (jamais le coffre réel). */
  demo: boolean
  /** Déverrouillé par le code de récupération : un nouveau mot de passe doit être choisi. */
  needsNewPassword: boolean
  sessionAvailable: boolean
  sessionUnavailableReason: SessionUnavailableReason | null
}

export type CreateVaultInput = { mode: 'session' } | { mode: 'password'; password: string }

export type UnlockInput =
  | { method: 'session' }
  | { method: 'password'; password: string }
  | { method: 'recovery'; code: string }

export type VaultFailureReason =
  | 'wrong-credentials'
  | 'locked-out'
  | 'invalid-password'
  | 'session-unavailable'
  | 'vault-corrupt'
  | 'vault-too-new'

export interface VaultFailure {
  ok: false
  reason: VaultFailureReason
  retryAfterMs?: number
}

/** Résultat d'une action sur le coffre : les échecs attendus ne sont pas des exceptions. */
export type VaultResult = { ok: true } | VaultFailure

/** Code de récupération : affiché une seule fois, jamais stocké en clair. */
export type RecoveryCodeResult = { ok: true; code: string } | VaultFailure

/** Les actions sensibles exigent le mot de passe actuel en mode mot de passe. */
export interface CurrentPasswordInput {
  currentPassword?: string
}

export interface ChangePasswordInput extends CurrentPasswordInput {
  newPassword: string
}

// ——— Règles de mot de passe ————————————————————————————————————————

/**
 * Longueur minimale : la base peut être copiée et attaquée hors ligne ; Argon2id ralentit
 * chaque essai, la longueur fait le reste. Pas de règle de composition (recommandation NIST) :
 * une phrase de passe est encouragée.
 */
export const PASSWORD_MIN_LENGTH = 10
export const PASSWORD_MAX_LENGTH = 1024

export type PasswordProblem = 'too-short' | 'too-long'

/** Longueur comptée en caractères (points de code), après normalisation NFC. */
export function checkPassword(password: string): PasswordProblem | null {
  const length = [...password.normalize('NFC')].length
  if (length < PASSWORD_MIN_LENGTH) return 'too-short'
  if (length > PASSWORD_MAX_LENGTH) return 'too-long'
  return null
}

// ——— Verrouillage automatique —————————————————————————————————————

/** Délais d'inactivité proposés (minutes) ; 0 = jamais. */
export const AUTO_LOCK_MINUTES = [0, 5, 15, 30, 60] as const
export type AutoLockMinutes = (typeof AUTO_LOCK_MINUTES)[number]

// ——— Code de récupération —————————————————————————————————————————

/** Alphabet Crockford base 32 : sans I, L, O ni U (pas de confusion à la relecture). */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
/** 32 caractères de 5 bits = 160 bits d'aléa, présentés en 8 groupes de 4. */
export const RECOVERY_CODE_LENGTH = 32

/** Encode des octets aléatoires en code de récupération lisible (`XXXX-XXXX-…`). */
export function formatRecoveryCode(bytes: Uint8Array): string {
  if (bytes.length * 8 < RECOVERY_CODE_LENGTH * 5) throw new Error('Aléa insuffisant')
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5 && output.length < RECOVERY_CODE_LENGTH) {
      output += CROCKFORD[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
    value &= (1 << bits) - 1
  }
  return output.match(/.{4}/g)?.join('-') ?? output
}

/**
 * Normalise une saisie : majuscules, sans espaces ni tirets, lettres ambiguës corrigées
 * (I et L → 1, O → 0). `null` si la saisie ne peut pas être un code valide.
 */
export function normalizeRecoveryCode(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0')
  if (cleaned.length !== RECOVERY_CODE_LENGTH) return null
  for (const char of cleaned) if (!CROCKFORD.includes(char)) return null
  return cleaned
}
