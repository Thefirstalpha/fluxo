import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  _electron as electron,
  expect,
  test as base,
  type ElectronApplication,
  type Page,
} from '@playwright/test'

/**
 * Lancement de la build de production dans un dossier de données isolé et jetable
 * (`FLUXO_USER_DATA_DIR`, ignoré par une application packagée).
 */
export interface FluxoFixtures {
  userDataDir: string
  launch: () => Promise<{ app: ElectronApplication; page: Page }>
}

export const test = base.extend<FluxoFixtures>({
  // eslint-disable-next-line no-empty-pattern -- signature imposée par Playwright
  userDataDir: async ({}, use) => {
    const directory = mkdtempSync(join(tmpdir(), 'fluxo-e2e-'))
    await use(directory)
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  },
  launch: async ({ userDataDir }, use) => {
    const launched: ElectronApplication[] = []
    await use(async () => {
      // Hérité des terminaux lancés depuis un éditeur basé sur Electron : ferait démarrer Electron en mode Node.
      const { ELECTRON_RUN_AS_NODE: _ignored, ...env } = process.env
      const app = await electron.launch({
        args: ['.'],
        env: { ...env, FLUXO_USER_DATA_DIR: userDataDir },
        // Playwright émule « prefers-color-scheme: light » par défaut : on laisse Electron piloter le thème.
        colorScheme: null,
      })
      launched.push(app)
      const page = await app.firstWindow()
      await page.waitForLoadState('domcontentloaded')
      return { app, page }
    })
    await Promise.all(launched.map((app) => app.close().catch(() => undefined)))
  },
})

export { expect }

export const PASSWORD = 'une phrase de passe pour les tests'

export function dashboardHeading(page: Page) {
  return page.getByRole('heading', { level: 1, name: /tableau de bord/i })
}

/**
 * Crée le coffre au premier lancement. `auto` : mode session si le trousseau du système
 * est utilisable (Windows, macOS, Linux avec trousseau), sinon mot de passe maître.
 * Retourne le mode effectivement choisi.
 */
export async function createVault(
  page: Page,
  mode: 'auto' | 'password' = 'auto',
): Promise<'session' | 'password'> {
  await expect(page.getByRole('heading', { name: 'Créer votre coffre' })).toBeVisible()
  const session = page.getByRole('radio', { name: /^Avec ma session/ })
  const chosen = mode === 'password' || (await session.isDisabled()) ? 'password' : 'session'
  if (chosen === 'password') {
    await page.getByRole('radio', { name: /^Avec un mot de passe maître/ }).check()
    await page.getByLabel('Mot de passe maître', { exact: true }).fill(PASSWORD)
    await page.getByLabel('Confirmer le mot de passe').fill(PASSWORD)
  }
  await page.getByRole('checkbox', { name: /code de récupération/ }).uncheck()
  await page.getByRole('button', { name: 'Créer mon coffre' }).click()
  await expect(dashboardHeading(page)).toBeVisible()
  return chosen
}

/** Après un redémarrage : déverrouille si nécessaire (le mode session s'ouvre seul). */
export async function enterVault(page: Page, mode: 'session' | 'password'): Promise<void> {
  if (mode === 'password') {
    await page.getByLabel('Mot de passe maître', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Déverrouiller' }).click()
  }
  await expect(dashboardHeading(page)).toBeVisible()
}
