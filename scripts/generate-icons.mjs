#!/usr/bin/env node
/**
 * Génère build/icon.png (1024×1024) à partir de build/icon.svg.
 * electron-builder dérive ensuite les formats natifs (.ico Windows, .icns macOS, PNG Linux).
 * Usage : npm run icons
 */
import { readFile, writeFile } from 'node:fs/promises'
import { Resvg } from '@resvg/resvg-js'

const svg = await readFile(new URL('../build/icon.svg', import.meta.url), 'utf8')
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1024 } }).render().asPng()
await writeFile(new URL('../build/icon.png', import.meta.url), png)
console.log(`build/icon.png généré (${Math.round(png.length / 1024)} Ko).`)
