import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

/**
 * Règle de bundling (cf. docs/architecture/vue-ensemble.md) :
 * - tout ce qui peut être bundlé est en devDependencies → rien n'est copié dans app.asar/node_modules ;
 * - seules les dépendances natives du process main (ex. SQLCipher, jalon M1) iront en "dependencies"
 *   et seront externalisées automatiquement (`build.externalizeDeps`, actif par défaut).
 */
const sharedAlias = {
  '@shared': resolve('src/shared'),
}

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias },
    // Non minifié : des traces d'erreur lisibles dans les journaux valent plus que quelques Ko.
    build: { emptyOutDir: true },
  },
  preload: {
    resolve: { alias: sharedAlias },
    build: { emptyOutDir: true },
  },
  renderer: {
    resolve: {
      alias: {
        ...sharedAlias,
        '@renderer': resolve('src/renderer/src'),
      },
    },
    plugins: [react(), tailwindcss()],
    build: {
      emptyOutDir: true,
      // electron-vite ne minifie pas par défaut : on le fait pour le renderer (poids et temps d'analyse).
      minify: true,
      // Budget : avertissement au-delà de 700 Ko par chunk minifié. ECharts « à la carte »
      // (barres, courbes, zoom, légende, infobulles) pèse ~550 Ko et vit dans le chunk du tableau de bord.
      chunkSizeWarningLimit: 700,
    },
  },
})
