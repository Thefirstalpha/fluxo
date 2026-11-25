import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openTestLedger, type TestLedger } from './testing'

let t: TestLedger

beforeEach(() => {
  t = openTestLedger()
})

afterEach(() => {
  t.close()
})

describe('Patrimoine, crédits, budgets & prévisions (M8)', () => {
  it('crée un crédit avec échéancier, met à jour le patrimoine net et simule un remboursement anticipé', () => {
    // 1. Compte courant + placement manuel valorisé
    const chk = t.ok('accountCreate', {
      name: 'Compte courant',
      type: 'checking',
      trackingMode: 'manual',
      institution: null,
      currency: 'EUR',
      openingBalance: 500_000, // 5 000 €
      openingDate: '2026-01-01',
      iban: null,
      color: null,
      icon: null,
    })
    const pea = t.ok('accountCreate', {
      name: 'PEA Actions',
      type: 'investment',
      trackingMode: 'valuation',
      institution: 'Boursorama',
      currency: 'EUR',
      openingBalance: 1_000_000, // 10 000 €
      openingDate: '2026-01-01',
      iban: null,
      color: null,
      icon: null,
    })
    t.ok('valuationAdd', {
      accountId: pea.id,
      valuationDate: '2026-11-20',
      valueCents: 1_250_000, // 12 500 €
      note: 'Valorisation novembre',
    })

    // 2. Crédit immobilier démarré en 2026-01 (TEST_NOW = 2026-11-24 => 11 échéances payées)
    const loan = t.ok('loanCreate', {
      name: 'Prêt Résidence Principale',
      loanType: 'mortgage',
      initialCapital: 10_000_000, // 100 000 €
      nominalRateMicros: 30_000, // 3,00 %
      taegMicros: 34_000,
      insuranceMonthlyCents: 2_500,
      durationMonths: 120,
      periodicity: 'monthly',
      startDate: '2026-01-05',
      fixedRateEndDate: null,
      currency: 'EUR',
    })

    const detail = t.ok('loanGet', { id: loan.id })
    expect(detail.installments).toHaveLength(120)
    expect(detail.loan.paidInstallments).toBe(11)
    expect(detail.loan.remainingPrincipalCents).toBeLessThan(10_000_000)

    // 3. Invariant Patrimoine net = Actifs (500k + 1250k) - Passifs (capital restant dû)
    const nw = t.ok('netWorthOverview', { currency: 'EUR' })
    expect(nw.totalAssetsCents).toBe(1_750_000)
    expect(nw.totalLiabilitiesCents).toBe(detail.loan.remainingPrincipalCents)
    expect(nw.netWorthCents).toBe(nw.totalAssetsCents - nw.totalLiabilitiesCents)
    expect(nw.history).toHaveLength(6)

    // 4. Simulation remboursement anticipé
    const sim = t.ok('loanSimulateEarlyRepayment', {
      loanId: loan.id,
      extraPrincipalCents: 1_500_000,
      atInstallmentNumber: 12,
      mode: 'reduce_duration',
    })
    expect(sim.monthsSaved).toBeGreaterThan(10)
    expect(sim.interestSavedCents).toBeGreaterThan(100_000)

    // 5. Rapprochement d'une échéance avec une transaction
    const debit = t.ok('transactionCreate', {
      accountId: chk.id,
      bookingDate: '2026-12-05',
      valueDate: null,
      amount: -detail.loan.monthlyPaymentCents,
      convertedAmount: null,
      label: 'Échéance prêt',
      payee: 'Banque',
      note: null,
      status: 'cleared',
      splits: [
        {
          amount: -detail.loan.monthlyPaymentCents,
          categoryId: null,
          note: null,
          tagIds: [],
        },
      ],
    })
    const decInst = detail.installments[11]!
    t.ok('loanLinkInstallment', { installmentId: decInst.id, transactionId: debit.id })
    const afterLink = t.ok('loanGet', { id: loan.id })
    expect(afterLink.installments[11]?.status).toBe('reconciled')
  })

  it('calcule budgets (report + alertes 80/100 %), objectifs, prévisions et scénarios « et si »', () => {
    const chk = t.ok('accountCreate', {
      name: 'Compte courant',
      type: 'checking',
      trackingMode: 'manual',
      institution: null,
      currency: 'EUR',
      openingBalance: 150_000,
      openingDate: '2026-01-01',
      iban: null,
      color: null,
      icon: null,
    })
    const livret = t.ok('accountCreate', {
      name: 'Livret A',
      type: 'savings',
      trackingMode: 'manual',
      institution: null,
      currency: 'EUR',
      openingBalance: 400_000,
      openingDate: '2026-01-01',
      iban: null,
      color: null,
      icon: null,
    })

    const groceries = t.categories.get('groceries')!
    t.ok('budgetSave', {
      categoryId: groceries,
      mode: 'fixed',
      amountCents: 40_000, // 400 €
      percentMicros: null,
      rollover: true,
      alert80: true,
      alert100: true,
      archived: false,
    })

    // Octobre 2026 : 300 € dépensés => report de +100 € en novembre (plafond effectif = 500 €)
    t.ok('transactionCreate', {
      accountId: chk.id,
      bookingDate: '2026-10-12',
      valueDate: null,
      amount: -30_000,
      convertedAmount: null,
      label: 'Courses Oct',
      payee: 'Biocoop',
      note: null,
      status: 'cleared',
      splits: [{ amount: -30_000, categoryId: groceries, note: null, tagIds: [] }],
    })
    // Novembre 2026 : 450 € dépensés => 90 % du plafond effectif 500 € => warning_80
    t.ok('transactionCreate', {
      accountId: chk.id,
      bookingDate: '2026-11-10',
      valueDate: null,
      amount: -45_000,
      convertedAmount: null,
      label: 'Courses Nov',
      payee: 'Biocoop',
      note: null,
      status: 'cleared',
      splits: [{ amount: -45_000, categoryId: groceries, note: null, tagIds: [] }],
    })

    const budgets = t.ok('budgetsList', { month: '2026-11' })
    expect(budgets).toHaveLength(1)
    expect(budgets[0]?.rolloverCents).toBe(10_000)
    expect(budgets[0]?.effectiveLimitCents).toBe(50_000)
    expect(budgets[0]?.spentCents).toBe(45_000)
    expect(budgets[0]?.alertLevel).toBe('warning_80')

    // Objectif d'épargne
    t.ok('goalSave', {
      name: 'Vacances',
      targetCents: 600_000,
      targetDate: '2027-07-01',
      accountId: livret.id,
      archived: false,
    })
    const goals = t.ok('goalsList', {})
    expect(goals[0]?.currentCents).toBe(400_000)

    // Prévision fin de mois & Scénario de base + variante « et si »
    const forecast = t.ok('forecastOverview', { currency: 'EUR' })
    expect(forecast.currentCheckingBalanceCents).toBe(75_000)

    const base = t.ok('scenarioGenerateBase', { horizonMonths: 12, currency: 'EUR' })
    const variant = t.ok('scenarioCloneVariant', {
      sourceScenarioId: base.scenario.id,
      name: 'Hausse épargne +200€',
    })
    t.ok('plannedItemSave', {
      scenarioId: variant.scenario.id,
      accountId: livret.id,
      label: 'Virement épargne mensuel',
      categoryId: null,
      amountCents: 20_000,
      periodicity: 'monthly',
      startDate: '2026-12-01',
      endDate: null,
      indexationMicros: 0,
      enabled: true,
    })

    const projBase = t.ok('scenarioSimulate', { scenarioId: base.scenario.id })
    const projVar = t.ok('scenarioSimulate', { scenarioId: variant.scenario.id })
    expect(projVar.points.at(-1)!.totalBalanceCents).toBeGreaterThan(
      projBase.points.at(-1)!.totalBalanceCents,
    )
  })
})
