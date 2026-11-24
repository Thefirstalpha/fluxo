import type { ResolvedTheme } from '@shared/settings'
import { useResolvedTheme } from '../theme'

/**
 * Couleurs des graphiques, par thème. Palette catégorielle « Vice Sunset » validée
 * (bande de luminosité, chroma, séparation daltonisme ΔE ≥ 8 entre voisins, contraste).
 * L'ordre des séries est un mécanisme d'accessibilité : ne pas le modifier sans re-valider
 * (voir docs/design/systeme-de-design.md § Graphiques).
 */
export interface ChartTheme {
  surface: string
  text: string
  text2: string
  muted: string
  grid: string
  axis: string
  /** Ordre fixe : rose, couchant, lagon, or, violet, corail, océan, palmier. */
  series: readonly [string, string, string, string, string, string, string, string]
  /** Paire divergente revenus/dépenses (lagon/couchant), validée comme voisine. */
  income: string
  expense: string
  /** Courbe de solde : encre neutre, distincte des deux pôles. */
  net: string
  /** Lavis de mise en évidence (mois sélectionné, survol). */
  highlight: string
}

export const CHART_THEMES: Readonly<Record<ResolvedTheme, ChartTheme>> = {
  light: {
    surface: '#ffffff',
    text: '#1f1f1f',
    text2: '#4d4d4d',
    muted: '#6b6b6b',
    grid: '#ececec',
    axis: '#cfcfcf',
    series: [
      '#dd2a80',
      '#e5690c',
      '#0e9b8f',
      '#dca81c',
      '#7a40da',
      '#cc272e',
      '#0977cb',
      '#278733',
    ],
    income: '#0e9b8f',
    expense: '#e5690c',
    net: '#4d4d4d',
    highlight: 'rgba(200, 23, 95, 0.07)',
  },
  dark: {
    surface: '#1f1f1f',
    text: '#e6e6e6',
    text2: '#b4b4b4',
    muted: '#8f8f8f',
    grid: '#2c2c2c',
    axis: '#3a3a3a',
    series: [
      '#e8428c',
      '#e26b1b',
      '#10a89b',
      '#bb8d0d',
      '#8c5ee8',
      '#d33a3c',
      '#2f8adc',
      '#409d48',
    ],
    income: '#10a89b',
    expense: '#e26b1b',
    net: '#b4b4b4',
    highlight: 'rgba(255, 95, 162, 0.09)',
  },
}

export function useChartTheme(): ChartTheme {
  return CHART_THEMES[useResolvedTheme()]
}

export const CHART_FONT_FAMILY =
  "'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif"
