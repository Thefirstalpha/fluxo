import { defineConfig } from '@playwright/test'

/**
 * Tests de bout en bout : lancent la build de production (protocole app://, CSP stricte)
 * via Electron — aucun navigateur Playwright n'est nécessaire.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
