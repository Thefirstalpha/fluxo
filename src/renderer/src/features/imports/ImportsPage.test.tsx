import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { BUILTIN_CSV_PROFILES } from '@shared/imports/profiles'
import type { AccountSummary } from '@shared/ledger/model'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { useSettingsStore } from '../../stores/settings'
import { installFakeApi, type FakeApi } from '../../test/fake-api'
import { renderWithQuery } from '../../test/render'
import ImportsPage from './ImportsPage'

const STATEMENT_ACCOUNT: AccountSummary = {
  id: '00000000-0000-7000-8000-000000000001',
  name: 'Compte Courant',
  type: 'checking',
  trackingMode: 'statement',
  institution: 'BoursoBank',
  currency: 'EUR',
  openingBalance: 1000_00,
  openingDate: '2026-11-01',
  ibanMasked: 'FR76 •••• •••• 0189',
  color: '#0977cb',
  icon: 'landmark',
  archived: false,
  sortOrder: 0,
  balance: 1000_00,
  reconciledBalance: 1000_00,
  transactionCount: 0,
  lastTransactionDate: null,
}

let api: FakeApi

beforeEach(() => {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, ready: true })
  api = installFakeApi()
  api.ledger.accountsList.mockResolvedValue({ ok: true, value: [STATEMENT_ACCOUNT] })
  api.imports.profilesList.mockResolvedValue({ ok: true, value: [...BUILTIN_CSV_PROFILES] })
  api.imports.batchesList.mockResolvedValue({ ok: true, value: [] })
})

describe('ImportsPage', () => {
  it('enchaîne fichier → aperçu avec écart de solde → validation → résultat', async () => {
    api.imports.pickFile.mockResolvedValue({
      ok: true,
      token: 'a'.repeat(32),
      fileName: 'releve.csv',
      extension: '.csv',
      sizeBytes: 512,
      detectedFormat: 'csv',
    })
    api.imports.preview.mockResolvedValue({
      ok: true,
      preview: {
        previewId: 'b'.repeat(32),
        accountId: STATEMENT_ACCOUNT.id,
        accountCurrency: 'EUR',
        accountType: 'checking',
        fileName: 'releve.csv',
        format: 'csv',
        encoding: 'utf-8',
        profile: 'builtin:boursobank',
        periodStart: '2026-11-10',
        periodEnd: '2026-11-12',
        openingBalance: 1000_00,
        closingBalance: 900_00,
        projectedBalance: 950_00,
        discrepancy: -50_00,
        counts: {
          total: 2,
          newCount: 1,
          exactDuplicateCount: 1,
          fuzzyDuplicateCount: 0,
          pendingCount: 0,
          skippedLines: 0,
        },
        overlappingAdjustments: [],
        warnings: [],
        csvInspection: {
          delimiter: ';',
          skipRows: 0,
          hasHeader: true,
          headers: ['dateOp', 'label', 'amount'],
          sampleRows: [['2026-11-10', 'COURSES', '-50,00']],
          suggestedProfileId: 'builtin:boursobank',
          suggestedConfig: BUILTIN_CSV_PROFILES[0]!.config,
        },
        rows: [
          {
            index: 0,
            bookingDate: '2026-11-10',
            valueDate: null,
            amount: -50_00,
            currency: 'EUR',
            labelRaw: 'COURSES BIO',
            payee: null,
            note: null,
            status: 'cleared',
            matchKind: 'new',
            defaultAction: 'import',
          },
          {
            index: 1,
            bookingDate: '2026-11-12',
            valueDate: null,
            amount: -12_00,
            currency: 'EUR',
            labelRaw: 'BOULANGERIE',
            payee: null,
            note: null,
            status: 'cleared',
            matchKind: 'exact-duplicate',
            defaultAction: 'skip',
            matchedTransaction: {
              id: '00000000-0000-7000-8000-000000000099',
              bookingDate: '2026-11-12',
              amount: -12_00,
              label: 'BOULANGERIE',
              status: 'cleared',
            },
          },
        ],
      },
    })
    api.imports.commit.mockResolvedValue({
      ok: true,
      value: {
        batchId: '00000000-0000-7000-8000-000000000123',
        insertedCount: 1,
        duplicateCount: 1,
        skippedCount: 1,
        replacedAdjustmentCount: 0,
        adjustmentTransactionId: '00000000-0000-7000-8000-000000000124',
        savedProfile: null,
      },
    })

    renderWithQuery(<ImportsPage />)

    fireEvent.click(await screen.findByRole('button', { name: /Choisir un fichier/ }))
    expect(await screen.findByText(/releve\.csv/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Analyser et afficher l’aperçu/ }))
    expect(await screen.findByText('COURSES BIO')).toBeInTheDocument()
    expect(screen.getByText(/Écart de solde détecté/)).toBeInTheDocument()

    // Cocher la création d'un ajustement exige une note obligatoire
    fireEvent.click(screen.getByRole('checkbox', { name: /Créer une écriture d’ajustement/ }))
    fireEvent.click(screen.getByRole('button', { name: /Importer 1 opération/ }))
    expect(
      await screen.findByText(/Une note est obligatoire pour créer un ajustement/),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/Note obligatoire de l’ajustement/), {
      target: { value: 'Relevé semaine précédente manquant' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Importer 1 opération/ }))

    expect(await screen.findByText('Import terminé')).toBeInTheDocument()
    expect(screen.getByText(/1 opération importée, 1 doublon écarté/)).toBeInTheDocument()
    expect(api.imports.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        previewId: 'b'.repeat(32),
        createAdjustment: { note: 'Relevé semaine précédente manquant' },
      }),
    )
  })
})
