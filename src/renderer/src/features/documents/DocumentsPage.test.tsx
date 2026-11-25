import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDefaultAiConfig } from '@shared/documents/ai'
import type { DocumentDetail, ExtractedPayslipDraft } from '@shared/documents/model'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { useSettingsStore } from '../../stores/settings'
import { installFakeApi } from '../../test/fake-api'
import { renderWithQuery } from '../../test/render'
import DocumentsPage from './DocumentsPage'

function samplePayslipDetail(overrides: Partial<ExtractedPayslipDraft> = {}): DocumentDetail {
  const draft: ExtractedPayslipDraft = {
    kind: 'payslip',
    employerName: 'Atelier Fluxo',
    employerSiret: '81234567800024',
    contractTitle: 'Développeur Full-Stack',
    contractType: 'cdi',
    executiveStatus: 'cadre',
    collectiveAgreement: 'Syntec',
    contractStartDate: '2026-01-05',
    contractEndDate: null,
    isFinalSettlement: false,
    period: '2026-11',
    paymentDate: '2026-11-28',
    currency: 'EUR',
    baseHoursHundredths: 15_167,
    hourlyRate: null,
    baseSalary: 360_000,
    gross: 360_000,
    employeeContributions: 79_200,
    employerContributions: 151_200,
    netBeforeTax: 280_800,
    taxableNet: 290_000,
    socialNet: 270_000,
    withholdingRateMicros: 75_000,
    withholdingPersonalized: true,
    withholdingBase: 290_000,
    withholdingTax: 21_750,
    otherAdjustments: 0,
    netPaid: 259_050,
    ytdGross: null,
    ytdTaxableNet: null,
    ytdWithholding: null,
    ytdHoursHundredths: null,
    lines: [],
    fieldZones: {
      netPaid: {
        confidence: 0.96,
        sourceZone: {
          page: 1,
          box: { x: 0.1, y: 0.6, width: 0.8, height: 0.04 },
          snippet: 'Net payé 2 590,50 €',
        },
      },
    },
    missingFields: [],
    overallConfidence: 0.95,
    needsAiAssist: false,
    ...overrides,
  }
  return {
    id: '01950000-0000-7000-8000-000000000001',
    kind: 'payslip',
    fileName: 'bulletin-nov-2026.pdf',
    mimeType: 'application/pdf',
    sha256: 'a'.repeat(64),
    pageCount: 1,
    status: needsReviewStatus(draft),
    extractionMethod: 'pdf-text',
    confidence: draft.overallConfidence,
    linkedEntityType: null,
    linkedEntityId: null,
    createdAt: '2026-11-25T10:00:00.000Z',
    updatedAt: '2026-11-25T10:00:00.000Z',
    draft,
    pages: [
      {
        pageNumber: 1,
        width: 595,
        height: 842,
        text: 'BULLETIN DE PAIE Novembre 2026 Net payé 2 590,50 EUR',
        items: [
          { text: 'BULLETIN DE PAIE', box: { x: 0.08, y: 0.1, width: 0.3, height: 0.03 } },
          { text: 'Net payé 2 590,50 EUR', box: { x: 0.08, y: 0.6, width: 0.5, height: 0.03 } },
        ],
      },
    ],
    hasOriginalBytes: true,
    previewImageDataUrl: null,
  }
}

function needsReviewStatus(draft: ExtractedPayslipDraft) {
  return draft.needsAiAssist ? ('needs_review' as const) : ('extracted' as const)
}

beforeEach(() => {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, ready: true })
})

describe('DocumentsPage (M7)', () => {
  it('sélectionne un bulletin PDF, affiche sa relecture côte à côte et l’enregistre dans Salaires', async () => {
    const api = installFakeApi()
    const detail = samplePayslipDetail()

    api.documents.pickFiles.mockResolvedValue([
      {
        ok: true,
        document: detail,
        duplicateOf: null,
        ocrMissingLanguage: null,
      },
    ])
    api.documents.list.mockResolvedValueOnce([]).mockResolvedValue([detail])
    api.documents.get.mockResolvedValue(detail)
    api.documents.commitPayslip.mockResolvedValue({
      ok: true,
      document: {
        ...detail,
        status: 'committed',
        linkedEntityType: 'payslip',
        linkedEntityId: 'p-1',
      },
      linkedEntityType: 'payslip',
      linkedEntityId: 'p-1',
    })

    renderWithQuery(<DocumentsPage />)
    expect(await screen.findByText(/Aucun document déposé/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Choisir des documents/i }))

    expect(await screen.findByText('Contrôles arithmétiques M6 conformes.')).toBeInTheDocument()
    expect(screen.getByLabelText(/Début de contrat/i)).toHaveValue('2026-01-05')
    expect(
      screen.getByRole('button', { name: /Exporter l’original avant purge/i }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Enregistrer ce bulletin/i }))
    await waitFor(() => expect(api.documents.commitPayslip).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/Bulletin enregistré dans Salaires/i)).toBeInTheDocument()
  })

  it('propose le tout-en-un par lot pour plusieurs bulletins et un solde de tout compte', async () => {
    const api = installFakeApi()
    const monthly = samplePayslipDetail({ period: '2025-01', contractStartDate: '2025-01-06' })
    const stcBase = samplePayslipDetail({
      period: '2025-05',
      contractStartDate: '2025-01-06',
      contractEndDate: '2025-05-31',
      isFinalSettlement: true,
    })
    const stc = {
      ...stcBase,
      id: '01950000-0000-7000-8000-000000000002',
      fileName: 'solde-tout-compte-mai-2025.pdf',
    }

    api.documents.list.mockResolvedValue([monthly, stc])
    api.documents.get.mockResolvedValue(stc)
    api.documents.commitPayslipBatch.mockResolvedValue({
      committedCount: 2,
      createdEmployers: 1,
      createdContracts: 1,
      updatedContracts: 1,
      skippedCount: 0,
      failedIds: [],
      results: [],
    })

    renderWithQuery(<DocumentsPage />)
    const batchBtn = await screen.findByRole('button', {
      name: /Tout enregistrer \(2 bulletins \/ STC\)/i,
    })
    expect(screen.getByRole('switch', { name: /Solde de tout compte/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByLabelText(/Fin de contrat/i)).toHaveValue('2025-05-31')

    fireEvent.click(batchBtn)
    await waitFor(() =>
      expect(api.documents.commitPayslipBatch).toHaveBeenCalledWith([monthly.id, stc.id]),
    )
    expect(
      await screen.findByText(/2 bulletin\(s\) enregistré\(s\) · 1 société\(s\) créée\(s\)/i),
    ).toBeInTheDocument()
  })

  it('propose le consentement IA explicite (ADR-022) uniquement quand l’extraction signale un besoin', async () => {
    const api = installFakeApi()
    const detail = samplePayslipDetail({ needsAiAssist: true, missingFields: ['gross'], gross: 0 })
    const aiCfg = { ...buildDefaultAiConfig(), provider: 'local' as const }

    api.documents.aiConfig.mockResolvedValue(aiCfg)
    api.documents.list.mockResolvedValue([detail])
    api.documents.get.mockResolvedValue(detail)
    api.documents.aiPreviewAssist.mockResolvedValue({
      ok: true,
      preview: {
        token: 'a'.repeat(32),
        provider: 'local',
        model: 'fluxo-local-heuristics',
        purpose: 'payslip',
        destinationLabel: 'Modèle local embarqué (hors-ligne)',
        anonymizedPayload: 'Salarié [NOM_1] · [NIR_1] · Net payé 2 590,50 €',
        redactions: [
          { category: 'name', count: 1 },
          { category: 'nir', count: 1 },
        ],
        estimatedInputTokens: 42,
        estimatedOutputTokens: 200,
        estimatedCostMicroUsd: 0,
        spentThisMonthMicroUsd: 0,
        monthlyCapMicroUsd: 5_000_000,
        exceedsCap: false,
        documentId: detail.id,
      },
    })
    api.documents.aiExecuteAssist.mockResolvedValue({
      ok: true,
      document: samplePayslipDetail({ needsAiAssist: false }),
      logEntry: {
        id: 'log-1',
        provider: 'local',
        model: 'fluxo-local-heuristics',
        purpose: 'payslip',
        documentId: detail.id,
        inputTokens: 42,
        outputTokens: 120,
        costMicroUsd: 0,
        payloadSha256: 'b'.repeat(64),
        redactions: [{ category: 'nir', count: 1 }],
        status: 'sent',
        createdAt: '2026-11-25T10:00:00.000Z',
      },
    })

    // Stub HTMLDialogElement.showModal / close dans happy-dom sans déclencher unbound-method.
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      value: vi.fn(function (this: HTMLDialogElement) {
        this.setAttribute('open', 'true')
      }),
      configurable: true,
    })
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      value: vi.fn(function (this: HTMLDialogElement) {
        this.removeAttribute('open')
      }),
      configurable: true,
    })

    renderWithQuery(<DocumentsPage />)
    const assistBtn = await screen.findByRole('button', { name: /Assister par IA/i })
    fireEvent.click(assistBtn)

    expect(await screen.findByText(/Aperçu & consentement avant envoi IA/i)).toBeInTheDocument()
    expect(screen.getByText(/Salarié \[NOM_1\]/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Envoyer cet extrait anonymisé/i }))
    await waitFor(() =>
      expect(api.documents.aiExecuteAssist).toHaveBeenCalledWith({
        documentId: detail.id,
        previewToken: 'a'.repeat(32),
        consentConfirmed: true,
      }),
    )
  })
})
