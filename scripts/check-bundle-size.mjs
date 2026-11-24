#!/usr/bin/env node
/**
 * Contrôle des budgets de poids de la build (à lancer après `npm run build`).
 *
 * Budgets (docs/architecture/performance.md), tailles minifiées non compressées, 1 Ko = 1000 octets :
 * - JS initial du renderer (script d'entrée de out/renderer/index.html + modulepreload) ≤ 300 Ko ;
 * - chaque chunk JS du renderer ≤ 700 Ko ;
 * - CSS total du renderer ≤ 40 Ko.
 * Les tailles des process main et preload sont affichées pour information.
 *
 * Code de sortie : 0 si tous les budgets sont respectés, 1 sinon (ou si la build est absente).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const KB = 1000
const BUDGETS = {
  initialJs: 300 * KB,
  jsChunk: 700 * KB,
  totalCss: 40 * KB,
}

const root = resolve(fileURLToPath(import.meta.url), '../..')
const outDir = join(root, 'out')
const rendererDir = join(outDir, 'renderer')
const assetsDir = join(rendererDir, 'assets')
const indexHtml = join(rendererDir, 'index.html')

function fail(message) {
  console.error(`✖ ${message}`)
  process.exit(1)
}

function formatKb(bytes) {
  return `${(bytes / KB).toFixed(2)} Ko`
}

function listFiles(dir, extension) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith(extension))
    .map((name) => ({ name, size: statSync(join(dir, name)).size }))
    .sort((a, b) => b.size - a.size)
}

/** Fichiers JS chargés au démarrage : `<script src>` et `<link rel="modulepreload">` locaux. */
function initialScripts(html) {
  const refs = new Set()
  for (const match of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)) refs.add(match[1])
  for (const match of html.matchAll(/<link\b[^>]*>/g)) {
    const tag = match[0]
    const href = /\bhref="([^"]+)"/.exec(tag)?.[1]
    if (href && /\brel="modulepreload"/.test(tag)) refs.add(href)
  }
  return [...refs]
    .filter((ref) => !/^[a-z]+:/i.test(ref) && ref.endsWith('.js'))
    .map((ref) => posix.basename(ref.split(/[?#]/)[0]))
}

function printTable(rows) {
  const headers = ['Contrôle', 'Taille', 'Budget', 'Statut']
  const widths = headers.map((header, i) =>
    Math.max(header.length, ...rows.map((row) => String(row[i]).length)),
  )
  const line = (cells) =>
    `| ${cells.map((cell, i) => String(cell).padEnd(widths[i])).join(' | ')} |`
  console.log(line(headers))
  console.log(`|${widths.map((width) => '-'.repeat(width + 2)).join('|')}|`)
  for (const row of rows) console.log(line(row))
}

if (!existsSync(indexHtml) || !existsSync(assetsDir)) {
  fail('Build introuvable (out/renderer). Lancer `npm run build` avant `npm run size`.')
}

const jsFiles = listFiles(assetsDir, '.js')
const cssFiles = listFiles(assetsDir, '.css')
const sizeOf = new Map(jsFiles.map((file) => [file.name, file.size]))

const entries = initialScripts(readFileSync(indexHtml, 'utf8'))
if (entries.length === 0) fail('Aucun <script src> trouvé dans out/renderer/index.html.')
const missing = entries.filter((name) => !sizeOf.has(name))
if (missing.length > 0)
  fail(`Script(s) d'entrée absent(s) de out/renderer/assets : ${missing.join(', ')}`)

const initialJs = entries.reduce((total, name) => total + (sizeOf.get(name) ?? 0), 0)
const totalCss = cssFiles.reduce((total, file) => total + file.size, 0)

const rows = []
let failures = 0
function check(label, size, budget) {
  const ok = size <= budget
  if (!ok) failures += 1
  rows.push([label, formatKb(size), `≤ ${formatKb(budget)}`, ok ? '✔ ok' : '✖ dépassé'])
}

check(`JS initial (${entries.join(', ')})`, initialJs, BUDGETS.initialJs)
for (const file of jsFiles) check(`Chunk ${file.name}`, file.size, BUDGETS.jsChunk)
check(
  `CSS total (${cssFiles.length} fichier${cssFiles.length > 1 ? 's' : ''})`,
  totalCss,
  BUDGETS.totalCss,
)

console.log('Budgets de poids du renderer (1 Ko = 1000 octets, minifié, non compressé)\n')
printTable(rows)

console.log('\nPour information (sans budget) :')
for (const part of ['main', 'preload']) {
  for (const file of listFiles(join(outDir, part), '.js')) {
    console.log(`  out/${part}/${basename(file.name)} : ${formatKb(file.size)}`)
  }
}

if (failures > 0) {
  console.error(
    `\n✖ ${failures} budget${failures > 1 ? 's' : ''} dépassé${failures > 1 ? 's' : ''} — voir docs/architecture/performance.md.`,
  )
  process.exit(1)
}
console.log('\n✔ Tous les budgets de poids sont respectés.')
