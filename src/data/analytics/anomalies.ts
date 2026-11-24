import type { AnalyticsAnomaly } from '@shared/analytics/model'
import { canonicalTransactionLabel, cleanTransactionLabel } from '@shared/categorization/normalize'
import type { MinorUnits } from '@shared/money'

export interface AnomalyTxInput {
  id: string
  accountId: string
  accountName: string
  bookingDate: string
  amount: MinorUnits
  currency: string
  label: string
  labelRaw: string
  payee: string | null
  transferId: string | null
  categoryKeys: string[]
}

const BANK_FEE_RE =
  /\b(?:frais\s+bancaires|commission\s+intervention|cotisation\s+carte|agios|tenue\s+de\s+compte|rejet)\b/i

function medianInt(sortedAsc: readonly number[]): number {
  if (sortedAsc.length === 0) return 0
  const mid = Math.floor(sortedAsc.length / 2)
  if (sortedAsc.length % 2 === 1) return sortedAsc[mid]!
  return Math.round((sortedAsc[mid - 1]! + sortedAsc[mid]!) / 2)
}

function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/**
 * Détecte les anomalies financières (F12) sur un ensemble filtré d'opérations :
 * - dépense inhabituelle (`> 3 × médiane` du commerçant, minimum 2 antécédents et 30 €) ;
 * - double prélèvement potentiel (même compte, même commerçant, même montant à 0–2 jours) ;
 * - cumul mensuel de frais bancaires (`>= 2` écritures ou `>= 10 €` sur le mois).
 */
export function detectAnalyticsAnomalies(
  transactions: readonly AnomalyTxInput[],
  merchantBaselines: ReadonlyMap<string, readonly MinorUnits[]>,
): AnalyticsAnomaly[] {
  const anomalies: AnalyticsAnomaly[] = []
  const displayCache = new Map<string, string>()
  const canonicalCache = new Map<string, string>()

  const getKey = (tx: AnomalyTxInput): string => {
    if (tx.payee) return `payee:${tx.payee.trim().toLowerCase()}`
    let hit = canonicalCache.get(tx.labelRaw)
    if (hit === undefined) {
      hit = canonicalTransactionLabel(tx.labelRaw)
      if (canonicalCache.size < 4096) canonicalCache.set(tx.labelRaw, hit)
    }
    return `label:${hit}`
  }

  const getTitle = (tx: AnomalyTxInput): string => {
    if (tx.payee) return tx.payee
    if (tx.label && tx.label !== tx.labelRaw) return tx.label
    let hit = displayCache.get(tx.labelRaw)
    if (hit === undefined) {
      hit = cleanTransactionLabel(tx.labelRaw).display || tx.labelRaw
      if (displayCache.size < 4096) displayCache.set(tx.labelRaw, hit)
    }
    return hit
  }

  const byMerchantInWindow = new Map<string, AnomalyTxInput[]>()
  const bankFeesByMonth = new Map<
    string,
    {
      accountName: string
      currency: string
      total: number
      count: number
      ids: string[]
      latestDate: string
    }
  >()

  for (const tx of transactions) {
    if (tx.amount >= 0 || tx.transferId !== null) continue
    const abs = -tx.amount
    const mKey = getKey(tx)

    const list = byMerchantInWindow.get(mKey)
    if (list) list.push(tx)
    else byMerchantInWindow.set(mKey, [tx])

    // 1. Dépense inhabituelle (> 3 × médiane)
    if (abs >= 30_00) {
      const history = merchantBaselines.get(mKey)
      if (history && history.length >= 3) {
        const sorted = [...history].sort((a, b) => a - b)
        const med = medianInt(sorted)
        if (med > 0 && abs > med * 3) {
          anomalies.push({
            id: `unusual:${tx.id}`,
            kind: 'unusual-expense',
            date: tx.bookingDate,
            title: getTitle(tx),
            accountName: tx.accountName,
            amount: abs,
            currency: tx.currency,
            referenceAmount: med,
            ratio: Math.round((abs / med) * 10) / 10,
            transactionIds: [tx.id],
          })
        }
      }
    }

    // 3. Frais bancaires cumulés dans le mois
    const isFee = tx.categoryKeys.some((k) => k === 'banking.fees') || BANK_FEE_RE.test(tx.labelRaw)
    if (isFee) {
      const month = tx.bookingDate.slice(0, 7)
      const feeKey = `${month}:${tx.currency}`
      const bucket = bankFeesByMonth.get(feeKey)
      if (bucket) {
        bucket.total += abs
        bucket.count += 1
        bucket.ids.push(tx.id)
        if (tx.bookingDate > bucket.latestDate) bucket.latestDate = tx.bookingDate
      } else {
        bankFeesByMonth.set(feeKey, {
          accountName: tx.accountName,
          currency: tx.currency,
          total: abs,
          count: 1,
          ids: [tx.id],
          latestDate: tx.bookingDate,
        })
      }
    }
  }

  // 2. Doubles prélèvements (même compte, même commerçant, même montant à 0..2 jours d'écart)
  for (const group of byMerchantInWindow.values()) {
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) => a.bookingDate.localeCompare(b.bookingDate))
    const flaggedIds = new Set<string>()
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i]!
      if (flaggedIds.has(a.id)) continue
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j]!
        const gap = diffDays(a.bookingDate, b.bookingDate)
        if (gap > 2) break
        if (a.accountId === b.accountId && a.amount === b.amount) {
          flaggedIds.add(a.id)
          flaggedIds.add(b.id)
          anomalies.push({
            id: `dup:${a.id}`,
            kind: 'duplicate-charge',
            date: b.bookingDate,
            title: getTitle(b),
            accountName: b.accountName,
            amount: -b.amount,
            currency: b.currency,
            count: 2,
            transactionIds: [a.id, b.id],
          })
          break
        }
      }
    }
  }

  for (const [feeKey, bucket] of bankFeesByMonth.entries()) {
    if (bucket.total >= 10_00 || bucket.count >= 2) {
      const month = feeKey.slice(0, 7)
      anomalies.push({
        id: `fees:${feeKey}`,
        kind: 'bank-fees',
        date: bucket.latestDate,
        title: month,
        accountName: bucket.accountName,
        amount: bucket.total,
        currency: bucket.currency,
        count: bucket.count,
        transactionIds: bucket.ids,
      })
    }
  }

  return anomalies.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30)
}
