import { readdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUnavailableReason, VaultStatus } from '@shared/vault'
import { VaultHost } from '../../data/host'
import { createMethods } from '../../data/methods'
import { resolveVaultPaths } from '../../data/vault'
import { idleLockDue, startAutoLock, type PowerEvents } from './auto-lock'
import type { SecureStorage } from './secure-storage'
import { VaultManager, type DataServiceCaller } from './vault-manager'

const PASSWORD = 'une phrase de passe solide'

/** Service de données exécuté dans le même processus, schémas compris (sans utilityProcess). */
function inProcessService(host: VaultHost): DataServiceCaller {
  const methods = createMethods(host)
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
let host: VaultHost

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'fluxo-manager-'))
})

afterEach(async () => {
  host?.shutdown()
  await rm(directory, { recursive: true, force: true })
})

async function setup(storage = fakeStorage()) {
  host = await VaultHost.open(
    resolveVaultPaths(directory),
    resolveVaultPaths(join(directory, '..', `${basename(directory)}-demo`)),
    vi.fn(),
    { kdf: { memoryKiB: 64, iterations: 1, parallelism: 1 } },
  )
  const dialogs = {
    chooseDirectory: vi.fn(() => Promise.resolve<string | null>(null)),
    chooseBackupFile: vi.fn(() => Promise.resolve<string | null>(null)),
  }
  const manager = new VaultManager(inProcessService(host), storage, dialogs)
  const statuses: VaultStatus[] = []
  manager.onStatusChange((status) => statuses.push(status))
  return { manager, storage, statuses, dialogs }
}

describe('VaultManager', () => {
  it('mode session : crée, verrouille, puis déverrouille sans saisie via le trousseau', async () => {
    const { manager, storage, statuses } = await setup()
    expect(await manager.create({ mode: 'session' }, 'fr-FR')).toEqual({ ok: true })
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
    expect(await manager.create({ mode: 'session' }, 'fr-FR')).toEqual({
      ok: false,
      reason: 'session-unavailable',
    })
    expect(await manager.create({ mode: 'password', password: PASSWORD }, 'fr-FR')).toEqual({
      ok: true,
    })
  })

  it('trousseau perdu : le code de récupération rouvre le coffre et ré-enveloppe la clé', async () => {
    const { manager, storage } = await setup()
    await manager.create({ mode: 'session' }, 'fr-FR')
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
    await manager.create({ mode: 'password', password: PASSWORD }, 'fr-FR')
    await manager.lock('test')
    await manager.unlockAtStartup()
    expect((await manager.status()).state).toBe('locked')
    expect(await manager.unlock({ method: 'password', password: PASSWORD })).toEqual({ ok: true })
  })

  it('bascule du mot de passe au mode session, mot de passe actuel exigé', async () => {
    const { manager } = await setup()
    await manager.create({ mode: 'password', password: PASSWORD }, 'fr-FR')
    expect(await manager.enableSessionMode({ currentPassword: 'faux' })).toMatchObject({
      ok: false,
      reason: 'wrong-credentials',
    })
    expect(await manager.enableSessionMode({ currentPassword: PASSWORD })).toEqual({ ok: true })
    expect((await manager.status()).mode).toBe('session')
  })
})

describe('VaultManager — sauvegardes et effacement', () => {
  it('annuler une boîte de dialogue ne fait rien', async () => {
    const { manager } = await setup()
    await manager.create({ mode: 'password', password: PASSWORD }, 'fr-FR')
    expect(await manager.pickBackup()).toEqual({ ok: false, reason: 'cancelled' })
    expect(await manager.exportData()).toEqual({ ok: false, reason: 'cancelled' })
    expect(await manager.chooseBackupDirectory()).toEqual({ ok: false, reason: 'cancelled' })
  })

  it('exporte dans le dossier choisi par la boîte de dialogue', async () => {
    const { manager, dialogs } = await setup()
    await manager.create({ mode: 'password', password: PASSWORD }, 'fr-FR')
    dialogs.chooseDirectory.mockResolvedValueOnce(directory)
    const result = await manager.exportData()
    expect(result.ok && result.folderName).toMatch(/^Fluxo-export-/)
    expect(dialogs.chooseDirectory).toHaveBeenCalledWith('export')
  })

  it('restaure une sauvegarde « session » en reprenant le mode session', async () => {
    const { manager, dialogs } = await setup()
    await manager.create({ mode: 'session' }, 'fr-FR')
    const recovery = await manager.createRecoveryCode({})
    if (!recovery.ok) throw new Error('code attendu')
    await manager.backupNow()
    const backups = join(directory, 'backups')
    const [file] = readdirSync(backups)
    dialogs.chooseBackupFile.mockResolvedValueOnce(join(backups, file ?? ''))
    const picked = await manager.pickBackup()
    if (!picked.ok) throw new Error('sauvegarde attendue')
    expect(await manager.previewRestore({ token: picked.token })).toMatchObject({ ok: true })
    expect(await manager.confirmRestore(picked.token)).toEqual({ ok: true })
    expect(await manager.status()).toMatchObject({
      state: 'unlocked',
      mode: 'session',
      needsNewPassword: false,
    })
  })

  it('« Tout effacer » appelle le nettoyage des journaux et repasse à « absent »', async () => {
    host = await VaultHost.open(
      resolveVaultPaths(directory),
      resolveVaultPaths(join(directory, '..', `${basename(directory)}-demo`)),
      vi.fn(),
      { kdf: { memoryKiB: 64, iterations: 1, parallelism: 1 } },
    )
    const onErased = vi.fn(() => Promise.resolve())
    const manager = new VaultManager(
      inProcessService(host),
      fakeStorage(),
      {
        chooseDirectory: () => Promise.resolve(null),
        chooseBackupFile: () => Promise.resolve(null),
      },
      onErased,
    )
    await manager.create({ mode: 'session' }, 'fr-FR')
    expect(await manager.eraseAll({})).toEqual({ ok: true })
    expect(onErased).toHaveBeenCalledTimes(1)
    expect((await manager.status()).state).toBe('absent')
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
