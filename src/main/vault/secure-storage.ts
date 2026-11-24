import { safeStorage } from 'electron'
import type { SessionUnavailableReason } from '@shared/vault'

/** Trousseau du système vu par le gestionnaire du coffre (remplaçable dans les tests). */
export interface SecureStorage {
  /** `null` si le mode session est utilisable, sinon la raison. */
  unavailableReason(): SessionUnavailableReason | null
  encrypt(plain: string): Buffer
  decrypt(blob: Buffer): string
}

/**
 * `safeStorage` d'Electron : DPAPI (Windows), Trousseau (macOS), libsecret ou kwallet (Linux).
 * Sous Linux sans trousseau, Electron retombe sur `basic_text` (clé en dur, aucune protection
 * réelle) : le mode session est alors refusé et le mot de passe maître imposé.
 */
export function electronSecureStorage(): SecureStorage {
  return {
    unavailableReason() {
      if (!safeStorage.isEncryptionAvailable()) return 'unavailable'
      if (
        process.platform === 'linux' &&
        safeStorage.getSelectedStorageBackend() === 'basic_text'
      ) {
        return 'no-secure-storage'
      }
      return null
    },
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (blob) => safeStorage.decryptString(blob),
  }
}
