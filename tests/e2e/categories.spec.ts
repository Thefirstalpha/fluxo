import { createVault, expect, test } from './fixtures'

/** Catégories et étiquettes (M2, lot 3) : pack France créé avec le coffre, gestion. */

test('pack France à la création, sous-catégorie ajoutée, étiquette créée', async ({ launch }) => {
  const { page } = await launch()
  await createVault(page)
  await page.getByRole('link', { name: 'Catégories' }).click()
  await expect(page.getByRole('heading', { name: 'Dépenses' })).toBeVisible()
  await expect(page.getByText('Loyer ou crédit immobilier')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Épargne', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Ajouter une sous-catégorie à Logement' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nouvelle sous-catégorie de Logement' })
  await dialog.getByLabel('Nom').fill('Internet')
  await dialog.getByRole('button', { name: 'Créer' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Internet', { exact: true })).toBeVisible()

  await page.getByRole('radio', { name: 'Étiquettes' }).click()
  await page.getByLabel('Nom de l’étiquette').fill('Vacances 2026')
  await page.getByRole('button', { name: 'Ajouter' }).click()
  await expect(page.getByText('Vacances 2026', { exact: true })).toBeVisible()
})
