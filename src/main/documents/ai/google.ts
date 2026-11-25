import { z } from 'zod'
import type { ProviderCallOutcome } from './anthropic'

const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

interface GeminiGenerateResponse {
  candidates?: {
    finishReason?: string
    content?: {
      parts?: { text?: string }[]
    }
  }[]
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
  }
}

/** Supprime `$schema` et `additionalProperties` que Gemini `responseJsonSchema` n'accepte pas toujours. */
function sanitizeGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeGeminiSchema)
  if (typeof node !== 'object' || node === null) return node
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === '$schema' || key === 'additionalProperties') continue
    out[key] = sanitizeGeminiSchema(value)
  }
  return out
}

/**
 * Appelle directement l'API Gemini (Google AI) via `fetch` natif avec sortie JSON contrainte
 * par `responseJsonSchema`. La clé API transite uniquement via l'en-tête `x-goog-api-key`.
 */
export async function callGoogleStructured<S extends z.ZodType>(params: {
  apiKey: string
  model: string
  system: string
  user: string
  schema: S
  fetcher?: typeof fetch
}): Promise<ProviderCallOutcome<z.output<S>>> {
  if (!params.apiKey.trim()) {
    return { ok: false, reason: 'missing-key' }
  }
  const doFetch = params.fetcher ?? fetch
  const jsonSchema = sanitizeGeminiSchema(z.toJSONSchema(params.schema))
  const url = `${GOOGLE_API_BASE}/${encodeURIComponent(params.model)}:generateContent`

  try {
    const response = await doFetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': params.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: params.system }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: params.user }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: jsonSchema,
        },
      }),
    })

    if (!response.ok) {
      return { ok: false, reason: 'network-error' }
    }

    const body = (await response.json()) as GeminiGenerateResponse
    const candidate = body.candidates?.[0]
    if (
      candidate?.finishReason === 'SAFETY' ||
      candidate?.finishReason === 'RECITATION' ||
      candidate?.finishReason === 'PROHIBITED_CONTENT'
    ) {
      return { ok: false, reason: 'refusal' }
    }

    const textBlock = candidate?.content?.parts?.find((p) => typeof p.text === 'string')?.text
    if (!textBlock) {
      return { ok: false, reason: 'invalid-output' }
    }

    let rawJson: unknown
    try {
      rawJson = JSON.parse(textBlock)
    } catch {
      return { ok: false, reason: 'invalid-output' }
    }

    const parsed = params.schema.safeParse(rawJson)
    if (!parsed.success) {
      return { ok: false, reason: 'invalid-output' }
    }

    return {
      ok: true,
      data: parsed.data,
      inputTokens: Math.max(0, Math.round(body.usageMetadata?.promptTokenCount ?? 0)),
      outputTokens: Math.max(0, Math.round(body.usageMetadata?.candidatesTokenCount ?? 0)),
    }
  } catch {
    return { ok: false, reason: 'network-error' }
  }
}
