import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createVault, dashboardHeading, enterVault, expect, test } from './fixtures'

/** Coffre chiffré (M1) : création, redémarrage, déverrouillage, verrouillage. */

test('premier lancement : création du coffre, fichier de base illisible sans la clé', async ({
  launch,
  userDataDir,
}) => {
  const { page } = await launch()
  await createVault(page)

  const database = readFileSync(join(userDataDir, 'vault', 'fluxo.db'))
  expect(database.subarray(0, 15).toString('latin1')).not.toBe('SQLite format 3')
  const keystore: unknown = JSON.parse(
    readFileSync(join(userDataDir, 'vault', 'keystore.json'), 'utf8'),
  )
  expect(keystore).toMatchObject({ format: 'fluxo-keystore', version: 1 })
  expect(JSON.stringify(keystore)).not.toMatch(/"key"/)
})

test('mode session : le coffre se rouvre seul au redémarrage', async ({ launch }) => {
  const first = await launch()
  const mode = await createVault(first.page)
  test.skip(mode !== 'session', 'Aucun trousseau sécurisé sur ce système')
  await first.app.close()

  const second = await launch()
  await expect(dashboardHeading(second.page)).toBeVisible()
})

test('mot de passe maître : refusé s’il est faux, accepté sinon, après redémarrage', async ({
  launch,
}) => {
  const first = await launch()
  await createVault(first.page, 'password')
  await first.app.close()

  const { page } = await launch()
  await expect(page.getByRole('heading', { name: 'Coffre verrouillé' })).toBeVisible()
  await page.getByLabel('Mot de passe maître', { exact: true }).fill('pas le bon mot de passe')
  await page.getByRole('button', { name: 'Déverrouiller' }).click()
  await expect(page.getByRole('alert')).toHaveText('Mot de passe incorrect.')
  await enterVault(page, 'password')
})

test('verrouillage depuis la barre de titre : l’interface est remplacée par l’écran du coffre', async ({
  launch,
}) => {
  const { page } = await launch()
  const mode = await createVault(page)
  await page.getByRole('button', { name: 'Verrouiller le coffre' }).click()
  await expect(page.getByRole('heading', { name: 'Coffre verrouillé' })).toBeVisible()
  await expect(dashboardHeading(page)).toHaveCount(0)
  if (mode === 'session') await page.getByRole('button', { name: 'Déverrouiller' }).click()
  await enterVault(page, mode)
})

test('le renderer ne peut ni fournir une clé ni lire l’enveloppe de session', async ({
  launch,
}) => {
  const { page } = await launch()
  await createVault(page)
  const outcome = await page.evaluate(async () => {
    try {
      // @ts-expect-error — méthode réservée au process main, hors contrat du renderer.
      await window.fluxo.vault.unlock({ method: 'key', key: new Uint8Array(32) })
      return 'accepted'
    } catch (error) {
      return String(error)
    }
  })
  expect(outcome).toContain('INVALID_INPUT')
  const status = await page.evaluate(() => window.fluxo.vault.getStatus())
  expect(JSON.stringify(status)).not.toMatch(/blob|key/i)
})
