import { z } from 'zod'
import { isLoopbackEndpoint } from '@shared/documents/schemas'
import type { ProviderCallOutcome } from './anthropic'

interface OllamaChatResponse {
  message?: { content?: string }
  prompt_eval_count?: number
  eval_count?: number
}

/**
 * Appelle un serveur Ollama local strictement restreint à la boucle locale (`127.0.0.1` /
 * `localhost`) avec sortie JSON contrainte par schéma. Aucune connexion distante autorisée.
 */
export async function callOllamaStructured<S extends z.ZodType>(params: {
  endpoint: string
  model: string
  system: string
  user: string
  schema: S
  fetcher?: typeof fetch
}): Promise<ProviderCallOutcome<z.output<S>>> {
  if (!isLoopbackEndpoint(params.endpoint)) {
    return { ok: false, reason: 'network-error' }
  }
  const doFetch = params.fetcher ?? fetch
  const jsonSchema = z.toJSONSchema(params.schema)
  const url = `${params.endpoint.replace(/\/$/, '')}/api/chat`

  try {
    const response = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: params.model,
        stream: false,
        format: jsonSchema,
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.user },
        ],
      }),
    })
    if (!response.ok) return { ok: false, reason: 'network-error' }

    const body = (await response.json()) as OllamaChatResponse
    const content = body.message?.content
    if (!content) return { ok: false, reason: 'invalid-output' }

    let rawJson: unknown
    try {
      rawJson = JSON.parse(content)
    } catch {
      return { ok: false, reason: 'invalid-output' }
    }

    const parsed = params.schema.safeParse(rawJson)
    if (!parsed.success) return { ok: false, reason: 'invalid-output' }

    return {
      ok: true,
      data: parsed.data,
      inputTokens: Math.max(0, Math.round(body.prompt_eval_count ?? 0)),
      outputTokens: Math.max(0, Math.round(body.eval_count ?? 0)),
    }
  } catch {
    return { ok: false, reason: 'network-error' }
  }
}
