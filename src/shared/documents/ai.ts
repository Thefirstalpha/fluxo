import {
  ANTHROPIC_MODELS,
  type AiConfigPublic,
  type AiProviderId,
  type AiPurpose,
  type AnthropicModelId,
} from './model'

/** Tarifs indicatifs en micro-USD par million de jetons (entiers uniquement). */
export const ANTHROPIC_PRICING_MICRO_USD_PER_MTOK: Readonly<
  Record<AnthropicModelId, { input: number; output: number }>
> = {
  'claude-sonnet-4-5': { input: 3_000_000, output: 15_000_000 },
  'claude-haiku-4-5': { input: 800_000, output: 4_000_000 },
}

export const DEFAULT_MONTHLY_CAP_MICRO_USD = 5_000_000 // $5,00 / mois par défaut
export const DEFAULT_LOCAL_OLLAMA_ENDPOINT = 'http://127.0.0.1:11434'
export const DEFAULT_LOCAL_OLLAMA_MODEL = 'qwen2.5:7b-instruct'

export const OCR_MODEL_SPECS = {
  fra: {
    language: 'fra',
    url: 'https://github.com/tesseract-ocr/tessdata_fast/raw/main/fra.traineddata',
    expectedBytes: 1_130_365,
    sha256: 'ced037562e8c80c13122dece28dd477d399af80911a28791a66a63ac1e3445ca',
  },
  eng: {
    language: 'eng',
    url: 'https://github.com/tesseract-ocr/tessdata_fast/raw/main/eng.traineddata',
    expectedBytes: 4_113_088,
    sha256: '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2',
  },
} as const

export function estimateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}

export function estimateCostMicroUsd(
  provider: AiProviderId,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  if (provider !== 'anthropic') return 0
  const rates =
    model in ANTHROPIC_PRICING_MICRO_USD_PER_MTOK
      ? ANTHROPIC_PRICING_MICRO_USD_PER_MTOK[model as AnthropicModelId]
      : ANTHROPIC_PRICING_MICRO_USD_PER_MTOK['claude-sonnet-4-5']
  return Math.ceil((inputTokens * rates.input + outputTokens * rates.output) / 1_000_000)
}

export function formatMicroUsd(microUsd: number): string {
  const dollars = microUsd / 1_000_000
  return dollars < 0.01 && microUsd > 0 ? `< $0.01` : `$${dollars.toFixed(2)}`
}

export function buildDefaultAiConfig(): AiConfigPublic {
  return {
    provider: 'none',
    anthropicModel: ANTHROPIC_MODELS[1],
    hasAnthropicKey: false,
    localMode: 'embedded',
    localEndpoint: DEFAULT_LOCAL_OLLAMA_ENDPOINT,
    localModel: DEFAULT_LOCAL_OLLAMA_MODEL,
    monthlyCapMicroUsd: DEFAULT_MONTHLY_CAP_MICRO_USD,
    spentThisMonthMicroUsd: 0,
    ocrLanguages: {
      fra: {
        language: 'fra',
        installed: false,
        sizeBytes: 0,
        expectedBytes: OCR_MODEL_SPECS.fra.expectedBytes,
        sha256: OCR_MODEL_SPECS.fra.sha256,
      },
      eng: {
        language: 'eng',
        installed: false,
        sizeBytes: 0,
        expectedBytes: OCR_MODEL_SPECS.eng.expectedBytes,
        sha256: OCR_MODEL_SPECS.eng.sha256,
      },
    },
  }
}

export function buildAiPrompt(
  purpose: AiPurpose,
  anonymizedPayload: string,
): {
  system: string
  user: string
} {
  if (purpose === 'payslip') {
    return {
      system:
        'Tu es un assistant comptable français strict. Extrais les totaux exacts en CENTIMES ENTIERS (ex. 2500.00 EUR -> 250000) du bulletin de paie anonymisé ci-dessous. N’invente jamais un montant absent.',
      user: anonymizedPayload,
    }
  }
  if (purpose === 'statement') {
    return {
      system:
        'Tu es un assistant bancaire strict. Extrais les dates ISO (AAAA-MM-JJ), les montants en CENTIMES ENTIERS (négatif pour débit, positif pour crédit) et les libellés propres du relevé bancaire anonymisé ci-dessous.',
      user: anonymizedPayload,
    }
  }
  return {
    system:
      'Tu es un assistant de catégorisation bancaire. Associe chaque opération à la meilleure catégorie (ou null si incertain) à partir des seuls identifiants de catégories autorisés et fournis.',
    user: anonymizedPayload,
  }
}
