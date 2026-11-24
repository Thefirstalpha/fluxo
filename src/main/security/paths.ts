import { isAbsolute, relative, resolve, sep } from 'node:path'

/**
 * Résout le chemin d'une URL (`/assets/app.js`) à l'intérieur de `root`.
 *
 * Retourne `null` pour toute tentative de sortie du dossier : `../`, séquences encodées,
 * chemin absolu, autre lecteur (Windows), octet nul, encodage invalide.
 * `/` et la chaîne vide désignent `index.html`.
 */
export function resolveInsideRoot(root: string, urlPath: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null

  const relativePath = decoded.replace(/^\/+/, '') || 'index.html'
  if (/^[a-zA-Z]:/.test(relativePath)) return null
  const absoluteRoot = resolve(root)
  const target = resolve(absoluteRoot, relativePath)
  const fromRoot = relative(absoluteRoot, target)

  if (
    fromRoot === '' ||
    fromRoot === '..' ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot)
  ) {
    return null
  }
  return target
}
