import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readKeystore, unwrapKey, wrapKey, writeKeystore, type Keystore } from './keystore'

/** Paramètres réduits pour des tests rapides (le format et l'algorithme restent les mêmes). */
const FAST = { memoryKiB: 64, iterations: 1, parallelism: 1 }
const vaultId = randomUUID()

describe('wrapKey / unwrapKey', () => {
  it('rend la clé avec le bon secret, `null` avec un mauvais', async () => {
    const key = randomBytes(32)
    const wrapped = await wrapKey(key, 'correct horse battery', 'password', vaultId, FAST)
    expect(await unwrapKey(wrapped, 'correct horse battery', 'password', vaultId)).toEqual(key)
    expect(await unwrapKey(wrapped, 'correct horse batterie', 'password', vaultId)).toBeNull()
  })

  it('normalise le secret (NFC) : « é » composé ou décomposé ouvre la même enveloppe', async () => {
    const key = randomBytes(32)
    const wrapped = await wrapKey(key, 'café au lait!', 'password', vaultId, FAST)
    expect(await unwrapKey(wrapped, 'café au lait!', 'password', vaultId)).toEqual(key)
  })

  it('lie l’enveloppe à son coffre et à son usage', async () => {
    const key = randomBytes(32)
    const wrapped = await wrapKey(key, 'secret secret', 'password', vaultId, FAST)
    expect(await unwrapKey(wrapped, 'secret secret', 'recovery', vaultId)).toBeNull()
    expect(await unwrapKey(wrapped, 'secret secret', 'password', randomUUID())).toBeNull()
  })

  it('détecte une enveloppe altérée', async () => {
    const wrapped = await wrapKey(randomBytes(32), 'secret secret', 'password', vaultId, FAST)
    const bytes = Buffer.from(wrapped.ciphertext, 'base64')
    bytes[0] = (bytes[0] ?? 0) ^ 1
    const altered = { ...wrapped, ciphertext: bytes.toString('base64') }
    expect(await unwrapKey(altered, 'secret secret', 'password', vaultId)).toBeNull()
  })

  it('sel et vecteur d’initialisation différents à chaque enveloppement', async () => {
    const key = randomBytes(32)
    const a = await wrapKey(key, 'secret secret', 'password', vaultId, FAST)
    const b = await wrapKey(key, 'secret secret', 'password', vaultId, FAST)
    expect(a.kdf.salt).not.toBe(b.kdf.salt)
    expect(a.iv).not.toBe(b.iv)
    expect(a.ciphertext).not.toBe(b.ciphertext)
  })
})

describe('readKeystore / writeKeystore', () => {
  let directory: string
  let file: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'fluxo-keystore-'))
    file = join(directory, 'keystore.json')
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  async function sample(): Promise<Keystore> {
    return {
      format: 'fluxo-keystore',
      version: 1,
      vaultId,
      createdAt: new Date().toISOString(),
      mode: 'password',
      session: null,
      password: await wrapKey(randomBytes(32), 'secret secret', 'password', vaultId, FAST),
      recovery: null,
    }
  }

  it('relit ce qui a été écrit, sans clé en clair dans le fichier', async () => {
    const keystore = await sample()
    await writeKeystore(file, keystore)
    expect(await readKeystore(file)).toEqual(keystore)
    expect(await readFile(file, 'utf8')).not.toMatch(/"key"/)
  })

  it('refuse des paramètres de dérivation hors bornes (fichier modifié)', async () => {
    const keystore = await sample()
    const tampered = structuredClone(keystore)
    if (!tampered.password) throw new Error('enveloppe attendue')
    tampered.password.kdf.memoryKiB = 64 * 1024 * 1024
    await writeFile(file, JSON.stringify(tampered))
    await expect(readKeystore(file)).rejects.toThrow()
  })

  it('refuse un champ inconnu', async () => {
    await writeFile(file, JSON.stringify({ ...(await sample()), plainKey: 'abc' }))
    await expect(readKeystore(file)).rejects.toThrow()
  })
})
