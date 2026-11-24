import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { APP_NAME } from '@shared/app-meta'
import type { ResolvedTheme } from '@shared/settings'
import { TITLE_BAR_HEIGHT, WINDOW_CHROME } from '@shared/theme-chrome'

interface MainWindowOptions {
  theme: ResolvedTheme
  contentProtection: boolean
}

export function createMainWindow({ theme, contentProtection }: MainWindowOptions): BrowserWindow {
  const chrome = WINDOW_CHROME[theme]
  const isMac = process.platform === 'darwin'

  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    show: false,
    title: APP_NAME,
    backgroundColor: chrome.background,
    // Barre de titre intégrée, façon éditeur de code (boutons natifs conservés).
    titleBarStyle: 'hidden',
    ...(isMac
      ? { trafficLightPosition: { x: 16, y: 13 } }
      : {
          titleBarOverlay: {
            color: chrome.titleBar,
            symbolColor: chrome.symbol,
            height: TITLE_BAR_HEIGHT,
          },
        }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Checklist de sécurité Electron : isolation et bac à sable systématiques.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      spellcheck: false,
      safeDialogs: true,
      devTools: !app.isPackaged,
    },
  })

  window.setContentProtection(contentProtection)
  window.once('ready-to-show', () => window.show())
  return window
}
