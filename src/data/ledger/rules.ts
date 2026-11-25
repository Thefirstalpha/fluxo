import type {
  RuleActions,
  RuleConditions,
  RulePreviewResult,
  RuleSummary,
} from '@shared/categorization/model'
import { safeRegexTest, validateSafeRegex } from '@shared/categorization/regex'
import { ruleActionsSchema, ruleConditionsSchema } from '@shared/categorization/schemas'
import { cleanTransactionLabel } from '@shared/categorization/normalize'
import type { SplitInput } from '@shared/ledger/model'
import { uuidv7 } from '@shared/uuid'
import type { Db } from '../db/connection'
import type { ChangeSet } from './changes'
import { fail } from './failure'
import { sameName } from './names'
import { writeSplits } from './splits'
import { reconcileLinkedCategoryTransfer } from './transfers'

interface RuleRow {
  id: string
  name: string
  conditions: string
  actions: string
  priority: number
  active: 0 | 1
  applied_count: number
  last_applied_at: string | null
  created_at: string
  updated_at: string
}

export interface CompiledRule {
  rule: RuleSummary
  regex: RegExp | null
}

function parseRuleRow(row: RuleRow): RuleSummary {
  return {
    id: row.id,
    name: row.name,
    conditions: ruleConditionsSchema.parse(JSON.parse(row.conditions)),
    actions: ruleActionsSchema.parse(JSON.parse(row.actions)),
    priority: row.priority,
    active: row.active === 1,
    appliedCount: row.applied_count,
    lastAppliedAt: row.last_applied_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listRules(db: Db): RuleSummary[] {
  const rows = db
    .prepare(
      `SELECT id, name, conditions, actions, priority, active, applied_count, last_applied_at, created_at, updated_at
       FROM rule ORDER BY priority ASC, created_at ASC`,
    )
    .all() as RuleRow[]
  return rows.map(parseRuleRow)
}

export function compileRule(rule: RuleSummary): CompiledRule {
  let regex: RegExp | null = null
  if (rule.conditions.labelOp === 'regex') {
    const check = validateSafeRegex(rule.conditions.labelValue, rule.conditions.caseSensitive)
    if (check.ok) regex = check.regex
  }
  return { rule, regex }
}

export interface RuleCandidateTx {
  id: string
  account_id: string
  amount: number
  label_raw: string
  label: string | null
  booking_date: string
  nature: string
  transfer_id: string | null
}

export function matchesRule(compiled: CompiledRule, tx: RuleCandidateTx): boolean {
  const { conditions } = compiled.rule
  if (conditions.accountIds && conditions.accountIds.length > 0) {
    if (!conditions.accountIds.includes(tx.account_id)) return false
  }
  if (conditions.direction === 'expense' && tx.amount >= 0) return false
  if (conditions.direction === 'income' && tx.amount <= 0) return false

  const absAmount = Math.abs(tx.amount)
  const min = conditions.amountMin ?? null
  const max = conditions.amountMax ?? null
  if (conditions.amountOp === 'eq' && min !== null && absAmount !== min) return false
  if (conditions.amountOp === 'gt' && min !== null && absAmount <= min) return false
  if (conditions.amountOp === 'lt' && min !== null && absAmount >= min) return false
  if (conditions.amountOp === 'between') {
    if (min !== null && absAmount < min) return false
    if (max !== null && absAmount > max) return false
  }

  const rawText = tx.label ?? tx.label_raw
  const cleaned = cleanTransactionLabel(tx.label_raw).canonical
  const needle = conditions.caseSensitive
    ? conditions.labelValue
    : conditions.labelValue.normalize('NFC').toLocaleLowerCase('fr')

  const compareTargets = conditions.caseSensitive
    ? [rawText, tx.label_raw]
    : [
        rawText.normalize('NFC').toLocaleLowerCase('fr'),
        tx.label_raw.normalize('NFC').toLocaleLowerCase('fr'),
        cleaned,
      ]

  switch (conditions.labelOp) {
    case 'contains':
      return compareTargets.some((target) => target.includes(needle))
    case 'starts-with':
      return compareTargets.some((target) => target.startsWith(needle))
    case 'equals':
      return compareTargets.some((target) => target === needle)
    case 'regex':
      return compiled.regex
        ? safeRegexTest(compiled.regex, rawText) || safeRegexTest(compiled.regex, tx.label_raw)
        : false
  }
}

export function previewRuleMatches(db: Db, conditions: RuleConditions): RulePreviewResult {
  const compiled = compileRule({
    id: '',
    name: '',
    conditions,
    actions: { categoryId: null },
    priority: 0,
    active: true,
    appliedCount: 0,
    lastAppliedAt: null,
    createdAt: '',
    updatedAt: '',
  })

  const rows = db
    .prepare(
      `SELECT t.id, t.account_id, t.amount, t.label_raw, t.label, t.booking_date, t.nature,
              t.transfer_id, t.currency, a.name AS account_name
       FROM transactions t
       JOIN account a ON a.id = t.account_id
       WHERE t.nature = 'operation'
       ORDER BY t.booking_date DESC, t.id DESC`,
    )
    .all() as (RuleCandidateTx & { currency: string; account_name: string })[]

  let matchCount = 0
  const samples: RulePreviewResult['samples'] = []
  for (const row of rows) {
    if (!matchesRule(compiled, row)) continue
    matchCount++
    if (samples.length < 15) {
      samples.push({
        id: row.id,
        bookingDate: row.booking_date,
        label: row.label ?? row.label_raw,
        amount: row.amount,
        currency: row.currency,
        accountName: row.account_name,
      })
    }
  }
  return { matchCount, samples }
}

function validateRuleActions(db: Db, actions: RuleActions): void {
  if (actions.categoryId !== undefined && actions.categoryId !== null) {
    const cat = db.prepare('SELECT archived FROM category WHERE id = ?').get(actions.categoryId) as
      { archived: number } | undefined
    if (!cat) fail('not-found')
    if (cat.archived === 1) fail('invalid')
  }
  if (actions.tagIds) {
    const checkTag = db.prepare('SELECT 1 FROM tag WHERE id = ?').pluck()
    for (const id of actions.tagIds) {
      if (checkTag.get(id) === undefined) fail('not-found')
    }
  }
}

export function saveRule(
  changes: ChangeSet,
  input: {
    id?: string
    name: string
    conditions: RuleConditions
    actions: RuleActions
    priority?: number
    active?: boolean
  },
  now: Date,
): RuleSummary {
  validateRuleActions(changes.db, input.actions)
  const stamp = now.toISOString()
  const conditionsJson = JSON.stringify(input.conditions)
  const actionsJson = JSON.stringify(input.actions)

  if (input.id) {
    const existing = changes.db.prepare('SELECT * FROM rule WHERE id = ?').get(input.id) as
      RuleRow | undefined
    if (!existing) fail('not-found')
    const priority = input.priority ?? existing.priority
    const active: 0 | 1 = input.active !== undefined ? (input.active ? 1 : 0) : existing.active
    changes.update(
      'rule',
      { id: input.id },
      {
        name: input.name.trim(),
        conditions: conditionsJson,
        actions: actionsJson,
        priority,
        active,
        updated_at: stamp,
      },
    )
    return {
      id: input.id,
      name: input.name.trim(),
      conditions: input.conditions,
      actions: input.actions,
      priority,
      active: active === 1,
      appliedCount: existing.applied_count,
      lastAppliedAt: existing.last_applied_at,
      createdAt: existing.created_at,
      updatedAt: stamp,
    }
  }

  const maxPriority =
    (changes.db.prepare('SELECT coalesce(max(priority), -1) FROM rule').pluck().get() as number) + 1
  const id = uuidv7()
  const priority = input.priority ?? maxPriority
  const active: 0 | 1 = input.active === false ? 0 : 1
  changes.insert('rule', {
    id,
    name: input.name.trim(),
    conditions: conditionsJson,
    actions: actionsJson,
    priority,
    active,
    applied_count: 0,
    last_applied_at: null,
    created_at: stamp,
    updated_at: stamp,
  })
  return {
    id,
    name: input.name.trim(),
    conditions: input.conditions,
    actions: input.actions,
    priority,
    active: active === 1,
    appliedCount: 0,
    lastAppliedAt: null,
    createdAt: stamp,
    updatedAt: stamp,
  }
}

export function deleteRule(changes: ChangeSet, id: string): null {
  const existing = changes.db.prepare('SELECT 1 FROM rule WHERE id = ?').get(id)
  if (!existing) fail('not-found')
  changes.delete('rule', { id })
  return null
}

function resolveOrCreatePayee(
  changes: ChangeSet,
  rawPayee: string,
  stamp: string,
  cache: Map<string, string>,
): string {
  const clean = rawPayee.trim()
  const key = clean.normalize('NFC').toLocaleLowerCase('fr')
  const cached = cache.get(key)
  if (cached) return cached

  const rows = changes.db.prepare('SELECT id, name FROM payee ORDER BY id').all() as {
    id: string
    name: string
  }[]
  const found = rows.find((r) => sameName(r.name, clean))
  if (found) {
    cache.set(key, found.id)
    return found.id
  }

  const id = uuidv7()
  changes.insert('payee', { id, name: clean, created_at: stamp, updated_at: stamp })
  cache.set(key, id)
  return id
}

function resolveTransferCategoryId(db: Db): string | null {
  const row = db
    .prepare(
      "SELECT id FROM category WHERE kind = 'transfer' AND archived = 0 ORDER BY sort_order LIMIT 1",
    )
    .pluck()
    .get() as string | undefined
  return row ?? null
}

export function applyActionsToTransaction(
  changes: ChangeSet,
  tx: RuleCandidateTx & { label: string | null },
  actions: RuleActions,
  stamp: string,
  payeeCache: Map<string, string>,
): void {
  const patch: Record<string, string | number | null> = {}
  if (actions.customLabel !== undefined && actions.customLabel !== null) {
    if (tx.label !== actions.customLabel) patch.label = actions.customLabel
  }
  if (actions.payee !== undefined && actions.payee !== null) {
    patch.payee_id = resolveOrCreatePayee(changes, actions.payee, stamp, payeeCache)
  }
  if (Object.keys(patch).length > 0) {
    patch.updated_at = stamp
    changes.update('transactions', { id: tx.id }, patch)
  }

  const targetCategory =
    actions.categoryId !== undefined
      ? actions.categoryId
      : actions.markAsTransfer
        ? resolveTransferCategoryId(changes.db)
        : undefined
  const targetTags = actions.tagIds

  if (targetCategory !== undefined || (targetTags && targetTags.length > 0)) {
    const existingSplits = changes.db
      .prepare(
        'SELECT id, category_id, amount, note FROM split WHERE transaction_id = ? ORDER BY position',
      )
      .all(tx.id) as {
      id: string
      category_id: string | null
      amount: number
      note: string | null
    }[]

    if (existingSplits.length <= 1) {
      const currentSplit = existingSplits[0]
      const currentTags = currentSplit
        ? (changes.db
            .prepare('SELECT tag_id FROM split_tag WHERE split_id = ?')
            .pluck()
            .all(currentSplit.id) as string[])
        : []
      const mergedTags =
        targetTags && targetTags.length > 0
          ? [...new Set([...currentTags, ...targetTags])]
          : currentTags
      const resolvedCategory =
        targetCategory !== undefined ? targetCategory : (currentSplit?.category_id ?? null)
      const nextSplit: SplitInput = {
        categoryId: resolvedCategory,
        amount: tx.amount,
        note: currentSplit?.note ?? null,
        tagIds: mergedTags,
      }
      writeSplits(changes, tx.id, tx.amount, [nextSplit])
      reconcileLinkedCategoryTransfer(changes, tx.id, new Date(stamp))
    } else if (targetTags && targetTags.length > 0) {
      // Ventilation multiple : ajoute uniquement les étiquettes sur chaque part existante.
      const readTags = changes.db.prepare('SELECT tag_id FROM split_tag WHERE split_id = ?').pluck()
      for (const s of existingSplits) {
        const existingSet = new Set(readTags.all(s.id) as string[])
        for (const tagId of targetTags) {
          if (!existingSet.has(tagId)) {
            changes.insert('split_tag', { split_id: s.id, tag_id: tagId })
          }
        }
      }
    }
  }
}

export function applyRulesRetroactively(
  changes: ChangeSet,
  options: { ruleId?: string; onlyUncategorized?: boolean },
  now: Date,
): { appliedCount: number } {
  const stamp = now.toISOString()
  const rules = listRules(changes.db).filter((r) =>
    options.ruleId ? r.id === options.ruleId : r.active,
  )
  if (options.ruleId && rules.length === 0) fail('not-found')
  if (rules.length === 0) return { appliedCount: 0 }

  const compiled = rules.map(compileRule)
  const whereUncat = options.onlyUncategorized
    ? 'AND NOT EXISTS (SELECT 1 FROM split s WHERE s.transaction_id = t.id AND s.category_id IS NOT NULL)'
    : ''

  const rows = changes.db
    .prepare(
      `SELECT t.id, t.account_id, t.amount, t.label_raw, t.label, t.booking_date, t.nature, t.transfer_id
       FROM transactions t
       WHERE t.nature = 'operation' ${whereUncat}`,
    )
    .all() as RuleCandidateTx[]

  const payeeCache = new Map<string, string>()
  const hitsByRule = new Map<string, number>()
  const upsertRuleSuggestion = changes.db.prepare(
    `INSERT INTO categorization_suggestion (
       transaction_id, category_id, tag_ids, suggested_label, suggested_payee,
       source, rule_id, confidence, reason, status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, 'rule', ?, 1.0, ?, 'accepted', ?, ?)
     ON CONFLICT (transaction_id) DO UPDATE SET
       category_id = excluded.category_id,
       tag_ids = excluded.tag_ids,
       suggested_label = excluded.suggested_label,
       suggested_payee = excluded.suggested_payee,
       source = 'rule',
       rule_id = excluded.rule_id,
       confidence = 1.0,
       reason = excluded.reason,
       status = 'accepted',
       updated_at = excluded.updated_at`,
  )
  let appliedCount = 0

  for (const tx of rows) {
    for (const c of compiled) {
      if (!matchesRule(c, tx)) continue
      applyActionsToTransaction(changes, tx, c.rule.actions, stamp, payeeCache)
      upsertRuleSuggestion.run(
        tx.id,
        c.rule.actions.categoryId ?? null,
        JSON.stringify(c.rule.actions.tagIds ?? []),
        c.rule.actions.customLabel ?? null,
        c.rule.actions.payee ?? null,
        c.rule.id,
        `Règle « ${c.rule.name} »`,
        stamp,
        stamp,
      )
      hitsByRule.set(c.rule.id, (hitsByRule.get(c.rule.id) ?? 0) + 1)
      appliedCount++
      break
    }
  }

  for (const [ruleId, hits] of hitsByRule.entries()) {
    const r = rules.find((item) => item.id === ruleId)!
    changes.update(
      'rule',
      { id: ruleId },
      {
        applied_count: r.appliedCount + hits,
        last_applied_at: stamp,
      },
    )
  }

  return { appliedCount }
}
