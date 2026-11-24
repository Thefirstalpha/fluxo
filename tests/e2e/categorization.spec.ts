import { createVault, expect, test } from './fixtures'

/** Catégorisation automatique (M4) : règles avec aperçu et multi-étiquettes, file À valider et abonnements démo. */

test('crée une règle depuis une opération, l’applique et valide la file À valider', async ({
  launch,
}) => {
  const { page } = await launch()
  await createVault(page)

  // Crée une étiquette pour vérifier E09 (multi-étiquettes sur une règle).
  await page.getByRole('link', { name: 'Catégories' }).click()
  await page.getByRole('radio', { name: 'Étiquettes' }).click()
  await page.getByLabel('Nom de l’étiquette').fill('Fixe')
  await page.getByRole('button', { name: 'Ajouter' }).click()
  await expect(page.getByText('Fixe', { exact: true })).toBeVisible()

  // Crée un compte en saisie manuelle et deux opérations non catégorisées.
  await page.getByRole('link', { name: 'Comptes' }).click()
  await page.getByRole('button', { name: 'Nouveau compte' }).first().click()
  const accDialog = page.getByRole('dialog', { name: 'Nouveau compte' })
  await accDialog.getByLabel('Nom du compte').fill('Courant M4')
  await accDialog.getByLabel('Type').selectOption('cash')
  await accDialog.getByLabel('Solde d’ouverture').fill('1500,00')
  await accDialog.getByRole('button', { name: 'Créer le compte' }).click()
  await expect(accDialog).toBeHidden()

  await page.getByRole('link', { name: 'Transactions' }).click()
  for (const row of [
    { label: 'PRLV OPERATEUR FIBRE PRO', amount: '-29,99' },
    { label: 'ATELIER POTERIE BLEUE', amount: '-35,00' },
  ]) {
    await page.getByRole('button', { name: 'Nouvelle opération' }).first().click()
    const entryDialog = page.getByRole('dialog', { name: 'Nouvelle opération' })
    await entryDialog.getByLabel('Libellé').fill(row.label)
    await entryDialog.getByLabel('Montant').fill(row.amount)
    await entryDialog.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(entryDialog).toBeHidden()
  }

  // Ouvre la page Catégorisation et crée une règle avec aperçu en direct + étiquette.
  await page.getByRole('link', { name: /Catégorisation/ }).click()
  await expect(page.getByRole('heading', { name: 'Catégorisation & règles' })).toBeVisible()

  await page.getByRole('radio', { name: /Règles/ }).click()
  await page.getByRole('button', { name: 'Nouvelle règle' }).click()
  const ruleDialog = page.getByRole('dialog', { name: 'Nouvelle règle' })
  await ruleDialog.getByLabel('Nom de la règle').fill('Fibre pro')
  await ruleDialog.getByLabel('Motif').fill('OPERATEUR FIBRE')
  await expect(
    ruleDialog.getByText('Aperçu en direct : 1 opération(s) correspondante(s)'),
  ).toBeVisible()
  const catOption = await ruleDialog
    .getByLabel('Catégorie à attribuer')
    .locator('option', { hasText: /Téléphone/ })
    .first()
    .getAttribute('value')
  if (catOption) await ruleDialog.getByLabel('Catégorie à attribuer').selectOption(catOption)
  await ruleDialog.getByRole('button', { name: 'Fixe' }).click()
  await ruleDialog.getByLabel('Renommer le libellé en').fill('Fibre bureau')
  await ruleDialog.getByRole('button', { name: 'Enregistrer la règle' }).click()
  await expect(ruleDialog).toBeHidden()
  await expect(page.getByText('Fibre pro', { exact: true })).toBeVisible()

  // File À valider : l'opération restante ("ATELIER POTERIE BLEUE") y apparaît et se valide.
  await page.getByRole('radio', { name: /À valider/ }).click()
  await expect(page.getByText('Atelier Poterie Bleue', { exact: true })).toBeVisible()
  const queueSelect = page.getByRole('combobox', { name: 'Choisir une catégorie…' }).first()
  const leisureOption = await queueSelect
    .locator('option', { hasText: /Loisirs|Sorties|Culture/ })
    .first()
    .getAttribute('value')
  if (leisureOption) await queueSelect.selectOption(leisureOption)
  await page.getByRole('button', { name: 'Valider' }).first().click()
  await expect(page.getByText('Aucune opération en attente de validation.')).toBeVisible()

  // Vérifie le libellé renommé dans le registre et la création rapide de règle depuis le détail.
  await page.getByRole('link', { name: 'Transactions' }).click()
  await expect(page.getByText('Fibre bureau')).toBeVisible()
  await page.getByText('Fibre bureau').click()
  const detail = page.getByRole('complementary', { name: 'Détail de l’opération' })
  await expect(detail.getByText(/Règle « Fibre pro »/)).toBeVisible()
  await expect(
    detail.getByRole('button', { name: 'Créer une règle depuis cette opération' }),
  ).toBeVisible()
})
