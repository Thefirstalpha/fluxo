import { createHash } from 'node:crypto'
import { renameSync, writeFileSync } from 'node:fs'
import { open, readFile } from 'node:fs/promises'
import { z } from 'zod'
import { wrappedKeySchema } from '../crypto/keystore'

/**
 * Format d'une sauvegarde (`*.fluxo-backup`), un seul fichier facile à copier :
 *
 *   « FLUXOBK1 » (8 octets) · longueur du manifeste (uint32, gros-boutiste) · manifeste JSON · base
 *
 * La base est une copie SQLCipher (`VACUUM INTO`), chiffrée avec la clé du coffre.
 * Le manifeste, en clair, ne contient **aucune donnée personnelle** : date, versions, empreinte
 * SHA-256 de la base et enveloppes mot de passe / code de récupération (Argon2id + AES-256-GCM),
 * pour pouvoir restaurer sur un autre ordinateur. L'enveloppe de session (liée à ce poste)
 * n'y figure jamais.
 */

export const BACKUP_EXTENSION = '.fluxo-backup'
const MAGIC = Buffer.from('FLUXOBK1', 'latin1')
const HEADER_BYTES = MAGIC.length + 4
const MAX_MANIFEST_BYTES = 64 * 1024

export const BACKUP_KINDS = ['manual', 'automatic', 'pre-migration', 'pre-restore'] as const
export type BackupKind = (typeof BACKUP_KINDS)[number]

const manifestSchema = z.strictObject({
  format: z.literal('fluxo-backup'),
  version: z.literal(1),
  kind: z.enum(BACKUP_KINDS),
  createdAt: z.iso.datetime(),
  appVersion: z.string().max(50),
  vaultId: z.uuid(),
  schemaVersion: z.number().int().min(1).max(10_000),
  database: z.strictObject({
    size: z.number().int().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  keys: z.strictObject({
    password: wrappedKeySchema.nullable(),
    recovery: wrappedKeySchema.nullable(),
  }),
})

export type BackupManifest = z.infer<typeof manifestSchema>
export type BackupManifestInput = Omit<BackupManifest, 'format' | 'version' | 'database'>

/** Fichier illisible, tronqué, altéré ou qui n'est pas une sauvegarde Fluxo. */
export class InvalidBackupError extends Error {
  constructor(reason: string) {
    super(`Sauvegarde invalide : ${reason}`)
    this.name = 'InvalidBackupError'
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * Écrit la sauvegarde de façon atomique (fichier temporaire puis renommage). Synchrone : elle
 * peut s'exécuter juste avant une migration, dans la même séquence que l'ouverture de la base.
 */
export function writeBackupFile(
  file: string,
  input: BackupManifestInput,
  database: Buffer,
): BackupManifest {
  const manifest = manifestSchema.parse({
    format: 'fluxo-backup',
    version: 1,
    ...input,
    database: { size: database.length, sha256: sha256(database) },
  })
  const json = Buffer.from(JSON.stringify(manifest), 'utf8')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(json.length)
  const temporary = `${file}.tmp`
  writeFileSync(temporary, Buffer.concat([MAGIC, length, json, database]), { mode: 0o600 })
  renameSync(temporary, file)
  return manifest
}

/** Lit seulement l'en-tête et le manifeste (liste des sauvegardes, aperçu avant restauration). */
export async function readBackupManifest(file: string): Promise<BackupManifest> {
  const handle = await open(file, 'r')
  try {
    const header = Buffer.alloc(HEADER_BYTES)
    const { bytesRead } = await handle.read(header, 0, HEADER_BYTES, 0)
    if (bytesRead < HEADER_BYTES || !header.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new InvalidBackupError('signature absente')
    }
    const length = header.readUInt32BE(MAGIC.length)
    if (length === 0 || length > MAX_MANIFEST_BYTES) throw new InvalidBackupError('manifeste')
    const json = Buffer.alloc(length)
    const read = await handle.read(json, 0, length, HEADER_BYTES)
    if (read.bytesRead < length) throw new InvalidBackupError('fichier tronqué')
    const parsed = manifestSchema.safeParse(
      (() => {
        try {
          return JSON.parse(json.toString('utf8')) as unknown
        } catch {
          throw new InvalidBackupError('manifeste illisible')
        }
      })(),
    )
    if (!parsed.success) throw new InvalidBackupError('manifeste non conforme')
    return parsed.data
  } finally {
    await handle.close()
  }
}

/** Lit la base contenue dans la sauvegarde, après vérification de sa taille et de son empreinte. */
export async function readBackupDatabase(file: string): Promise<{
  manifest: BackupManifest
  database: Buffer
}> {
  const manifest = await readBackupManifest(file)
  const bytes = await readFile(file)
  const offset = HEADER_BYTES + bytes.readUInt32BE(MAGIC.length)
  const database = bytes.subarray(offset)
  if (database.length !== manifest.database.size) throw new InvalidBackupError('taille')
  if (sha256(database) !== manifest.database.sha256) throw new InvalidBackupError('empreinte')
  return { manifest, database }
}
