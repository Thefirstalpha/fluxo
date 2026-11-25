import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { z } from 'zod'
import {
  buildDefaultAiConfig,
  DEFAULT_LOCAL_OLLAMA_ENDPOINT,
  DEFAULT_LOCAL_OLLAMA_MODEL,
  DEFAULT_MONTHLY_CAP_MICRO_USD,
} from '@shared/documents/ai'
import {
  AI_LOCAL_MODES,
  AI_PROVIDERS,
  ANTHROPIC_MODELS,
  GOOGLE_MODELS,
  type AiConfigPatch,
  type AiConfigPublic,
} from '@shared/documents/model'
import { aiConfigPatchSchema, isLoopbackEndpoint } from '@shared/documents/schemas'

const defaults = buildDefaultAiConfig()

const storedConfigSchema = z.object({
  provider: z.enum(AI_PROVIDERS).catch(defaults.provider),
  anthropicModel: z.enum(ANTHROPIC_MODELS).catch(defaults.anthropicModel),
  googleModel: z.enum(GOOGLE_MODELS).catch(defaults.googleModel),
  autoAnalyzeDocuments: z.boolean().catch(defaults.autoAnalyzeDocuments),
  localMode: z.enum(AI_LOCAL_MODES).catch(defaults.localMode),
  localEndpoint: z.string().refine(isLoopbackEndpoint).catch(DEFAULT_LOCAL_OLLAMA_ENDPOINT),
  localModel: z.string().min(1).max(120).catch(DEFAULT_LOCAL_OLLAMA_MODEL),
  monthlyCapMicroUsd: z.number().int().min(0).max(500_000_000).catch(DEFAULT_MONTHLY_CAP_MICRO_USD),
})

export type StoredAiConfig = z.infer<typeof storedConfigSchema>

/**
 * Stockage tolérant des réglages IA non sensibles (`userData/ai-config.json`).
 * Par défaut : `provider: 'none'` (tout traitement IA désactivé).
 */
export class AiConfigStore {
  private current: StoredAiConfig

  constructor(private readonly filePath: string) {
    this.current = this.load()
  }

  private load(): StoredAiConfig {
    try {
      const raw = readFileSync(this.filePath, 'utf8')
      return storedConfigSchema.parse(JSON.parse(raw))
    } catch {
      return storedConfigSchema.parse({})
    }
  }

  get(): StoredAiConfig {
    return { ...this.current }
  }

  update(patch: AiConfigPatch): StoredAiConfig {
    const parsed = aiConfigPatchSchema.parse(patch)
    const next = storedConfigSchema.parse({ ...this.current, ...parsed })
    this.current = next
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(next, null, 2), 'utf8')
    return this.get()
  }

  toPublic(extras: {
    hasAnthropicKey: boolean
    hasGoogleKey: boolean
    spentThisMonthMicroUsd: number
    ocrLanguages: AiConfigPublic['ocrLanguages']
  }): AiConfigPublic {
    return {
      ...this.current,
      hasAnthropicKey: extras.hasAnthropicKey,
      hasGoogleKey: extras.hasGoogleKey,
      spentThisMonthMicroUsd: extras.spentThisMonthMicroUsd,
      ocrLanguages: extras.ocrLanguages,
    }
  }
}
