import { vi } from 'vitest'
import type { AppInfo, FluxoApi } from '@shared/ipc'
import { DEFAULT_SETTINGS, type Settings, type SettingsPatch } from '@shared/settings'
import type { VaultStatus } from '@shared/vault'

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
    },
  } satisfies FluxoApi
  return api
}

export type FakeApi = ReturnType<typeof createFakeApi>

export function installFakeApi(api: FakeApi = createFakeApi()): FakeApi {
  Object.defineProperty(window, 'fluxo', { value: api, configurable: true })
  return api
}
