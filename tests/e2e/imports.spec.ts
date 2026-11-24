import { join } from 'node:path'
import type { ElectronApplication } from '@playwright/test'
import { createVault, expect, test } from './fixtures'

/** Import de relevés (M3) : aperçu CSV, déduplication, rapprochement de soldes et annulation de lot. */

async function stubOpenDialog(app: ElectronApplication, filePath: string): Promise<void> {
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [chosen] })
  }, filePath)
}

test('importe un relevé BoursoBank CSV, refuse les doublons au réimport puis annule le lot', async ({
  launch,
}) => {
  const { app, page } = await launch()
  await createVault(page)

  // Crée un compte courant à relevé avec solde initial concordant avec boursobank.csv (1 284,20 €).
  await page.getByRole('link', { name: 'Comptes' }).click()
  await page.getByRole('button', { name: 'Nouveau compte' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Nouveau compte' })
  await dialog.getByLabel('Nom du compte').fill('Courant Bourso')
  await dialog.getByLabel('Solde d’ouverture').fill('1284,20')
  await dialog.getByRole('button', { name: 'Créer le compte' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Courant Bourso')).toBeVisible()

  // Ouvre la page Imports et sélectionne le CSV d'exemple anonymisé.
  await page.getByRole('link', { name: 'Imports' }).click()
  await expect(page.getByRole('heading', { name: 'Imports de relevés' })).toBeVisible()

  const boursoPath = join(process.cwd(), 'src', 'imports', 'fixtures', 'boursobank.csv')
  await stubOpenDialog(app, boursoPath)
  await page.getByRole('button', { name: /Choisir un fichier/ }).click()
  await expect(page.getByText(/boursobank\.csv/)).toBeVisible()

  // Étape 2 : aperçu CSV, profil auto-détecté et solde concordant.
  await page.getByRole('button', { name: /Analyser et afficher l’aperçu/ }).click()
  await expect(page.getByText('VIR SEPA EMPLOYEUR')).toBeVisible()
  await expect(page.getByText('Soldes concordants (aucun écart)')).toBeVisible()

  await page.getByRole('button', { name: 'Importer 3 opérations' }).click()
  await expect(page.getByText('Import terminé')).toBeVisible()
  await expect(page.getByText(/3 opérations importées, 0 doublon écarté/)).toBeVisible()

  // Vérifie les opérations et le solde dans le registre.
  await page.getByRole('button', { name: 'Voir dans les transactions' }).click()
  await expect(page.getByText('VIR SEPA EMPLOYEUR')).toBeVisible()
  await expect(page.getByText('CARTE 16/11 BOULANGERIE DUPONT')).toBeVisible()

  // Ré-import du même fichier : les 3 lignes sont reconnues comme doublons.
  await page.getByRole('link', { name: 'Imports' }).click()
  await stubOpenDialog(app, boursoPath)
  await page.getByRole('button', { name: /Choisir un fichier/ }).click()
  await page.getByRole('button', { name: /Analyser et afficher l’aperçu/ }).click()
  await expect(page.getByText('Doublon exact').first()).toBeVisible()
  await page.getByRole('button', { name: 'Annuler' }).first().click()

  // Annule le lot dans l'historique et vérifie le retour au solde d'ouverture.
  await page.getByRole('button', { name: /Annuler ce lot/ }).click()
  const confirmDialog = page.getByRole('dialog', { name: /Annuler cet import/ })
  await expect(confirmDialog).toBeVisible()
  await confirmDialog.getByRole('button', { name: 'Annuler ce lot' }).click()
  await expect(page.getByText(/Lot annulé \(3 opérations supprimées\)/)).toBeVisible()

  await page.getByRole('link', { name: 'Comptes' }).click()
  await expect(page.getByText('1 284,20 €').first()).toBeVisible()
})
