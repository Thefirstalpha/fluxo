import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PALETTE } from '@shared/ledger/model'
import { WINDOW_CHROME } from '@shared/theme-chrome'
import { CHART_THEMES } from '../lib/charts/chart-theme'

// Sous happy-dom, import.meta.url n'est pas une URL file:// : chemin relatif à la racine du projet.
const tokensCss = readFileSync(resolve('src/renderer/src/styles/tokens.css'), 'utf8')

/** Les couleurs dupliquées (fenêtre native, graphiques) ne doivent jamais diverger du CSS. */
function readTokens(css: string): Map<string, string> {
  return new Map(
    [...css.matchAll(/(--fx-[\w-]+):\s*([^;]+);/g)].map((match) => [
      match[1] ?? '',
      (match[2] ?? '').trim(),
    ]),
  )
}

const darkStart = tokensCss.indexOf('@media (prefers-color-scheme: dark)')
const themes = [
  ['light', readTokens(tokensCss.slice(0, darkStart))],
  ['dark', readTokens(tokensCss.slice(darkStart))],
] as const

describe('tokens.css', () => {
  it('définit un bloc clair et un bloc sombre', () => {
    expect(darkStart).toBeGreaterThan(0)
  })

  it.each(themes)('reste aligné sur les couleurs natives de la fenêtre (%s)', (theme, tokens) => {
    expect(tokens.get('--fx-bg')).toBe(WINDOW_CHROME[theme].background)
    expect(tokens.get('--fx-titlebar')).toBe(WINDOW_CHROME[theme].titleBar)
    expect(tokens.get('--fx-text')).toBe(WINDOW_CHROME[theme].symbol)
  })

  it.each(themes)('reste aligné sur la palette validée des graphiques (%s)', (theme, tokens) => {
    const chart = CHART_THEMES[theme]
    chart.series.forEach((color, index) => {
      expect(tokens.get(`--fx-series-${index + 1}`)).toBe(color)
    })
    expect(tokens.get('--fx-surface')).toBe(chart.surface)
    expect(tokens.get('--fx-grid')).toBe(chart.grid)
    expect(tokens.get('--fx-axis')).toBe(chart.axis)
    expect(tokens.get('--fx-text-muted')).toBe(chart.muted)
  })

  it('associe chaque couleur enregistrable (comptes, catégories) à un emplacement de la palette', () => {
    const light = themes[0][1]
    PALETTE.forEach((color, index) => {
      expect(light.get(`--fx-series-${index + 1}`)).toBe(color)
    })
  })
})
