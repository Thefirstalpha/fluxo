import type { Db } from './connection'
import { SCHEMA_V1 } from './schema-v1'
import { SCHEMA_V2 } from './schema-v2'
import { SCHEMA_V3 } from './schema-v3'
import { SCHEMA_V4 } from './schema-v4'
import { SCHEMA_V5 } from './schema-v5'
import { SCHEMA_V6 } from './schema-v6'
import { SCHEMA_V7 } from './schema-v7'
import { SCHEMA_V8 } from './schema-v8'
import { SCHEMA_V9 } from './schema-v9'
import { SCHEMA_V10 } from './schema-v10'

export interface Migration {
  /** Version atteinte après la migration (1, 2, 3… sans trou). */
  version: number
  name: string
  up: string
  /** Nécessaire quand la migration reconstruit une table référencée par d'autres tables. */
  rebuildForeignKeys?: boolean
}

/** Migrations du coffre, dans l'ordre. Une migration publiée ne se modifie plus : on en ajoute une. */
export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'schéma initial', up: SCHEMA_V1 },
  { version: 2, name: 'registre (comptes, recherche, filtres)', up: SCHEMA_V2 },
  {
    version: 3,
    name: 'imports (MT940, soldes de rapprochement, profils CSV)',
    up: SCHEMA_V3,
    rebuildForeignKeys: true,
  },
  {
    version: 4,
    name: 'catégorisation (modèle local, file de validation, récurrences)',
    up: SCHEMA_V4,
  },
  {
    version: 5,
    name: 'analyses (agrégats mensuels précalculés, index par date)',
    up: SCHEMA_V5,
  },
  {
    version: 6,
    name: 'virements (catégories liées aux comptes, épargne nette)',
    up: SCHEMA_V6,
  },
  {
    version: 7,
    name: 'salaires (employeurs, contrats, bulletins de paie)',
    up: SCHEMA_V7,
  },
  {
    version: 8,
    name: 'documents et IA (file documentaire, journal IA, relevés PDF)',
    up: SCHEMA_V8,
    rebuildForeignKeys: true,
  },
  {
    version: 9,
    name: 'patrimoine, crédits, budgets et prévisions',
    up: SCHEMA_V9,
  },
  {
    version: 10,
    name: 'IA Google Gemini et synthèses transverses',
    up: SCHEMA_V10,
    rebuildForeignKeys: true,
  },
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
  const fkEnabled = Boolean(db.pragma('foreign_keys', { simple: true }))
  for (const migration of pending) {
    if (migration.rebuildForeignKeys && fkEnabled) db.pragma('foreign_keys = OFF')
    try {
      db.transaction(() => {
        db.exec(migration.up)
        if (migration.rebuildForeignKeys && fkEnabled) {
          const violations = db.pragma('foreign_key_check') as unknown[]
          if (violations.length > 0) throw new Error('Intégrité des clés étrangères rompue')
        }
        db.pragma(`user_version = ${migration.version}`)
      }).immediate()
    } finally {
      if (migration.rebuildForeignKeys && fkEnabled) db.pragma('foreign_keys = ON')
    }
    options.afterEach?.(migration)
  }
  return { from, to: latest }
}
