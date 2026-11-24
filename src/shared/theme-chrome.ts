import type { ResolvedTheme } from './settings'

/**
 * Couleurs natives de la fenêtre (fond avant le premier rendu, barre de titre Windows/Linux).
 * Elles DOIVENT rester alignées sur src/renderer/src/styles/tokens.css : un test le vérifie.
 */
export const WINDOW_CHROME: Readonly<
  Record<ResolvedTheme, { background: string; titleBar: string; symbol: string }>
> = {
  light: { background: '#f8f8f8', titleBar: '#f8f8f8', symbol: '#1f1f1f' },
  dark: { background: '#181818', titleBar: '#181818', symbol: '#e6e6e6' },
}

/** Hauteur de la barre de titre personnalisée (px), partagée avec le CSS. */
export const TITLE_BAR_HEIGHT = 40
