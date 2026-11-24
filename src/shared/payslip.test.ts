import { describe, expect, it } from 'vitest'
import { checkPayslip, type PayslipSummary } from './payslip'

const valid: PayslipSummary = {
  period: '2026-12',
  baseSalary: 340_000,
  extras: [
    { kind: 'on-call', amount: 24_000 },
    { kind: 'thirteenth-month', amount: 340_000 },
  ],
  gross: 704_000,
  employeeContributions: 156_288,
  netBeforeTax: 547_712,
  taxableNet: 567_776,
  withholdingRate: 0.08,
  withholdingTax: 45_422,
  otherAdjustments: -5_000,
  netPaid: 497_290,
}

describe('checkPayslip', () => {
  it('valide un bulletin cohérent', () => {
    expect(checkPayslip(valid)).toEqual([])
  })

  it('tolère les arrondis de quelques centimes', () => {
    expect(checkPayslip({ ...valid, netPaid: valid.netPaid + 1 })).toEqual([])
  })

  it('signale chaque incohérence avec la valeur attendue', () => {
    const issues = checkPayslip({ ...valid, gross: 700_000, withholdingTax: 40_000 })
    expect(issues.map((issue) => issue.code)).toEqual([
      'GROSS_MISMATCH',
      'NET_BEFORE_TAX_MISMATCH',
      'WITHHOLDING_MISMATCH',
      'NET_PAID_MISMATCH',
    ])
    expect(issues[0]).toMatchObject({ expected: 704_000, actual: 700_000 })
  })
})
