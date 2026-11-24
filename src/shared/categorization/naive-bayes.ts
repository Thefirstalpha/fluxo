import type { MinorUnits } from '../money'
import { cleanTransactionLabel, tokenizeForLearning } from './normalize'

/**
 * Classifieur local léger (Bayes naïf multinomial) utilisant mots normalisés, n-grammes de
 * caractères (3 et 4), sens du flux et tranche de montant, stockable en JSON dans SQLCipher.
 */
export interface SerializedNaiveBayesModel {
  version: 1
  /** Comptes par catégorie (`categoryId -> nombre d'exemples`). */
  classCounts: Record<string, number>
  /** Totaux de jetons pondérés par catégorie. */
  classTokenTotals: Record<string, number>
  /** `feature -> { categoryId -> count }`. */
  featureCounts: Record<string, Record<string, number>>
  vocabularySize: number
  totalSamples: number
}

export interface TrainingSample {
  labelRaw: string
  payee: string | null
  amount: MinorUnits
  categoryId: string
}

export interface ClassificationPrediction {
  categoryId: string
  confidence: number
  topFeatures: string[]
}

const LAPLACE_ALPHA = 1.0
const MAX_VOCAB_FEATURES = 4_000

function amountBucket(amount: MinorUnits): string {
  const abs = Math.abs(amount)
  if (abs < 1_500) return '__amt:xs'
  if (abs < 5_000) return '__amt:sm'
  if (abs < 20_000) return '__amt:md'
  if (abs < 100_000) return '__amt:lg'
  return '__amt:xl'
}

export function extractFeatures(sample: {
  labelRaw: string
  payee: string | null
  amount: MinorUnits
  precleanedCanonical?: string
}): string[] {
  const features: string[] = []
  const canonical =
    sample.precleanedCanonical !== undefined
      ? sample.precleanedCanonical
      : cleanTransactionLabel(sample.labelRaw).canonical
  const words = tokenizeForLearning(canonical)

  for (const w of words) {
    // Double poids sur les mots complets en les émettant sous forme unigramme dédiée
    features.push(`w:${w}`)
    if (w.length >= 4) {
      const padded = `^${w}$`
      for (let i = 0; i <= padded.length - 3; i++) {
        features.push(`g3:${padded.slice(i, i + 3)}`)
      }
    }
  }

  for (let i = 0; i < words.length - 1; i++) {
    features.push(`b:${words[i]}_${words[i + 1]}`)
  }

  if (sample.payee) {
    const cleanPayee = cleanTransactionLabel(sample.payee).canonical
    for (const pw of tokenizeForLearning(cleanPayee)) {
      features.push(`p:${pw}`)
    }
  }

  features.push(sample.amount < 0 ? '__dir:out' : '__dir:in')
  features.push(amountBucket(sample.amount))
  return features
}

export function trainNaiveBayesModel(
  samples: readonly TrainingSample[],
): SerializedNaiveBayesModel {
  const classCounts: Record<string, number> = Object.create(null) as Record<string, number>
  const classTokenTotals: Record<string, number> = Object.create(null) as Record<string, number>
  const rawFeatures = new Map<string, { total: number; byClass: Record<string, number> }>()

  for (const sample of samples) {
    if (!sample.categoryId) continue
    classCounts[sample.categoryId] = (classCounts[sample.categoryId] ?? 0) + 1
    const feats = extractFeatures(sample)
    for (const feat of feats) {
      let entry = rawFeatures.get(feat)
      if (!entry) {
        entry = { total: 0, byClass: Object.create(null) as Record<string, number> }
        rawFeatures.set(feat, entry)
      }
      entry.total += 1
      entry.byClass[sample.categoryId] = (entry.byClass[sample.categoryId] ?? 0) + 1
    }
  }

  // Élagage doux si le vocabulaire dépasse `MAX_VOCAB_FEATURES` : garde les plus fréquents.
  const entries = [...rawFeatures.entries()]
  if (entries.length > MAX_VOCAB_FEATURES) {
    entries.sort((a, b) => b[1].total - a[1].total)
    entries.length = MAX_VOCAB_FEATURES
  }

  const featureCounts: Record<string, Record<string, number>> = Object.create(null) as Record<
    string,
    Record<string, number>
  >
  for (const [feat, data] of entries) {
    featureCounts[feat] = data.byClass
    for (const [cls, cnt] of Object.entries(data.byClass)) {
      classTokenTotals[cls] = (classTokenTotals[cls] ?? 0) + cnt
    }
  }

  return {
    version: 1,
    classCounts,
    classTokenTotals,
    featureCounts,
    vocabularySize: entries.length,
    totalSamples: Object.values(classCounts).reduce((a, b) => a + b, 0),
  }
}

export function predictWithNaiveBayes(
  model: SerializedNaiveBayesModel,
  sample: {
    labelRaw: string
    payee: string | null
    amount: MinorUnits
    precleanedCanonical?: string
  },
  allowedCategoryIds?: ReadonlySet<string>,
  precomputedAllowedClasses?: readonly string[],
): ClassificationPrediction | null {
  if (model.totalSamples === 0) return null
  const classes =
    precomputedAllowedClasses ??
    Object.keys(model.classCounts).filter(
      (cls) => !allowedCategoryIds || allowedCategoryIds.has(cls),
    )
  if (classes.length === 0) return null

  const features = extractFeatures(sample)
  const vocab = Math.max(1, model.vocabularySize)
  const logScores = new Map<string, number>()

  for (const cls of classes) {
    const classCount = model.classCounts[cls] ?? 0
    if (classCount === 0) continue
    let logProb = Math.log(classCount / model.totalSamples)
    const denom = (model.classTokenTotals[cls] ?? 0) + LAPLACE_ALPHA * vocab

    for (const feat of features) {
      const fMap = model.featureCounts[feat]
      if (!fMap) continue
      const count = fMap[cls] ?? 0
      logProb += Math.log((count + LAPLACE_ALPHA) / denom)
    }
    logScores.set(cls, logProb)
  }

  if (logScores.size === 0) return null

  // Normalisation log-sum-exp → probabilités exactes dans [0, 1].
  let maxLog = Number.NEGATIVE_INFINITY
  for (const v of logScores.values()) if (v > maxLog) maxLog = v

  let sumExp = 0
  let bestClass = ''
  let bestExp = -1
  const exps = new Map<string, number>()

  for (const [cls, v] of logScores.entries()) {
    const e = Math.exp(v - maxLog)
    exps.set(cls, e)
    sumExp += e
    if (e > bestExp) {
      bestExp = e
      bestClass = cls
    }
  }

  if (!bestClass || sumExp <= 0) return null
  const confidence = Math.max(0, Math.min(1, bestExp / sumExp))

  const topFeatures = features
    .filter((f) => f.startsWith('w:') && (model.featureCounts[f]?.[bestClass] ?? 0) > 0)
    .slice(0, 3)
    .map((f) => f.slice(2))

  return {
    categoryId: bestClass,
    confidence,
    topFeatures,
  }
}
