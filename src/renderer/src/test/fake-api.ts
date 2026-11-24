import { vi, type Mock } from 'vitest'
import type { AppInfo, FluxoApi } from '@shared/ipc'
import type { LedgerInput, LedgerMethod, LedgerOutput } from '@shared/ledger/api'
import type { LedgerResult } from '@shared/ledger/model'
import { DEFAULT_SETTINGS, type Settings, type SettingsPatch } from '@shared/settings'
import type { BackupInfo, PickBackupResult, VaultStatus } from '@shared/vault'

export const TEST_APP_INFO: AppInfo = {
  name: 'Fluxo',
  version: '0.1.0',
  electron: '45.3.3',
  chrome: '146.0.0.0',
  node: '24.12.0',
  platform: 'linux',
  arch: 'x64',
  packaged: false,
}

export const UNLOCKED_STATUS: VaultStatus = {
  state: 'unlocked',
  mode: 'session',
  hasRecoveryCode: true,
  retryAfterMs: 0,
  demo: false,
  needsNewPassword: false,
  sessionAvailable: true,
  sessionUnavailableReason: null,
}

export const TEST_BACKUP_INFO: BackupInfo = {
  directory: '/home/test/.config/Fluxo/vault/backups',
  isDefault: true,
  auto: true,
  lastAutomaticAt: '2026-11-24T08:00:00.000Z',
  count: 4,
  portable: true,
}

/** Résultats par défaut du registre (coffre vide) ; chaque test peut les remplacer. */
const LEDGER_DEFAULTS: { [M in LedgerMethod]: LedgerOutput<M> } = {
  accountsList: [],
  accountCreate: { id: '0192f0c8-0000-7000-8000-000000000001' },
  accountUpdate: null,
  accountSetArchived: null,
  accountDelete: null,
  accountRevealIban: null,
  accountsReorder: null,
}

export type FakeLedger = {
  [M in LedgerMethod]: Mock<(input: LedgerInput<M>) => Promise<LedgerResult<LedgerOutput<M>>>>
}

function createFakeLedger(): FakeLedger {
  const entries = Object.entries(LEDGER_DEFAULTS).map(([method, value]) => [
    method,
    vi.fn(() => Promise.resolve({ ok: true, value })),
  ])
  return Object.fromEntries(entries) as FakeLedger
}

/** Double du preload : le renderer ne voit que cette API. Chaque fonction est espionnable. */
export function createFakeApi() {
  const ok = () => Promise.resolve({ ok: true as const })
  const api = {
    platform: 'linux',
    settings: {
      get: vi.fn(() => Promise.resolve<Settings>({ ...DEFAULT_SETTINGS })),
      update: vi.fn((patch: SettingsPatch) =>
        Promise.resolve<Settings>({ ...DEFAULT_SETTINGS, ...patch }),
      ),
      onChange: vi.fn(() => () => undefined),
    },
    app: {
      getInfo: vi.fn(() => Promise.resolve(TEST_APP_INFO)),
      openExternal: vi.fn(() => Promise.resolve(true)),
      reportError: vi.fn(() => Promise.resolve()),
    },
    vault: {
      getStatus: vi.fn(() => Promise.resolve(UNLOCKED_STATUS)),
      onStatusChange: vi.fn(() => () => undefined),
      create: vi.fn(ok),
      unlock: vi.fn(ok),
      lock: vi.fn(() => Promise.resolve()),
      changePassword: vi.fn(ok),
      enableSessionMode: vi.fn(ok),
      createRecoveryCode: vi.fn(() =>
        Promise.resolve({ ok: true as const, code: 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789' }),
      ),
      removeRecoveryCode: vi.fn(ok),
      backupNow: vi.fn(() =>
        Promise.resolve({ ok: true as const, createdAt: '2026-11-24T10:00:00.000Z' }),
      ),
      backupInfo: vi.fn(() => Promise.resolve(TEST_BACKUP_INFO)),
      chooseBackupDirectory: vi.fn(() =>
        Promise.resolve({ ok: true as const, info: TEST_BACKUP_INFO }),
      ),
      resetBackupDirectory: vi.fn(() =>
        Promise.resolve({ ok: true as const, info: TEST_BACKUP_INFO }),
      ),
      setAutoBackup: vi.fn((auto: boolean) => Promise.resolve({ ...TEST_BACKUP_INFO, auto })),
      pickBackup: vi.fn((): Promise<PickBackupResult> =>
        Promise.resolve({
          ok: true as const,
          token: 'a'.repeat(32),
          summary: {
            createdAt: '2026-11-20T08:00:00.000Z',
            kind: 'automatic' as const,
            appVersion: '0.2.0',
            sameVault: true,
            methods: ['password' as const],
          },
        }),
      ),
      previewRestore: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          preview: {
            createdAt: '2026-11-20T08:00:00.000Z',
            accounts: 3,
            transactions: 1250,
            firstDate: '2025-06-01',
            lastDate: '2026-11-19',
          },
        }),
      ),
      confirmRestore: vi.fn(ok),
      cancelRestore: vi.fn(() => Promise.resolve()),
      exportData: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          folderName: 'Fluxo-export-20261124-100000',
          rows: 42,
        }),
      ),
      eraseAll: vi.fn(ok),
      enterDemo: vi.fn(() => Promise.resolve()),
      exitDemo: vi.fn(() => Promise.resolve()),
    },
    ledger: createFakeLedger(),
  } satisfies FluxoApi
  return api
}

export type FakeApi = ReturnType<typeof createFakeApi>

export function installFakeApi(api: FakeApi = createFakeApi()): FakeApi {
  Object.defineProperty(window, 'fluxo', { value: api, configurable: true })
  return api
}
