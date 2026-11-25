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
    expect(staged).toMatchObject({ ok: true })
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

test('importe plusieurs fiches de paie et un solde de tout compte, déduplique la société et fixe début + fin de contrat', async ({
  launch,
}) => {
  const workDir = mkdtempSync(join(tmpdir(), 'fluxo-e2e-batch-'))
  try {
    const stcPath = join(workDir, 'solde-tout-compte-mai-2025.pdf')
    const janPath = join(workDir, 'bulletin-janvier-2025.pdf')
    const febPath = join(workDir, 'bulletin-fevrier-2025.pdf')

    // Déposés volontairement dans le désordre (STC d'abord, puis janvier et février).
    writeFileSync(
      stcPath,
      buildSyntheticPdf([
        'Employeur : Nova Conseil SAS',
        'SIRET : 901 234 567 00018',
        'RECU POUR SOLDE DE TOUT COMPTE - Mai 2025',
        'Emploi : Ingenieure Produit Senior',
        'Date entree : 06/01/2025',
        'Date sortie : 31/05/2025',
        'Paye le 31/05/2025',
        'Salaire de base 151,67 h 3 200,00 EUR',
        'Indemnite compensatrice de conges payes 800,00 EUR',
        'Salaire brut 4 000,00 EUR',
        'Total cotisations salariales 880,00 EUR',
        'Net a payer avant impot 3 120,00 EUR',
        'Net imposable 3 200,00 EUR',
        'Prelevement a la source (8,00 %) 256,00 EUR',
        'Net paye au salarie 2 864,00 EUR',
      ]),
    )
    writeFileSync(
      janPath,
      buildSyntheticPdf([
        'Employeur : Nova Conseil SAS',
        'SIRET : 901 234 567 00018',
        'BULLETIN DE PAIE - Janvier 2025',
        'Paye le 31/01/2025',
        'Salaire de base 151,67 h 3 200,00 EUR',
        'Salaire brut 3 200,00 EUR',
        'Total cotisations salariales 704,00 EUR',
        'Net a payer avant impot 2 496,00 EUR',
        'Net imposable 2 560,00 EUR',
        'Prelevement a la source (8,00 %) 204,80 EUR',
        'Net paye au salarie 2 291,20 EUR',
      ]),
    )
    writeFileSync(
      febPath,
      buildSyntheticPdf([
        'Employeur : Nova Conseil SAS',
        'SIRET : 901 234 567 00018',
        'BULLETIN DE PAIE - Fevrier 2025',
        'Paye le 28/02/2025',
        'Salaire de base 151,67 h 3 200,00 EUR',
        'Salaire brut 3 200,00 EUR',
        'Total cotisations salariales 704,00 EUR',
        'Net a payer avant impot 2 496,00 EUR',
        'Net imposable 2 560,00 EUR',
        'Prelevement a la source (8,00 %) 204,80 EUR',
        'Net paye au salarie 2 291,20 EUR',
      ]),
    )

    const { page } = await launch()
    await createVault(page)

    const stagedIds = await page.evaluate(
      async (paths) => {
        const ids: string[] = []
        for (const p of paths) {
          const res = await window.fluxo.documents.stagePath(p)
          if (res.ok) ids.push(res.document.id)
        }
        return ids
      },
      [stcPath, janPath, febPath],
    )
    expect(stagedIds).toHaveLength(3)

    await page.getByRole('link', { name: 'Documents' }).click()
    const batchBtn = page.getByRole('button', { name: /Tout enregistrer \(3 bulletins \/ STC\)/i })
    await expect(batchBtn).toBeVisible()
    await batchBtn.click()

    await expect(
      page.getByText(
        /3 bulletin\(s\) enregistré\(s\) · 1 société\(s\) créée\(s\) · 1 contrat\(s\) créé\(s\)/i,
      ),
    ).toBeVisible()

    // Vérifie la purge des originaux sur les 3 documents intégrés.
    const purgedAll = await page.evaluate(async (ids) => {
      const details = await Promise.all(ids.map((id) => window.fluxo.documents.get(id)))
      return details.every((d) => d?.status === 'committed' && d.hasOriginalBytes === false)
    }, stagedIds)
    expect(purgedAll).toBe(true)

    // Vérifie dans M6 Salaires -> Employeurs & contrats que Nova Conseil SAS n'existe qu'en 1 exemplaire avec 6 janv. 2025 -> 31 mai 2025.
    const dbCheck = await page.evaluate(async () => {
      const [empRes, contractRes, slipRes] = await Promise.all([
        window.fluxo.ledger.employersList({ includeArchived: true }),
        window.fluxo.ledger.contractsList({ includeArchived: true }),
        window.fluxo.ledger.payslipsList({ limit: 20 }),
      ])
      return {
        employersCount: empRes.ok ? empRes.value.length : -1,
        contractsCount: contractRes.ok ? contractRes.value.length : -1,
        payslipsCount: slipRes.ok ? slipRes.value.length : -1,
      }
    })
    expect(dbCheck).toEqual({ employersCount: 1, contractsCount: 1, payslipsCount: 3 })

    await page.getByRole('link', { name: 'Salaires' }).click()
    await page.getByRole('radio', { name: 'Employeurs & contrats' }).click()
    await expect(page.locator('span').filter({ hasText: /^Nova Conseil SAS$/ })).toHaveCount(1)
    await expect(page.getByText('Ingenieure Produit Senior')).toBeVisible()
    await expect(page.getByText(/6\s+janv\.\s+2025\s*→\s*31\s+mai\s+2025/i)).toBeVisible()
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
})
