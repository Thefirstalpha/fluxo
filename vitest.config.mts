import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Lancer via `npm test` (scripts/vitest.mjs) : corrige la casse du lecteur sous Windows.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src'),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'src/main/**/*.test.ts',
            'src/data/**/*.test.ts',
            'src/imports/**/*.test.ts',
            'src/shared/**/*.test.ts',
          ],
          exclude: ['src/**/*.perf.test.ts'],
        },
      },
      {
        // Mesures de performance (npm run test:perf) : hors npm test, dépendent de la machine.
        extends: true,
        test: {
          name: 'perf',
          environment: 'node',
          include: ['src/**/*.perf.test.ts'],
          testTimeout: 120_000,
        },
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: 'renderer',
          environment: 'happy-dom',
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['src/renderer/src/test/setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.d.ts', 'src/renderer/src/test/**'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
})
