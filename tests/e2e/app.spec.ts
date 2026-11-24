import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'

/**
 * Tests de bout en bout sur la build de production (`npm run build` au préalable) :
 * protocole app://, CSP réelle, preload sandboxé, IPC validé.
 * Les fonctions passées à `page.evaluate` s'exécutent dans le renderer (globals du navigateur).
 */
let userDataDir: string
const launched: ElectronApplication[] = []

test.beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'fluxo-e2e-'))
})

test.afterEach(async () => {
  await Promise.all(launched.splice(0).map((app) => app.close().catch(() => undefined)))
  rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})

async function launch(): Promise<{ app: ElectronApplication; page: Page }> {
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
}

test('démarre sur le tableau de bord, servi par le protocole privé app://', async () => {
  const { app, page } = await launch()
  await expect(page).toHaveTitle('Fluxo')
  expect(page.url()).toMatch(/^app:\/\/fluxo\/index\.html/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/tableau de bord/i)
  await expect(page.getByRole('img', { name: /revenus et des dépenses/i })).toBeVisible()
  await app.close()
})

test('le renderer est isolé : ni Node.js, ni require, seulement window.fluxo', async () => {
  const { app, page } = await launch()
  const exposure = await page.evaluate(() => ({
    require: typeof (globalThis as Record<string, unknown>).require,
    process: typeof (globalThis as Record<string, unknown>).process,
    fluxo: typeof window.fluxo,
    apiKeys: Object.keys(window.fluxo).sort(),
  }))
  expect(exposure).toEqual({
    require: 'undefined',
    process: 'undefined',
    fluxo: 'object',
    apiKeys: ['app', 'platform', 'settings'],
  })
  await app.close()
})

test('la CSP bloque les scripts injectés et le réseau depuis le renderer', async () => {
  const { app, page } = await launch()
  const result = await page.evaluate(async () => {
    const script = document.createElement('script')
    script.textContent = 'window.__injected = true'
    document.head.append(script)
    let network = 'allowed'
    try {
      await fetch('https://example.com/')
    } catch {
      network = 'blocked'
    }
    const response = await fetch('app://fluxo/index.html')
    return {
      injected: (window as unknown as Record<string, unknown>).__injected === true,
      network,
      csp: response.headers.get('content-security-policy') ?? '',
    }
  })
  expect(result.injected).toBe(false)
  expect(result.network).toBe('blocked')
  expect(result.csp).toContain("default-src 'none'")
  expect(result.csp).toContain("script-src 'self'")
  await app.close()
})

test('le process main rejette une mise à jour de préférences invalide', async () => {
  const { app, page } = await launch()
  const outcome = await page.evaluate(async () => {
    try {
      // @ts-expect-error — valeur volontairement hors contrat.
      await window.fluxo.settings.update({ theme: 'neon', admin: true })
      return 'accepted'
    } catch (error) {
      return String(error)
    }
  })
  expect(outcome).toContain('INVALID_INPUT')
  await app.close()
})

test('le thème choisi est appliqué immédiatement et conservé au redémarrage', async () => {
  const first = await launch()
  await first.page.getByRole('link', { name: 'Paramètres' }).click()
  await first.page.getByRole('button', { name: 'Sombre', exact: true }).click()
  await expect(first.page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await first.page.getByRole('button', { name: 'Clair', exact: true }).click()
  await expect(first.page.locator('html')).toHaveAttribute('data-theme', 'light')
  await first.app.close()

  const second = await launch()
  await expect(second.page.locator('html')).toHaveAttribute('data-theme', 'light')
  await second.app.close()
})

test('la taille de la fenêtre est mémorisée entre deux lancements', async () => {
  const first = await launch()
  await first.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setBounds({ width: 1111, height: 777 })
  })
  await first.app.close()

  const second = await launch()
  const size = await second.app.evaluate(({ BrowserWindow }) => {
    const bounds = BrowserWindow.getAllWindows()[0]?.getNormalBounds()
    return { width: bounds?.width, height: bounds?.height }
  })
  expect(size).toEqual({ width: 1111, height: 777 })
  await second.app.close()
})

test('une erreur de l’interface est consignée, expurgée, dans le journal local', async () => {
  const { app, page } = await launch()
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('échec simulé FR7630006000011234567890189')
    })
  })
  const logFile = join(userDataDir, 'logs', 'fluxo.log')
  await expect
    .poll(() => (existsSync(logFile) ? readFileSync(logFile, 'utf8') : ''))
    .toContain('Erreur de l’interface (window)')
  const log = readFileSync(logFile, 'utf8')
  expect(log).toContain('échec simulé [iban]')
  expect(log).not.toContain('FR7630006000011234567890189')
  await app.close()
})

test('aucune nouvelle fenêtre ne peut être ouverte vers un site non autorisé', async () => {
  const { app, page } = await launch()
  await page.evaluate(() => {
    window.open('https://example.com/phishing', '_blank')
  })
  await page.waitForTimeout(300)
  expect(app.windows()).toHaveLength(1)
  await app.close()
})
