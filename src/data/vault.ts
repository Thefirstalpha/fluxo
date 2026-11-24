import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ServiceStatus } from './api'
import { closeDatabase, type Db } from './db/connection'
import type { ServiceLogger } from './server'

export interface VaultPaths {
  directory: string
  database: string
  keystore: string
}

export function resolveVaultPaths(directory: string): VaultPaths {
  return {
    directory,
    database: join(directory, 'fluxo.db'),
    keystore: join(directory, 'keystore.json'),
  }
}

/**
 * Coffre : la base chiffrée et ses clés. Seul ce processus détient la clé en clair,
 * le temps où le coffre est déverrouillé ; le verrouillage ferme la base et oublie la clé.
 */
export class Vault {
  private db: Db | null = null

  constructor(
    readonly paths: VaultPaths,
    private readonly log: ServiceLogger,
  ) {
    mkdirSync(paths.directory, { recursive: true, mode: 0o700 })
  }

  status(): ServiceStatus {
    if (this.db) return { state: 'unlocked' }
    return { state: existsSync(this.paths.database) ? 'locked' : 'absent' }
  }

  lock(): ServiceStatus {
    if (this.db) {
      closeDatabase(this.db)
      this.db = null
      this.log('info', 'Coffre verrouillé.')
    }
    return this.status()
  }
}
