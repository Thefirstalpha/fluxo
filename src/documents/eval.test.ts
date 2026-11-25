import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  anonymizeDocumentText,
  anonymizeTransactionsForCategorization,
} from '@shared/documents/anonymize'
import { classifyDocument } from '@shared/documents/classify'
import {
  aiCategorizationStructuredOutputSchema,
  aiPayslipStructuredOutputSchema,
  aiStatementStructuredOutputSchema,
} from '@shared/documents/schemas'
import { extractFrenchPayslip, extractPdfBankStatement } from '@shared/documents/templates'
import type { ExtractedPage } from '@shared/documents/model'
import { AiConfigStore } from '../main/documents/ai/config-store'
import { AiGateway } from '../main/documents/ai/gateway'
import { AiSecretStore } from '../main/documents/ai/secrets'
import type { SecureStorage } from '../main/vault/secure-storage'
import { buildSyntheticPdf } from './pdf.test'
import { extractPdfPages } from './pdf'

interface PayslipGroundTruth {
  name: string
  lines: string[]
  expected: {
    period: string
    gross: number
    employeeContributions: number
    netBeforeTax: number
    taxableNet: number
    withholdingTax: number
    netPaid: number
  }
}

const PAYSLIP_CORPUS: readonly PayslipGroundTruth[] = [
  {
    name: 'Cadre standard sans variables',
    lines: [
      'Employeur : Horizon Numerique SAS',
      'SIRET : 812 345 678 00024',
      'BULLETIN DE PAIE - Janvier 2026',
      'Paye le 29/01/2026',
      'Salaire de base 151,67 h 3 500,00 EUR',
      'Salaire brut 3 500,00 EUR',
      'Total cotisations salariales 770,00 EUR',
      'Total cotisations patronales 1 470,00 EUR',
      'Net a payer avant impot 2 730,00 EUR',
      'Net imposable 2 820,00 EUR',
      'Montant net social 2 630,00 EUR',
      'Prelevement a la source (7,00 %) 197,40 EUR',
      'Net paye au salarie 2 532,60 EUR',
    ],
    expected: {
      period: '2026-01',
      gross: 350_000,
      employeeContributions: 77_000,
      netBeforeTax: 273_000,
      taxableNet: 282_000,
      withholdingTax: 19_740,
      netPaid: 253_260,
    },
  },
  {
    name: 'Technicien avec heures supplementaires, astreinte et titres-restaurant',
    lines: [
      'Employeur : Atelier Rhone Energie',
      'SIRET : 445 221 908 00017',
      'BULLETIN DE PAIE - Mars 2026',
      'Paye le 30/03/2026',
      'Salaire de base 151,67 h 2 800,00 EUR',
      'Heures supplementaires 240,00 EUR',
      'Astreinte week-end 160,00 EUR',
      'Salaire brut 3 200,00 EUR',
      'Total cotisations salariales 704,00 EUR',
      'Net a payer avant impot 2 496,00 EUR',
      'Net imposable 2 580,00 EUR',
      'Prelevement a la source (5,50 %) 141,90 EUR',
      'Titres-restaurant (part salarie) -75,00 EUR',
      'Net paye au salarie 2 279,10 EUR',
    ],
    expected: {
      period: '2026-03',
      gross: 320_000,
      employeeContributions: 70_400,
      netBeforeTax: 249_600,
      taxableNet: 258_000,
      withholdingTax: 14_190,
      netPaid: 227_910,
    },
  },
  {
    name: 'Bulletin 13e mois et prime anciennete',
    lines: [
      'Employeur : Maison Leger SA',
      'SIRET : 332 100 998 00031',
      'BULLETIN DE PAIE - Decembre 2026',
      'Paye le 23/12/2026',
      'Salaire de base 151,67 h 4 000,00 EUR',
      'Prime d’anciennete 300,00 EUR',
      '13eme mois 4 000,00 EUR',
      'Salaire brut 8 300,00 EUR',
      'Total cotisations salariales 1 826,00 EUR',
      'Net a payer avant impot 6 474,00 EUR',
      'Net imposable 6 700,00 EUR',
      'Montant net social 6 300,00 EUR',
      'Prelevement a la source (12,00 %) 804,00 EUR',
      'Net paye au salarie 5 670,00 EUR',
    ],
    expected: {
      period: '2026-12',
      gross: 830_000,
      employeeContributions: 182_600,
      netBeforeTax: 647_400,
      taxableNet: 670_000,
      withholdingTax: 80_400,
      netPaid: 567_000,
    },
  },
]

function fakeStorage(): SecureStorage {
  return {
    unavailableReason: () => null,
    encrypt: (plain: string) => Buffer.from(plain, 'utf8'),
    decrypt: (cipher: Buffer) => cipher.toString('utf8'),
  }
}

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'fluxo-eval-'))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('Corpus d’évaluation hors-ligne (M7)', () => {
  it('atteint >= 90 % de précision et de rappel sur le corpus PDF français sans aucun appel réseau', async () => {
    let totalFields = 0
    let matchedFields = 0

    for (const sample of PAYSLIP_CORPUS) {
      const pdfBytes = buildSyntheticPdf(sample.lines)
      const extracted = await extractPdfPages(pdfBytes)
      expect(extracted.ok).toBe(true)
      if (!extracted.ok) continue

      const cls = classifyDocument(extracted.pages, `${sample.name}.pdf`)
      expect(cls.kind).toBe('payslip')

      const draft = extractFrenchPayslip(extracted.pages)
      const keys = Object.keys(sample.expected) as (keyof typeof sample.expected)[]
      for (const k of keys) {
        totalFields++
        if (draft[k] === sample.expected[k]) matchedFields++
      }
      expect(draft.needsAiAssist).toBe(false)
    }

    const accuracy = matchedFields / totalFields
    expect(accuracy).toBeGreaterThanOrEqual(0.9)
  })

  it('extrait un relevé bancaire PDF multi-opérations sans perte de précision', () => {
    const page: ExtractedPage = {
      pageNumber: 1,
      width: 595,
      height: 842,
      text: 'Relevé de compte EUR Débit Crédit Ancien solde 2 000,00 Nouveau solde 2 912,20',
      items: [
        {
          text: 'RELEVÉ DE COMPTE BANCAIRE (EUR)',
          box: { x: 0.05, y: 0.05, width: 0.5, height: 0.02 },
        },
        { text: 'Ancien solde', box: { x: 0.05, y: 0.12, width: 0.2, height: 0.02 } },
        { text: '2 000,00 €', box: { x: 0.78, y: 0.12, width: 0.12, height: 0.02 } },
        { text: 'Date', box: { x: 0.05, y: 0.18, width: 0.1, height: 0.02 } },
        { text: 'Libellé', box: { x: 0.2, y: 0.18, width: 0.2, height: 0.02 } },
        { text: 'Débit', box: { x: 0.62, y: 0.18, width: 0.1, height: 0.02 } },
        { text: 'Crédit', box: { x: 0.8, y: 0.18, width: 0.1, height: 0.02 } },
        { text: '02/11/2026', box: { x: 0.05, y: 0.24, width: 0.1, height: 0.02 } },
        { text: 'CARREFOUR MARKET', box: { x: 0.2, y: 0.24, width: 0.3, height: 0.02 } },
        { text: '68,40', box: { x: 0.63, y: 0.24, width: 0.08, height: 0.02 } },
        { text: '05/11/2026', box: { x: 0.05, y: 0.29, width: 0.1, height: 0.02 } },
        { text: 'EDF FACTURE', box: { x: 0.2, y: 0.29, width: 0.3, height: 0.02 } },
        { text: '119,40', box: { x: 0.63, y: 0.29, width: 0.08, height: 0.02 } },
        { text: '28/11/2026', box: { x: 0.05, y: 0.34, width: 0.1, height: 0.02 } },
        { text: 'VIREMENT EMPLOYEUR', box: { x: 0.2, y: 0.34, width: 0.3, height: 0.02 } },
        { text: '1 100,00', box: { x: 0.81, y: 0.34, width: 0.08, height: 0.02 } },
        { text: 'Nouveau solde', box: { x: 0.05, y: 0.42, width: 0.2, height: 0.02 } },
        { text: '2 912,20 €', box: { x: 0.78, y: 0.42, width: 0.12, height: 0.02 } },
      ],
    }

    const statement = extractPdfBankStatement([page])
    expect(statement.rows).toHaveLength(3)
    expect(statement.balanceDiscrepancy).toBe(0)
    expect(statement.needsAiAssist).toBe(false)
  })

  it('rejoue les réponses enregistrées Anthropic et Ollama hors-ligne en vérifiant anonymisation et coûts', async () => {
    const recordedAnthropicPayslip = {
      stop_reason: 'end_turn',
      usage: { input_tokens: 420, output_tokens: 180 },
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            employerName: null,
            period: '2026-11',
            paymentDate: '2026-11-28',
            baseSalaryCents: 360_000,
            grossCents: 380_000,
            employeeContributionsCents: 83_600,
            employerContributionsCents: 159_600,
            netBeforeTaxCents: 296_400,
            taxableNetCents: 306_200,
            socialNetCents: 284_000,
            withholdingTaxCents: 22_965,
            withholdingRateMicros: 75_000,
            otherAdjustmentsCents: -8_000,
            netPaidCents: 265_435,
            confidence: 0.96,
          }),
        },
      ],
    }

    const secrets = new AiSecretStore(join(tempDir, 'ai.bin'), fakeStorage())
    secrets.setKey('sk-ant-offline-fixture-key')
    const config = new AiConfigStore(join(tempDir, 'ai.json'))
    config.update({ provider: 'anthropic', anthropicModel: 'claude-haiku-4-5' })

    let capturedBody = ''
    const mockFetch = vi.fn<typeof fetch>((_url, init) => {
      capturedBody = typeof init?.body === 'string' ? init.body : ''
      return Promise.resolve(
        new Response(JSON.stringify(recordedAnthropicPayslip), { status: 200 }),
      )
    })

    const gateway = new AiGateway(
      () => config.get(),
      secrets,
      () => Promise.resolve(0),
      mockFetch,
    )
    const anon = anonymizeDocumentText(
      'Salarié Jean Dupont · NIR 1 88 04 75 112 045 19 · Net payé 2 654,35 EUR',
      { knownNames: ['Jean Dupont'] },
    )
    const preview = await gateway.createPreview({
      purpose: 'payslip',
      documentId: '01950000-0000-7000-8000-000000000001',
      rawText: 'Salarié Jean Dupont · NIR 1 88 04 75 112 045 19 · Net payé 2 654,35 EUR',
      anonymize: { knownNames: ['Jean Dupont'] },
    })
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.preview.anonymizedPayload).toBe(anon.anonymizedText)

    const result = await gateway.executeConsented({
      previewToken: preview.preview.token,
      consentConfirmed: true,
      schema: aiPayslipStructuredOutputSchema,
      embeddedFallback: () => null,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.netPaidCents).toBe(265_435)
    expect(capturedBody).not.toContain('Jean Dupont')
    expect(capturedBody).not.toContain('88 04 75')

    // Vérification rejeu Ollama local pour relevé et catégorisation.
    config.update({
      provider: 'local',
      localMode: 'ollama',
      localEndpoint: 'http://127.0.0.1:11434',
    })
    const recordedOllamaStatement = {
      message: {
        content: JSON.stringify({
          currency: 'EUR',
          periodStart: '2026-11-01',
          periodEnd: '2026-11-30',
          openingBalanceCents: 100_000,
          closingBalanceCents: 95_000,
          rows: [
            {
              bookingDate: '2026-11-12',
              amountCents: -5_000,
              labelRaw: 'LIBRAIRIE',
              payee: 'Librairie',
            },
          ],
          confidence: 0.91,
        }),
      },
      prompt_eval_count: 150,
      eval_count: 80,
    }
    const stmtGateway = new AiGateway(
      () => config.get(),
      secrets,
      () => Promise.resolve(0),
      () => Promise.resolve(new Response(JSON.stringify(recordedOllamaStatement), { status: 200 })),
    )
    const stmtPrev = await stmtGateway.createPreview({
      purpose: 'statement',
      documentId: '01950000-0000-7000-8000-000000000002',
      rawText: 'Relevé IBAN FR76 3000 6000 0112 3456 7890 189 · LIBRAIRIE 50,00',
    })
    expect(stmtPrev.ok).toBe(true)
    if (!stmtPrev.ok) return
    const stmtExec = await stmtGateway.executeConsented({
      previewToken: stmtPrev.preview.token,
      consentConfirmed: true,
      schema: aiStatementStructuredOutputSchema,
      embeddedFallback: () => null,
    })
    expect(stmtExec.ok).toBe(true)
    if (stmtExec.ok) {
      expect(stmtExec.audit.costMicroUsd).toBe(0)
      expect(stmtExec.data.rows[0]?.amountCents).toBe(-5_000)
    }

    // Lot de catégorisation anonymisé validé par schéma.
    const catAnon = anonymizeTransactionsForCategorization([
      {
        transactionId: '01950000-0000-7000-8000-000000000010',
        labelRaw: 'BIOCOOP PARMENTIER FR7630006000011234567890189',
        payee: null,
        amount: -3_420,
      },
    ])
    expect(catAnon.samples[0]?.label).not.toContain('FR7630006')
    const validCatOut = aiCategorizationStructuredOutputSchema.parse({
      suggestions: [
        {
          index: 0,
          categoryId: '01950000-0000-7000-8000-000000000099',
          suggestedLabel: 'Biocoop',
          confidence: 0.94,
          reason: 'Magasin bio identifié',
        },
      ],
    })
    expect(validCatOut.suggestions).toHaveLength(1)
  })
})
