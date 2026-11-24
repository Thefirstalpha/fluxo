import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createVault, dashboardHeading, enterVault, expect, test } from './fixtures'

/**
 * Tests de bout en bout sur la build de production (`npm run build` au préalable) :
 * protocole app://, CSP réelle, preload sandboxé, IPC validé.
 * Les fonctions passées à `page.evaluate` s'exécutent dans le renderer (globals du navigateur).
 */

test('démarre sur le tableau de bord, servi par le protocole privé app://', async ({ launch }) => {
  const { page } = await launch()
  await expect(page).toHaveTitle('Fluxo')
  expect(page.url()).toMatch(/^app:\/\/fluxo\/index\.html/)
  await createVault(page)
  await expect(dashboardHeading(page)).toBeVisible()
  await expect(page.getByRole('img', { name: /revenus et des dépenses/i })).toBeVisible()
})

test('le renderer est isolé : ni Node.js, ni require, seulement window.fluxo', async ({
  launch,
}) => {
  const { page } = await launch()
  const exposure = await page.evaluate(() => ({
    require: typeof (globalThis as Record<string, unknown>).require,
    process: typeof (globalThis as Record<string, unknown>).process,
    fluxo: typeof window.fluxo,
    apiKeys: Object.keys(window.fluxo).sort(),
    // Registre, imports et analyses : uniquement des fonctions (listes fermées), rien d'autre.
    ledgerKinds: [...new Set(Object.values(window.fluxo.ledger).map((value) => typeof value))],
    ledgerFrozen: Object.isFrozen(window.fluxo.ledger),
    importsKinds: [...new Set(Object.values(window.fluxo.imports).map((value) => typeof value))],
    importsFrozen: Object.isFrozen(window.fluxo.imports),
    analyticsKinds: [
      ...new Set(Object.values(window.fluxo.analytics).map((value) => typeof value)),
    ],
    analyticsFrozen: Object.isFrozen(window.fluxo.analytics),
  }))
  expect(exposure).toEqual({
    require: 'undefined',
    process: 'undefined',
    fluxo: 'object',
    apiKeys: ['analytics', 'app', 'imports', 'ledger', 'platform', 'settings', 'vault'],
    ledgerKinds: ['function'],
    ledgerFrozen: true,
    importsKinds: ['function'],
    importsFrozen: true,
    analyticsKinds: ['function'],
    analyticsFrozen: true,
  })
})

test('la CSP bloque les scripts injectés et le réseau depuis le renderer', async ({ launch }) => {
  const { page } = await launch()
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
})

test('le process main rejette une mise à jour de préférences invalide', async ({ launch }) => {
  const { page } = await launch()
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
})

test('le thème choisi est appliqué immédiatement et conservé au redémarrage', async ({
  launch,
}) => {
  const first = await launch()
  const mode = await createVault(first.page)
  await first.page.getByRole('link', { name: 'Paramètres' }).click()
  await first.page.getByRole('button', { name: 'Sombre', exact: true }).click()
  await expect(first.page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await first.page.getByRole('button', { name: 'Clair', exact: true }).click()
  await expect(first.page.locator('html')).toHaveAttribute('data-theme', 'light')
  await first.app.close()

  const second = await launch()
  // Le thème s'applique dès l'écran du coffre, avant tout déverrouillage.
  await expect(second.page.locator('html')).toHaveAttribute('data-theme', 'light')
  await enterVault(second.page, mode)
})

test('la taille de la fenêtre est mémorisée entre deux lancements', async ({ launch }) => {
  const first = await launch()
  await first.app.evaluate(({ BrowserWindow }) => {
    // Taille >= MIN_WINDOW_SIZE (980×640) et <= écran CI Windows (1024×720).
    BrowserWindow.getAllWindows()[0]?.setBounds({ width: 995, height: 665 })
  })
  await first.app.close()

  const second = await launch()
  const size = await second.app.evaluate(({ BrowserWindow }) => {
    const bounds = BrowserWindow.getAllWindows()[0]?.getNormalBounds()
    return { width: bounds?.width, height: bounds?.height }
  })
  expect(size).toEqual({ width: 995, height: 665 })
})

test('une erreur de l’interface est consignée, expurgée, dans le journal local', async ({
  launch,
  userDataDir,
}) => {
  const { page } = await launch()
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
})

test('le service de données démarre dans un processus séparé', async ({ launch, userDataDir }) => {
  await launch()
  const logFile = join(userDataDir, 'logs', 'fluxo.log')
  await expect
    .poll(() => (existsSync(logFile) ? readFileSync(logFile, 'utf8') : ''))
    .toContain('[données] Service de données prêt.')
  expect(existsSync(join(userDataDir, 'vault'))).toBe(true)
})

test('aucune nouvelle fenêtre ne peut être ouverte vers un site non autorisé', async ({
  launch,
}) => {
  const { app, page } = await launch()
  await page.evaluate(() => {
    window.open('https://example.com/phishing', '_blank')
  })
  await page.waitForTimeout(300)
  expect(app.windows()).toHaveLength(1)
})
