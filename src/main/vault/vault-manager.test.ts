import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUnavailableReason, VaultStatus } from '@shared/vault'
import { createMethods } from '../../data/methods'
import { resolveVaultPaths, Vault } from '../../data/vault'
import { idleLockDue, startAutoLock, type PowerEvents } from './auto-lock'
import type { SecureStorage } from './secure-storage'
import { VaultManager, type DataServiceCaller } from './vault-manager'

const PASSWORD = 'une phrase de passe solide'

/** Service de données exécuté dans le même processus, schémas compris (sans utilityProcess). */
function inProcessService(vault: Vault): DataServiceCaller {
  const methods = createMethods(vault)
  return {
    call: ((method: keyof typeof methods, params?: unknown) => {
      const definition = methods[method]
      return Promise.resolve(definition.run(definition.schema.parse(params)))
    }) as DataServiceCaller['call'],
  }
}

/** Trousseau simulé : réversible, mais la clé n'y apparaît jamais telle quelle. */
function fakeStorage(reason: SessionUnavailableReason | null = null) {
  return {
    unavailableReason: (): SessionUnavailableReason | null => reason,
    encrypt: vi.fn((plain: string) => Buffer.from(`enc:${plain}`, 'utf8')),
    decrypt: vi.fn((blob: Buffer) => {
      const text = blob.toString('utf8')
      if (!text.startsWith('enc:')) throw new Error('blob étranger')
      return text.slice(4)
    }),
  } satisfies SecureStorage
}

let directory: string
let vault: Vault

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'fluxo-manager-'))
})

afterEach(async () => {
  vault?.lock()
  await rm(directory, { recursive: true, force: true })
})

async function setup(storage = fakeStorage()) {
  vault = await Vault.open(resolveVaultPaths(directory), vi.fn(), {
    kdf: { memoryKiB: 64, iterations: 1, parallelism: 1 },
  })
  const manager = new VaultManager(inProcessService(vault), storage)
  const statuses: VaultStatus[] = []
  manager.onStatusChange((status) => statuses.push(status))
  return { manager, storage, statuses }
}

describe('VaultManager', () => {
  it('mode session : crée, verrouille, puis déverrouille sans saisie via le trousseau', async () => {
    const { manager, storage, statuses } = await setup()
    expect(await manager.create({ mode: 'session' })).toEqual({ ok: true })
    expect(storage.encrypt).toHaveBeenCalledTimes(1)
    expect(statuses.at(-1)).toMatchObject({ state: 'unlocked', mode: 'session' })

    await manager.lock('test')
    expect(statuses.at(-1)?.state).toBe('locked')
    await manager.unlockAtStartup()
    expect((await manager.status()).state).toBe('unlocked')
  })

  it('refuse le mode session sans trousseau sûr et l’indique dans le statut', async () => {
    const { manager } = await setup(fakeStorage('no-secure-storage'))
    expect(await manager.status()).toMatchObject({
      sessionAvailable: false,
      sessionUnavailableReason: 'no-secure-storage',
    })
    expect(await manager.create({ mode: 'session' })).toEqual({
      ok: false,
      reason: 'session-unavailable',
    })
    expect(await manager.create({ mode: 'password', password: PASSWORD })).toEqual({ ok: true })
  })

  it('trousseau perdu : le code de récupération rouvre le coffre et ré-enveloppe la clé', async () => {
    const { manager, storage } = await setup()
    await manager.create({ mode: 'session' })
    const recovery = await manager.createRecoveryCode({})
    if (!recovery.ok) throw new Error('code attendu')
    await manager.lock('test')

    // Le trousseau ne sait plus ouvrir l'ancienne enveloppe.
    storage.decrypt.mockImplementationOnce(() => {
      throw new Error('clé du trousseau changée')
    })
    expect(await manager.unlock({ method: 'session' })).toMatchObject({ ok: false })
    expect(await manager.unlock({ method: 'recovery', code: recovery.code })).toEqual({ ok: true })
    expect(storage.encrypt).toHaveBeenCalledTimes(2) // nouvelle enveloppe de session
    await manager.lock('test')
    expect(await manager.unlock({ method: 'session' })).toEqual({ ok: true })
  })

  it('mode mot de passe : n’auto-déverrouille pas au lancement', async () => {
    const { manager } = await setup()
    await manager.create({ mode: 'password', password: PASSWORD })
    await manager.lock('test')
    await manager.unlockAtStartup()
    expect((await manager.status()).state).toBe('locked')
    expect(await manager.unlock({ method: 'password', password: PASSWORD })).toEqual({ ok: true })
  })

  it('bascule du mot de passe au mode session, mot de passe actuel exigé', async () => {
    const { manager } = await setup()
    await manager.create({ mode: 'password', password: PASSWORD })
    expect(await manager.enableSessionMode({ currentPassword: 'faux' })).toMatchObject({
      ok: false,
      reason: 'wrong-credentials',
    })
    expect(await manager.enableSessionMode({ currentPassword: PASSWORD })).toEqual({ ok: true })
    expect((await manager.status()).mode).toBe('session')
  })
})

describe('verrouillage automatique', () => {
  it('idleLockDue : délai atteint, jamais pour 0', () => {
    expect(idleLockDue(899, 15)).toBe(false)
    expect(idleLockDue(900, 15)).toBe(true)
    expect(idleLockDue(1_000_000, 0)).toBe(false)
  })

  it('verrouille à la mise en veille et après inactivité, selon les préférences', async () => {
    vi.useFakeTimers()
    try {
      const listeners = new Map<string, () => void>()
      let idle = 0
      const power: PowerEvents = {
        on: (event, listener) => listeners.set(event, listener),
        removeListener: (event) => listeners.delete(event),
        getSystemIdleTime: () => idle,
      }
      const prefs = { autoLockMinutes: 5 as const, lockOnSystemLock: true }
      const lock = vi.fn(() => Promise.resolve())
      const stop = startAutoLock({ power, settings: () => prefs, lock, onError: vi.fn() })

      listeners.get('suspend')?.()
      expect(lock).toHaveBeenCalledTimes(1)

      idle = 200
      await vi.advanceTimersByTimeAsync(15_000)
      expect(lock).toHaveBeenCalledTimes(1)
      idle = 300
      await vi.advanceTimersByTimeAsync(15_000)
      expect(lock).toHaveBeenCalledTimes(2)

      prefs.lockOnSystemLock = false
      listeners.get('lock-screen')?.()
      expect(lock).toHaveBeenCalledTimes(2)

      stop()
      expect(listeners.size).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
