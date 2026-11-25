import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ACCOUNT_DEFAULTS, openTestLedger, type TestLedger } from '../ledger/testing'
import { getAnalyticsAnomaliesForFilter, getAnalyticsOverview } from './overview'

let t: TestLedger

beforeEach(() => {
  t = openTestLedger()
})

afterEach(() => t.close())

const cat = (key: string) => {
  const id = t.categories.get(key)
  if (!id) throw new Error(`Missing category ${key}`)
  return id
}

function manualAccount(name = 'Compte Courant', type: 'checking' | 'savings' = 'checking') {
  return t.ok('accountCreate', {
    ...ACCOUNT_DEFAULTS,
    name,
    type,
    trackingMode: 'manual',
    openingBalance: 1000_00,
  }).id
}

describe('agrégats mensuels et analyses multi-critères (M5)', () => {
  it('maintient l’invariant de cohérence totale sous filtres multiples et vérifie M-1 / N-1', () => {
    const bank = manualAccount('Courant', 'checking')
    const savingsAcc = manualAccount('Livret A', 'savings')
    const tagVac = t.ok('tagCreate', { name: 'Vacances', color: null }).id

    // N-1 (nov 2025)
    t.ok('transactionCreate', {
      accountId: bank,
      bookingDate: '2025-11-10',
      valueDate: null,
      amount: 2400_00,
      convertedAmount: null,
      label: 'VIR SALAIRE',
      payee: 'Employeur',
      status: 'reconciled',
      note: null,
      splits: [{ categoryId: cat('salary.net'), amount: 2400_00, note: null, tagIds: [] }],
    })
    t.ok('transactionCreate', {
      accountId: bank,
      bookingDate: '2025-11-12',
      valueDate: null,
      amount: -800_00,
      convertedAmount: null,
      label: 'LOYER',
      payee: 'Bailleur',
      status: 'reconciled',
      note: null,
      splits: [{ categoryId: cat('housing.rent'), amount: -800_00, note: null, tagIds: [] }],
    })

    // M-1 (oct 2026)
    t.ok('transactionCreate', {
      accountId: bank,
      bookingDate: '2026-10-05',
      valueDate: null,
      amount: 2600_00,
      convertedAmount: null,
      label: 'VIR SALAIRE',
      payee: 'Employeur',
      status: 'reconciled',
      note: null,
      splits: [{ categoryId: cat('salary.net'), amount: 2600_00, note: null, tagIds: [] }],
    })
    t.ok('transactionCreate', {
      accountId: bank,
      bookingDate: '2026-10-14',
      valueDate: null,
      amount: -120_00,
      convertedAmount: null,
      label: 'CB CARREFOUR',
      payee: 'Carrefour',
      status: 'cleared',
      note: null,
      splits: [{ categoryId: cat('groceries.shopping'), amount: -120_00, note: null, tagIds: [] }],
    })

    // M (nov 2026) : ventilation mixte + étiquette Vacances + virement épargne
    t.ok('transactionCreate', {
      accountId: bank,
      bookingDate: '2026-11-05',
      valueDate: null,
      amount: 2650_00,
      convertedAmount: null,
      label: 'VIR SALAIRE',
      payee: 'Employeur',
      status: 'reconciled',
      note: null,
      splits: [{ categoryId: cat('salary.net'), amount: 2650_00, note: null, tagIds: [] }],
    })
    t.ok('transactionCreate', {
      accountId: bank,
      bookingDate: '2026-11-08',
      valueDate: null,
      amount: -350_00,
      convertedAmount: null,
      label: 'TRAIN + HOTEL',
      payee: 'SNCF',
      status: 'cleared',
      note: null,
      splits: [
        { categoryId: cat('transport.public'), amount: -150_00, note: null, tagIds: [tagVac] },
        { categoryId: cat('leisure.travel'), amount: -200_00, note: null, tagIds: [tagVac] },
      ],
    })
    t.ok('transferCreate', {
      fromAccountId: bank,
      toAccountId: savingsAcc,
      bookingDate: '2026-11-15',
      amount: 400_00,
      label: 'Épargne mensuelle',
    })

    const overview = getAnalyticsOverview(t.db, {
      currency: 'EUR',
      from: '2026-10-01',
      to: '2026-11-30',
      focusMonth: '2026-11',
    })

    expect(overview.kpis.income).toBe(5250_00)
    expect(overview.kpis.expenses).toBe(470_00)
    expect(overview.kpis.savings).toBe(400_00)

    // Invariant strict : Σ ventilation par catégorie === kpis.expenses === Σ série mensuelle
    const breakdownSum = overview.categoryBreakdown.reduce((acc, c) => acc + c.amount, 0)
    expect(breakdownSum).toBe(overview.kpis.expenses)
    const seriesExpenses = overview.monthlySeries.reduce((acc, m) => acc + m.expenses, 0)
    expect(seriesExpenses).toBe(overview.kpis.expenses)

    // Synthèse mensuelle nov 2026 vs oct 2026 (M-1) et nov 2025 (N-1)
    expect(overview.monthlySynthesis.month).toBe('2026-11')
    expect(overview.monthlySynthesis.vsPrevMonth?.referenceMonth).toBe('2026-10')
    expect(overview.monthlySynthesis.vsPrevMonth?.expenseDiff).toBe(350_00 - 120_00)
    expect(overview.monthlySynthesis.vsLastYear?.referenceMonth).toBe('2025-11')
    expect(overview.monthlySynthesis.vsLastYear?.incomeDiff).toBe(2650_00 - 2400_00)
    expect(overview.monthlySynthesis.payslipSummary?.totalIncome).toBe(2650_00)

    // Filtre par étiquette : cohérence sur l'opération SNCF uniquement
    const tagFiltered = getAnalyticsOverview(t.db, {
      currency: 'EUR',
      from: '2026-10-01',
      to: '2026-11-30',
      tagIds: [tagVac],
    })
    expect(tagFiltered.kpis.expenses).toBe(350_00)
    expect(tagFiltered.categoryBreakdown.reduce((acc, c) => acc + c.amount, 0)).toBe(350_00)

    // Invalidation automatique de l'agrégat après écriture supplémentaire
    t.ok('transactionCreate', {
      accountId: bank,
      bookingDate: '2026-11-22',
      valueDate: null,
      amount: -30_00,
      convertedAmount: null,
      label: 'CB PHARMACIE',
      payee: null,
      status: 'cleared',
      note: null,
    })
    const refreshed = getAnalyticsOverview(t.db, {
      currency: 'EUR',
      from: '2026-10-01',
      to: '2026-11-30',
    })
    expect(refreshed.kpis.expenses).toBe(500_00)
  })

  it('détecte dépenses > 3x médiane, doubles prélèvements et frais bancaires, et neutralise les formules CSV', () => {
    const bank = manualAccount('Courant')
    // Historique stable chez Bistro (~20 €), puis dépense inhabituelle (120 € > 3x20)
    for (const date of ['2026-08-05', '2026-09-05', '2026-10-05']) {
      t.ok('transactionCreate', {
        accountId: bank,
        bookingDate: date,
        valueDate: null,
        amount: -20_00,
        convertedAmount: null,
        label: 'CB BISTRO DU COIN',
        payee: 'Bistro',
        status: 'cleared',
        note: null,
      })
    }
    t.ok('transactionCreate', {
      accountId: bank,
      bookingDate: '2026-11-10',
      valueDate: null,
      amount: -120_00,
      convertedAmount: null,
      label: 'CB BISTRO DU COIN',
      payee: 'Bistro',
      status: 'cleared',
      note: null,
    })

    // Double prélèvement en 2 jours
    t.ok('transactionCreate', {
      accountId: bank,
      bookingDate: '2026-11-14',
      valueDate: null,
      amount: -45_00,
      convertedAmount: null,
      label: '=MALICIOUS_CELL',
      payee: 'Salle Sport',
      status: 'cleared',
      note: null,
    })
    t.ok('transactionCreate', {
      accountId: bank,
      bookingDate: '2026-11-15',
      valueDate: null,
      amount: -45_00,
      convertedAmount: null,
      label: 'PRLV SALLE SPORT',
      payee: 'Salle Sport',
      status: 'cleared',
      note: null,
    })

    // Frais bancaires cumulés
    t.ok('transactionCreate', {
      accountId: bank,
      bookingDate: '2026-11-18',
      valueDate: null,
      amount: -12_00,
      convertedAmount: null,
      label: 'FRAIS BANCAIRES TENUE DE COMPTE',
      payee: null,
      status: 'cleared',
      note: null,
      splits: [{ categoryId: cat('banking.fees'), amount: -12_00, note: null, tagIds: [] }],
    })

    const anomalies = getAnalyticsAnomaliesForFilter(t.db, {
      currency: 'EUR',
      from: '2026-11-01',
      to: '2026-11-30',
    })
    expect(anomalies.some((a) => a.kind === 'unusual-expense' && a.amount === 120_00)).toBe(true)
    expect(anomalies.some((a) => a.kind === 'duplicate-charge' && a.amount === 45_00)).toBe(true)
    expect(anomalies.some((a) => a.kind === 'bank-fees' && a.amount === 12_00)).toBe(true)

    const csvOut = t.ok('analyticsCsvData', {
      currency: 'EUR',
      from: '2026-11-01',
      to: '2026-11-30',
    })
    expect(csvOut.csv).toContain("'=MALICIOUS_CELL")
  })

  it('compte un retrait depuis l’épargne en épargne nette négative sans fausser les revenus (agrégat et direct)', () => {
    const bank = manualAccount('Courant', 'checking')
    const livretValo = t.ok('accountCreate', {
      ...ACCOUNT_DEFAULTS,
      name: 'PEA',
      type: 'investment',
      trackingMode: 'valuation',
    }).id
    const livretManual = manualAccount('Livret A', 'savings')

    const peaCat = t.ok('categoriesList', {}).find((c) => c.linkedAccountId === livretValo)!.id
    const livretCat = t.ok('categoriesList', {}).find((c) => c.linkedAccountId === livretManual)!.id

    // Versement 600 € vers Livret A (lié auto), retrait 450 € depuis Livret A (lié auto),
    // et retrait 200 € depuis PEA non suivi par opérations -> épargne nette = 600 - 450 - 200 = -50 €.
    t.ok('transactionCreate', {
      accountId: bank,
      bookingDate: '2026-11-04',
      valueDate: null,
      amount: -600_00,
      convertedAmount: null,
      label: 'VIR VERS LIVRET A',
      payee: null,
      status: 'cleared',
      note: null,
      splits: [{ categoryId: livretCat, amount: -600_00, note: null, tagIds: [] }],
    })
    t.ok('transactionCreate', {
      accountId: bank,
      bookingDate: '2026-11-10',
      valueDate: null,
      amount: 450_00,
      convertedAmount: null,
      label: 'VIR DE LIVRET A',
      payee: null,
      status: 'cleared',
      note: null,
      splits: [{ categoryId: livretCat, amount: 450_00, note: null, tagIds: [] }],
    })
    t.ok('transactionCreate', {
      accountId: bank,
      bookingDate: '2026-11-15',
      valueDate: null,
      amount: 200_00,
      convertedAmount: null,
      label: 'RACHAT PEA',
      payee: null,
      status: 'cleared',
      note: null,
      splits: [{ categoryId: peaCat, amount: 200_00, note: null, tagIds: [] }],
    })

    const viaAgg = getAnalyticsOverview(t.db, {
      currency: 'EUR',
      from: '2026-11-01',
      to: '2026-11-30',
    })
    expect(viaAgg.kpis.income).toBe(0)
    expect(viaAgg.kpis.expenses).toBe(0)
    expect(viaAgg.kpis.savings).toBe(-50_00)

    // Force le chemin direct (plage en milieu de mois).
    const viaDirect = getAnalyticsOverview(t.db, {
      currency: 'EUR',
      from: '2026-11-02',
      to: '2026-11-29',
    })
    expect(viaDirect.kpis.income).toBe(0)
    expect(viaDirect.kpis.expenses).toBe(0)
    expect(viaDirect.kpis.savings).toBe(-50_00)
  })
})
