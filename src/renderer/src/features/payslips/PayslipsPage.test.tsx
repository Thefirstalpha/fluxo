import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createFakeApi, installFakeApi } from '../../test/fake-api'
import { renderWithQuery } from '../../test/render'
import PayslipsPage from './PayslipsPage'

vi.mock('../../lib/charts/EChart', () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} />,
}))

describe('PayslipsPage (M6)', () => {
  it('affiche le bulletin détaillé, l’avertissement légal et permet d’ouvrir le tableau de bord et le simulateur', async () => {
    const api = installFakeApi(createFakeApi())

    const baseItem = {
      id: '0192f0c8-0000-7000-8000-000000000011',
      contractId: '0192f0c8-0000-7000-8000-000000000010',
      contractTitle: 'Ingénieur CDI',
      employerId: '0192f0c8-0000-7000-8000-000000000009',
      employerName: 'Entreprise Exemple SAS',
      period: '2026-11',
      paymentDate: '2026-11-28',
      countryPack: 'fr' as const,
      currency: 'EUR',
      totalsOnly: false,
      baseSalary: 340_000,
      gross: 340_000,
      employeeContributions: 75_480,
      employerContributions: 142_800,
      employerCost: 482_800,
      netBeforeTax: 264_520,
      taxableNet: 274_210,
      socialNet: 264_520,
      withholdingRateMicros: 75_000,
      withholdingPersonalized: true,
      withholdingTax: 20_566,
      otherAdjustments: 0,
      netPaid: 243_954,
      transactionId: null,
      matchedTransactionLabel: null,
      matchedTransactionDate: null,
      matchedTransactionAmount: null,
      sourceOrigin: 'user' as const,
      issueCount: 0,
      errorCount: 0,
    }

    api.ledger.payslipsList.mockResolvedValue({ ok: true, value: [baseItem] })
    api.ledger.salaryDashboard.mockResolvedValue({
      ok: true,
      value: {
        currency: 'EUR',
        contracts: [],
        months: [
          {
            payslipId: baseItem.id,
            contractId: baseItem.contractId,
            contractTitle: baseItem.contractTitle,
            period: '2026-11',
            gross: 340_000,
            employeeContributions: 75_480,
            employerContributions: 142_800,
            employerCost: 482_800,
            netBeforeTax: 264_520,
            taxableNet: 274_210,
            socialNet: 264_520,
            withholdingRateMicros: 75_000,
            withholdingTax: 20_566,
            netPaid: 243_954,
            variableTotal: 0,
            onCallTotal: 0,
            overtimeTotal: 0,
            thirteenthMonthTotal: 0,
            bonusesTotal: 0,
            effectiveContributionRateMicros: 222_000,
          },
        ],
        annualRecaps: [
          {
            year: 2026,
            monthCount: 1,
            gross: 340_000,
            employeeContributions: 75_480,
            employerContributions: 142_800,
            employerCost: 482_800,
            netBeforeTax: 264_520,
            taxableNet: 274_210,
            socialNet: 264_520,
            withholdingTax: 20_566,
            otherAdjustments: 0,
            netPaid: 243_954,
            variableTotal: 0,
            onCallTotal: 0,
            overtimeTotal: 0,
            thirteenthMonthTotal: 0,
            bonusesTotal: 0,
            hoursHundredths: 15_167,
            effectiveContributionRateMicros: 222_000,
            effectiveWithholdingRateMicros: 75_000,
            decemberYtdGross: null,
            decemberYtdTaxableNet: null,
            decemberYtdWithholding: null,
            decemberYtdHoursHundredths: null,
            hasDecemberYtdMismatch: false,
          },
        ],
        latestPayslip: null,
      },
    })

    renderWithQuery(<PayslipsPage />)

    expect(
      await screen.findByText(/Fluxo n’est ni un logiciel de paie ni un conseiller fiscal/i),
    ).toBeInTheDocument()
    expect(await screen.findByText(/Tous les contrôles arithmétiques/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Du brut au net/i).length).toBeGreaterThanOrEqual(2)

    // Onglet Simulateur
    fireEvent.click(screen.getByRole('radio', { name: /Simulateur/i }))
    const deltaInput = screen.getByLabelText(/Variation du brut fixe/i)
    fireEvent.change(deltaInput, { target: { value: '200' } })
    expect(screen.getByText(/3\s*600,00/)).toBeInTheDocument()

    // Onglet Tableau de bord
    fireEvent.click(screen.getByRole('radio', { name: /Tableau de bord/i }))
    expect(await screen.findByText(/Récapitulatif annuel/i)).toBeInTheDocument()
  })
})
