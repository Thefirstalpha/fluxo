import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildSyntheticPdf } from '../../src/shared/documents/synthetic-pdf'
import { createVault, expect, test } from './fixtures'

/** Documents, OCR & IA (M7) : dépôt PDF local, relecture côte à côte, intégration M6 et purge original (ADR-018). */
test('analyse un bulletin PDF localement, vérifie la relecture côte à côte, intègre en Salaires et purge les octets originaux', async ({
  launch,
}) => {
  const workDir = mkdtempSync(join(tmpdir(), 'fluxo-e2e-docs-'))
  try {
    const pdfPath = join(workDir, 'bulletin-novembre-2026.pdf')
    const pdfBytes = buildSyntheticPdf([
      'Employeur : Horizon Numerique SAS',
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
    writeFileSync(pdfPath, pdfBytes)

    const { page } = await launch()
    await createVault(page)

    // 1. Par défaut l'IA est strictement désactivée (ADR-022).
    const initialAi = await page.evaluate(() => window.fluxo.documents.aiConfig())
    expect(initialAi.provider).toBe('none')

    // 2. Déposer et analyser localement le bulletin PDF (processus isolé, 0 réseau).
    const staged = await page.evaluate(async (path) => {
      return window.fluxo.documents.stagePath(path)
    }, pdfPath)
    expect(staged.ok).toBe(true)
    if (!staged.ok) return
    expect(staged.document.hasOriginalBytes).toBe(true)
    expect(staged.document.kind).toBe('payslip')

    // 3. Ouvrir l'écran Documents et vérifier la relecture côte à côte.
    await page.getByRole('link', { name: 'Documents' }).click()
    await expect(page.getByText('bulletin-novembre-2026.pdf').first()).toBeVisible()
    await expect(page.getByText('Contrôles arithmétiques M6 conformes.')).toBeVisible()
    await expect(page.getByLabel('Net payé (€)')).toHaveValue('2590.50')

    // 4. Valider et enregistrer le bulletin dans M6 Salaires -> purge immédiate des octets originaux.
    await page.getByRole('button', { name: 'Enregistrer ce bulletin' }).click()
    await expect(page.getByText(/Bulletin enregistré dans Salaires/i)).toBeVisible()

    const afterCommit = await page.evaluate(
      (id) => window.fluxo.documents.get(id),
      staged.document.id,
    )
    expect(afterCommit?.status).toBe('committed')
    expect(afterCommit?.hasOriginalBytes).toBe(false)

    // 5. Vérifier dans M6 Salaires que le bulletin intégré est bien présent.
    await page.getByRole('link', { name: 'Salaires' }).click()
    await expect(page.getByText('Horizon Numerique SAS').first()).toBeVisible()
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
})
