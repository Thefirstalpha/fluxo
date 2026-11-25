import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ExtractedPayslipDraft } from '@shared/documents/model'
import type { LedgerInput, LedgerMethod, LedgerOutput } from '@shared/ledger/api'
import type { LedgerResult } from '@shared/ledger/model'
import { openTestLedger, type TestLedger } from '../../data/ledger/testing'
import { resolveOrUpdateContractForPayslip } from './contract-resolver'

let t: TestLedger

beforeEach(() => {
  t = openTestLedger()
})

afterEach(() => {
  t.close()
})

function fakeVault() {
  return {
    ledger<M extends LedgerMethod>(
      method: M,
      input: LedgerInput<M>,
    ): Promise<LedgerResult<LedgerOutput<M>>> {
      return Promise.resolve(t.ledger.run(method, input))
    },
  }
}

function makeDraft(overrides: Partial<ExtractedPayslipDraft> = {}): ExtractedPayslipDraft {
  return {
    kind: 'payslip',
    employerName: 'Nova Conseil SAS',
    employerSiret: '90123456700018',
    contractTitle: null,
    contractType: null,
    executiveStatus: null,
    collectiveAgreement: null,
    contractStartDate: null,
    contractEndDate: null,
    isFinalSettlement: false,
    period: '2025-02',
    paymentDate: '2025-02-28',
    currency: 'EUR',
    baseHoursHundredths: 15_167,
    hourlyRate: null,
    baseSalary: 320_000,
    gross: 320_000,
    employeeContributions: 70_400,
    employerContributions: 134_400,
    netBeforeTax: 249_600,
    taxableNet: 256_000,
    socialNet: 240_000,
    withholdingRateMicros: 80_000,
    withholdingPersonalized: true,
    withholdingBase: 256_000,
    withholdingTax: 20_480,
    otherAdjustments: 0,
    netPaid: 229_120,
    ytdGross: null,
    ytdTaxableNet: null,
    ytdWithholding: null,
    ytdHoursHundredths: null,
    lines: [],
    fieldZones: {},
    missingFields: [],
    overallConfidence: 0.95,
    needsAiAssist: false,
    ...overrides,
  }
}

describe('resolveOrUpdateContractForPayslip', () => {
  it('déduplique la société par SIRET ou nom normalisé et ajuste début + fin avec le STC', async () => {
    const vault = fakeVault()

    // 1. Premier bulletin importé sans SIRET (ex: Février 2025) -> crée société + contrat générique.
    const r1 = await resolveOrUpdateContractForPayslip(vault, {
      draft: makeDraft({
        employerName: '  Nova   Conséil  SAS ',
        employerSiret: null,
        period: '2025-02',
      }),
    })
    expect(r1).toMatchObject({
      createdEmployer: true,
      createdContract: true,
      updatedContract: false,
    })

    // 2. Bulletin de janvier sans date d'entrée explicite -> recule startDate de 2025-02-01 à 2025-01-01.
    const r2 = await resolveOrUpdateContractForPayslip(vault, {
      draft: makeDraft({
        employerName: 'NOVA CONSEIL SAS',
        employerSiret: '90123456700018',
        period: '2025-01',
      }),
    })
    expect(r2).toMatchObject({
      contractId: r1?.contractId,
      createdEmployer: false,
      createdContract: false,
      updatedContract: true,
    })

    // 3. Solde de tout compte en mai avec dates exactes d'entrée/sortie + poste + convention -> affine startDate + endDate + titre.
    const r3 = await resolveOrUpdateContractForPayslip(vault, {
      draft: makeDraft({
        employerName: 'Nova Conseil',
        employerSiret: '90123456700018',
        contractTitle: 'Ingénieure Produit Senior',
        collectiveAgreement: 'Syntec',
        contractStartDate: '2025-01-06',
        contractEndDate: '2025-05-31',
        isFinalSettlement: true,
        period: '2025-05',
      }),
    })
    expect(r3).toMatchObject({
      contractId: r1?.contractId,
      createdEmployer: false,
      createdContract: false,
      updatedContract: true,
    })

    const employers = t.ok('employersList', { includeArchived: true })
    expect(employers).toHaveLength(1)
    expect(employers[0]?.siret).toBe('90123456700018')

    const contracts = t.ok('contractsList', { includeArchived: true })
    expect(contracts).toHaveLength(1)
    expect(contracts[0]).toMatchObject({
      id: r1?.contractId,
      title: 'Ingénieure Produit Senior',
      collectiveAgreement: 'Syntec',
      startDate: '2025-01-06',
      endDate: '2025-05-31',
    })
  })

  it('crée un nouveau contrat distinct quand un employeur réembauche après un contrat clos', async () => {
    const vault = fakeVault()

    const first = await resolveOrUpdateContractForPayslip(vault, {
      draft: makeDraft({
        contractTitle: 'CDD Renfort',
        contractType: 'cdd',
        contractStartDate: '2024-03-01',
        contractEndDate: '2024-06-30',
        isFinalSettlement: true,
        period: '2024-06',
      }),
    })
    expect(first?.createdEmployer).toBe(true)
    expect(first?.createdContract).toBe(true)

    const second = await resolveOrUpdateContractForPayslip(vault, {
      draft: makeDraft({
        contractTitle: 'CDI Titulaire',
        contractType: 'cdi',
        contractStartDate: '2025-01-06',
        contractEndDate: null,
        isFinalSettlement: false,
        period: '2025-01',
      }),
    })
    expect(second?.createdEmployer).toBe(false)
    expect(second?.createdContract).toBe(true)
    expect(second?.contractId).not.toBe(first?.contractId)

    const contracts = t.ok('contractsList', { includeArchived: true })
    expect(contracts).toHaveLength(2)
  })
})
