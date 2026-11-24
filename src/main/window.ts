import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { APP_NAME } from '@shared/app-meta'
import type { ResolvedTheme } from '@shared/settings'
import { TITLE_BAR_HEIGHT, WINDOW_CHROME } from '@shared/theme-chrome'
import { MIN_WINDOW_SIZE, type InitialBounds } from './window-state/window-state'

interface MainWindowOptions {
  theme: ResolvedTheme
  contentProtection: boolean
  bounds: InitialBounds
  /**
   * Tests E2E : la fenêtre n'est jamais affichée (rendu et minuteurs non ralentis), pour ne pas
   * prendre le focus ni s'afficher sur le poste de la personne qui lance les tests.
   */
  hidden?: boolean
}

export function createMainWindow({
  theme,
  contentProtection,
  bounds,
  hidden = false,
}: MainWindowOptions): BrowserWindow {
  const chrome = WINDOW_CHROME[theme]
  const isMac = process.platform === 'darwin'
  const { maximized, ...rectangle } = bounds

  const window = new BrowserWindow({
    ...rectangle,
    minWidth: MIN_WINDOW_SIZE.width,
    minHeight: MIN_WINDOW_SIZE.height,
    show: false,
    ...(hidden ? { skipTaskbar: true } : {}),
    title: APP_NAME,
    // En développement, electron.exe générique n'a pas l'icône de Fluxo : on la fournit
    // explicitement. Une fois packagée, l'icône vient de l'exécutable (electron-builder.yml).
    ...(app.isPackaged ? {} : { icon: join(__dirname, '../../build/icon.png') }),
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
      ...(hidden ? { backgroundThrottling: false } : {}),
    },
  })

  window.setContentProtection(contentProtection)
  window.once('ready-to-show', () => {
    if (hidden) return
    if (maximized) window.maximize()
    window.show()
  })
  return window
}
