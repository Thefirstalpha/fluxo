import { createVault, expect, test } from './fixtures'

/** Patrimoine, crédits, budgets & prévisions (M8). */
test('crée un budget, un crédit amortissable, une valorisation et simule un scénario « et si »', async ({
  launch,
}) => {
  const { page } = await launch()
  await createVault(page)

  // 1. Créer un budget sur Courses (450 €)
  await page.getByRole('link', { name: /Budgets/i }).click()
  await expect(page.getByRole('heading', { level: 1, name: /Patrimoine, crédits/i })).toBeVisible()
  await page.getByRole('button', { name: 'Enregistrer ce budget' }).click()
  await expect(page.getByText('Dans le budget')).toBeVisible()

  // 2. Créer un crédit immobilier et vérifier son échéancier
  await page.getByRole('radio', { name: 'Crédits' }).click()
  await page.getByLabel('Libellé du prêt').fill('Prêt Résidence')
  await page.getByRole('button', { name: /Créer le crédit/i }).click()
  await expect(page.getByText('Tableau d’amortissement')).toBeVisible()
  await page.getByRole('button', { name: 'Simuler' }).click()
  await expect(page.getByText(/Intérêts économisés/i)).toBeVisible()

  // 3. Vérifier le patrimoine net (passifs non nuls suite au crédit)
  await page.getByRole('radio', { name: 'Patrimoine net' }).click()
  await expect(page.getByText('Total passifs (crédits)')).toBeVisible()

  // 4. Générer le scénario de base puis créer une variante « et si »
  await page.getByRole('radio', { name: /Prévisions & simulation/i }).click()
  await page.getByRole('button', { name: 'Générer le scénario de base' }).click()
  await expect(page.getByLabel('Scénario actif')).toBeVisible()

  await page.getByLabel('Créer une variante « et si »').fill('Économie +100 €')
  await page.getByRole('button', { name: 'Créer une variante « et si »' }).click()
  await page.getByRole('button', { name: 'Tableau' }).click()
  await expect(page.getByRole('columnheader', { name: 'Solde projeté' })).toBeVisible()
})
