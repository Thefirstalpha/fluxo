import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultContributionLines } from '@shared/payslip'
import { openTestLedger, type TestLedger } from './testing'

let t: TestLedger

beforeEach(() => {
  t = openTestLedger()
})

afterEach(() => {
  t.close()
})

describe('Salaires & bulletins de paie (M6)', () => {
  it('crée employeur, contrat et bulletin avec NIR masqué dans la lecture et dans l’audit', () => {
    const emp = t.ok('employerCreate', {
      name: 'Atelier Exemple SAS',
      siret: '12345678900014',
      address: '12 rue des Lilas, 75011 Paris',
    })

    const employers = t.ok('employersList', {})
    expect(employers[0]?.siret).toBe('12345678900014')
    expect(employers[0]?.addressMasked).toBe('••••••, 75011 Paris')
    expect(t.ok('employerRevealAddress', { id: emp.id })).toBe('12 rue des Lilas, 75011 Paris')

    const contract = t.ok('contractCreate', {
      employerId: emp.id,
      title: 'Développeur senior',
      contractType: 'cdi',
      executiveStatus: 'cadre',
      workTime: 'full_time',
      workTimeRatioMicros: 1_000_000,
      monthlyHoursHundredths: 15_167,
      collectiveAgreement: 'Syntec',
      classification: 'Cadre 2.2',
      startDate: '2025-01-01',
      endDate: null,
      defaultBaseSalary: 350_000,
      currency: 'EUR',
      countryPack: 'fr',
      employeeNir: '1 85 05 78 006 084 91',
    })

    const contracts = t.ok('contractsList', {})
    expect(contracts[0]?.nirMasked).toBe('1 85 •• •• ••• ••• 91')
    expect(t.ok('contractRevealNir', { id: contract.id })).toBe('185057800608491')

    const contribs = buildDefaultContributionLines(350_000)
    const empContrib = contribs.reduce((s, l) => s + l.employeeAmount, 0)
    const erContrib = contribs.reduce((s, l) => s + l.employerAmount, 0)
    const netBeforeTax = 350_000 - empContrib
    const taxableNet = Math.round(netBeforeTax * 1.036)
    const pasTax = Math.round((taxableNet * 75_000) / 1_000_000)
    const netPaid = netBeforeTax - pasTax

    const saved = t.ok('payslipSave', {
      contractId: contract.id,
      period: '2026-01',
      paymentDate: '2026-01-28',
      countryPack: 'fr',
      currency: 'EUR',
      totalsOnly: false,
      baseHoursHundredths: 15_167,
      hourlyRate: null,
      baseSalary: 350_000,
      gross: 350_000,
      employeeContributions: empContrib,
      employerContributions: erContrib,
      netBeforeTax,
      taxableNet,
      socialNet: netBeforeTax,
      withholdingRateMicros: 75_000,
      withholdingPersonalized: true,
      withholdingBase: null,
      withholdingTax: pasTax,
      otherAdjustments: 0,
      netPaid,
      ytdGross: 350_000,
      ytdTaxableNet: taxableNet,
      ytdWithholding: pasTax,
      ytdHoursHundredths: 15_167,
      employeeNir: '185057800608491',
      employeeAddress: '12 rue des Lilas, 75011 Paris',
      notes: null,
      lines: contribs,
    })

    expect(saved.issues).toEqual([])
    expect(saved.nirMasked).toBe('1 85 •• •• ••• ••• 91')
    expect(saved.addressMasked).toBe('••••••, 75011 Paris')
    expect(t.ok('payslipRevealSensitive', { id: saved.id })).toEqual({
      nir: '185057800608491',
      address: '12 rue des Lilas, 75011 Paris',
    })

    // L'audit ne contient jamais le NIR ni l'adresse complète en clair.
    const contractAudit = t.ok('auditList', { entity: 'contract' })
    expect(JSON.stringify(contractAudit)).not.toContain('185057800608491')
    const payslipAudit = t.ok('auditList', { entity: 'payslip' })
    expect(JSON.stringify(payslipAudit)).not.toContain('185057800608491')
    expect(JSON.stringify(payslipAudit)).not.toContain('12 rue des Lilas')
  })

  it('duplique le mois précédent sans reconduire les primes ponctuelles et met à jour les cumuls', () => {
    const emp = t.ok('employerCreate', { name: 'Société Alpha', siret: null, address: null })
    const contract = t.ok('contractCreate', {
      employerId: emp.id,
      title: 'CDI',
      contractType: 'cdi',
      executiveStatus: 'cadre',
      workTime: 'full_time',
      workTimeRatioMicros: 1_000_000,
      monthlyHoursHundredths: 15_167,
      collectiveAgreement: null,
      classification: null,
      startDate: '2026-01-01',
      endDate: null,
      defaultBaseSalary: 300_000,
      currency: 'EUR',
      countryPack: 'fr',
      employeeNir: null,
    })

    const jan = t.ok('payslipSave', {
      contractId: contract.id,
      period: '2026-01',
      paymentDate: '2026-01-30',
      countryPack: 'fr',
      currency: 'EUR',
      totalsOnly: true,
      baseHoursHundredths: 15_167,
      hourlyRate: null,
      baseSalary: 300_000,
      gross: 350_000,
      employeeContributions: 77_000,
      employerContributions: 147_000,
      netBeforeTax: 273_000,
      taxableNet: 283_000,
      socialNet: 273_000,
      withholdingRateMicros: 80_000,
      withholdingPersonalized: true,
      withholdingBase: null,
      withholdingTax: 22_640,
      otherAdjustments: 0,
      netPaid: 250_360,
      ytdGross: 350_000,
      ytdTaxableNet: 283_000,
      ytdWithholding: 22_640,
      ytdHoursHundredths: 15_167,
      employeeNir: null,
      employeeAddress: null,
      notes: null,
      lines: [
        {
          section: 'variable',
          itemKind: 'performance-bonus',
          label: 'Prime annuelle',
          quantityHundredths: null,
          baseAmount: null,
          employeeRateMicros: null,
          employeeAmount: 50_000,
          employerRateMicros: null,
          employerAmount: 0,
          taxable: true,
        },
      ],
    })

    const draft = t.ok('payslipDuplicatePrevious', {
      sourcePayslipId: jan.id,
      targetPeriod: '2026-02',
    })
    expect(draft.period).toBe('2026-02')
    expect(draft.paymentDate).toBe('2026-02-28') // 30 janvier -> 28 février
    expect(draft.lines).toEqual([])
    expect(draft.gross).toBe(300_000)
    expect(draft.ytdGross).toBe(350_000 + 300_000)

    const feb = t.ok('payslipSave', draft)
    expect(feb.errorCount).toBe(0)

    const overview = t.ok('salaryDashboard', { currency: 'EUR' })
    expect(overview.months).toHaveLength(2)
    expect(overview.annualRecaps[0]).toMatchObject({
      year: 2026,
      monthCount: 2,
      gross: 650_000,
      hasDecemberYtdMismatch: false,
    })
  })

  it('propose le rapprochement avec le virement bancaire et signale les écarts', () => {
    const emp = t.ok('employerCreate', { name: 'Société Beta', siret: null, address: null })
    const contract = t.ok('contractCreate', {
      employerId: emp.id,
      title: 'CDI',
      contractType: 'cdi',
      executiveStatus: 'non_cadre',
      workTime: 'full_time',
      workTimeRatioMicros: 1_000_000,
      monthlyHoursHundredths: null,
      collectiveAgreement: null,
      classification: null,
      startDate: '2026-01-01',
      endDate: null,
      defaultBaseSalary: 250_000,
      currency: 'EUR',
      countryPack: 'fr',
      employeeNir: null,
    })

    const acc = t.ok('accountCreate', {
      name: 'Compte courant',
      type: 'checking',
      trackingMode: 'manual',
      institution: null,
      currency: 'EUR',
      openingBalance: 0,
      openingDate: '2026-01-01',
      iban: null,
      color: null,
      icon: null,
    })

    const salaryTx = t.ok('transactionCreate', {
      accountId: acc.id,
      bookingDate: '2026-03-30',
      valueDate: null,
      amount: 184_550, // écart de +50 centimes vs 184 500
      convertedAmount: null,
      label: 'VIR SALAIRE BETA',
      payee: 'Société Beta',
      status: 'cleared',
      note: null,
      splits: [{ categoryId: null, amount: 184_550, note: null, tagIds: [] }],
    })

    const payslip = t.ok('payslipSave', {
      contractId: contract.id,
      period: '2026-03',
      paymentDate: '2026-03-28',
      countryPack: 'fr',
      currency: 'EUR',
      totalsOnly: true,
      baseHoursHundredths: null,
      hourlyRate: null,
      baseSalary: 250_000,
      gross: 250_000,
      employeeContributions: 55_000,
      employerContributions: 95_000,
      netBeforeTax: 195_000,
      taxableNet: 200_000,
      socialNet: 195_000,
      withholdingRateMicros: 52_500,
      withholdingPersonalized: true,
      withholdingBase: null,
      withholdingTax: 10_500,
      otherAdjustments: 0,
      netPaid: 184_500,
      ytdGross: null,
      ytdTaxableNet: null,
      ytdWithholding: null,
      ytdHoursHundredths: null,
      employeeNir: null,
      employeeAddress: null,
      notes: null,
      lines: [],
    })

    const candidates = t.ok('payslipTransferCandidates', { id: payslip.id })
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      transactionId: salaryTx.id,
      diffCents: 50,
      daysDiff: 2,
    })

    const linked = t.ok('payslipLinkTransaction', {
      id: payslip.id,
      transactionId: salaryTx.id,
    })
    expect(linked.transactionId).toBe(salaryTx.id)
    expect(linked.matchedTransactionAmount).toBe(184_550)
  })
})
