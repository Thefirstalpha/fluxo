import { nativeTheme, type BrowserWindow } from 'electron'
import type { ResolvedTheme, ThemePreference } from '@shared/settings'
import { TITLE_BAR_HEIGHT, WINDOW_CHROME } from '@shared/theme-chrome'

/**
 * `nativeTheme.themeSource` pilote à la fois l'interface native (barre de titre, menus)
 * ET la media query CSS `prefers-color-scheme` du renderer : un seul interrupteur pour tout.
 */
export function applyThemePreference(preference: ThemePreference): void {
  nativeTheme.themeSource = preference
}

export function resolvedTheme(): ResolvedTheme {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

export function syncWindowChrome(window: BrowserWindow): void {
  const chrome = WINDOW_CHROME[resolvedTheme()]
  window.setBackgroundColor(chrome.background)
  if (process.platform !== 'darwin') {
    window.setTitleBarOverlay({
      color: chrome.titleBar,
      symbolColor: chrome.symbol,
      height: TITLE_BAR_HEIGHT,
    })
  }
}
