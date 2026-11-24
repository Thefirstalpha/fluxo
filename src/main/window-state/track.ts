import { screen, type BrowserWindow } from 'electron'
import { logger } from '../logger'
import {
  fitWindowState,
  loadWindowState,
  saveWindowState,
  saveWindowStateSync,
  type InitialBounds,
  type WindowState,
} from './window-state'

const SAVE_DELAY_MS = 500

/** État initial de la fenêtre, adapté aux écrans branchés au démarrage. */
export async function readInitialBounds(filePath: string): Promise<InitialBounds> {
  const state = await loadWindowState(filePath).catch((error: unknown) => {
    logger.warn('État de la fenêtre illisible, taille par défaut utilisée.', error)
    return undefined
  })
  return fitWindowState(
    state,
    screen.getAllDisplays().map((display) => display.workArea),
  )
}

/** Mémorise taille, position et maximisation (écriture différée, puis immédiate à la fermeture). */
export function trackWindowState(window: BrowserWindow, filePath: string): void {
  let timer: NodeJS.Timeout | undefined

  const snapshot = (): WindowState => ({
    bounds: window.getNormalBounds(),
    maximized: window.isMaximized(),
  })
  const save = (state: WindowState): void => {
    saveWindowState(filePath, state).catch((error: unknown) => {
      logger.warn('Mémorisation de la fenêtre impossible', error)
    })
  }
  const schedule = (): void => {
    clearTimeout(timer)
    timer = setTimeout(() => save(snapshot()), SAVE_DELAY_MS)
  }

  window.on('resize', schedule)
  window.on('move', schedule)
  window.on('maximize', schedule)
  window.on('unmaximize', schedule)
  window.on('close', () => {
    clearTimeout(timer)
    try {
      saveWindowStateSync(filePath, snapshot())
    } catch (error) {
      logger.warn('Mémorisation de la fenêtre impossible', error)
    }
  })
}
