import Database from 'better-sqlite3-multiple-ciphers'

export type Db = Database.Database

/** Clé de base : 256 bits aléatoires, jamais dérivée d'un mot de passe directement. */
export const DATABASE_KEY_BYTES = 32

/** Structure de la base endommagée (contrôle `quick_check` à l'ouverture). */
export class CorruptDatabaseError extends Error {
  constructor() {
    super('Base endommagée')
    this.name = 'CorruptDatabaseError'
  }
}

/** Mauvaise clé ou fichier qui n'est pas une base Fluxo. */
export class WrongKeyError extends Error {
  constructor() {
    super('Clé refusée ou fichier illisible')
    this.name = 'WrongKeyError'
  }
}

function isNotADatabase(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'SQLITE_NOTADB'
}

function isCorruption(error: unknown): boolean {
  if (!(error instanceof Error) || !('code' in error) || typeof error.code !== 'string') {
    return false
  }
  return error.code.startsWith('SQLITE_CORRUPT') || error.code === 'SQLITE_NOTADB'
}

/**
 * Ouvre (ou crée) une base SQLite chiffrée au format SQLCipher 4 (AES-256-CBC, HMAC-SHA512
 * par page), avec une clé brute : pas de dérivation PBKDF2, la clé est déjà aléatoire.
 * Le format SQLCipher garde les données lisibles par des outils standard (avec la clé).
 *
 * Un contrôle rapide de la structure (`quick_check`) est fait à l'ouverture, sauf si l'appelant
 * le planifie lui-même (`check: false` : le coffre le fait au plus une fois par jour, ADR-033).
 *
 * Réglages : WAL (lectures concurrentes, écritures atomiques), synchronisation complète
 * (une opération validée survit à une coupure), clés étrangères, effacement sécurisé
 * des pages libérées, fichiers temporaires en mémoire (jamais en clair sur le disque),
 * cache de pages de 32 Mio (ADR-033).
 */
export function openEncryptedDatabase(
  file: string,
  key: Uint8Array,
  { create, check = true }: { create: boolean; check?: boolean },
): Db {
  if (key.length !== DATABASE_KEY_BYTES) throw new Error('Longueur de clé invalide')
  const db = new Database(file, { fileMustExist: !create })
  try {
    db.pragma("cipher = 'sqlcipher'")
    db.pragma('legacy = 4')
    db.pragma(`key = "x'${Buffer.from(key).toString('hex')}'"`)
    try {
      // Première lecture : échoue immédiatement si la clé est fausse.
      db.prepare('SELECT count(*) FROM sqlite_schema').get()
    } catch (error) {
      if (isNotADatabase(error)) throw new WrongKeyError()
      throw error
    }
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = FULL')
    db.pragma('foreign_keys = ON')
    db.pragma('secure_delete = ON')
    db.pragma('temp_store = MEMORY')
    // Cache de pages déchiffrées : 32 Mio au plus, rempli à l'usage, libéré à la fermeture
    // (verrouillage). En deçà, une base de 50 000 opérations redéchiffre sans cesse ses pages.
    db.pragma('cache_size = -32768')
    if (check) assertHealthy(db)
    return db
  } catch (error) {
    db.close()
    throw error
  }
}

/** `quick_check` : lève `CorruptDatabaseError` si la structure ou une page est altérée. */
export function assertHealthy(db: Db): void {
  let healthy: boolean
  try {
    healthy = checkDatabase(db)
  } catch (error) {
    // Page altérée : l'authentification HMAC échoue pendant le contrôle lui-même.
    if (isCorruption(error)) throw new CorruptDatabaseError()
    throw error
  }
  if (!healthy) throw new CorruptDatabaseError()
}

/** Contrôle rapide de la structure (au démarrage) ; `integrity_check` complet avant sauvegarde. */
export function checkDatabase(db: Db, mode: 'quick' | 'full' = 'quick'): boolean {
  const result: unknown = db.pragma(mode === 'quick' ? 'quick_check' : 'integrity_check', {
    simple: true,
  })
  return result === 'ok'
}

/** Ferme proprement : le journal WAL est reporté dans la base avant fermeture. */
export function closeDatabase(db: Db): void {
  if (!db.open) return
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
  } finally {
    db.close()
  }
}
