import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { isMissingFileError, writeFileAtomic, writeFileAtomicSync } from '../fs/atomic-write'

/** Taille par défaut et minimale de la fenêtre principale (pixels indépendants de la densité). */
export const DEFAULT_WINDOW_SIZE = { width: 1320, height: 860 } as const
export const MIN_WINDOW_SIZE = { width: 980, height: 640 } as const

/** Partie d'une fenêtre qui doit rester visible sur un écran pour qu'on la restaure à sa place. */
const MIN_VISIBLE = { width: 160, height: 80 } as const

export interface Rectangle {
  x: number
  y: number
  width: number
  height: number
}

export interface WindowState {
  /** Bornes « normales » (hors maximisation), en pixels indépendants de la densité. */
  bounds: Rectangle
  maximized: boolean
}

const coordinate = z.number().int().min(-100_000).max(100_000)
const length = z.number().int().min(1).max(100_000)

const windowStateSchema = z.object({
  bounds: z.object({ x: coordinate, y: coordinate, width: length, height: length }),
  maximized: z.boolean(),
}) satisfies z.ZodType<WindowState>

/** Lit l'état mémorisé ; absent ou invalide → `undefined` (la fenêtre reprend sa taille par défaut). */
export async function loadWindowState(filePath: string): Promise<WindowState | undefined> {
  try {
    const parsed = windowStateSchema.safeParse(JSON.parse(await readFile(filePath, 'utf8')))
    return parsed.success ? parsed.data : undefined
  } catch (error) {
    if (isMissingFileError(error) || error instanceof SyntaxError) return undefined
    throw error
  }
}

export async function saveWindowState(filePath: string, state: WindowState): Promise<void> {
  await writeFileAtomic(filePath, `${JSON.stringify(state)}\n`)
}

export function saveWindowStateSync(filePath: string, state: WindowState): void {
  writeFileAtomicSync(filePath, `${JSON.stringify(state)}\n`)
}

function intersection(a: Rectangle, b: Rectangle): { width: number; height: number } {
  return {
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)),
  }
}

export interface InitialBounds {
  width: number
  height: number
  /** Absents : la fenêtre est centrée par le système. */
  x?: number
  y?: number
  maximized: boolean
}

/**
 * Adapte l'état mémorisé aux écrans actuels (fonction pure) : un écran débranché, une
 * résolution réduite ou un fichier modifié ne doivent jamais ouvrir la fenêtre hors de vue.
 * - taille bornée entre le minimum de l'application et la plus grande zone de travail ;
 * - position conservée seulement si une partie suffisante de la barre de titre reste visible
 *   sur un écran, sinon la fenêtre est recentrée.
 */
export function fitWindowState(
  state: WindowState | undefined,
  workAreas: readonly Rectangle[],
): InitialBounds {
  if (!state) return { ...DEFAULT_WINDOW_SIZE, maximized: false }

  const maxWidth = Math.max(MIN_WINDOW_SIZE.width, ...workAreas.map((area) => area.width))
  const maxHeight = Math.max(MIN_WINDOW_SIZE.height, ...workAreas.map((area) => area.height))
  const width = Math.min(Math.max(state.bounds.width, MIN_WINDOW_SIZE.width), maxWidth)
  const height = Math.min(Math.max(state.bounds.height, MIN_WINDOW_SIZE.height), maxHeight)

  // On teste la bande du haut (barre de titre) : c'est elle qui permet de déplacer la fenêtre.
  const titleStrip: Rectangle = { x: state.bounds.x, y: state.bounds.y, width, height: 40 }
  const reachable = workAreas.some((area) => {
    const visible = intersection(titleStrip, area)
    return visible.width >= MIN_VISIBLE.width && visible.height >= Math.min(MIN_VISIBLE.height, 40)
  })

  return reachable
    ? { x: state.bounds.x, y: state.bounds.y, width, height, maximized: state.maximized }
    : { width, height, maximized: state.maximized }
}
