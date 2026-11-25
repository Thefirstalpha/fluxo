import { createHash, randomBytes } from 'node:crypto'
import type { z } from 'zod'
import { anonymizeDocumentText, type AnonymizeOptions } from '@shared/documents/anonymize'
import { buildAiPrompt, estimateCostMicroUsd, estimateTokenCount } from '@shared/documents/ai'
import type {
  AiProviderId,
  AiPurpose,
  AiSendPreview,
  RedactionCount,
} from '@shared/documents/model'
import { callAnthropicStructured, type ProviderCallOutcome } from './anthropic'
import type { StoredAiConfig } from './config-store'
import { callGoogleStructured } from './google'
import { callOllamaStructured } from './local'
import type { AiSecretStore } from './secrets'

interface PendingAiSend {
  preview: AiSendPreview
  system: string
  user: string
  payloadSha256: string
  redactions: RedactionCount[]
}

export type EmbeddedFallbackResolver<T> = (anonymizedPayload: string) => T | null

/**
 * Passerelle centrale d'assistance IA (ADR-022) :
 * - refuse tout appel si `provider === 'none'`, sans plafond disponible ou sans jeton de
 *   prévisualisation explicitement consenti ;
 * - n'envoie jamais d'octets bruts ni de PII non expurgées ;
 * - renvoie le journal d'audit métadonnées (jetons, coût micro-USD, empreinte SHA-256).
 */
export class AiGateway {
  private readonly pending = new Map<string, PendingAiSend>()

  constructor(
    private readonly readConfig: () => StoredAiConfig,
    private readonly secrets: AiSecretStore,
    private readonly readMonthlySpend: () => Promise<number>,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  clearPending(): void {
    this.pending.clear()
  }

  async createPreview(params: {
    purpose: AiPurpose
    documentId: string | null
    rawText: string
    anonymize?: AnonymizeOptions
    preAnonymized?: { text: string; redactions: RedactionCount[] }
  }): Promise<
    { ok: true; preview: AiSendPreview } | { ok: false; reason: 'disabled' | 'missing-key' }
  > {
    const config = this.readConfig()
    if (config.provider === 'none') {
      return { ok: false, reason: 'disabled' }
    }
    if (config.provider === 'anthropic' && !this.secrets.hasKey('anthropic')) {
      return { ok: false, reason: 'missing-key' }
    }
    if (config.provider === 'google' && !this.secrets.hasKey('google')) {
      return { ok: false, reason: 'missing-key' }
    }

    const anon = params.preAnonymized
      ? params.preAnonymized
      : (() => {
          const res = anonymizeDocumentText(params.rawText, params.anonymize)
          return { text: res.anonymizedText, redactions: res.redactions }
        })()
    const prompt = buildAiPrompt(params.purpose, anon.text)
    const inputTokens = estimateTokenCount(`${prompt.system}\n${prompt.user}`)
    const estimatedOutputTokens = params.purpose === 'statement' ? 800 : 400
    const model =
      config.provider === 'anthropic'
        ? config.anthropicModel
        : config.provider === 'google'
          ? config.googleModel
          : config.localMode === 'ollama'
            ? config.localModel
            : 'fluxo-local-heuristics'

    const estimatedCostMicroUsd = estimateCostMicroUsd(
      config.provider,
      model,
      inputTokens,
      estimatedOutputTokens,
    )
    const spentThisMonthMicroUsd = await this.readMonthlySpend()
    const exceedsCap =
      (config.provider === 'anthropic' || config.provider === 'google') &&
      spentThisMonthMicroUsd + estimatedCostMicroUsd > config.monthlyCapMicroUsd

    const token = randomBytes(16).toString('hex')
    const payloadSha256 = createHash('sha256').update(anon.text, 'utf8').digest('hex')
    const destinationLabel =
      config.provider === 'anthropic'
        ? `Anthropic Messages (${model})`
        : config.provider === 'google'
          ? `Google AI Gemini (${model})`
          : config.localMode === 'ollama'
            ? `Ollama local (${config.localEndpoint})`
            : 'Modèle local embarqué (hors-ligne)'

    const preview: AiSendPreview = {
      token,
      provider: config.provider,
      model,
      purpose: params.purpose,
      destinationLabel,
      anonymizedPayload: anon.text,
      redactions: anon.redactions,
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens,
      estimatedCostMicroUsd,
      spentThisMonthMicroUsd,
      monthlyCapMicroUsd: config.monthlyCapMicroUsd,
      exceedsCap,
      documentId: params.documentId,
    }

    this.pending.set(token, {
      preview,
      system: prompt.system,
      user: prompt.user,
      payloadSha256,
      redactions: anon.redactions,
    })

    return { ok: true, preview }
  }

  async executeConsented<S extends z.ZodType>(params: {
    previewToken: string
    consentConfirmed: boolean
    schema: S
    embeddedFallback: EmbeddedFallbackResolver<z.output<S>>
  }): Promise<
    | {
        ok: true
        data: z.output<S>
        audit: {
          provider: AiProviderId
          model: string
          purpose: AiPurpose
          documentId: string | null
          inputTokens: number
          outputTokens: number
          costMicroUsd: number
          payloadSha256: string
          redactions: RedactionCount[]
        }
      }
    | {
        ok: false
        reason:
          | 'disabled'
          | 'consent-required'
          | 'cap-exceeded'
          | 'missing-key'
          | 'network-error'
          | 'refusal'
          | 'invalid-output'
        audit?: {
          provider: AiProviderId
          model: string
          purpose: AiPurpose
          documentId: string | null
          inputTokens: number
          outputTokens: number
          costMicroUsd: number
          payloadSha256: string
          redactions: RedactionCount[]
          status: 'refused' | 'error'
        }
      }
  > {
    if (!params.consentConfirmed) {
      return { ok: false, reason: 'consent-required' }
    }
    const job = this.pending.get(params.previewToken)
    if (!job) {
      return { ok: false, reason: 'consent-required' }
    }
    this.pending.delete(params.previewToken)

    const config = this.readConfig()
    if (config.provider === 'none') {
      return { ok: false, reason: 'disabled' }
    }
    if (job.preview.exceedsCap) {
      return { ok: false, reason: 'cap-exceeded' }
    }

    let outcome: ProviderCallOutcome<z.output<S>>
    if (config.provider === 'anthropic') {
      const apiKey = this.secrets.readKey('anthropic')
      if (!apiKey) return { ok: false, reason: 'missing-key' }
      outcome = await callAnthropicStructured({
        apiKey,
        model: config.anthropicModel,
        system: job.system,
        user: job.user,
        schema: params.schema,
        fetcher: this.fetcher,
      })
    } else if (config.provider === 'google') {
      const apiKey = this.secrets.readKey('google')
      if (!apiKey) return { ok: false, reason: 'missing-key' }
      outcome = await callGoogleStructured({
        apiKey,
        model: config.googleModel,
        system: job.system,
        user: job.user,
        schema: params.schema,
        fetcher: this.fetcher,
      })
    } else if (config.localMode === 'ollama') {
      outcome = await callOllamaStructured({
        endpoint: config.localEndpoint,
        model: config.localModel,
        system: job.system,
        user: job.user,
        schema: params.schema,
        fetcher: this.fetcher,
      })
    } else {
      const fallback = params.embeddedFallback(job.preview.anonymizedPayload)
      outcome = fallback
        ? {
            ok: true,
            data: fallback,
            inputTokens: job.preview.estimatedInputTokens,
            outputTokens: estimateTokenCount(JSON.stringify(fallback)),
          }
        : { ok: false, reason: 'invalid-output' }
    }

    if (!outcome.ok) {
      return {
        ok: false,
        reason: outcome.reason,
        audit: {
          provider: job.preview.provider,
          model: job.preview.model,
          purpose: job.preview.purpose,
          documentId: job.preview.documentId,
          inputTokens: job.preview.estimatedInputTokens,
          outputTokens: 0,
          costMicroUsd: 0,
          payloadSha256: job.payloadSha256,
          redactions: job.redactions,
          status: outcome.reason === 'refusal' ? 'refused' : 'error',
        },
      }
    }

    const costMicroUsd = estimateCostMicroUsd(
      job.preview.provider,
      job.preview.model,
      outcome.inputTokens,
      outcome.outputTokens,
    )

    return {
      ok: true,
      data: outcome.data,
      audit: {
        provider: job.preview.provider,
        model: job.preview.model,
        purpose: job.preview.purpose,
        documentId: job.preview.documentId,
        inputTokens: outcome.inputTokens,
        outputTokens: outcome.outputTokens,
        costMicroUsd,
        payloadSha256: job.payloadSha256,
        redactions: job.redactions,
      },
    }
  }
}
