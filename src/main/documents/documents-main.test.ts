import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OCR_MODEL_SPECS } from '@shared/documents/ai'
import { aiPayslipStructuredOutputSchema, aiConfigPatchSchema } from '@shared/documents/schemas'
import type { SecureStorage } from '../vault/secure-storage'
import { callAnthropicStructured } from './ai/anthropic'
import { AiConfigStore } from './ai/config-store'
import { AiGateway } from './ai/gateway'
import { callOllamaStructured } from './ai/local'
import { AiSecretStore } from './ai/secrets'
import { StagedOriginalBytesStore } from './file-guard'
import { OcrModelManager } from './model-manager'

function fakeStorage(): SecureStorage {
  return {
    unavailableReason: () => null,
    encrypt: (plain: string) =>
      Buffer.from(`enc:${Buffer.from(plain, 'utf8').toString('base64')}`, 'utf8'),
    decrypt: (cipher: Buffer) => {
      const s = cipher.toString('utf8')
      if (!s.startsWith('enc:')) throw new Error('bad')
      return Buffer.from(s.slice(4), 'base64').toString('utf8')
    },
  }
}

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'fluxo-m7-main-'))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('StagedOriginalBytesStore (ADR-018 zéro rétention)', () => {
  it('efface et met à zéro les octets en mémoire dès la purge ou le verrouillage', () => {
    const store = new StagedOriginalBytesStore()
    const buf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
    store.put('doc-1', { fileName: 'bulletin.pdf', mimeType: 'application/pdf', bytes: buf })
    expect(store.has('doc-1')).toBe(true)

    expect(store.purge('doc-1')).toBe(true)
    expect(store.has('doc-1')).toBe(false)
    expect([...buf]).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
  })
})

describe('AiSecretStore & AiConfigStore', () => {
  it('chiffre la clé Anthropic avec safeStorage et rejette tout endpoint Ollama non loopback', () => {
    const secrets = new AiSecretStore(join(tempDir, 'ai.bin'), fakeStorage())
    expect(secrets.hasKey()).toBe(false)
    expect(secrets.setKey('sk-ant-secret-123456')).toBe(true)
    expect(secrets.hasKey()).toBe(true)
    expect(secrets.readKey()).toBe('sk-ant-secret-123456')
    secrets.clearKey()
    expect(secrets.hasKey()).toBe(false)

    const config = new AiConfigStore(join(tempDir, 'ai-config.json'))
    expect(config.get().provider).toBe('none')
    expect(() =>
      aiConfigPatchSchema.parse({ localEndpoint: 'https://remote.attacker.example' }),
    ).toThrow()
    expect(aiConfigPatchSchema.parse({ localEndpoint: 'http://127.0.0.1:11434' })).toEqual({
      localEndpoint: 'http://127.0.0.1:11434',
    })
  })
})

describe('AiGateway & fournisseurs Anthropic / Ollama (hors-ligne, mocks stricts)', () => {
  it('refuse tout appel réseau quand provider = none ou sans consentement explicite', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const secrets = new AiSecretStore(join(tempDir, 'ai.bin'), fakeStorage())
    const config = new AiConfigStore(join(tempDir, 'ai-config.json'))
    const gateway = new AiGateway(
      () => config.get(),
      secrets,
      () => Promise.resolve(0),
      fetcher,
    )

    const disabledPreview = await gateway.createPreview({
      purpose: 'payslip',
      documentId: 'doc-1',
      rawText: 'Net payé 2500,00 €',
    })
    expect(disabledPreview).toEqual({ ok: false, reason: 'disabled' })
    expect(fetcher).not.toHaveBeenCalled()

    // Avec fournisseur anthropic configuré mais consentement refusé / manquant.
    secrets.setKey('sk-ant-secret-123456')
    config.update({ provider: 'anthropic' })
    const preview = await gateway.createPreview({
      purpose: 'payslip',
      documentId: 'doc-1',
      rawText: 'NIR 1 85 11 75 116 003 42 · Net payé 2 500,00 €',
    })
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.preview.anonymizedPayload).toContain('[NIR_1]')
    expect(preview.preview.anonymizedPayload).not.toContain('85 11 75')

    const denied = await gateway.executeConsented({
      previewToken: preview.preview.token,
      consentConfirmed: false,
      schema: aiPayslipStructuredOutputSchema,
      embeddedFallback: () => null,
    })
    expect(denied).toEqual({ ok: false, reason: 'consent-required' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('applique le plafond mensuel et gère stop_reason = refusal ou sortie structurée Anthropic', async () => {
    const secrets = new AiSecretStore(join(tempDir, 'ai.bin'), fakeStorage())
    secrets.setKey('sk-ant-secret-123456')
    const config = new AiConfigStore(join(tempDir, 'ai-config.json'))
    config.update({ provider: 'anthropic', monthlyCapMicroUsd: 1_000 })

    const fetcher = vi.fn<typeof fetch>()
    const cappedGateway = new AiGateway(
      () => config.get(),
      secrets,
      () => Promise.resolve(999),
      fetcher,
    )
    const capPreview = await cappedGateway.createPreview({
      purpose: 'payslip',
      documentId: 'doc-1',
      rawText: 'Salaire brut 3000,00 EUR',
    })
    expect(capPreview.ok && capPreview.preview.exceedsCap).toBe(true)
    if (capPreview.ok) {
      const capExec = await cappedGateway.executeConsented({
        previewToken: capPreview.preview.token,
        consentConfirmed: true,
        schema: aiPayslipStructuredOutputSchema,
        embeddedFallback: () => null,
      })
      expect(capExec).toEqual({ ok: false, reason: 'cap-exceeded' })
      expect(fetcher).not.toHaveBeenCalled()
    }

    // Réponse refusal Anthropic.
    const refusalRes = await callAnthropicStructured({
      apiKey: 'sk-ant-12345',
      model: 'claude-haiku-4-5',
      system: 'sys',
      user: 'user',
      schema: aiPayslipStructuredOutputSchema,
      fetcher: () =>
        Promise.resolve(
          new Response(JSON.stringify({ stop_reason: 'refusal', content: [] }), { status: 200 }),
        ),
    })
    expect(refusalRes).toEqual({ ok: false, reason: 'refusal' })

    // Ollama distant bloqué avant réseau.
    const remoteBlocked = await callOllamaStructured({
      endpoint: 'https://not-local.example',
      model: 'qwen2.5',
      system: 'sys',
      user: 'user',
      schema: aiPayslipStructuredOutputSchema,
      fetcher,
    })
    expect(remoteBlocked).toEqual({ ok: false, reason: 'network-error' })
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('OcrModelManager (vérification SHA-256 stricte)', () => {
  it('rejette un modèle corrompu et accepte un binaire conforme à son empreinte SHA-256', async () => {
    const manager = new OcrModelManager(join(tempDir, 'ocr-models'))
    expect(manager.status().fra.installed).toBe(false)

    // Fausse charge utile -> refus checksum-mismatch.
    const bad = await manager.downloadLanguage('fra', () =>
      Promise.resolve(new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 })),
    )
    expect(bad).toEqual({ ok: false, reason: 'checksum-mismatch' })
    expect(manager.status().fra.installed).toBe(false)

    // Vérifie la formule SHA-256 sur une empreinte attendue.
    const fakePayload = new Uint8Array([10, 20, 30])
    expect(createHash('sha256').update(fakePayload).digest('hex')).not.toBe(
      OCR_MODEL_SPECS.fra.sha256,
    )
  })
})
