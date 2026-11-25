import { createVault, expect, test } from './fixtures'

/** Salaires & bulletins de paie (M6) : employeur, contrat, bulletin France, duplication, simulateur. */
test('crée employeur, contrat et bulletin France, duplique le mois et utilise le simulateur', async ({
  launch,
}) => {
  const { page } = await launch()
  await createVault(page)

  await page.getByRole('link', { name: 'Salaires' }).click()
  await expect(
    page.getByText(/Fluxo n’est ni un logiciel de paie ni un conseiller fiscal/i),
  ).toBeVisible()

  // 1. Configurer employeur et contrat
  await page.getByRole('button', { name: /Configurer un employeur et contrat/i }).click()
  await page.getByLabel('Raison sociale').fill('Société Horizon SAS')
  await page.getByRole('button', { name: 'Enregistrer l’employeur' }).click()
  await expect(page.locator('span', { hasText: 'Société Horizon SAS' }).first()).toBeVisible()

  await page.getByLabel('Poste / intitulé').fill('Développeur full-stack')
  await page.getByRole('button', { name: 'Enregistrer le contrat' }).click()
  await expect(page.locator('span', { hasText: 'Développeur full-stack' }).first()).toBeVisible()

  // 2. Créer un bulletin pré-rempli (pack France)
  await page.getByRole('button', { name: 'Nouveau bulletin' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nouveau bulletin de paie' })
  await dialog.getByLabel('Période (AAAA-MM)').fill('2026-10')
  await dialog.getByLabel('Taux PAS (%)').fill('8.00')
  await dialog.getByRole('button', { name: 'Pré-remplir cotisations France' }).click()
  await expect(dialog.getByText(/Tous les contrôles arithmétiques/i)).toBeVisible()
  await dialog.getByRole('button', { name: 'Enregistrer le bulletin' }).click()
  await expect(dialog).toBeHidden()

  // 3. Vérifier la vue « Du brut au net » et le détail repliable
  await expect(page.getByText('Du brut au net', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Détail des cotisations/i }).click()
  await expect(page.getByText('Retraite de base')).toBeVisible()

  // 4. Dupliquer vers le mois suivant
  await page.getByRole('button', { name: 'Dupliquer le mois précédent' }).click()
  const dupDialog = page.getByRole('dialog', { name: 'Nouveau bulletin de paie' })
  await expect(dupDialog.getByLabel('Période (AAAA-MM)')).toHaveValue('2026-11')
  await dupDialog.getByRole('button', { name: 'Enregistrer le bulletin' }).click()
  await expect(dupDialog).toBeHidden()

  // 5. Ouvrir Tableau de bord & récapitulatif annuel
  await page.getByRole('radio', { name: 'Tableau de bord' }).click()
  await expect(page.getByText(/Récapitulatif annuel/i)).toBeVisible()

  // 6. Ouvrir Simulateur
  await page.getByRole('radio', { name: 'Simulateur' }).click()
  const delta = page.getByLabel(/Variation du brut fixe/i)
  await delta.fill('200')
  await expect(page.getByText(/3\s*600,00/)).toBeVisible()
})
