import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { SecureStorage } from '../../vault/secure-storage'

export type CloudAiProvider = 'anthropic' | 'google'

/**
 * Conserve les clés API cloud (Anthropic / Google AI) exclusivement dans le process main,
 * chiffrées par `safeStorage` (Keychain macOS, DPAPI Windows, libsecret Linux).
 * Jamais journalisées ni exposées au renderer.
 */
export class AiSecretStore {
  constructor(
    private readonly secretFile: string,
    private readonly storage: SecureStorage,
  ) {}

  private pathFor(provider: CloudAiProvider): string {
    if (provider === 'anthropic') return this.secretFile
    return join(dirname(this.secretFile), 'ai-google.bin')
  }

  hasKey(provider: CloudAiProvider = 'anthropic'): boolean {
    return this.readKey(provider) !== null
  }

  setKey(apiKey: string, provider: CloudAiProvider = 'anthropic'): boolean {
    const trimmed = apiKey.trim()
    if (!trimmed) return false
    if (this.storage.unavailableReason()) return false
    try {
      const encrypted = this.storage.encrypt(trimmed)
      const target = this.pathFor(provider)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, encrypted.toString('base64'), {
        encoding: 'utf8',
        mode: 0o600,
      })
      return true
    } catch {
      return false
    }
  }

  readKey(provider: CloudAiProvider = 'anthropic'): string | null {
    if (this.storage.unavailableReason()) return null
    try {
      const b64 = readFileSync(this.pathFor(provider), 'utf8').trim()
      if (!b64) return null
      const buf = Buffer.from(b64, 'base64')
      const decrypted = this.storage.decrypt(buf).trim()
      return decrypted || null
    } catch {
      return null
    }
  }

  clearKey(provider: CloudAiProvider = 'anthropic'): void {
    try {
      rmSync(this.pathFor(provider), { force: true })
    } catch {
      // Ignore
    }
  }
}
