import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication } from '@playwright/test'
import { createVault, expect, PASSWORD, test } from './fixtures'

/** Sauvegardes, restauration, export et effacement (M1, lot 4). */

/** Remplace la boîte de dialogue native (process main) par un chemin choisi par le test. */
async function stubDialog(app: ElectronApplication, path: string): Promise<void> {
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [chosen] })
  }, path)
}

test('sauvegarde automatique à la création, manuelle à la demande, puis restauration', async ({
  launch,
  userDataDir,
}) => {
  const { app, page } = await launch()
  await createVault(page)
  const backups = join(userDataDir, 'vault', 'backups')
  await expect
    .poll(() => (existsSync(backups) ? readdirSync(backups) : []).join(','))
    .toMatch(/-automatic\.fluxo-backup/)

  await page.getByRole('link', { name: 'Paramètres' }).click()
  await page.getByRole('button', { name: 'Sauvegarder maintenant' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Sauvegarde créée' })).toBeVisible()
  const manual = readdirSync(backups).find((name) => name.endsWith('-manual.fluxo-backup'))
  expect(manual).toBeDefined()
  const bytes = readFileSync(join(backups, manual ?? ''))
  expect(bytes.subarray(0, 8).toString('latin1')).toBe('FLUXOBK1')

  await stubDialog(app, join(backups, manual ?? ''))
  await page.getByRole('button', { name: 'Restaurer une sauvegarde…' }).click()
  await page.getByRole('button', { name: 'Choisir le fichier…' }).click()
  await expect(page.getByText('Opérations')).toBeVisible()
  await page.getByRole('button', { name: 'Restaurer', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Restaurer une sauvegarde…' })).toBeVisible()
  expect(readdirSync(backups).some((name) => name.endsWith('-pre-restore.fluxo-backup'))).toBe(true)
})

test('export en clair dans le dossier choisi', async ({ launch, userDataDir }) => {
  const { app, page } = await launch()
  await createVault(page)
  const destination = join(userDataDir, 'export-cible')
  mkdirSync(destination)
  await stubDialog(app, destination)
  await page.getByRole('link', { name: 'Paramètres' }).click()
  await page.getByRole('button', { name: 'Exporter mes données…' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Export' })).toBeVisible()
  const [folder] = readdirSync(destination)
  expect(folder).toMatch(/^Fluxo-export-/)
  expect(readdirSync(join(destination, folder ?? ''))).toContain('fluxo.json')
})

test('« Tout effacer » supprime le coffre et ramène à la création', async ({
  launch,
  userDataDir,
}) => {
  const { page } = await launch()
  const mode = await createVault(page)
  await page.getByRole('link', { name: 'Paramètres' }).click()
  await page.getByRole('button', { name: 'Tout effacer…' }).click()
  await page.getByLabel('Pour confirmer, saisissez EFFACER').fill('EFFACER')
  if (mode === 'password') await page.getByLabel('Mot de passe actuel').fill(PASSWORD)
  await page.getByRole('button', { name: 'Effacer définitivement' }).click()
  await expect(page.getByRole('heading', { name: 'Créer votre coffre' })).toBeVisible()
  expect(existsSync(join(userDataDir, 'vault', 'fluxo.db'))).toBe(false)
  expect(existsSync(join(userDataDir, 'vault', 'backups'))).toBe(false)
})
