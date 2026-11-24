import { createVault, enterVault, expect, test } from './fixtures'

/** Comptes (M2, lot 1) : création, persistance chiffrée, archivage. */

test('crée un compte, le retrouve après redémarrage, puis l’archive', async ({ launch }) => {
  const first = await launch()
  const mode = await createVault(first.page)
  await first.page.getByRole('link', { name: 'Comptes' }).click()
  await expect(first.page.getByText('Aucun compte pour l’instant')).toBeVisible()

  await first.page.getByRole('button', { name: 'Nouveau compte' }).first().click()
  const dialog = first.page.getByRole('dialog', { name: 'Nouveau compte' })
  await dialog.getByLabel('Nom du compte').fill('Livret A')
  await dialog.getByLabel('Type').selectOption('savings')
  await dialog.getByLabel('Solde d’ouverture').fill('2 500,00')
  await dialog.getByLabel('IBAN').fill('FR76 3000 6000 0112 3456 7890 189')
  await dialog.getByRole('button', { name: 'Créer le compte' }).click()
  await expect(dialog).toBeHidden()

  const row = first.page.getByRole('listitem').filter({ hasText: 'Livret A' })
  await expect(row).toContainText(/2\s500,00\s€/)
  await expect(row).toContainText('FR76 •••• •••• 0189')
  await first.app.close()

  const second = await launch()
  await enterVault(second.page, mode)
  await second.page.getByRole('link', { name: 'Comptes' }).click()
  const again = second.page.getByRole('listitem').filter({ hasText: 'Livret A' })
  await expect(again).toContainText(/2\s500,00\s€/)
  await again.getByRole('button', { name: 'Archiver Livret A' }).click()
  await expect(second.page.getByText('Livret A est archivé')).toBeVisible()
  await expect(
    second.page.getByRole('button', { name: /Afficher les comptes archivés \(1\)/ }),
  ).toBeVisible()
})
