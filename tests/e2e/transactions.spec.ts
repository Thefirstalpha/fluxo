import { createVault, dashboardHeading, expect, test } from './fixtures'

/** Registre des opérations (M2, lots 4 et 5) : saisie, ventilation, filtres, palette, annulation, dashboard réel. */

test('saisit une opération manuelle, ventile, filtre, annule/rétablit et met à jour le tableau de bord', async ({
  launch,
}) => {
  const { page } = await launch()
  await createVault(page)

  // Le tableau de bord réel (vide au départ) ne porte pas le badge Démo.
  await expect(page.getByText('Aucune opération pour l’instant')).toBeVisible()

  // Crée un compte en saisie manuelle.
  await page.getByRole('link', { name: 'Comptes' }).click()
  await page.getByRole('button', { name: 'Nouveau compte' }).first().click()
  const accDialog = page.getByRole('dialog', { name: 'Nouveau compte' })
  await accDialog.getByLabel('Nom du compte').fill('Espèces')
  await accDialog.getByLabel('Type').selectOption('cash')
  await accDialog.getByLabel('Solde d’ouverture').fill('200,00')
  await accDialog.getByRole('button', { name: 'Créer le compte' }).click()
  await expect(accDialog).toBeHidden()

  // Ouvre la page Transactions et saisit une opération.
  await page.getByRole('link', { name: 'Transactions' }).click()
  await page.getByRole('button', { name: 'Nouvelle opération' }).first().click()
  const entryDialog = page.getByRole('dialog', { name: 'Nouvelle opération' })
  await entryDialog.getByLabel('Libellé').fill('Marché bio')
  await entryDialog.getByLabel('Montant').fill('-35,00')
  await entryDialog.getByLabel('Tiers').fill('Primeur local')
  await entryDialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(entryDialog).toBeHidden()

  await expect(page.getByText('Marché bio')).toBeVisible()
  await expect(page.getByText('Primeur local')).toBeVisible()

  // Ouvre le panneau de détail et ventile en deux parts.
  await page.getByText('Marché bio').click()
  const detail = page.getByRole('complementary', { name: 'Détail de l’opération' })
  await expect(detail).toBeVisible()
  await detail.getByRole('button', { name: 'Ajouter une part' }).click()
  const splitInputs = detail.locator('section[aria-label="Ventilation"] input[type="text"]')
  await splitInputs.nth(0).fill('-20,00')
  await splitInputs.nth(1).fill('-15,00')
  await detail.getByRole('button', { name: 'Enregistrer la ventilation' }).click()
  await expect(page.getByText('2 parts')).toBeVisible()

  // Annule puis rétablit la ventilation.
  await page.getByRole('button', { name: 'Annuler' }).click()
  await expect(page.getByText('2 parts')).toHaveCount(0)
  await page.getByRole('button', { name: 'Rétablir' }).click()
  await expect(page.getByText('2 parts')).toBeVisible()

  // Palette de commandes (Ctrl+K) : recherche l'opération et affiche les raccourcis (?).
  await page.keyboard.press('Control+k')
  const palette = page.getByRole('dialog', { name: 'Palette de commandes' })
  await expect(palette).toBeVisible()
  await palette.getByRole('searchbox').fill('Marché')
  await expect(palette.getByRole('option', { name: /Marché bio/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(palette).toBeHidden()

  // Tableau de bord branché sur les vraies données.
  await page.getByRole('link', { name: 'Tableau de bord' }).click()
  await expect(dashboardHeading(page)).toBeVisible()
  await expect(page.getByText('Aucune opération pour l’instant')).toHaveCount(0)
  await expect(page.getByText('Soldes des comptes')).toBeVisible()
  await expect(page.getByText(/165,00\s€/)).toBeVisible()
})
