import type {
  RecurringSubscription,
  SubscriptionsOverview,
  TransferMatchCandidate,
} from '@shared/categorization/model'
import { cleanTransactionLabel } from '@shared/categorization/normalize'
import { matchFrenchMerchant } from '@shared/categorization/merchants'
import { daysBetweenIso } from '@shared/imports/normalize'
import type { MinorUnits } from '@shared/money'
import { addMonths } from '@shared/months'
import type { Db } from '../db/connection'

interface TxSeriesRow {
  id: string
  account_id: string
  account_name: string
  booking_date: string
  amount: number
  currency: string
  label_raw: string
  label: string | null
  payee_name: string | null
  category_id: string | null
  category_name: string | null
  category_key: string | null
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2)
  }
  return sorted[mid] ?? 0
}

function addDaysIso(isoDate: string, days: number): string {
  const time = Date.parse(`${isoDate}T00:00:00Z`)
  return new Date(time + days * 86_400_000).toISOString().slice(0, 10)
}

function detectFrequency(
  gaps: readonly number[],
): { frequency: RecurringSubscription['frequency']; periodDays: number } | null {
  if (gaps.length === 0) return null
  const medGap = median(gaps)
  const regular = (target: number, tol: number) =>
    gaps.filter((g) => Math.abs(g - target) <= tol).length >= Math.ceil(gaps.length * 0.6)

  if (medGap >= 24 && medGap <= 36 && regular(30, 8)) {
    return { frequency: 'monthly', periodDays: 30 }
  }
  if (medGap >= 78 && medGap <= 102 && regular(91, 14)) {
    return { frequency: 'quarterly', periodDays: 91 }
  }
  if (medGap >= 350 && medGap <= 380 && regular(365, 16)) {
    return { frequency: 'annual', periodDays: 365 }
  }
  return null
}

function buildSignature(row: TxSeriesRow): { signature: string; display: string } {
  const merchant = matchFrenchMerchant(row.label_raw)
  const clean = cleanTransactionLabel(row.label_raw)
  const base = (row.payee_name ?? clean.canonical).normalize('NFC').toLocaleLowerCase('fr').trim()
  const key = `${row.account_id}|${base || clean.canonical}`
  const display =
    row.label ??
    row.payee_name ??
    (merchant ? `${merchant.merchant} (${clean.display})` : clean.display)
  return { signature: key, display }
}

/**
 * Détecte les abonnements et dépenses récurrentes (mensuelles, trimestrielles, annuelles),
 * repère les hausses de prix par rapport à la base historique et les abonnements dormants.
 */
export function detectSubscriptions(
  db: Db,
  { currency }: { currency: string },
  now: Date = new Date(),
): SubscriptionsOverview {
  const todayIso = now.toISOString().slice(0, 10)
  const earliestMonth = addMonths(todayIso.slice(0, 7), -24)
  const fromDate = `${earliestMonth}-01`

  const rows = db
    .prepare(
      `SELECT t.id, t.account_id, a.name AS account_name, t.booking_date, t.amount, t.currency,
              t.label_raw, t.label, p.name AS payee_name,
              s.category_id, c.name AS category_name, NULL AS category_key
       FROM transactions t
       JOIN account a ON a.id = t.account_id
       LEFT JOIN payee p ON p.id = t.payee_id
       LEFT JOIN split s ON s.transaction_id = t.id AND s.position = 0
       LEFT JOIN category c ON c.id = s.category_id
       WHERE t.nature = 'operation'
         AND t.transfer_id IS NULL
         AND t.amount < 0
         AND t.booking_date >= ?
       ORDER BY t.booking_date ASC, t.id ASC`,
    )
    .all(fromDate) as TxSeriesRow[]

  const dismissed = new Map<string, number | null>()
  for (const d of db
    .prepare('SELECT signature, last_known_amount FROM recurring_dismissed')
    .all() as { signature: string; last_known_amount: number | null }[]) {
    dismissed.set(d.signature, d.last_known_amount)
  }

  const groups = new Map<string, { display: string; items: TxSeriesRow[] }>()
  for (const row of rows) {
    const { signature, display } = buildSignature(row)
    let group = groups.get(signature)
    if (!group) {
      group = { display, items: [] }
      groups.set(signature, group)
    }
    group.items.push(row)
  }

  const subscriptions: RecurringSubscription[] = []

  for (const [signature, { display, items }] of groups.entries()) {
    if (items.length < 3) continue
    // Regroupe par jour : ne garde pas un passage fréquent (courses) comme abonnement
    const gaps: number[] = []
    for (let i = 1; i < items.length; i++) {
      const diff = daysBetweenIso(items[i]!.booking_date, items[i - 1]!.booking_date)
      if (diff > 0) gaps.push(diff)
    }
    const freq = detectFrequency(gaps)
    if (!freq) continue

    const magnitudes = items.map((x) => Math.abs(x.amount))
    const medAmount = median(magnitudes)
    if (medAmount <= 0) continue

    // Tolérance sur l'écart de montant (accepte une variation modérée ou une hausse nette)
    const wildCount = magnitudes.filter((m) => Math.abs(m - medAmount) / medAmount > 0.45).length
    if (wildCount > Math.floor(items.length * 0.25)) continue

    const latest = items[items.length - 1]!
    const latestAbs = Math.abs(latest.amount)
    const prevPool = magnitudes.slice(-5, -1)
    const prevBaseline = prevPool.length > 0 ? median(prevPool) : medAmount

    let priceIncrease: RecurringSubscription['priceIncrease'] = null
    const dismissedAtAmount = dismissed.get(signature)
    if (
      latestAbs > prevBaseline &&
      latestAbs - prevBaseline >= 50 &&
      (latestAbs - prevBaseline) / prevBaseline >= 0.015 &&
      dismissedAtAmount !== latestAbs
    ) {
      const delta = latestAbs - prevBaseline
      priceIncrease = {
        previousAmount: prevBaseline,
        currentAmount: latestAbs,
        delta,
        percent: Math.round((delta / prevBaseline) * 1000) / 10,
      }
    }

    const monthlyEquivalent: MinorUnits =
      freq.frequency === 'monthly'
        ? latestAbs
        : freq.frequency === 'quarterly'
          ? Math.round(latestAbs / 3)
          : Math.round(latestAbs / 12)
    const annualEquivalent: MinorUnits =
      freq.frequency === 'monthly'
        ? latestAbs * 12
        : freq.frequency === 'quarterly'
          ? latestAbs * 4
          : latestAbs

    const nextExpectedDate = addDaysIso(latest.booking_date, freq.periodDays)
    const daysSinceLast = daysBetweenIso(todayIso, latest.booking_date)
    const dormant = daysSinceLast > Math.round(freq.periodDays * 1.6)

    subscriptions.push({
      signature,
      merchant: display,
      accountId: latest.account_id,
      accountName: latest.account_name,
      currency: latest.currency,
      frequency: freq.frequency,
      expectedAmount: prevBaseline,
      latestAmount: latestAbs,
      monthlyEquivalent,
      annualEquivalent,
      occurrenceCount: items.length,
      lastDate: latest.booking_date,
      nextExpectedDate,
      dormant,
      priceIncrease,
      categoryId: latest.category_id,
      categoryName: latest.category_name,
    })
  }

  subscriptions.sort((a, b) => {
    if (Boolean(b.priceIncrease) !== Boolean(a.priceIncrease)) {
      return b.priceIncrease ? 1 : -1
    }
    return b.monthlyEquivalent - a.monthlyEquivalent
  })

  const matchingCurrency = subscriptions.filter((s) => s.currency === currency && !s.dormant)
  return {
    subscriptions,
    totalMonthlyCost: matchingCurrency.reduce((sum, s) => sum + s.monthlyEquivalent, 0),
    totalAnnualCost: matchingCurrency.reduce((sum, s) => sum + s.annualEquivalent, 0),
    priceIncreaseCount: subscriptions.filter((s) => s.priceIncrease !== null).length,
    dormantCount: subscriptions.filter((s) => s.dormant).length,
    currency,
  }
}

export function dismissPriceAlert(
  db: Db,
  signature: string,
  lastKnownAmount: MinorUnits | null,
  now: Date,
): null {
  db.prepare(
    `INSERT INTO recurring_dismissed (signature, last_known_amount, dismissed_at)
     VALUES (?, ?, ?)
     ON CONFLICT (signature) DO UPDATE SET last_known_amount = excluded.last_known_amount, dismissed_at = excluded.dismissed_at`,
  ).run(signature, lastKnownAmount, now.toISOString())
  return null
}

/**
 * Détecte les paires de virements internes candidats entre deux comptes distincts
 * (montants opposés, même devise, écart ≤ 3 jours).
 */
export function detectTransferCandidates(db: Db): TransferMatchCandidate[] {
  const rows = db
    .prepare(
      `SELECT t.id, t.account_id, a.name AS account_name, a.type AS account_type,
              t.booking_date, t.amount, t.currency, coalesce(t.label, t.label_raw) AS label
       FROM transactions t
       JOIN account a ON a.id = t.account_id
       WHERE t.nature = 'operation' AND t.transfer_id IS NULL AND t.amount <> 0
       ORDER BY t.booking_date DESC, t.id DESC`,
    )
    .all() as {
    id: string
    account_id: string
    account_name: string
    account_type: string
    booking_date: string
    amount: number
    currency: string
    label: string
  }[]

  const positivesByAmount = new Map<number, typeof rows>()
  for (const row of rows) {
    if (row.amount > 0) {
      const list = positivesByAmount.get(row.amount) ?? []
      list.push(row)
      positivesByAmount.set(row.amount, list)
    }
  }

  const claimedPos = new Set<string>()
  const candidates: TransferMatchCandidate[] = []

  for (const neg of rows) {
    if (neg.amount >= 0) continue
    const target = -neg.amount
    const pool = positivesByAmount.get(target)
    if (!pool) continue

    let best: { pos: (typeof rows)[number]; diff: number } | null = null
    for (const pos of pool) {
      if (claimedPos.has(pos.id)) continue
      if (pos.account_id === neg.account_id || pos.currency !== neg.currency) continue
      const diff = Math.abs(daysBetweenIso(pos.booking_date, neg.booking_date))
      if (diff > 3) continue
      if (!best || diff < best.diff) best = { pos, diff }
    }

    if (!best) continue
    claimedPos.add(best.pos.id)

    const savingsTypes = new Set(['savings', 'investment'])
    const isSavingsTransfer =
      savingsTypes.has(neg.account_type) !== savingsTypes.has(best.pos.account_type)

    candidates.push({
      id: `${neg.id}:${best.pos.id}`,
      fromTransaction: {
        id: neg.id,
        accountId: neg.account_id,
        accountName: neg.account_name,
        bookingDate: neg.booking_date,
        amount: neg.amount,
        currency: neg.currency,
        label: neg.label,
      },
      toTransaction: {
        id: best.pos.id,
        accountId: best.pos.account_id,
        accountName: best.pos.account_name,
        bookingDate: best.pos.booking_date,
        amount: best.pos.amount,
        currency: best.pos.currency,
        label: best.pos.label,
      },
      dayDiff: best.diff,
      isSavingsTransfer,
    })
  }

  return candidates
}
