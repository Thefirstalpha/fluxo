import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { argon2id } from 'hash-wasm/dist/argon2.umd.min.js'
import { z } from 'zod'
import { VAULT_MODES } from '@shared/vault'
import { DATABASE_KEY_BYTES } from '../db/connection'

/**
 * Enveloppe de clé (`keystore.json`). La base est chiffrée par une clé aléatoire de 256 bits ;
 * cette clé n'est jamais stockée en clair, seulement « enveloppée » :
 * - mode session : chiffrée par le trousseau du système (`safeStorage`, côté process main) ;
 * - mode mot de passe : chiffrée (AES-256-GCM) par une clé dérivée du mot de passe (Argon2id) ;
 * - code de récupération (facultatif) : même principe, avec le code comme secret.
 * Changer de mot de passe ré-enveloppe la clé, sans re-chiffrer la base.
 */

export interface KdfParams {
  memoryKiB: number
  iterations: number
  parallelism: number
}

/** 64 Mio, 3 passes, 1 voie (RFC 9106, 2ᵉ recommandation) : ≈ 215 ms sous Electron (ADR-027). */
export const DEFAULT_KDF: Readonly<KdfParams> = Object.freeze({
  memoryKiB: 65_536,
  iterations: 3,
  parallelism: 1,
})

const base64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/)

/** Bornes de lecture : un fichier modifié ne doit pas pouvoir épuiser la mémoire ou le temps. */
const kdfSchema = z.strictObject({
  algorithm: z.literal('argon2id'),
  memoryKiB: z.number().int().min(8).max(1_048_576),
  iterations: z.number().int().min(1).max(16),
  parallelism: z.number().int().min(1).max(8),
  salt: base64,
})

const wrappedKeySchema = z.strictObject({
  kdf: kdfSchema,
  cipher: z.literal('aes-256-gcm'),
  iv: base64,
  ciphertext: base64,
  tag: base64,
})

export type WrappedKey = z.infer<typeof wrappedKeySchema>

const keystoreSchema = z.strictObject({
  format: z.literal('fluxo-keystore'),
  version: z.literal(1),
  vaultId: z.uuid(),
  createdAt: z.iso.datetime(),
  mode: z.enum(VAULT_MODES),
  /** Clé chiffrée par `safeStorage` (base 64) : seul le process main sait l'ouvrir. */
  session: z.strictObject({ blob: base64.max(4096) }).nullable(),
  password: wrappedKeySchema.nullable(),
  recovery: wrappedKeySchema.nullable(),
})

export type Keystore = z.infer<typeof keystoreSchema>
export type SecretPurpose = 'password' | 'recovery'

/** Données authentifiées : une enveloppe ne peut pas être déplacée vers un autre coffre ou usage. */
function associatedData(vaultId: string, purpose: SecretPurpose): Buffer {
  return Buffer.from(`fluxo-keystore:v1:${vaultId}:${purpose}`, 'utf8')
}

async function deriveKey(secret: string, salt: Uint8Array, params: KdfParams): Promise<Uint8Array> {
  return argon2id({
    password: secret.normalize('NFC'),
    salt,
    iterations: params.iterations,
    parallelism: params.parallelism,
    memorySize: params.memoryKiB,
    hashLength: 32,
    outputType: 'binary',
  })
}

export async function wrapKey(
  key: Uint8Array,
  secret: string,
  purpose: SecretPurpose,
  vaultId: string,
  params: KdfParams = DEFAULT_KDF,
): Promise<WrappedKey> {
  const salt = randomBytes(16)
  const kek = await deriveKey(secret, salt, params)
  try {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', kek, iv)
    cipher.setAAD(associatedData(vaultId, purpose))
    const ciphertext = Buffer.concat([cipher.update(key), cipher.final()])
    return {
      kdf: { algorithm: 'argon2id', ...params, salt: salt.toString('base64') },
      cipher: 'aes-256-gcm',
      iv: iv.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    }
  } finally {
    kek.fill(0)
  }
}

/** Ouvre une enveloppe ; `null` si le secret est faux (ou l'enveloppe altérée). */
export async function unwrapKey(
  wrapped: WrappedKey,
  secret: string,
  purpose: SecretPurpose,
  vaultId: string,
): Promise<Buffer | null> {
  const kek = await deriveKey(secret, Buffer.from(wrapped.kdf.salt, 'base64'), wrapped.kdf)
  try {
    const decipher = createDecipheriv('aes-256-gcm', kek, Buffer.from(wrapped.iv, 'base64'))
    decipher.setAAD(associatedData(vaultId, purpose))
    decipher.setAuthTag(Buffer.from(wrapped.tag, 'base64'))
    const key = Buffer.concat([
      decipher.update(Buffer.from(wrapped.ciphertext, 'base64')),
      decipher.final(),
    ])
    if (key.length !== DATABASE_KEY_BYTES) {
      key.fill(0)
      return null
    }
    return key
  } catch {
    return null
  } finally {
    kek.fill(0)
  }
}

export async function readKeystore(file: string): Promise<Keystore> {
  return keystoreSchema.parse(JSON.parse(await readFile(file, 'utf8')))
}

/** Écriture atomique : une coupure ne laisse jamais une enveloppe à moitié écrite. */
export async function writeKeystore(file: string, keystore: Keystore): Promise<void> {
  const validated = keystoreSchema.parse(keystore)
  const temporary = `${file}.tmp`
  await writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })
  await rename(temporary, file)
}
