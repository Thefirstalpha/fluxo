/**
 * Rotation des sauvegardes automatiques : on garde la plus récente de chacun des 7 derniers
 * jours, de chacune des 4 dernières semaines et de chacun des 12 derniers mois (calendrier UTC).
 * Les sauvegardes manuelles, avant migration et avant restauration ne sont jamais supprimées.
 */

export const RETENTION = { daily: 7, weekly: 4, monthly: 12 } as const

export interface DatedBackup {
  id: string
  createdAt: Date
}

const dayKey = (date: Date) => date.toISOString().slice(0, 10)
const monthKey = (date: Date) => date.toISOString().slice(0, 7)

/** Semaine ISO 8601 (année ISO + numéro), en UTC. */
export function isoWeekKey(date: Date): string {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const weekday = day.getUTCDay() || 7 // lundi = 1 … dimanche = 7
  day.setUTCDate(day.getUTCDate() + 4 - weekday) // jeudi de la même semaine
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function keepNewestPerPeriod(
  sorted: readonly DatedBackup[],
  key: (date: Date) => string,
  periods: number,
  kept: Set<string>,
): void {
  const seen = new Set<string>()
  for (const backup of sorted) {
    const period = key(backup.createdAt)
    if (seen.has(period)) continue
    if (seen.size >= periods) break
    seen.add(period)
    kept.add(backup.id)
  }
}

/** Identifiants des sauvegardes automatiques à supprimer. */
export function backupsToPrune(backups: readonly DatedBackup[]): string[] {
  const sorted = [...backups].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  const kept = new Set<string>()
  keepNewestPerPeriod(sorted, dayKey, RETENTION.daily, kept)
  keepNewestPerPeriod(sorted, isoWeekKey, RETENTION.weekly, kept)
  keepNewestPerPeriod(sorted, monthKey, RETENTION.monthly, kept)
  return sorted.filter((backup) => !kept.has(backup.id)).map((backup) => backup.id)
}
