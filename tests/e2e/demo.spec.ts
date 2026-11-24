import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createVault, dashboardHeading, expect, PASSWORD, test } from './fixtures'

/** Coffre de démonstration (M1, lot 5) : séparé, signalé, supprimé à la sortie. */

test('démonstration sans coffre : données fictives, puis retour à la création', async ({
  launch,
  userDataDir,
}) => {
  const { page } = await launch()
  await page.getByRole('button', { name: 'Explorer avec des données de démonstration' }).click()
  await expect(dashboardHeading(page)).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Mode démonstration' })).toBeVisible()
  expect(existsSync(join(userDataDir, 'demo-vault', 'fluxo.db'))).toBe(true)
  expect(existsSync(join(userDataDir, 'vault', 'keystore.json'))).toBe(false)

  await page.getByRole('button', { name: 'Quitter la démonstration' }).click()
  await expect(page.getByRole('heading', { name: 'Créer votre coffre' })).toBeVisible()
  expect(existsSync(join(userDataDir, 'demo-vault'))).toBe(false)
})

test('démonstration depuis un coffre verrouillé : le coffre réel reste verrouillé', async ({
  launch,
}) => {
  const { page } = await launch()
  const mode = await createVault(page)
  await page.getByRole('button', { name: 'Verrouiller le coffre' }).click()
  await page.getByRole('button', { name: 'Explorer avec des données de démonstration' }).click()
  await expect(page.getByRole('button', { name: 'Quitter la démonstration' })).toBeVisible()

  await page.getByRole('link', { name: 'Paramètres' }).click()
  await expect(page.getByText(/Indisponible en mode démonstration/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sauvegarder maintenant' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Quitter la démonstration' }).click()
  // Verrouillé avant l'entrée, le coffre réel l'est toujours à la sortie.
  await expect(page.getByRole('heading', { name: 'Coffre verrouillé' })).toBeVisible()
  if (mode === 'session') await page.getByRole('button', { name: 'Déverrouiller' }).click()
  else {
    await page.getByLabel('Mot de passe maître', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Déverrouiller' }).click()
  }
  await expect(page.getByRole('heading', { level: 1, name: 'Paramètres' })).toBeVisible()
})
