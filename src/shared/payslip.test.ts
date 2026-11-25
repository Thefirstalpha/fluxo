import { describe, expect, it } from 'vitest'
import {
  buildDefaultContributionLines,
  checkPayslip,
  checkPayslipDetailed,
  isValidNir,
  maskAddress,
  maskNir,
  simulatePayslipAdjustment,
  type PayslipSummary,
} from './payslip'

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

describe('NIR et masquage', () => {
  it('valide la clé modulo 97 d’un NIR et masque les segments sensibles', () => {
    // 1 85 05 78 006 084 : 1850578006084 % 97 = 6 -> clé = 97 - 6 = 91
    expect(isValidNir('1 85 05 78 006 084 91')).toBe(true)
    expect(isValidNir('1 85 05 78 006 084 99')).toBe(false)
    expect(maskNir('185057800608491')).toBe('1 85 •• •• ••• ••• 91')
    expect(maskAddress('12 rue des Lilas, 75011 Paris')).toBe('••••••, 75011 Paris')
  })
})

describe('checkPayslipDetailed et simulateur', () => {
  it('valide un bulletin détaillé avec cotisations France et cumuls annuels', () => {
    const contribs = buildDefaultContributionLines(360_000)
    const empSum = contribs.reduce((s, l) => s + l.employeeAmount, 0)
    const erSum = contribs.reduce((s, l) => s + l.employerAmount, 0)
    const netBeforeTax = 360_000 - empSum
    const taxableNet = Math.round(netBeforeTax * 1.035)
    const withholdingTax = Math.round((taxableNet * 80_000) / 1_000_000)
    const netPaid = netBeforeTax - withholdingTax

    const issues = checkPayslipDetailed(
      {
        countryPack: 'fr',
        period: '2026-02',
        totalsOnly: false,
        baseHoursHundredths: 15_167,
        hourlyRate: null,
        baseSalary: 340_000,
        gross: 360_000,
        employeeContributions: empSum,
        employerContributions: erSum,
        netBeforeTax,
        taxableNet,
        socialNet: netBeforeTax,
        withholdingRateMicros: 80_000,
        withholdingBase: null,
        withholdingTax,
        otherAdjustments: 0,
        netPaid,
        ytdGross: 700_000,
        ytdTaxableNet: 260_000 + taxableNet,
        ytdWithholding: 20_800 + withholdingTax,
        ytdHoursHundredths: 30_334,
        lines: [
          {
            section: 'variable',
            itemKind: 'on-call',
            label: 'Astreinte week-end',
            quantityHundredths: null,
            baseAmount: null,
            employeeRateMicros: null,
            employeeAmount: 20_000,
            employerRateMicros: null,
            employerAmount: 0,
            taxable: true,
          },
          ...contribs,
        ],
      },
      [
        {
          period: '2026-01',
          gross: 340_000,
          taxableNet: 260_000,
          withholdingTax: 20_800,
          baseHoursHundredths: 15_167,
        },
      ],
    )
    expect(issues).toEqual([])
  })

  it('simule une augmentation brute et des heures sup défiscalisées en entiers', () => {
    const sim = simulatePayslipAdjustment(
      {
        gross: 340_000,
        employeeContributions: 75_480,
        employerContributions: 142_800,
        netBeforeTax: 264_520,
        taxableNet: 274_210,
        withholdingRateMicros: 80_000,
        otherAdjustments: -5_000,
      },
      { grossDeltaAmount: 20_000, taxFreeOvertime: 10_000 },
    )
    expect(sim.gross).toBe(370_000)
    expect(sim.deltaGross).toBe(30_000)
    expect(sim.deltaNetPaid).toBeGreaterThan(20_000)
    expect(Number.isInteger(sim.netPaid)).toBe(true)
    expect(sim.employerCost).toBe(sim.gross + sim.employerContributions)
  })
})
