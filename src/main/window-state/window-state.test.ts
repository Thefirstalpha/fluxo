import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_WINDOW_SIZE,
  fitWindowState,
  loadWindowState,
  MIN_WINDOW_SIZE,
  saveWindowState,
  type WindowState,
} from './window-state'

const primary = { x: 0, y: 0, width: 1920, height: 1040 }
const secondary = { x: 1920, y: 0, width: 1280, height: 984 }

describe('fitWindowState', () => {
  it('reprend la taille par défaut sans état mémorisé', () => {
    expect(fitWindowState(undefined, [primary])).toEqual({
      ...DEFAULT_WINDOW_SIZE,
      maximized: false,
    })
  })

  it('restaure position, taille et maximisation sur un écran présent', () => {
    const state: WindowState = {
      bounds: { x: 2000, y: 40, width: 1100, height: 800 },
      maximized: true,
    }
    expect(fitWindowState(state, [primary, secondary])).toEqual({
      x: 2000,
      y: 40,
      width: 1100,
      height: 800,
      maximized: true,
    })
  })

  it('recentre une fenêtre restée sur un écran débranché', () => {
    const state: WindowState = {
      bounds: { x: 2000, y: 40, width: 1100, height: 800 },
      maximized: false,
    }
    expect(fitWindowState(state, [primary])).toEqual({
      width: 1100,
      height: 800,
      maximized: false,
    })
  })

  it('recentre une fenêtre dont seule une bordure dépasserait de l’écran', () => {
    const state: WindowState = {
      bounds: { x: 1900, y: 100, width: 1100, height: 800 },
      maximized: false,
    }
    expect(fitWindowState(state, [primary])).not.toHaveProperty('x')
  })

  it('recentre une fenêtre dont la barre de titre serait au-dessus de l’écran', () => {
    const state: WindowState = {
      bounds: { x: 100, y: -600, width: 1100, height: 800 },
      maximized: false,
    }
    expect(fitWindowState(state, [primary])).not.toHaveProperty('y')
  })

  it('borne la taille entre le minimum et la plus grande zone de travail', () => {
    const tiny: WindowState = {
      bounds: { x: 10, y: 10, width: 200, height: 100 },
      maximized: false,
    }
    expect(fitWindowState(tiny, [primary])).toMatchObject(MIN_WINDOW_SIZE)

    const huge: WindowState = {
      bounds: { x: 0, y: 0, width: 5000, height: 4000 },
      maximized: false,
    }
    expect(fitWindowState(huge, [primary, secondary])).toMatchObject({
      width: 1920,
      height: 1040,
    })
  })
})

describe('loadWindowState / saveWindowState', () => {
  let directory: string
  let file: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'fluxo-window-'))
    file = join(directory, 'window-state.json')
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('relit ce qui a été écrit', async () => {
    const state: WindowState = { bounds: { x: 5, y: 6, width: 1000, height: 700 }, maximized: true }
    await saveWindowState(file, state)
    await expect(loadWindowState(file)).resolves.toEqual(state)
  })

  it('ignore un fichier absent, illisible ou hors limites', async () => {
    await expect(loadWindowState(file)).resolves.toBeUndefined()
    await writeFile(file, '{ pas du json', 'utf8')
    await expect(loadWindowState(file)).resolves.toBeUndefined()
    await writeFile(file, JSON.stringify({ bounds: { x: 0.5, y: 0, width: 1, height: 1 } }))
    await expect(loadWindowState(file)).resolves.toBeUndefined()
    // Le fichier n'est pas réécrit par la lecture.
    expect(await readFile(file, 'utf8')).toContain('bounds')
  })
})
