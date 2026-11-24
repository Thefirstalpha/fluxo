import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * Écriture atomique d'un petit fichier texte : fichier temporaire puis renommage,
 * pour qu'une coupure ne laisse jamais un fichier à moitié écrit. Lisible par l'utilisateur seul.
 */
export async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp`
  await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600 })
  await rename(temporary, filePath)
}

/** Variante synchrone de `writeFileAtomic` (utilisée à la fermeture de l'application). */
export function writeFileAtomicSync(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp`
  writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o600 })
  renameSync(temporary, filePath)
}

export function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
