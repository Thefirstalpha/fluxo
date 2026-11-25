import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { SecureStorage } from '../../vault/secure-storage'

/**
 * Conserve la clé API Anthropic exclusivement dans le process main, chiffrée par `safeStorage`
 * (Keychain macOS, Credential Vault / DPAPI Windows, libsecret Linux).
 * N'est jamais journalisée ni exposée au renderer.
 */
export class AiSecretStore {
  constructor(
    private readonly secretFile: string,
    private readonly storage: SecureStorage,
  ) {}

  hasKey(): boolean {
    return this.readKey() !== null
  }

  setKey(apiKey: string): boolean {
    const trimmed = apiKey.trim()
    if (!trimmed) return false
    if (this.storage.unavailableReason()) return false
    try {
      const encrypted = this.storage.encrypt(trimmed)
      mkdirSync(dirname(this.secretFile), { recursive: true })
      writeFileSync(this.secretFile, encrypted.toString('base64'), {
        encoding: 'utf8',
        mode: 0o600,
      })
      return true
    } catch {
      return false
    }
  }

  readKey(): string | null {
    if (this.storage.unavailableReason()) return null
    try {
      const b64 = readFileSync(this.secretFile, 'utf8').trim()
      if (!b64) return null
      const buf = Buffer.from(b64, 'base64')
      const decrypted = this.storage.decrypt(buf).trim()
      return decrypted || null
    } catch {
      return null
    }
  }

  clearKey(): void {
    try {
      rmSync(this.secretFile, { force: true })
    } catch {
      // Ignore
    }
  }
}
