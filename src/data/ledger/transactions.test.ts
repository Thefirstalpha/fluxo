import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AccountType, SplitInput, TrackingMode } from '@shared/ledger/model'
import { listAudit } from '../db/audit'
import { findUnbalancedTransactions } from '../db/integrity'
import { ACCOUNT_DEFAULTS, insertImported, openTestLedger, type TestLedger } from './testing'

let t: TestLedger

beforeEach(() => {
  t = openTestLedger()
})

afterEach(() => t.close())

function account(name: string, type: AccountType, trackingMode: TrackingMode, openingBalance = 0) {
  return t.ok('accountCreate', { ...ACCOUNT_DEFAULTS, name, type, trackingMode, openingBalance }).id
}

const category = (key: string) => {
  const id = t.categories.get(key)
  if (!id) throw new Error(`catégorie ${key}`)
  return id
}

function spend(accountId: string, amount: number, extra: Record<string, unknown> = {}) {
  return t.ok('transactionCreate', {
    accountId,
    label: 'Marché',
    bookingDate: '2026-11-10',
    valueDate: null,
    amount,
    convertedAmount: null,
    payee: null,
    note: null,
    status: 'cleared',
    ...extra,
  }).id
}

const part = (categoryId: string | null, amount: number, tagIds: string[] = []): SplitInput => ({
  categoryId,
  amount,
  note: null,
  tagIds,
})

const balances = () =>
  Object.fromEntries(t.ok('accountsList', {}).map((a) => [a.name, a.balance] as const))

describe('saisie (ADR-026)', () => {
  it('saisit sur un compte manuel, jamais sur un compte à relevé ou valorisé', () => {
    const cash = account('Espèces', 'cash', 'manual', 50_00)
    const bank = account('Courant', 'checking', 'statement')
    const pea = account('PEA', 'investment', 'valuation')
    spend(cash, -12_30, { payee: 'Primeur' })
    expect(balances()).toMatchObject({ Espèces: 37_70 })
    const base = { label: 'X', bookingDate: '2026-11-10', valueDate: null, amount: -1_00 }
    const extra = { convertedAmount: null, payee: null, note: null, status: 'cleared' as const }
    expect(t.ledger.run('transactionCreate', { accountId: bank, ...base, ...extra })).toEqual({
      ok: false,
      error: 'statement-account',
    })
    expect(t.ledger.run('transactionCreate', { accountId: pea, ...base, ...extra })).toEqual({
      ok: false,
      error: 'valuation-account',
    })
    expect(t.ok('payeesList', {})).toEqual([
      expect.objectContaining({ name: 'Primeur', transactionCount: 1 }),
    ])
  })

  it('annote une opération importée, sans pouvoir en changer la substance', () => {
    const bank = account('Courant', 'checking', 'statement')
    const id = insertImported(t.db, bank, {
      date: '2026-11-03',
      amount: -45_90,
      label: 'CB SUPER U',
    })
    t.ok('transactionUpdate', {
      id,
      patch: {
        customLabel: 'Courses',
        note: 'avec les voisins',
        status: 'reconciled',
        favorite: true,
        payee: 'Super U',
      },
    })
    const detail = t.ok('transactionGet', { id })
    expect(detail).toMatchObject({
      label: 'Courses',
      labelRaw: 'CB SUPER U',
      payee: 'Super U',
      status: 'reconciled',
      favorite: true,
      imported: true,
    })
    for (const patch of [
      { amount: -40_00 },
      { bookingDate: '2026-11-04' },
      { valueDate: '2026-11-04' },
      { labelRaw: 'AUTRE' },
    ]) {
      expect(t.ledger.run('transactionUpdate', { id, patch })).toEqual({
        ok: false,
        error: 'statement-account',
      })
    }
    expect(t.ledger.run('transactionsDelete', { ids: [id] })).toEqual({
      ok: false,
      error: 'statement-account',
    })
  })
})

describe('ventilation', () => {
  it('exige Σ des parts = montant, des parts non nulles et des catégories actives', () => {
    const cash = account('Espèces', 'cash', 'manual')
    const id = spend(cash, -100_00)
    const groceries = category('groceries.shopping')
    const home = category('shopping.home')
    expect(
      t.ledger.run('transactionSetSplits', {
        id,
        splits: [part(groceries, -60_00), part(home, -30_00)],
      }),
    ).toEqual({ ok: false, error: 'unbalanced-splits' })
    expect(
      t.ledger.run('transactionSetSplits', {
        id,
        splits: [part(groceries, -100_00), part(home, 0)],
      }),
    ).toEqual({ ok: false, error: 'invalid' })
    t.ok('transactionSetSplits', { id, splits: [part(groceries, -70_00), part(home, -30_00)] })
    expect(t.ok('transactionGet', { id }).splits.map((s) => s.amount)).toEqual([-70_00, -30_00])

    t.db.prepare('UPDATE category SET archived = 1 WHERE id = ?').run(home)
    expect(
      t.ledger.run('transactionSetSplits', {
        id,
        splits: [part(groceries, -50_00), part(home, -50_00)],
      }),
    ).toEqual({ ok: false, error: 'invalid' })
    expect(findUnbalancedTransactions(t.db)).toEqual([])
  })

  it('une part unique suit le montant ; une ventilation multiple doit être refaite', () => {
    const cash = account('Espèces', 'cash', 'manual')
    const id = spend(cash, -20_00, { splits: [part(category('groceries'), -20_00)] })
    t.ok('transactionUpdate', { id, patch: { amount: -25_00 } })
    expect(t.ok('transactionGet', { id }).splits).toMatchObject([{ amount: -25_00 }])
    t.ok('transactionSetSplits', {
      id,
      splits: [part(category('groceries'), -20_00), part(category('leisure'), -5_00)],
    })
    expect(t.ledger.run('transactionUpdate', { id, patch: { amount: -30_00 } })).toEqual({
      ok: false,
      error: 'unbalanced-splits',
    })
    expect(findUnbalancedTransactions(t.db)).toEqual([])
  })

  it('une part vide équivaut à « non catégorisée »', () => {
    const cash = account('Espèces', 'cash', 'manual')
    const id = spend(cash, -5_00, { splits: [part(null, -5_00)] })
    expect(t.ok('transactionGet', { id }).splits).toEqual([])
  })
})

describe('virements internes', () => {
  it('courant → livret : épargne ; retrait d’espèces : virement neutre ; soldes cohérents', () => {
    const bank = account('Courant', 'checking', 'statement', 1_000_00)
    const livret = account('Livret', 'savings', 'statement', 500_00)
    const cash = account('Espèces', 'cash', 'manual')
    const out = insertImported(t.db, bank, { date: '2026-11-05', amount: -200_00 })
    const into = insertImported(t.db, livret, { date: '2026-11-05', amount: 200_00 })
    t.ok('transferLink', { ids: [out, into] })
    const withdrawal = insertImported(t.db, bank, { date: '2026-11-06', amount: -60_00 })
    const { id: cashIn } = t.ok('transferCounterpart', {
      transactionId: withdrawal,
      accountId: cash,
    })

    const savingsCategory = category('savings')
    const transferCategory = category('transfer')
    expect(t.ok('transactionGet', { id: out })).toMatchObject({
      transferId: into,
      transferAccountId: livret,
      categoryIds: [savingsCategory],
    })
    expect(t.ok('transactionGet', { id: into }).categoryIds).toEqual([savingsCategory])
    expect(t.ok('transactionGet', { id: cashIn })).toMatchObject({
      amount: 60_00,
      transferId: withdrawal,
      categoryIds: [transferCategory],
    })
    expect(balances()).toEqual({ Courant: 740_00, Livret: 700_00, Espèces: 60_00 })
    // Un virement ne crée ni ne détruit d'argent.
    expect(Object.values(balances()).reduce((a, b) => a + b, 0)).toBe(1_500_00)
  })

  it('refuse un lien incohérent, défait un lien, supprime en déliant', () => {
    const cash = account('Espèces', 'cash', 'manual', 100_00)
    const vouchers = account('Titres', 'meal_voucher', 'manual')
    const bank = account('Courant', 'checking', 'statement')
    const a = insertImported(t.db, bank, { date: '2026-11-05', amount: -30_00 })
    const b = insertImported(t.db, bank, { date: '2026-11-05', amount: 30_00 })
    expect(t.ledger.run('transferLink', { ids: [a, b] })).toEqual({ ok: false, error: 'invalid' })
    const c = spend(cash, 25_00)
    expect(t.ledger.run('transferLink', { ids: [a, c] })).toEqual({ ok: false, error: 'invalid' })

    const { fromId, toId } = t.ok('transferCreate', {
      fromAccountId: cash,
      toAccountId: vouchers,
      bookingDate: '2026-11-07',
      amount: 15_00,
      label: 'Échange',
    })
    // Le montant suit sur la contrepartie (les deux sont saisies).
    t.ok('transactionUpdate', { id: fromId, patch: { amount: -20_00 } })
    expect(t.ok('transactionGet', { id: toId }).amount).toBe(20_00)
    expect(balances()).toMatchObject({ Espèces: 100_00 + 25_00 - 20_00, Titres: 20_00 })

    t.ok('transactionsDelete', { ids: [fromId] })
    expect(t.ok('transactionGet', { id: toId }).transferId).toBeNull()
    t.ok('transferUnlink', { id: toId })
  })
})

describe('édition en masse et étiquettes', () => {
  it('catégorise sans casser une ventilation, étiquette, change le statut', () => {
    const cash = account('Espèces', 'cash', 'manual')
    const single = spend(cash, -10_00)
    const split = spend(cash, -30_00, {
      splits: [part(category('groceries'), -20_00), part(category('leisure'), -10_00)],
    })
    expect(
      t.ok('transactionsCategorize', { ids: [single, split], categoryId: category('health') }),
    ).toEqual({ updated: 1, skipped: 1 })
    const { id: pro } = t.ok('tagCreate', { name: 'Pro', color: null })
    const { id: phone } = t.ok('tagCreate', { name: 'Abonnement téléphonique', color: '#0977cb' })
    expect(t.ledger.run('tagCreate', { name: 'pro', color: null })).toEqual({
      ok: false,
      error: 'name-taken',
    })
    t.ok('transactionsTag', { ids: [single, split], add: [pro, phone], remove: [] })
    t.ok('transactionsTag', { ids: [split], add: [], remove: [phone] })
    expect(t.ok('transactionGet', { id: single })).toMatchObject({
      categoryIds: [category('health')],
      tagIds: [phone, pro].sort(),
    })
    expect(t.ok('tagsList', {})).toEqual([
      expect.objectContaining({
        name: 'Abonnement téléphonique',
        total: -10_00,
        transactionCount: 1,
      }),
      expect.objectContaining({ name: 'Pro', total: -40_00, transactionCount: 2 }),
    ])
    expect(t.ok('transactionsSetStatus', { ids: [single, split], status: 'reconciled' })).toEqual({
      updated: 2,
    })
    t.ok('tagDelete', { id: pro })
    expect(t.ok('transactionGet', { id: split }).tagIds).toEqual([])
    expect(findUnbalancedTransactions(t.db)).toEqual([])
  })

  it('somme des catégories de dépense = total des dépenses (hors virements et épargne)', () => {
    const bank = account('Courant', 'checking', 'statement')
    const livret = account('Livret', 'savings', 'statement')
    const ops = [
      [-45_90, 'groceries.shopping'],
      [-120_00, 'housing.energy'],
      [-15_00, 'leisure'],
      [2_400_00, 'salary.net'],
    ] as const
    for (const [amount, key] of ops) {
      const id = insertImported(t.db, bank, { date: '2026-11-08', amount })
      t.ok('transactionsCategorize', { ids: [id], categoryId: category(key) })
    }
    const mixed = insertImported(t.db, bank, { date: '2026-11-09', amount: -60_00 })
    t.ok('transactionSetSplits', {
      id: mixed,
      splits: [part(category('health.pharmacy'), -35_00), part(category('shopping'), -25_00)],
    })
    t.ok('transferLink', {
      ids: [
        insertImported(t.db, bank, { date: '2026-11-10', amount: -300_00 }),
        insertImported(t.db, livret, { date: '2026-11-10', amount: 300_00 }),
      ],
    })
    const byKind = t.db
      .prepare(
        `SELECT c.kind, sum(s.amount) AS total FROM split s JOIN category c ON c.id = s.category_id
         GROUP BY c.kind ORDER BY c.kind`,
      )
      .all() as { kind: string; total: number }[]
    const expenses = -45_90 - 120_00 - 15_00 - 60_00
    expect(byKind).toEqual([
      { kind: 'expense', total: expenses },
      { kind: 'income', total: 2_400_00 },
      { kind: 'savings', total: 0 },
    ])
    const outflowNotTransfer = t.ok('transactionsSummary', {
      filter: {
        direction: 'out',
        categoryIds: [
          category('groceries'),
          category('housing'),
          category('leisure'),
          category('health'),
          category('shopping'),
        ],
      },
    })
    expect(outflowNotTransfer.total).toBe(expenses)
  })
})

describe('registre : filtres, recherche, pagination', () => {
  let bank: string
  let cash: string

  beforeEach(() => {
    bank = account('Courant', 'checking', 'statement')
    cash = account('Espèces', 'cash', 'manual')
    const rows = [
      ['2026-10-02', -45_90, 'CB ÉPICERIE DU MARCHÉ'],
      ['2026-10-15', -12_00, 'CB BOULANGERIE'],
      ['2026-11-01', 2_500_00, 'VIR SALAIRE'],
      ['2026-11-03', -45_90, 'CB EPICERIE DU MARCHE'],
      ['2026-11-20', -80_00, 'PRLV ENERGIE'],
    ] as const
    for (const [date, amount, label] of rows) insertImported(t.db, bank, { date, amount, label })
    spend(cash, -7_50, { bookingDate: '2026-11-21', label: 'Fleuriste', note: 'anniversaire' })
  })

  const ids = (filter: Record<string, unknown>) =>
    t.ok('transactionsList', { filter }).rows.map((row) => row.label)

  it('pagine par curseur sans doublon ni oubli, dans l’ordre demandé', () => {
    const seen: string[] = []
    let cursor: string | null = null
    do {
      const page: { rows: { id: string }[]; nextCursor: string | null } = t.ok('transactionsList', {
        filter: {},
        limit: 2,
        cursor,
      })
      seen.push(...page.rows.map((row) => row.id))
      cursor = page.nextCursor
    } while (cursor)
    const all = t.ok('transactionsList', { filter: {} }).rows.map((row) => row.id)
    expect(seen).toEqual(all)
    expect(new Set(seen).size).toBe(6)
    const byAmount = t.ok('transactionsList', { filter: {}, sort: 'amount-asc' }).rows
    expect(byAmount.map((row) => row.amount)).toEqual([
      -80_00, -45_90, -45_90, -12_00, -7_50, 2_500_00,
    ])
    expect(t.ledger.run('transactionsList', { filter: {}, cursor: 'nimporte' })).toEqual({
      ok: false,
      error: 'invalid',
    })
  })

  it('cherche sans tenir compte des accents ni de la casse, ou par montant', () => {
    expect(ids({ search: 'epicerie' })).toEqual(['CB EPICERIE DU MARCHE', 'CB ÉPICERIE DU MARCHÉ'])
    expect(ids({ search: 'ÉPIC march' })).toHaveLength(2)
    expect(ids({ search: 'anniv' })).toEqual(['Fleuriste'])
    expect(ids({ search: '45,90' })).toHaveLength(2)
    expect(ids({ search: '"; DROP TABLE transactions; --' })).toEqual([])
    expect(t.db.prepare('SELECT count(*) FROM transactions').pluck().get()).toBe(6)
  })

  it('combine compte, période, sens, montant, statut, catégorie et favori', () => {
    expect(ids({ accountIds: [cash] })).toEqual(['Fleuriste'])
    expect(ids({ from: '2026-11-01', to: '2026-11-20', direction: 'out' })).toEqual([
      'PRLV ENERGIE',
      'CB EPICERIE DU MARCHE',
    ])
    expect(ids({ minAmount: 40_00, maxAmount: 100_00 })).toHaveLength(3)
    const energy = t.ok('transactionsList', { filter: { search: 'energie' } }).rows[0]?.id ?? ''
    t.ok('transactionsCategorize', { ids: [energy], categoryId: category('housing.energy') })
    t.ok('transactionUpdate', { id: energy, patch: { favorite: true, status: 'reconciled' } })
    expect(ids({ categoryIds: [category('housing')] })).toEqual(['PRLV ENERGIE'])
    expect(ids({ categoryIds: ['none'] })).toHaveLength(5)
    expect(ids({ favorite: true, statuses: ['reconciled'] })).toEqual(['PRLV ENERGIE'])
    expect(t.ok('transactionsSummary', { filter: { accountIds: [bank] } })).toEqual({
      count: 5,
      total: 2_500_00 - 45_90 - 12_00 - 45_90 - 80_00,
      inflow: 2_500_00,
      outflow: -45_90 - 12_00 - 45_90 - 80_00,
      currencies: ['EUR'],
    })
  })
})

describe('audit', () => {
  it('une entrée par ligne modifiée, un résumé pour une écriture en masse', () => {
    const cash = account('Espèces', 'cash', 'manual')
    const created = Array.from({ length: 30 }, () => spend(cash, -1_00))
    const before = listAudit(t.db).length
    t.ok('transactionsSetStatus', { ids: created, status: 'reconciled' })
    const entries = listAudit(t.db).slice(before)
    expect(entries).toEqual([
      expect.objectContaining({
        entity: 'transaction',
        entityId: null,
        after: { action: 'transaction-status', rows: 30 },
      }),
    ])
  })
})
