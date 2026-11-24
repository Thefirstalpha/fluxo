#!/usr/bin/env node
/**
 * Lanceur Vitest.
 *
 * Sous Windows, un terminal ouvert par VS Code démarre souvent en « c:\ » (lettre minuscule).
 * Vitest résout alors son propre runner sous deux chemins (« c:\… » et « C:\… ») et échoue
 * avec « Vitest failed to find the runner ». On se place d'abord dans le chemin canonique.
 * Sur macOS/Linux, ce script est transparent.
 */
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

process.chdir(realpathSync.native(process.cwd()))

const require = createRequire(`${process.cwd()}/package.json`)
const vitestPackage = require.resolve('vitest/package.json')
await import(pathToFileURL(vitestPackage.replace(/package\.json$/, 'vitest.mjs')).href)
