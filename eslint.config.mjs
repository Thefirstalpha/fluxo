import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/** Interdictions communes : surfaces d'injection de code / HTML. */
const securitySyntax = [
  {
    selector: 'AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]',
    message: 'Pas d’innerHTML/outerHTML : utiliser textContent ou du JSX (risque XSS).',
  },
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: 'dangerouslySetInnerHTML est interdit (risque XSS).',
  },
  {
    selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
    message: 'insertAdjacentHTML est interdit (risque XSS).',
  },
]

export default defineConfig(
  globalIgnores([
    'out/**',
    'dist/**',
    'release/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
  ]),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-syntax': ['error', ...securitySyntax],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  // Process main & preload : Node.js, jamais de React.
  {
    files: [
      'src/main/**/*.ts',
      'src/preload/**/*.ts',
      '*.config.ts',
      '*.config.mts',
      'tests/e2e/**/*.ts',
    ],
    languageOptions: { globals: globals.node },
  },
  // Code partagé : TypeScript pur, aucune dépendance à un process.
  {
    files: ['src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['electron', 'react', 'react-dom'],
          patterns: [
            { group: ['node:*'], message: 'src/shared doit rester portable (ni Node ni DOM).' },
            { group: ['**/main/**', '**/preload/**', '**/renderer/**'] },
          ],
        },
      ],
    },
  },
  // Renderer : navigateur sandboxé, accès au système uniquement via window.fluxo (preload).
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'electron',
              message: 'Le renderer n’importe jamais electron : passer par window.fluxo (preload).',
            },
          ],
          patterns: [
            { group: ['node:*'], message: 'Pas d’API Node.js dans le renderer.' },
            { group: ['**/main/**', '**/preload/index*'] },
          ],
        },
      ],
    },
  },
  // Les tests du renderer s'exécutent dans Node (happy-dom) : lecture de fixtures autorisée.
  {
    files: ['src/renderer/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { paths: ['electron'] }],
    },
  },
)
