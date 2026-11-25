import type {
  AutoCategorizeResult,
  CategorizationQueueItem,
  ClassifierStatus,
  RuleActions,
  RuleSummary,
  SuggestionSource,
} from '@shared/categorization/model'
import { matchFrenchMerchant } from '@shared/categorization/merchants'
import {
  predictWithNaiveBayes,
  trainNaiveBayesModel,
  type SerializedNaiveBayesModel,
} from '@shared/categorization/naive-bayes'
import { canonicalTransactionLabel, cleanTransactionLabel } from '@shared/categorization/normalize'
import { CATEGORY_PACK_FR } from '@shared/ledger/category-pack'
import type { SplitInput } from '@shared/ledger/model'
import { uuidv7 } from '@shared/uuid'
import { recordAudit } from '../db/audit'
import type { Db } from '../db/connection'
import type { ChangeSet } from './changes'
import { fail } from './failure'
import {
  compileRule,
  listRules,
  matchesRule,
  saveRule,
  type CompiledRule,
  type RuleCandidateTx,
} from './rules'
import { writeSplits } from './splits'
import { reconcileLinkedCategoryTransfer, reconcileLinkedCategoryTransferOnDb } from './transfers'

const DEFAULT_THRESHOLD = 0.85
const META_THRESHOLD_KEY = 'categorization_threshold'
const CLASSIFIER_MODEL_ID = 'default'

export function getCategorizationThreshold(db: Db): number {
  const raw = db.prepare('SELECT value FROM meta WHERE key = ?').pluck().get(META_THRESHOLD_KEY) as
    string | undefined
  if (!raw) return DEFAULT_THRESHOLD
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0.5 || parsed > 0.99) return DEFAULT_THRESHOLD
  return parsed
}

export function setCategorizationThreshold(db: Db, threshold: number): { threshold: number } {
  const clamped = Math.max(0.5, Math.min(0.99, Math.round(threshold * 100) / 100))
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
  ).run(META_THRESHOLD_KEY, String(clamped))
  return { threshold: clamped }
}

/** Associe chaque clé du pack France (`groceries.shopping`…) à l'ID actif en base. */
export function resolvePackCategoryMap(db: Db): Map<string, string> {
  const rows = db.prepare('SELECT id, parent_id, name FROM category WHERE archived = 0').all() as {
    id: string
    parent_id: string | null
    name: string
  }[]

  const byNorm = new Map<string, string>()
  for (const row of rows) {
    byNorm.set(row.name.normalize('NFC').toLocaleLowerCase('fr'), row.id)
  }

  const map = new Map<string, string>()
  for (const top of CATEGORY_PACK_FR) {
    const topId =
      byNorm.get(top.names['fr-FR'].normalize('NFC').toLocaleLowerCase('fr')) ??
      byNorm.get(top.names['en-US'].normalize('NFC').toLocaleLowerCase('fr'))
    if (topId) map.set(top.key, topId)

    for (const sub of top.children) {
      const subId =
        byNorm.get(sub.names['fr-FR'].normalize('NFC').toLocaleLowerCase('fr')) ??
        byNorm.get(sub.names['en-US'].normalize('NFC').toLocaleLowerCase('fr')) ??
        topId
      if (subId) map.set(sub.key, subId)
    }
  }
  return map
}

function loadNaiveBayesModel(db: Db): SerializedNaiveBayesModel | null {
  const row = db
    .prepare('SELECT vocabulary_json, priors_json, sample_count FROM classifier_state WHERE id = ?')
    .get(CLASSIFIER_MODEL_ID) as
    { vocabulary_json: string; priors_json: string; sample_count: number } | undefined
  if (!row || row.sample_count === 0) return null
  try {
    const vocab = JSON.parse(row.vocabulary_json) as SerializedNaiveBayesModel['featureCounts']
    const priors = JSON.parse(row.priors_json) as {
      classCounts: SerializedNaiveBayesModel['classCounts']
      classTokenTotals: SerializedNaiveBayesModel['classTokenTotals']
      vocabularySize: number
    }
    return {
      version: 1,
      classCounts: priors.classCounts,
      classTokenTotals: priors.classTokenTotals,
      featureCounts: vocab,
      vocabularySize: priors.vocabularySize,
      totalSamples: row.sample_count,
    }
  } catch {
    return null
  }
}

export function getClassifierStatus(db: Db): ClassifierStatus {
  const row = db
    .prepare('SELECT sample_count, priors_json, updated_at FROM classifier_state WHERE id = ?')
    .get(CLASSIFIER_MODEL_ID) as
    { sample_count: number; priors_json: string; updated_at: string } | undefined
  let categoryCount = 0
  if (row) {
    try {
      const priors = JSON.parse(row.priors_json) as { classCounts?: Record<string, number> }
      categoryCount = Object.keys(priors.classCounts ?? {}).length
    } catch {
      categoryCount = 0
    }
  }
  return {
    sampleCount: row?.sample_count ?? 0,
    categoryCount,
    updatedAt: row?.updated_at ?? null,
    threshold: getCategorizationThreshold(db),
  }
}

export function retrainClassifier(db: Db, now: Date): ClassifierStatus {
  const rows = db
    .prepare(
      `SELECT t.label_raw, p.name AS payee, t.amount, s.category_id
       FROM split s
       JOIN transactions t ON t.id = s.transaction_id
       JOIN category c ON c.id = s.category_id
       LEFT JOIN payee p ON p.id = t.payee_id
       WHERE t.nature = 'operation'
         AND t.transfer_id IS NULL
         AND s.category_id IS NOT NULL
         AND c.archived = 0
         AND c.kind IN ('expense', 'income')`,
    )
    .all() as { label_raw: string; payee: string | null; amount: number; category_id: string }[]

  const model = trainNaiveBayesModel(
    rows.map((r) => ({
      labelRaw: r.label_raw,
      payee: r.payee,
      amount: r.amount,
      categoryId: r.category_id,
    })),
  )

  const stamp = now.toISOString()
  db.prepare(
    `INSERT INTO classifier_state (id, vocabulary_json, priors_json, sample_count, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       vocabulary_json = excluded.vocabulary_json,
       priors_json = excluded.priors_json,
       sample_count = excluded.sample_count,
       updated_at = excluded.updated_at`,
  ).run(
    CLASSIFIER_MODEL_ID,
    JSON.stringify(model.featureCounts),
    JSON.stringify({
      classCounts: model.classCounts,
      classTokenTotals: model.classTokenTotals,
      vocabularySize: model.vocabularySize,
    }),
    model.totalSamples,
    stamp,
  )

  return {
    sampleCount: model.totalSamples,
    categoryCount: Object.keys(model.classCounts).length,
    updatedAt: stamp,
    threshold: getCategorizationThreshold(db),
  }
}

/**
 * Pipeline rapide de catégorisation automatique (règles → dictionnaire de marchands → Bayes naïf)
 * conçu pour traiter 10 000 opérations en moins d'une seconde.
 */
export function runAutoCategorization(
  db: Db,
  options: { transactionIds?: readonly string[]; threshold?: number } = {},
  now: Date = new Date(),
): AutoCategorizeResult {
  const start = performance.now()
  const stamp = now.toISOString()
  const threshold = options.threshold ?? getCategorizationThreshold(db)

  // Assure qu'un modèle Bayes existe déjà s'il y a un historique étiqueté.
  let model = loadNaiveBayesModel(db)
  if (!model) {
    const status = retrainClassifier(db, now)
    if (status.sampleCount > 0) model = loadNaiveBayesModel(db)
  }

  const activeCategoryIds = new Set(
    db.prepare('SELECT id FROM category WHERE archived = 0').pluck().all() as string[],
  )
  const allowedClasses = model
    ? Object.keys(model.classCounts).filter((cls) => activeCategoryIds.has(cls))
    : []
  const canonicalCache = new Map<string, string>()
  const getCanonical = (raw: string) => {
    let hit = canonicalCache.get(raw)
    if (hit === undefined) {
      hit = canonicalTransactionLabel(raw)
      if (canonicalCache.size < 2048) canonicalCache.set(raw, hit)
    }
    return hit
  }
  const categoryNames = new Map<string, string>(
    (
      db.prepare('SELECT id, name FROM category WHERE archived = 0').all() as {
        id: string
        name: string
      }[]
    ).map((c) => [c.id, c.name]),
  )
  const packMap = resolvePackCategoryMap(db)
  const rules = listRules(db).filter((r) => r.active)
  const compiledRules: CompiledRule[] = rules.map(compileRule)
  const transferCategoryId =
    (db
      .prepare(
        "SELECT id FROM category WHERE kind = 'transfer' AND archived = 0 ORDER BY sort_order LIMIT 1",
      )
      .pluck()
      .get() as string | undefined) ?? null
  const linkedCategoryIds = new Set(
    db
      .prepare('SELECT id FROM category WHERE linked_account_id IS NOT NULL AND archived = 0')
      .pluck()
      .all() as string[],
  )

  const scopedIds = options.transactionIds
  const idFilterSql =
    scopedIds && scopedIds.length > 0 ? `AND t.id IN (SELECT value FROM json_each(@idsJson))` : ''

  const candidates = db
    .prepare(
      `SELECT t.id, t.account_id, t.amount, t.label_raw, t.label, t.booking_date, t.nature,
              t.transfer_id, p.name AS payee,
              EXISTS (SELECT 1 FROM split sx WHERE sx.transaction_id = t.id) AS has_split
       FROM transactions t
       LEFT JOIN payee p ON p.id = t.payee_id
       WHERE t.nature = 'operation'
         AND t.transfer_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM split s WHERE s.transaction_id = t.id AND s.category_id IS NOT NULL
         )
         AND NOT EXISTS (
           SELECT 1 FROM categorization_suggestion cs
           WHERE cs.transaction_id = t.id AND cs.status = 'rejected'
         )
         ${idFilterSql}`,
    )
    .all(scopedIds ? { idsJson: JSON.stringify(scopedIds) } : {}) as (RuleCandidateTx & {
    payee: string | null
    has_split: 0 | 1
  })[]

  let autoAppliedCount = 0
  let queuedCount = 0

  const delSplitTags = db.prepare(
    'DELETE FROM split_tag WHERE split_id IN (SELECT id FROM split WHERE transaction_id = ?)',
  )
  const delSplits = db.prepare('DELETE FROM split WHERE transaction_id = ?')
  const insertSplitTag = db.prepare('INSERT INTO split_tag (split_id, tag_id) VALUES (?, ?)')
  const updateTxLabel = db.prepare('UPDATE transactions SET label = ?, updated_at = ? WHERE id = ?')
  const SPLIT_BATCH = 100
  const insertSplitSingle = db.prepare(
    'INSERT INTO split (id, transaction_id, category_id, amount, note, position) VALUES (?, ?, ?, ?, NULL, 0)',
  )
  const insertSplitBatch = db.prepare(
    `INSERT INTO split (id, transaction_id, category_id, amount, note, position) VALUES ${Array.from(
      { length: SPLIT_BATCH },
      () => '(?, ?, ?, ?, NULL, 0)',
    ).join(', ')}`,
  )
  const SUG_BATCH = 50
  const upsertSugSql = (count: number) =>
    `INSERT INTO categorization_suggestion (
       transaction_id, category_id, tag_ids, suggested_label, suggested_payee,
       source, rule_id, confidence, reason, status, created_at, updated_at
     ) VALUES ${Array.from({ length: count }, () => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}
     ON CONFLICT (transaction_id) DO UPDATE SET
       category_id = excluded.category_id,
       tag_ids = excluded.tag_ids,
       suggested_label = excluded.suggested_label,
       suggested_payee = excluded.suggested_payee,
       source = excluded.source,
       rule_id = excluded.rule_id,
       confidence = excluded.confidence,
       reason = excluded.reason,
       status = excluded.status,
       updated_at = excluded.updated_at`
  const upsertSugSingle = db.prepare(upsertSugSql(1))
  const upsertSugBatch = db.prepare(upsertSugSql(SUG_BATCH))
  const bumpRule = db.prepare(
    'UPDATE rule SET applied_count = applied_count + ?, last_applied_at = ? WHERE id = ?',
  )

  const ruleHits = new Map<string, number>()
  const pendingSplits: unknown[] = []
  const pendingSplitTags: [string, string][] = []
  const pendingSugs: unknown[] = []
  const autoAppliedLinkedTxIds: string[] = []

  const flushSplitBatch = () => {
    if (pendingSplits.length === SPLIT_BATCH * 4) {
      insertSplitBatch.run(...pendingSplits)
      pendingSplits.length = 0
    }
  }
  const flushSugBatch = () => {
    if (pendingSugs.length === SUG_BATCH * 12) {
      upsertSugBatch.run(...pendingSugs)
      pendingSugs.length = 0
    }
  }

  db.transaction(() => {
    for (const tx of candidates) {
      let matchedCategoryId: string | null = null
      let matchedTagIds: string[] = []
      let suggestedLabel: string | null = null
      let suggestedPayee: string | null = null
      let source: SuggestionSource = 'naive-bayes'
      let ruleId: string | null = null
      let confidence = 0
      let reason = ''
      let matchedByRule = false

      // 1. Règles utilisateur (prioritaires)
      for (const compiled of compiledRules) {
        if (!matchesRule(compiled, tx)) continue
        matchedByRule = true
        source = 'rule'
        ruleId = compiled.rule.id
        confidence = 1
        reason = `Règle « ${compiled.rule.name} »`
        matchedCategoryId =
          compiled.rule.actions.categoryId !== undefined
            ? compiled.rule.actions.categoryId
            : compiled.rule.actions.markAsTransfer
              ? transferCategoryId
              : null
        matchedTagIds = compiled.rule.actions.tagIds ?? []
        suggestedLabel = compiled.rule.actions.customLabel ?? null
        suggestedPayee = compiled.rule.actions.payee ?? null
        ruleHits.set(compiled.rule.id, (ruleHits.get(compiled.rule.id) ?? 0) + 1)
        break
      }

      // 2. Dictionnaire de marchands France (démarrage à froid + normalisation)
      const canonical = getCanonical(tx.label_raw)
      if (!matchedByRule) {
        const merchant = matchFrenchMerchant(tx.label_raw, { canonical })
        if (merchant) {
          const catId = packMap.get(merchant.categoryKey) ?? null
          if (catId && activeCategoryIds.has(catId)) {
            source = 'merchant'
            matchedCategoryId = catId
            suggestedLabel = merchant.merchant
            suggestedPayee = merchant.merchant
            confidence = 0.9
            const catLabel = categoryNames.get(catId) ?? ''
            reason = `Marchand reconnu : ${merchant.merchant}${catLabel ? ` → ${catLabel}` : ''}`
          }
        }
      }

      // 3. Apprentissage local (Bayes naïf multinomial)
      if (!matchedByRule && matchedCategoryId === null && model) {
        const pred = predictWithNaiveBayes(
          model,
          {
            labelRaw: tx.label_raw,
            payee: tx.payee,
            amount: tx.amount,
            precleanedCanonical: canonical,
          },
          activeCategoryIds,
          allowedClasses,
        )
        if (pred && pred.confidence >= 0.35) {
          source = 'naive-bayes'
          matchedCategoryId = pred.categoryId
          confidence = pred.confidence
          const pct = Math.round(pred.confidence * 100)
          const hint = pred.topFeatures.length > 0 ? ` (${pred.topFeatures.join(', ')})` : ''
          reason = `Apprentissage local : ${pct} %${hint}`
        }
      }

      const shouldAutoApply =
        (matchedByRule || (matchedCategoryId !== null && confidence >= threshold)) &&
        (matchedCategoryId !== null || matchedTagIds.length > 0 || suggestedLabel !== null)
      const tagIdsJson = matchedTagIds.length === 0 ? '[]' : JSON.stringify(matchedTagIds)

      if (shouldAutoApply) {
        if (matchedByRule && suggestedLabel && !tx.label) {
          updateTxLabel.run(suggestedLabel, stamp, tx.id)
        }
        if (matchedCategoryId !== null || matchedTagIds.length > 0) {
          if (tx.has_split) {
            delSplitTags.run(tx.id)
            delSplits.run(tx.id)
          }
          const splitId = uuidv7()
          pendingSplits.push(splitId, tx.id, matchedCategoryId, tx.amount)
          flushSplitBatch()
          if (matchedCategoryId !== null && linkedCategoryIds.has(matchedCategoryId)) {
            autoAppliedLinkedTxIds.push(tx.id)
          }
          for (const tagId of matchedTagIds) {
            pendingSplitTags.push([splitId, tagId])
          }
        }
        pendingSugs.push(
          tx.id,
          matchedCategoryId,
          tagIdsJson,
          suggestedLabel,
          suggestedPayee,
          source,
          ruleId,
          confidence,
          reason,
          'accepted',
          stamp,
          stamp,
        )
        flushSugBatch()
        autoAppliedCount++
      } else {
        const cleaned = cleanTransactionLabel(tx.label_raw)
        pendingSugs.push(
          tx.id,
          matchedCategoryId,
          tagIdsJson,
          suggestedLabel ?? (cleaned.display !== tx.label_raw ? cleaned.display : null),
          suggestedPayee,
          source,
          ruleId,
          confidence,
          reason || `Libellé normalisé : ${cleaned.display}`,
          'pending',
          stamp,
          stamp,
        )
        flushSugBatch()
        queuedCount++
      }
    }

    for (let i = 0; i < pendingSplits.length; i += 4) {
      insertSplitSingle.run(
        pendingSplits[i],
        pendingSplits[i + 1],
        pendingSplits[i + 2],
        pendingSplits[i + 3],
      )
    }
    for (const [splitId, tagId] of pendingSplitTags) {
      insertSplitTag.run(splitId, tagId)
    }
    for (const txId of autoAppliedLinkedTxIds) {
      reconcileLinkedCategoryTransferOnDb(db, txId, now)
    }
    for (let i = 0; i < pendingSugs.length; i += 12) {
      upsertSugSingle.run(
        pendingSugs[i],
        pendingSugs[i + 1],
        pendingSugs[i + 2],
        pendingSugs[i + 3],
        pendingSugs[i + 4],
        pendingSugs[i + 5],
        pendingSugs[i + 6],
        pendingSugs[i + 7],
        pendingSugs[i + 8],
        pendingSugs[i + 9],
        pendingSugs[i + 10],
        pendingSugs[i + 11],
      )
    }

    for (const [ruleId, count] of ruleHits.entries()) {
      bumpRule.run(count, stamp, ruleId)
    }

    if (autoAppliedCount > 0) {
      recordAudit(
        db,
        {
          entity: 'transaction',
          entityId: null,
          action: 'update',
          origin: 'rule',
          after: {
            evaluatedCount: candidates.length,
            autoAppliedCount,
            queuedCount,
          },
        },
        now,
      )
    }
  }).immediate()

  return {
    evaluatedCount: candidates.length,
    autoAppliedCount,
    queuedCount,
    durationMs: Math.round(performance.now() - start),
  }
}

export function listValidationQueue(
  db: Db,
  { limit = 100 }: { limit?: number },
): CategorizationQueueItem[] {
  const rows = db
    .prepare(
      `SELECT t.id AS transaction_id, t.account_id, a.name AS account_name,
              t.booking_date, t.amount, t.currency, t.label_raw,
              coalesce(t.label, t.label_raw) AS label_display,
              p.name AS payee,
              cs.category_id AS sug_category_id, c.name AS sug_category_name,
              cs.tag_ids AS sug_tag_ids, cs.suggested_label, cs.suggested_payee,
              cs.source AS sug_source, cs.rule_id AS sug_rule_id,
              cs.confidence AS sug_confidence, cs.reason AS sug_reason
       FROM transactions t
       JOIN account a ON a.id = t.account_id
       LEFT JOIN payee p ON p.id = t.payee_id
       LEFT JOIN categorization_suggestion cs ON cs.transaction_id = t.id
       LEFT JOIN category c ON c.id = cs.category_id AND c.archived = 0
       WHERE t.nature = 'operation'
         AND t.transfer_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM split s WHERE s.transaction_id = t.id AND s.category_id IS NOT NULL
         )
         AND coalesce(cs.status, 'pending') = 'pending'
       ORDER BY coalesce(cs.confidence, 0) DESC, t.booking_date DESC, t.id DESC
       LIMIT ?`,
    )
    .all(limit) as {
    transaction_id: string
    account_id: string
    account_name: string
    booking_date: string
    amount: number
    currency: string
    label_raw: string
    label_display: string
    payee: string | null
    sug_category_id: string | null
    sug_category_name: string | null
    sug_tag_ids: string | null
    suggested_label: string | null
    suggested_payee: string | null
    sug_source: SuggestionSource | null
    sug_rule_id: string | null
    sug_confidence: number | null
    sug_reason: string | null
  }[]

  const readTags = db.prepare(
    'SELECT st.tag_id FROM split_tag st JOIN split s ON s.id = st.split_id WHERE s.transaction_id = ?',
  )

  return rows.map((row) => {
    const cleaned = cleanTransactionLabel(row.label_raw)
    const currentTags = readTags.pluck().all(row.transaction_id) as string[]
    let sugTags: string[] = []
    if (row.sug_tag_ids) {
      try {
        sugTags = JSON.parse(row.sug_tag_ids) as string[]
      } catch {
        sugTags = []
      }
    }
    return {
      transactionId: row.transaction_id,
      accountId: row.account_id,
      accountName: row.account_name,
      bookingDate: row.booking_date,
      amount: row.amount,
      currency: row.currency,
      labelRaw: row.label_raw,
      labelDisplay: row.label_display,
      cleanedLabel: cleaned.display,
      payee: row.payee,
      currentCategoryId: null,
      currentTagIds: currentTags,
      suggestion: row.sug_source
        ? {
            categoryId: row.sug_category_id,
            categoryName: row.sug_category_name,
            tagIds: sugTags,
            suggestedLabel: row.suggested_label,
            suggestedPayee: row.suggested_payee,
            source: row.sug_source,
            ruleId: row.sug_rule_id,
            confidence: row.sug_confidence ?? 0,
            reason: row.sug_reason ?? '',
          }
        : null,
    }
  })
}

export function acceptQueueSuggestion(
  changes: ChangeSet,
  input: {
    transactionId: string
    categoryId: string | null
    tagIds?: string[]
    customLabel?: string | null
  },
  now: Date,
): null {
  const tx = changes.db
    .prepare('SELECT id, amount, label, label_raw FROM transactions WHERE id = ?')
    .get(input.transactionId) as
    { id: string; amount: number; label: string | null; label_raw: string } | undefined
  if (!tx) fail('not-found')

  const stamp = now.toISOString()
  if (input.customLabel !== undefined && input.customLabel !== tx.label) {
    changes.update('transactions', { id: tx.id }, { label: input.customLabel, updated_at: stamp })
  }

  const split: SplitInput = {
    categoryId: input.categoryId,
    amount: tx.amount,
    note: null,
    tagIds: input.tagIds ?? [],
  }
  writeSplits(changes, tx.id, tx.amount, [split])
  reconcileLinkedCategoryTransfer(changes, tx.id, now)

  changes.db
    .prepare(
      `INSERT INTO categorization_suggestion (
         transaction_id, category_id, tag_ids, suggested_label, suggested_payee,
         source, rule_id, confidence, reason, status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, NULL, 'naive-bayes', NULL, 1.0, 'Validé manuellement', 'accepted', ?, ?)
       ON CONFLICT (transaction_id) DO UPDATE SET
         category_id = excluded.category_id,
         tag_ids = excluded.tag_ids,
         status = 'accepted',
         updated_at = excluded.updated_at`,
    )
    .run(
      tx.id,
      input.categoryId,
      JSON.stringify(input.tagIds ?? []),
      input.customLabel ?? null,
      stamp,
      stamp,
    )

  return null
}

export function rejectQueueSuggestion(db: Db, transactionId: string, now: Date): null {
  const exists = db.prepare('SELECT 1 FROM transactions WHERE id = ?').get(transactionId)
  if (!exists) fail('not-found')
  const stamp = now.toISOString()
  db.prepare(
    `INSERT INTO categorization_suggestion (
       transaction_id, category_id, tag_ids, suggested_label, suggested_payee,
       source, rule_id, confidence, reason, status, created_at, updated_at
     ) VALUES (?, NULL, '[]', NULL, NULL, 'naive-bayes', NULL, 0, 'Ignoré', 'rejected', ?, ?)
     ON CONFLICT (transaction_id) DO UPDATE SET status = 'rejected', updated_at = excluded.updated_at`,
  ).run(transactionId, stamp, stamp)
  return null
}

export function createRuleFromCorrection(
  changes: ChangeSet,
  input: {
    transactionId: string
    name: string
    pattern: string
    categoryId?: string | null
    tagIds?: string[]
    customLabel?: string | null
    applyRetroactively?: boolean
  },
  now: Date,
): RuleSummary {
  const tx = changes.db
    .prepare('SELECT id, amount FROM transactions WHERE id = ?')
    .get(input.transactionId) as { id: string; amount: number } | undefined
  if (!tx) fail('not-found')

  const actions: RuleActions = {
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
    ...(input.tagIds && input.tagIds.length > 0 ? { tagIds: input.tagIds } : {}),
    ...(input.customLabel ? { customLabel: input.customLabel } : {}),
  }

  return saveRule(
    changes,
    {
      name: input.name,
      conditions: {
        labelOp: 'contains',
        labelValue: input.pattern,
        direction: tx.amount < 0 ? 'expense' : tx.amount > 0 ? 'income' : 'any',
        amountOp: 'any',
      },
      actions,
      active: true,
    },
    now,
  )
}
