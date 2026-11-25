import { z } from 'zod'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

export type ProviderCallOutcome<T> =
  | { ok: true; data: T; inputTokens: number; outputTokens: number }
  | { ok: false; reason: 'network-error' | 'refusal' | 'invalid-output' | 'missing-key' }

interface AnthropicApiResponse {
  stop_reason?: string
  content?: { type?: string; text?: string }[]
  usage?: { input_tokens?: number; output_tokens?: number }
}

/**
 * Appelle directement l'API Messages d'Anthropic via `fetch` natif (Node 24) avec sortie JSON
 * strictement contrainte par `output_config.format.json_schema`.
 */
export async function callAnthropicStructured<S extends z.ZodType>(params: {
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
  const jsonSchema = z.toJSONSchema(params.schema)

  try {
    const response = await doFetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': params.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: params.model,
        max_tokens: 2048,
        system: params.system,
        messages: [{ role: 'user', content: params.user }],
        output_config: {
          format: {
            type: 'json_schema',
            schema: jsonSchema,
          },
        },
      }),
    })

    if (!response.ok) {
      return { ok: false, reason: 'network-error' }
    }

    const body = (await response.json()) as AnthropicApiResponse
    if (body.stop_reason === 'refusal') {
      return { ok: false, reason: 'refusal' }
    }

    const textBlock = body.content?.find(
      (c) => c.type === 'text' && typeof c.text === 'string',
    )?.text
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
      inputTokens: Math.max(0, Math.round(body.usage?.input_tokens ?? 0)),
      outputTokens: Math.max(0, Math.round(body.usage?.output_tokens ?? 0)),
    }
  } catch {
    return { ok: false, reason: 'network-error' }
  }
}
