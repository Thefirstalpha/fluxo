import { describe, expect, it } from 'vitest'
import { buildSyntheticPdf } from '@shared/documents/synthetic-pdf'
import { extractFrenchPayslip } from '@shared/documents/templates'
import { extractPdfPages } from './pdf'

export { buildSyntheticPdf }

describe('extractPdfPages (pdfjs-dist isolé)', () => {
  it('extrait texte et coordonnées d’un bulletin PDF généré et alimente le template France', async () => {
    const pdf = buildSyntheticPdf([
      'Employeur : Atelier Fluxo SAS',
      'SIRET : 812 345 678 00024',
      'BULLETIN DE PAIE - Novembre 2026',
      'Paye le 28/11/2026',
      'Salaire de base 151,67 h 3 600,00 EUR',
      'Salaire brut 3 600,00 EUR',
      'Total cotisations salariales 792,00 EUR',
      'Total cotisations patronales 1 512,00 EUR',
      'Net a payer avant impot 2 808,00 EUR',
      'Net imposable 2 900,00 EUR',
      'Montant net social 2 700,00 EUR',
      'Prelevement a la source (7,50 %) 217,50 EUR',
      'Net paye au salarie 2 590,50 EUR',
    ])

    const res = await extractPdfPages(pdf)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.pageCount).toBe(1)
    expect(res.pages[0]?.items.length).toBeGreaterThan(5)

    const draft = extractFrenchPayslip(res.pages)
    expect(draft.period).toBe('2026-11')
    expect(draft.gross).toBe(360_000)
    expect(draft.netPaid).toBe(259_050)
    expect(draft.withholdingTax).toBe(21_750)
    expect(draft.needsAiAssist).toBe(false)
  })

  it('refuse proprement un fichier corrompu ou dépassant la taille maximale', async () => {
    expect(await extractPdfPages(new Uint8Array(0))).toEqual({ ok: false, reason: 'too-large' })
    expect(await extractPdfPages(Buffer.from('not a pdf', 'utf8'))).toEqual({
      ok: false,
      reason: 'parse-failed',
    })
  })
})
