import { describe, expect, it } from 'vitest'
import { EXPENSE_CATEGORY_IDS } from '../categories'
import { sum } from '../money'
import { DEMO_ACCOUNTS, generateDemoLedger, splitAmount } from './demo-ledger'

const ledger = generateDemoLedger({ endMonth: '2026-11', count: 18 })

describe('generateDemoLedger', () => {
  it('est déterministe : même graine, mêmes opérations', () => {
    expect(generateDemoLedger({ endMonth: '2026-11', count: 18 })).toEqual(ledger)
    expect(generateDemoLedger({ endMonth: '2026-11', count: 18, seed: 7 })).not.toEqual(ledger)
  })

  it('reproduit exactement les synthèses mensuelles du tableau de bord', () => {
    for (const summary of ledger.months) {
      const ofMonth = ledger.transactions.filter((t) => t.date.startsWith(summary.month))
      for (const category of EXPENSE_CATEGORY_IDS) {
        const spent = -sum(ofMonth.filter((t) => t.category === category).map((t) => t.amount))
        expect(spent, `${summary.month} / ${category}`).toBe(summary.byCategory[category])
      }
      const income = sum(
        ofMonth
          .filter((t) => t.category === 'salary' || t.category === 'refunds')
          .map((t) => t.amount),
      )
      expect(income, summary.month).toBe(summary.income)
    }
  })

  it('les virements d’épargne et internes s’annulent (ni dépense ni revenu)', () => {
    const savings = ledger.transactions.filter((t) => t.category === 'savings')
    expect(sum(savings.map((t) => t.amount))).toBe(0)
    const transfers = ledger.transactions.filter((t) => t.category === 'transfer')
    expect(transfers.length).toBeGreaterThan(0)
    expect(sum(transfers.map((t) => t.amount))).toBe(0)
  })

  it('le compte espèces reste positif (retraits au distributeur)', () => {
    let balance = DEMO_ACCOUNTS.find((a) => a.key === 'cash')?.openingBalance ?? 0
    for (const transaction of ledger.transactions.filter((t) => t.account === 'cash')) {
      balance += transaction.amount
      expect(balance, transaction.date).toBeGreaterThanOrEqual(0)
    }
  })

  it('produit des dates valides, triées, et des montants entiers non nuls', () => {
    const dates = ledger.transactions.map((t) => t.date)
    expect([...dates].sort()).toEqual(dates)
    for (const transaction of ledger.transactions) {
      expect(Number.isInteger(transaction.amount)).toBe(true)
      expect(transaction.amount).not.toBe(0)
      const date = new Date(`${transaction.date}T00:00:00Z`)
      expect(date.toISOString().slice(0, 10)).toBe(transaction.date)
    }
  })
})

describe('splitAmount', () => {
  it('découpe en parts entières ≥ 1 centime dont la somme est exacte', () => {
    let state = 0.37
    const random = () => (state = (state * 9301 + 0.49297) % 1)
    for (const [total, parts] of [
      [100_000, 7],
      [3, 5],
      [1, 1],
      [99_999, 3],
    ] as const) {
      const amounts = splitAmount(total, parts, random)
      expect(sum(amounts)).toBe(total)
      for (const amount of amounts) {
        expect(Number.isInteger(amount)).toBe(true)
        expect(amount).toBeGreaterThanOrEqual(1)
      }
    }
  })
})
