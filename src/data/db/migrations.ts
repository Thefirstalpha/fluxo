import type { Db } from './connection'
import { SCHEMA_V1 } from './schema-v1'

export interface Migration {
  /** Version atteinte après la migration (1, 2, 3… sans trou). */
  version: number
  name: string
  up: string
}

/** Migrations du coffre, dans l'ordre. Une migration publiée ne se modifie plus : on en ajoute une. */
export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'schéma initial', up: SCHEMA_V1 },
]

export const LATEST_SCHEMA_VERSION = MIGRATIONS.at(-1)?.version ?? 0

/** La base a été écrite par une version plus récente de Fluxo : on refuse de l'ouvrir. */
export class SchemaTooNewError extends Error {
  constructor(readonly found: number) {
    super(`Version de schéma ${found} inconnue`)
    this.name = 'SchemaTooNewError'
  }
}

export function schemaVersion(db: Db): number {
  const version: unknown = db.pragma('user_version', { simple: true })
  return typeof version === 'number' ? version : 0
}

export interface MigrationOptions {
  migrations?: readonly Migration[]
  /** Appelé une fois avant de migrer une base existante (sauvegarde de sécurité). */
  beforeMigrating?: (fromVersion: number) => void
  /** Appelé après chaque migration réussie (journal d'audit). */
  afterEach?: (migration: Migration) => void
}

/**
 * Amène la base à la dernière version. Chaque migration s'exécute dans **une transaction**
 * (schéma + numéro de version) : en cas d'échec, la base reste à la version précédente, intacte.
 * Une base existante est sauvegardée avant la première migration.
 */
export function migrate(db: Db, options: MigrationOptions = {}): { from: number; to: number } {
  const migrations = options.migrations ?? MIGRATIONS
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) throw new Error('Migrations non contiguës')
  })
  const latest = migrations.at(-1)?.version ?? 0
  const from = schemaVersion(db)
  if (from > latest) throw new SchemaTooNewError(from)
  const pending = migrations.filter((migration) => migration.version > from)
  if (pending.length === 0) return { from, to: from }

  if (from > 0) options.beforeMigrating?.(from)
  for (const migration of pending) {
    db.transaction(() => {
      db.exec(migration.up)
      db.pragma(`user_version = ${migration.version}`)
    }).immediate()
    options.afterEach?.(migration)
  }
  return { from, to: latest }
}
