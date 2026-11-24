import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generateDemoLedger } from '@shared/demo/demo-ledger'
import { sum } from '@shared/money'
import { uuidv7 } from '@shared/uuid'
import { seedDemoVault } from '../demo/seed'
import {
  ACCOUNT_DEFAULTS,
  insertImported,
  openTestLedger,
  TEST_NOW,
  type TestLedger,
} from './testing'

let t: TestLedger

beforeEach(() => {
  t = openTestLedger()
})

afterEach(() => t.close())

describe('filtres enregistrés', () => {
  it('crée, modifie, liste et supprime un filtre enregistré ; refuse un doublon', () => {
    const first = t.ok('savedFilterSave', {
      name: 'Abonnements',
      filter: { direction: 'out', search: 'mobile' },
    })
    expect(t.ledger.run('savedFilterSave', { name: 'abonnements', filter: {} })).toEqual({
      ok: false,
      error: 'name-taken',
    })
    t.ok('savedFilterSave', {
      id: first.id,
      name: 'Abonnements pro',
      filter: { direction: 'out', favorite: true },
    })
    expect(t.ok('savedFiltersList', {})).toEqual([
      {
        id: first.id,
        name: 'Abonnements pro',
        filter: { direction: 'out', favorite: true },
        sortOrder: 0,
      },
    ])
    t.ok('savedFilterDelete', { id: first.id })
    expect(t.ok('savedFiltersList', {})).toEqual([])
    expect(t.ledger.run('savedFilterDelete', { id: first.id })).toEqual({
      ok: false,
      error: 'not-found',
    })
  })
})

describe('annuler / rétablir et journal d’audit', () => {
  it('annule et rétablit des opérations, trace un revert dans l’audit et ignore les filtres', () => {
    expect(t.ledger.run('ledgerUndo', {})).toEqual({ ok: false, error: 'nothing-to-undo' })
    const cash = t.ok('accountCreate', {
      ...ACCOUNT_DEFAULTS,
      name: 'Espèces',
      type: 'cash',
      trackingMode: 'manual',
      openingBalance: 100_00,
    }).id

    const tx = t.ok('transactionCreate', {
      accountId: cash,
      label: 'Boulangerie',
      bookingDate: '2026-11-15',
      valueDate: null,
      amount: -4_50,
      convertedAmount: null,
      payee: 'Boulanger',
      note: null,
      status: 'cleared',
    }).id

    // Sauvegarder un filtre ne doit pas polluer la pile d'annulation du registre.
    t.ok('savedFilterSave', { name: 'Espèces', filter: { accountIds: [cash] } })

    expect(t.ok('ledgerHistoryStatus', {})).toMatchObject({
      canUndo: true,
      canRedo: false,
      undoAction: 'transaction-create',
    })

    t.ok('ledgerUndo', {})
    expect(t.ok('transactionsList', { filter: {} }).rows).toHaveLength(0)
    expect(t.ok('accountsList', {}).find((a) => a.id === cash)?.balance).toBe(100_00)

    const audit = t.ok('auditList', { limit: 10 })
    expect(audit[0]).toMatchObject({ action: 'revert', origin: 'user' })

    t.ok('ledgerRedo', {})
    expect(t.ok('transactionsList', { filter: {} }).rows).toHaveLength(1)
    expect(t.ok('transactionGet', { id: tx }).label).toBe('Boulangerie')
    expect(t.ok('accountsList', {}).find((a) => a.id === cash)?.balance).toBe(95_50)
  })

  it('refuse l’annulation en cas de conflit (modification extérieure)', () => {
    const bank = t.ok('accountCreate', {
      ...ACCOUNT_DEFAULTS,
      name: 'Courant',
      type: 'checking',
      trackingMode: 'statement',
    }).id
    const tx = insertImported(t.db, bank, { date: '2026-11-05', amount: -25_00, label: 'CB CAFE' })
    t.ok('transactionUpdate', { id: tx, patch: { customLabel: 'Café' } })
    // Modification directe en base (ex. import ou mise à jour externe).
    t.db.prepare('UPDATE transactions SET label = ? WHERE id = ?').run('Modifié ailleurs', tx)
    expect(t.ledger.run('ledgerUndo', {})).toEqual({ ok: false, error: 'conflict' })
    expect(t.ok('transactionGet', { id: tx }).label).toBe('Modifié ailleurs')
  })
})

describe('synthèse du tableau de bord', () => {
  it('reproduit exactement le grand livre de démonstration et exclut les ajustements', () => {
    const demo = generateDemoLedger({ endMonth: '2026-11', count: 18 })
    // Repartir d'une base vierge seedée comme le coffre de démonstration.
    t.db.prepare('DELETE FROM audit_entry WHERE 1 = 0') // vérification purement structurelle
    seedDemoVault(t.db, demo, { locale: 'fr-FR', now: TEST_NOW })

    const summary = t.ok('dashboardSummary', {
      currency: 'EUR',
      months: 18,
      endMonth: '2026-11',
    })
    expect(summary.hasTransactions).toBe(true)
    expect(summary.otherCurrencies).toEqual([])
    expect(summary.months).toHaveLength(18)

    for (let i = 0; i < demo.months.length; i += 1) {
      const expected = demo.months[i]!
      const actual = summary.months[i]!
      expect(actual.month).toBe(expected.month)
      expect(actual.income, expected.month).toBe(expected.income)
      expect(actual.expenses, expected.month).toBe(expected.expenses)
      expect(actual.savings, expected.month).toBe(20_000)
      expect(sum(actual.categories.map((c) => c.amount))).toBe(expected.expenses)
    }

    // Une écriture d'ajustement est exclue des revenus et dépenses.
    const checking = t.ok('accountsList', {}).find((a) => a.type === 'checking')!
    t.db
      .prepare(
        `INSERT INTO transactions (id, account_id, booking_date, amount, currency, label_raw,
           nature, note, created_at, updated_at)
         VALUES (?, ?, '2026-11-10', -50000, 'EUR', 'Ajustement', 'adjustment', 'Écart initial', ?, ?)`,
      )
      .run(uuidv7(), checking.id, TEST_NOW.toISOString(), TEST_NOW.toISOString())

    const afterAdjustment = t.ok('dashboardSummary', {
      currency: 'EUR',
      months: 18,
      endMonth: '2026-11',
    })
    expect(afterAdjustment.months.at(-1)?.expenses).toBe(demo.months.at(-1)?.expenses)
  })

  it('regroupe les sous-catégories et utilise la contre-valeur en devise étrangère', () => {
    const chf = t.ok('accountCreate', {
      ...ACCOUNT_DEFAULTS,
      name: 'Suisse',
      type: 'cash',
      trackingMode: 'manual',
      currency: 'CHF',
    }).id
    const housingChild = t.ok('categoryCreate', {
      name: 'Électricité test',
      parentId: t.categories.get('housing')!,
      icon: null,
      color: null,
    }).id
    t.ok('transactionCreate', {
      accountId: chf,
      label: 'Loyer CHF',
      bookingDate: '2026-11-05',
      valueDate: null,
      amount: -100_00,
      convertedAmount: -105_00,
      payee: null,
      note: null,
      status: 'cleared',
      splits: [{ categoryId: housingChild, amount: -100_00, note: null, tagIds: [] }],
    })
    t.ok('transactionCreate', {
      accountId: chf,
      label: 'Café CHF sans taux',
      bookingDate: '2026-11-06',
      valueDate: null,
      amount: -5_00,
      convertedAmount: null,
      payee: null,
      note: null,
      status: 'cleared',
    })

    const summary = t.ok('dashboardSummary', {
      currency: 'EUR',
      months: 1,
      endMonth: '2026-11',
    })
    expect(summary.otherCurrencies).toEqual(['CHF'])
    expect(summary.months[0]?.expenses).toBe(105_00)
    expect(summary.months[0]?.categories[0]).toMatchObject({
      id: t.categories.get('housing'),
      amount: 105_00,
    })
  })
})
