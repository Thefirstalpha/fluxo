import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication } from '@playwright/test'
import { expect, test } from './fixtures'

/** Analyses & synthèses (M5) : filtres globaux, synthèse M-1/N-1, exploration 3 clics, tableau et exports CSV/PDF. */

async function stubSaveDialog(app: ElectronApplication, filePath: string): Promise<void> {
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: chosen })
  }, filePath)
}

test('explore le mode démo sur Analyses, bascule un graphique en tableau, exporte CSV et PDF', async ({
  launch,
  userDataDir,
}) => {
  const { app, page } = await launch()
  await page.getByRole('button', { name: 'Explorer avec des données de démonstration' }).click()

  await page.getByRole('link', { name: 'Analyses' }).click()
  await expect(page.getByRole('heading', { name: 'Analyses & synthèses' })).toBeVisible()
  await expect(page.getByText('Faits marquants')).toBeVisible()
  await expect(page.getByText('Principaux commerçants (top 10)')).toBeVisible()

  // Passe sur Graphiques & exploration et bascule un graphique en vue tableau accessible
  await page.getByRole('radio', { name: 'Graphiques & exploration' }).click()
  await expect(page.getByText('Évolution des dépenses par catégorie')).toBeVisible()
  await page.getByRole('radio', { name: 'Tableau' }).first().click()
  await expect(page.getByRole('table').first()).toBeVisible()

  // Test export CSV filtré via boîte de dialogue native simulée
  const csvTarget = join(userDataDir, 'export-analyses.csv')
  await stubSaveDialog(app, csvTarget)
  await page.getByRole('button', { name: 'Exporter CSV' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Export CSV enregistré' })).toBeVisible()
  expect(existsSync(csvTarget)).toBe(true)
  expect(readFileSync(csvTarget, 'utf8')).toContain('date,account,label')

  // Test export PDF mensuel offline via Chromium printToPDF
  const pdfTarget = join(userDataDir, 'rapport-mensuel.pdf')
  await stubSaveDialog(app, pdfTarget)
  await page.getByRole('button', { name: 'Rapport mensuel PDF' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Rapport PDF enregistré' })).toBeVisible()
  expect(existsSync(pdfTarget)).toBe(true)
  const pdfHeader = readFileSync(pdfTarget).subarray(0, 5).toString('latin1')
  expect(pdfHeader).toBe('%PDF-')

  // Exploration en <= 3 clics vers Transactions
  await page.getByRole('radio', { name: 'Synthèse mensuelle' }).click()
  await page.getByRole('button', { name: 'Voir dans les transactions' }).click()
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible()
})
