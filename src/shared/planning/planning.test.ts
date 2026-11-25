import { describe, expect, it } from 'vitest'
import { computeLoanSchedule, simulateEarlyRepayment } from './amortization'
import { projectScenario } from './simulation'

describe('computeLoanSchedule & simulateEarlyRepayment (M8)', () => {
  it('amortit un prêt immobilier français exactement au centime près sans flottant résiduel', () => {
    const sched = computeLoanSchedule({
      initialCapital: 20_000_000, // 200 000 €
      nominalRateMicros: 35_000, // 3,50 %
      insuranceMonthlyCents: 4_500, // 45 €/mois
      durationMonths: 240,
      periodicity: 'monthly',
      startDate: '2025-01-05',
    })

    expect(sched.installments).toHaveLength(240)
    const sumPrincipal = sched.installments.reduce((s, r) => s + r.principalCents, 0)
    expect(sumPrincipal).toBe(20_000_000)
    expect(sched.installments.at(-1)?.remainingPrincipalCents).toBe(0)
    expect(sched.installments[0]?.dueDate).toBe('2025-01-05')
    expect(sched.installments.at(-1)?.dueDate).toBe('2044-12-05')
    // Mensualité théorique 200k€ @ 3,50% / 240 mois ≈ 1 159,92 € + 45 € = ~1 204,92 €
    expect(sched.monthlyPaymentCents).toBeGreaterThan(120_000)
    expect(sched.monthlyPaymentCents).toBeLessThan(121_000)
  })

  it('gère les prêts à taux 0 % et périodicité trimestrielle', () => {
    const sched = computeLoanSchedule({
      initialCapital: 1_200_000, // 12 000 €
      nominalRateMicros: 0,
      insuranceMonthlyCents: 0,
      durationMonths: 24,
      periodicity: 'quarterly',
      startDate: '2025-01-31',
    })

    expect(sched.installments).toHaveLength(8)
    expect(sched.totalInterestCents).toBe(0)
    expect(sched.installments.reduce((s, r) => s + r.principalCents, 0)).toBe(1_200_000)
    expect(sched.installments[1]?.dueDate).toBe('2025-04-30') // borné fin avril
  })

  it('calcule les économies d’intérêts et de durée d’un remboursement anticipé', () => {
    const simDuration = simulateEarlyRepayment({
      initialCapital: 15_000_000,
      nominalRateMicros: 40_000,
      insuranceMonthlyCents: 3_000,
      durationMonths: 180,
      periodicity: 'monthly',
      startDate: '2025-01-01',
      extraPrincipalCents: 2_000_000, // 20 000 € à l'échéance 12
      atInstallmentNumber: 12,
      mode: 'reduce_duration',
    })

    expect(simDuration.monthsSaved).toBeGreaterThan(20)
    expect(simDuration.interestSavedCents).toBeGreaterThan(500_000)

    const simPayment = simulateEarlyRepayment({
      initialCapital: 15_000_000,
      nominalRateMicros: 40_000,
      insuranceMonthlyCents: 3_000,
      durationMonths: 180,
      periodicity: 'monthly',
      startDate: '2025-01-01',
      extraPrincipalCents: 2_000_000,
      atInstallmentNumber: 12,
      mode: 'reduce_payment',
    })
    expect(simPayment.monthsSaved).toBe(0)
    expect(simPayment.newMonthlyPaymentCents).toBeLessThan(113_953)
  })
})

describe('projectScenario (M8 simulation)', () => {
  it('respecte les invariants mois 0 = solde réel, indexation annuelle et intérêts épargne', () => {
    const proj = projectScenario({
      scenarioId: 'sc-1',
      scenarioName: 'Base',
      currency: 'EUR',
      startMonth: '2026-01',
      horizonMonths: 24,
      accounts: [
        { id: 'acc-chk', name: 'Compte courant', type: 'checking', balanceCents: 200_000 },
        {
          id: 'acc-sav',
          name: 'Livret A',
          type: 'savings',
          balanceCents: 1_000_000,
          interestRateMicros: 30_000, // 3,00 % / an
        },
      ],
      items: [
        {
          id: 'it-sal',
          scenarioId: 'sc-1',
          accountId: 'acc-chk',
          label: 'Salaire',
          categoryId: null,
          amountCents: 300_000,
          periodicity: 'monthly',
          startDate: '2026-01-01',
          endDate: null,
          indexationMicros: 0,
          origin: 'salary',
          sourceRefId: null,
          enabled: true,
        },
        {
          id: 'it-nrg',
          scenarioId: 'sc-1',
          accountId: 'acc-chk',
          label: 'Énergie',
          categoryId: null,
          amountCents: -20_000,
          periodicity: 'monthly',
          startDate: '2026-01-01',
          endDate: null,
          indexationMicros: 100_000, // +10 % / an
          origin: 'recurrence',
          sourceRefId: null,
          enabled: true,
        },
      ],
    })

    expect(proj.points).toHaveLength(25)
    // Mois 0 == soldes réels.
    expect(proj.points[0]?.totalBalanceCents).toBe(1_200_000)
    // Mois 1..12 : Énergie à -20 000 cts ; Mois 13 : Énergie indexée à -22 000 cts (+10 %).
    expect(proj.points[1]?.outflowsCents).toBe(20_000)
    expect(proj.points[13]?.outflowsCents).toBe(22_000)
    // Invariant : mois m = mois m-1 + flux + intérêts.
    for (let i = 1; i < proj.points.length; i++) {
      const prev = proj.points[i - 1]!
      const cur = proj.points[i]!
      expect(cur.totalBalanceCents).toBe(
        prev.totalBalanceCents + cur.inflowsCents - cur.outflowsCents + cur.interestCents,
      )
    }
  })
})
