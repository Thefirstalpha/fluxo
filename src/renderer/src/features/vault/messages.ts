import { checkPassword, PASSWORD_MIN_LENGTH, type VaultFailure } from '@shared/vault'
import type { Dictionary } from '../../i18n'

/** Message d'un échec du coffre ; `secret` précise ce qui était demandé. */
export function failureMessage(
  t: Dictionary,
  failure: VaultFailure,
  secret: 'password' | 'recovery' = 'password',
): string {
  switch (failure.reason) {
    case 'wrong-credentials':
      return secret === 'recovery' ? t.vault.errors.wrongRecovery : t.vault.errors.wrongPassword
    case 'locked-out':
      return t.vault.errors.lockedOut(Math.ceil((failure.retryAfterMs ?? 0) / 1000))
    case 'invalid-password':
      return t.vault.errors.tooShort(PASSWORD_MIN_LENGTH)
    case 'session-unavailable':
      return t.vault.errors.sessionUnavailable
    case 'vault-corrupt':
      return t.vault.errors.corrupt
  }
}

/** Vérifie un nouveau mot de passe et sa confirmation ; `null` si tout va bien. */
export function newPasswordError(t: Dictionary, password: string, confirm: string): string | null {
  const problem = checkPassword(password)
  if (problem === 'too-short') return t.vault.errors.tooShort(PASSWORD_MIN_LENGTH)
  if (problem === 'too-long') return t.vault.errors.tooLong
  if (password !== confirm) return t.vault.errors.mismatch
  return null
}
