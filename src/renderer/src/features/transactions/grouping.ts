import type { SplitInput, TransactionRow } from '@shared/ledger/model'
import type { MinorUnits } from '@shared/money'

export type GroupingMode = 'none' | 'day' | 'month'

export type RegisterItem =
  | { kind: 'group'; key: string; label: string; count: number; total: MinorUnits }
  | { kind: 'row'; row: TransactionRow }

/**
 * Construit une liste plate de groupes (jour ou mois) et d'opérations pour la virtualisation.
 * Les groupes respectent l'ordre déjà trié des lignes reçues.
 */
export function buildRegisterItems(
  rows: readonly TransactionRow[],
  grouping: GroupingMode,
  formatDay: (date: string) => string,
  formatMonth: (month: string) => string,
): RegisterItem[] {
  if (grouping === 'none') {
    return rows.map((row) => ({ kind: 'row', row }))
  }

  const groups: { key: string; label: string; rows: TransactionRow[]; total: MinorUnits }[] = []
  const byKey = new Map<string, (typeof groups)[number]>()

  for (const row of rows) {
    const key = grouping === 'day' ? row.bookingDate : row.bookingDate.slice(0, 7)
    let group = byKey.get(key)
    if (!group) {
      group = {
        key,
        label: grouping === 'day' ? formatDay(key) : formatMonth(key),
        rows: [],
        total: 0,
      }
      byKey.set(key, group)
      groups.push(group)
    }
    group.rows.push(row)
    group.total += row.amount
  }

  const items: RegisterItem[] = []
  for (const group of groups) {
    items.push({
      kind: 'group',
      key: group.key,
      label: group.label,
      count: group.rows.length,
      total: group.total,
    })
    for (const row of group.rows) {
      items.push({ kind: 'row', row })
    }
  }
  return items
}

/** Reste à répartir pour qu'une ventilation égale exactement `total` (0 = équilibrée). */
export function splitRemainder(
  total: MinorUnits,
  splits: readonly Pick<SplitInput, 'amount'>[],
): MinorUnits {
  if (splits.length === 0) return 0
  return total - splits.reduce((acc, split) => acc + split.amount, 0)
}

/** Calcule une contre-valeur entière à partir d'un taux saisi (ex. « 1,05 »). */
export function convertedFromRate(amount: MinorUnits, rateText: string): MinorUnits | null {
  const normalized = rateText.trim().replace(/\s+/g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const rate = Number(normalized)
  if (!Number.isFinite(rate) || rate <= 0 || rate > 10_000) return null
  return Math.round(amount * rate)
}

/** Taux implicite affiché entre le montant d'origine et sa contre-valeur. */
export function rateFromConverted(amount: MinorUnits, converted: MinorUnits | null): string {
  if (converted === null || amount === 0) return ''
  const ratio = Math.abs(converted) / Math.abs(amount)
  if (!Number.isFinite(ratio) || ratio <= 0) return ''
  return ratio.toFixed(4).replace(/\.?0+$/, '')
}
