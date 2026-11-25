import { describe, expect, it } from 'vitest'
import { anonymizeDocumentText, anonymizeTransactionsForCategorization } from './anonymize'
import { classifyDocument } from './classify'
import type { ExtractedPage } from './model'
import {
  extractFrenchPayslip,
  extractPdfBankStatement,
  parseAmountCents,
  parseFrenchDate,
} from './templates'

function pageFromLines(lines: string[], pageNumber = 1): ExtractedPage {
  const height = Math.max(1, lines.length)
  return {
    pageNumber,
    width: 595,
    height: 842,
    text: lines.join('\n'),
    items: lines.map((text, idx) => ({
      text,
      box: {
        x: 0.06,
        y: (idx + 0.5) / (height + 1),
        width: 0.88,
        height: 0.025,
      },
    })),
  }
}

describe('parseAmountCents & parseFrenchDate', () => {
  it('convertit les montants français sans flottants résiduels', () => {
    expect(parseAmountCents('3 450,00 €')).toBe(345_000)
    expect(parseAmountCents('1\u202f234,56')).toBe(123_456)
    expect(parseAmountCents('-42,50 €')).toBe(-4_250)
    expect(parseAmountCents('(19,99)')).toBe(-1_999)
    expect(parseAmountCents('abc')).toBeNull()
  })

  it('valide les dates ISO et françaises existantes', () => {
    expect(parseFrenchDate('02/11/2026')).toBe('2026-11-02')
    expect(parseFrenchDate('2026-11-30')).toBe('2026-11-30')
    expect(parseFrenchDate('30/02/2026')).toBeNull()
  })
})

describe('anonymizeDocumentText (ADR-022)', () => {
  it('remplace NIR, IBAN, carte, e-mail, SIRET, téléphone, nom et adresse avant tout envoi', () => {
    const raw = [
      'Bulletin de paie — Société Atelier Fluxo',
      'SIRET : 812 345 678 00024',
      'Salarié : Monsieur Jean Dupont',
      'NIR : 1 85 11 75 116 003 42',
      '14 rue de Rivoli, 75004 Paris',
      'Courriel : jean.dupont@exemple.fr · Tél : 06 12 34 56 78',
      'Virement sur IBAN : FR76 3000 6000 0112 3456 7890 189',
      'Carte utilisée : 4970 1234 5678 9012',
      'Salaire brut : 3 800,00 € · Net payé : 2 760,00 €',
    ].join('\n')

    const res = anonymizeDocumentText(raw, { knownNames: ['Atelier Fluxo', 'Jean Dupont'] })

    expect(res.anonymizedText).not.toContain('1 85 11 75 116 003 42')
    expect(res.anonymizedText).not.toContain('FR76 3000 6000 0112 3456 7890 189')
    expect(res.anonymizedText).not.toContain('jean.dupont@exemple.fr')
    expect(res.anonymizedText).not.toContain('812 345 678 00024')
    expect(res.anonymizedText).not.toContain('Jean Dupont')
    expect(res.anonymizedText).not.toContain('Atelier Fluxo')
    expect(res.anonymizedText).not.toContain('14 rue de Rivoli')
    expect(res.anonymizedText).not.toContain('4970 1234 5678 9012')
    expect(res.anonymizedText).not.toContain('06 12 34 56 78')
    // Préserve les montants et libellés comptables pour l'analyse IA.
    expect(res.anonymizedText).toContain('3 800,00 €')
    expect(res.anonymizedText).toContain('[NIR_1]')
    expect(res.anonymizedText).toContain('[IBAN_1]')
    expect(res.anonymizedText).toContain('[EMAIL_1]')
    expect(res.anonymizedText).toContain('[SIRET_1]')
    expect(res.anonymizedText).toContain('[CARTE_1]')
    expect(res.redactions.length).toBeGreaterThanOrEqual(6)
  })

  it('anonymise les lots de catégorisation sans dates ni montants exacts', () => {
    const res = anonymizeTransactionsForCategorization(
      [
        {
          transactionId: 'tx-1',
          labelRaw: 'VIR SEPA FR7630006000011234567890189 JEAN DUPONT LOYER',
          payee: 'Jean Dupont',
          amount: -85_000,
        },
      ],
      { knownNames: ['Jean Dupont'] },
    )
    expect(res.samples[0]).toEqual({
      index: 0,
      direction: 'expense',
      amountBucket: '200-1000',
      label: 'VIR SEPA [IBAN_1] [NOM_1] LOYER ([NOM_1])',
    })
  })
})

describe('classifyDocument & templates déterministes', () => {
  it('reconnaît et extrait un bulletin de paie français complet avec cohérence M6', () => {
    const page = pageFromLines([
      'Employeur : Horizon Numérique SAS',
      'SIRET : 812 345 678 00024',
      'BULLETIN DE PAIE — Novembre 2026',
      'Payé le 28/11/2026',
      'Salaire de base 151,67 h        3 600,00 €',
      'Prime d’ancienneté                200,00 €',
      'Salaire brut                    3 800,00 €',
      'Total cotisations salariales      836,00 €',
      'Total cotisations patronales    1 596,00 €',
      'Net à payer avant impôt         2 964,00 €',
      'Net imposable                   3 062,00 €',
      'Montant net social              2 840,00 €',
      'Prélèvement à la source (7,50 %)  229,65 €',
      'Titres-restaurant (part salarié)  -80,00 €',
      'Net payé au salarié             2 654,35 €',
    ])

    const cls = classifyDocument([page], 'bulletin-nov-2026.pdf')
    expect(cls.kind).toBe('payslip')
    expect(cls.confidence).toBeGreaterThan(0.8)

    const draft = extractFrenchPayslip([page])
    expect(draft.employerName).toBe('Horizon Numérique SAS')
    expect(draft.employerSiret).toBe('81234567800024')
    expect(draft.period).toBe('2026-11')
    expect(draft.paymentDate).toBe('2026-11-28')
    expect(draft.baseSalary).toBe(360_000)
    expect(draft.gross).toBe(380_000)
    expect(draft.employeeContributions).toBe(83_600)
    expect(draft.employerContributions).toBe(159_600)
    expect(draft.netBeforeTax).toBe(296_400)
    expect(draft.taxableNet).toBe(306_200)
    expect(draft.socialNet).toBe(284_000)
    expect(draft.withholdingRateMicros).toBe(75_000)
    expect(draft.withholdingTax).toBe(22_965)
    expect(draft.otherAdjustments).toBe(-8_000)
    expect(draft.netPaid).toBe(265_435)
    expect(draft.missingFields).toEqual([])
    expect(draft.needsAiAssist).toBe(false)
    expect(draft.fieldZones.netPaid?.sourceZone?.page).toBe(1)
  })

  it('reconstruit les opérations d’un relevé bancaire PDF et contrôle le solde', () => {
    const page: ExtractedPage = {
      pageNumber: 1,
      width: 595,
      height: 842,
      text: 'Relevé de compte EUR Débit Crédit Ancien solde 1 500,00 Nouveau solde 1 695,50',
      items: [
        {
          text: 'RELEVÉ DE COMPTE BANCAIRE (EUR)',
          box: { x: 0.05, y: 0.05, width: 0.5, height: 0.02 },
        },
        {
          text: 'Période du 01/11/2026 au 30/11/2026',
          box: { x: 0.05, y: 0.09, width: 0.5, height: 0.02 },
        },
        { text: 'Ancien solde', box: { x: 0.05, y: 0.14, width: 0.2, height: 0.02 } },
        { text: '1 500,00 €', box: { x: 0.78, y: 0.14, width: 0.12, height: 0.02 } },
        { text: 'Date', box: { x: 0.05, y: 0.2, width: 0.1, height: 0.02 } },
        { text: 'Libellé', box: { x: 0.2, y: 0.2, width: 0.2, height: 0.02 } },
        { text: 'Débit', box: { x: 0.62, y: 0.2, width: 0.1, height: 0.02 } },
        { text: 'Crédit', box: { x: 0.8, y: 0.2, width: 0.1, height: 0.02 } },
        { text: '03/11/2026', box: { x: 0.05, y: 0.26, width: 0.12, height: 0.02 } },
        { text: 'CB BIOCOOP PARIS', box: { x: 0.2, y: 0.26, width: 0.3, height: 0.02 } },
        { text: '54,50', box: { x: 0.63, y: 0.26, width: 0.08, height: 0.02 } },
        { text: '10/11/2026', box: { x: 0.05, y: 0.32, width: 0.12, height: 0.02 } },
        { text: 'VIREMENT SALAIRE', box: { x: 0.2, y: 0.32, width: 0.3, height: 0.02 } },
        { text: '250,00', box: { x: 0.81, y: 0.32, width: 0.08, height: 0.02 } },
        { text: 'Nouveau solde', box: { x: 0.05, y: 0.42, width: 0.2, height: 0.02 } },
        { text: '1 695,50 €', box: { x: 0.78, y: 0.42, width: 0.12, height: 0.02 } },
      ],
    }

    const cls = classifyDocument([page], 'releve-nov.pdf')
    expect(cls.kind).toBe('statement')

    const stmt = extractPdfBankStatement([page])
    expect(stmt.currency).toBe('EUR')
    expect(stmt.openingBalance).toBe(150_000)
    expect(stmt.closingBalance).toBe(169_550)
    expect(stmt.rows).toHaveLength(2)
    expect(stmt.rows[0]).toMatchObject({
      bookingDate: '2026-11-03',
      amount: -5_450,
      labelRaw: 'CB BIOCOOP PARIS',
    })
    expect(stmt.rows[1]).toMatchObject({
      bookingDate: '2026-11-10',
      amount: 25_000,
      labelRaw: 'VIREMENT SALAIRE',
    })
    expect(stmt.balanceDiscrepancy).toBe(0)
    expect(stmt.needsAiAssist).toBe(false)
  })
})
