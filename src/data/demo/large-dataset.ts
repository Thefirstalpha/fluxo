import { createHash } from 'node:crypto'
import { createUuidV7Generator } from '@shared/uuid'
import type { Db } from '../db/connection'

/**
 * Jeu volumineux pour les mesures de performance (M1, lot 5) : `count` opérations sur 3 comptes
 * et 12 catégories, réparties sur ~10 ans. Déterministe, entièrement fictif, jamais dans un coffre réel.
 */
export function seedLargeDataset(
  db: Db,
  { count = 50_000, seed = 42 }: { count?: number; seed?: number } = {},
): { accounts: string[]; categories: string[] } {
  let state = seed >>> 0
  const random = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 4_294_967_296
  }
  // Identifiants dans l'ordre chronologique des opérations (horloge simulée).
  let clock = Date.UTC(2017, 0, 1)
  const nextId = createUuidV7Generator(() => clock)
  const stamp = new Date(Date.UTC(2026, 10, 24)).toISOString()
  const accounts = [0, 1, 2].map(() => nextId())
  const categories = Array.from({ length: 12 }, () => nextId())

  db.transaction(() => {
    accounts.forEach((id, index) =>
      db
        .prepare(
          `INSERT INTO account (id, name, type, tracking_mode, currency, created_at, updated_at)
           VALUES (?, ?, 'cash', 'manual', 'EUR', ?, ?)`,
        )
        .run(id, `Compte ${index + 1}`, stamp, stamp),
    )
    categories.forEach((id, index) =>
      db
        .prepare(
          `INSERT INTO category (id, name, kind, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(id, `Catégorie ${index + 1}`, index === 0 ? 'income' : 'expense', index, stamp, stamp),
    )
    const insertTransaction = db.prepare(
      `INSERT INTO transactions (id, account_id, booking_date, amount, currency, label_raw,
         dedup_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'EUR', ?, ?, ?, ?)`,
    )
    const insertSplit = db.prepare(
      'INSERT INTO split (id, transaction_id, category_id, amount, position) VALUES (?, ?, ?, ?, 0)',
    )
    const start = Date.UTC(2017, 0, 1)
    const span = Date.UTC(2026, 10, 24) - start
    for (let index = 0; index < count; index += 1) {
      clock = start + Math.floor((span * index) / count)
      const date = new Date(clock).toISOString().slice(0, 10)
      const categoryIndex = Math.floor(random() * categories.length)
      const amount =
        categoryIndex === 0
          ? 150_000 + Math.floor(random() * 200_000)
          : -(100 + Math.floor(random() * 25_000))
      const id = nextId()
      const label = `OPERATION ${index}`
      insertTransaction.run(
        id,
        accounts[index % accounts.length],
        date,
        amount,
        label,
        createHash('sha1').update(label).digest('hex'),
        stamp,
        stamp,
      )
      insertSplit.run(nextId(), id, categories[categoryIndex], amount)
    }
  })()
  return { accounts, categories }
}
