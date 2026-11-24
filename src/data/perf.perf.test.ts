import { randomBytes } from 'node:crypto'
import { statSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkDatabase, closeDatabase, openEncryptedDatabase, type Db } from './db/connection'
import { migrate } from './db/migrations'
import { seedLargeDataset } from './demo/large-dataset'
import { Ledger } from './ledger/ledger'

/**
 * Mesures du coffre (`npm run test:perf`, hors `npm run check` : dépend de la machine).
 * Budgets (docs/architecture/performance.md) : ouverture < 500 ms hors Argon2id,
 * requêtes courantes < 20 ms à 50 000 opérations (M1), registre (M2) : filtrage < 100 ms.
 */
const COUNT = 50_000

let directory: string
let file: string
let db: Db
const key = randomBytes(32)
const report: Record<string, string> = {}

function median(run: () => unknown, times = 15): number {
  const samples: number[] = []
  run() // préchauffage (préparation, cache de pages)
  for (let i = 0; i < times; i += 1) {
    const start = performance.now()
    run()
    samples.push(performance.now() - start)
  }
  samples.sort((a, b) => a - b)
  return samples[Math.floor(samples.length / 2)] ?? 0
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'fluxo-perf-'))
  file = join(directory, 'fluxo.db')
  db = openEncryptedDatabase(file, key, { create: true })
  migrate(db)
  const start = performance.now()
  seedLargeDataset(db, { count: COUNT })
  report['insertion de 50 000 opérations'] = `${Math.round(performance.now() - start)} ms`
  closeDatabase(db)
}, 120_000)

afterAll(async () => {
  if (db.open) db.close()
  await rm(directory, { recursive: true, force: true })
  console.table(report)
})

describe(`coffre à ${COUNT} opérations`, () => {
  it('ouverture (clé, migrations) < 500 ms ; contrôle quotidien mesuré à part', () => {
    const start = performance.now()
    db = openEncryptedDatabase(file, key, { create: false, check: false })
    migrate(db)
    const elapsed = performance.now() - start
    report['ouverture'] = `${elapsed.toFixed(1)} ms`
    const check = performance.now()
    checkDatabase(db)
    // Au plus une fois par jour au déverrouillage (ADR-033) : proportionnel à la taille.
    report['contrôle quick_check (quotidien)'] = `${(performance.now() - check).toFixed(1)} ms`
    report['taille de la base'] = `${Math.round(statSync(file).size / 1024)} Ko`
    expect(elapsed).toBeLessThan(500)
  })

  it('requêtes courantes < 20 ms (médiane)', () => {
    const account = db.prepare('SELECT id FROM account ORDER BY id LIMIT 1').pluck().get()
    const queries: Record<string, () => unknown> = {
      'opérations d’un compte sur un mois': () =>
        db
          .prepare(
            `SELECT id, booking_date, amount, label_raw FROM transactions
             WHERE account_id = ? AND booking_date BETWEEN '2026-03-01' AND '2026-03-31'
             ORDER BY booking_date DESC LIMIT 200`,
          )
          .all(account),
      'dernière page du registre (200 lignes)': () =>
        db
          .prepare(
            `SELECT id, booking_date, amount FROM transactions
             ORDER BY booking_date DESC, id DESC LIMIT 200`,
          )
          .all(),
      'totaux mensuels par catégorie sur un an': () =>
        db
          .prepare(
            `SELECT substr(t.booking_date, 1, 7) AS month, s.category_id, SUM(s.amount) AS total
             FROM transactions t JOIN split s ON s.transaction_id = t.id
             WHERE t.booking_date BETWEEN '2025-12-01' AND '2026-11-30'
             GROUP BY month, s.category_id`,
          )
          .all(),
      'solde d’un compte': () =>
        db
          .prepare('SELECT SUM(amount) FROM transactions WHERE account_id = ?')
          .pluck()
          .get(account),
      'comptes et soldes (registre)': () => new Ledger(db).run('accountsList', {}),
      'recherche plein texte (FTS5, préfixe)': () =>
        db
          .prepare(
            `SELECT k.transaction_id FROM transactions_fts f
             JOIN transaction_search_key k ON k.search_id = f.rowid
             WHERE transactions_fts MATCH ? LIMIT 200`,
          )
          .all('"loy"*'),
      'recherche de doublon (empreinte)': () =>
        db
          .prepare('SELECT id FROM transactions WHERE account_id = ? AND dedup_hash = ?')
          .get(account, 'inexistante-0000000000'),
    }
    for (const [name, run] of Object.entries(queries)) {
      const elapsed = median(run)
      report[name] = `${elapsed.toFixed(2)} ms`
      expect(elapsed, name).toBeLessThan(20)
    }
  })

  it('registre : page, recherche et filtres < 100 ms (médiane)', () => {
    const ledger = new Ledger(db)
    const category = db
      .prepare('SELECT id FROM category ORDER BY id LIMIT 1')
      .pluck()
      .get() as string
    const first = ledger.run('transactionsList', { filter: {} })
    const cursor = first.ok ? first.value.nextCursor : null
    const queries: Record<string, () => unknown> = {
      'registre : première page (200)': () => ledger.run('transactionsList', { filter: {} }),
      'registre : page suivante (curseur)': () =>
        ledger.run('transactionsList', { filter: {}, cursor }),
      'registre : recherche « loyer »': () =>
        ledger.run('transactionsList', { filter: { search: 'loyer' } }),
      'registre : recherche d’un montant': () =>
        ledger.run('transactionsList', { filter: { search: '45,90' } }),
      'registre : catégorie + période': () =>
        ledger.run('transactionsList', {
          filter: { categoryIds: [category], from: '2026-01-01', to: '2026-06-30' },
        }),
      'registre : non catégorisées': () =>
        ledger.run('transactionsList', { filter: { categoryIds: ['none'] } }),
      'registre : tri par montant': () =>
        ledger.run('transactionsList', { filter: {}, sort: 'amount-desc' }),
      'registre : synthèse du filtre': () =>
        ledger.run('transactionsSummary', { filter: { categoryIds: [category] } }),
      'analyses M5 : synthèse globale (agrégats < 50 ms)': () =>
        ledger.run('analyticsOverview', {
          currency: 'EUR',
          from: '2026-01-01',
          to: '2026-11-30',
        }),
    }
    for (const [name, run] of Object.entries(queries)) {
      const elapsed = median(run, 9)
      report[name] = `${elapsed.toFixed(2)} ms`
      expect(elapsed, name).toBeLessThan(name.includes('< 50 ms') ? 50 : 100)
    }
  })
})
