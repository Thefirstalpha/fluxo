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
  transactionsList: { rows: [], nextCursor: null },
  transactionsSummary: { count: 0, total: 0, inflow: 0, outflow: 0, currencies: [] },
  transactionGet: {
    id: '0192f0c8-0000-7000-8000-000000000002',
    accountId: '0192f0c8-0000-7000-8000-000000000001',
    bookingDate: '2026-11-20',
    valueDate: null,
    amount: -1_250,
    currency: 'EUR',
    convertedAmount: null,
    label: 'CB SUPERMARCHE',
    labelRaw: 'CB SUPERMARCHE',
    customLabel: null,
    payee: null,
    status: 'cleared',
    nature: 'operation',
    note: null,
    favorite: false,
    imported: true,
    transferId: null,
    transferAccountId: null,
    categoryIds: [],
    tagIds: [],
    splitCount: 0,
    splits: [],
  },
  transactionCreate: { id: '0192f0c8-0000-7000-8000-000000000002' },
  transactionUpdate: null,
  transactionsDelete: { count: 1 },
  transactionSetSplits: null,
  transactionsCategorize: { updated: 1, skipped: 0 },
  transactionsTag: { updated: 1 },
  transactionsSetStatus: { updated: 1 },
  transferCreate: {
    fromId: '0192f0c8-0000-7000-8000-000000000003',
    toId: '0192f0c8-0000-7000-8000-000000000004',
  },
  transferCounterpart: { id: '0192f0c8-0000-7000-8000-000000000003' },
  transferLink: null,
  transferUnlink: null,
  tagsList: [],
  tagCreate: { id: '0192f0c8-0000-7000-8000-000000000005' },
  tagUpdate: null,
  tagDelete: null,
  payeesList: [],
  categoriesList: [],
  categoryCreate: { id: '0192f0c8-0000-7000-8000-000000000006' },
  categoryUpdate: null,
  categoryMerge: { reassigned: 0 },
  categoryArchive: { reassigned: 0 },
  categoryDelete: null,
  savedFiltersList: [],
  savedFilterSave: { id: '0192f0c8-0000-7000-8000-000000000007' },
  savedFilterDelete: null,
  auditList: [],
  ledgerHistoryStatus: { canUndo: false, canRedo: false, undoAction: null, redoAction: null },
  ledgerUndo: { action: 'transaction-update' },
  ledgerRedo: { action: 'transaction-update' },
  dashboardSummary: { currency: 'EUR', hasTransactions: false, otherCurrencies: [], months: [] },
  rulesList: [],
  rulePreview: { matchCount: 0, samples: [] },
  ruleSave: {
    id: '0192f0c8-0000-7000-8000-000000000008',
    name: 'Règle test',
    conditions: {
      labelOp: 'contains',
      labelValue: 'carrefour',
      direction: 'expense',
      amountOp: 'any',
    },
    actions: { categoryId: null },
    priority: 0,
    active: true,
    appliedCount: 0,
    lastAppliedAt: null,
    createdAt: '2026-11-24T10:00:00.000Z',
    updatedAt: '2026-11-24T10:00:00.000Z',
  },
  ruleDelete: null,
  ruleApply: { appliedCount: 0 },
  ruleCreateFromTransaction: {
    id: '0192f0c8-0000-7000-8000-000000000008',
    name: 'Règle test',
    conditions: {
      labelOp: 'contains',
      labelValue: 'carrefour',
      direction: 'expense',
      amountOp: 'any',
    },
    actions: { categoryId: null },
    priority: 0,
    active: true,
    appliedCount: 0,
    lastAppliedAt: null,
    createdAt: '2026-11-24T10:00:00.000Z',
    updatedAt: '2026-11-24T10:00:00.000Z',
  },
  categorizationQueueList: [],
  categorizeAutoRun: { evaluatedCount: 0, autoAppliedCount: 0, queuedCount: 0, durationMs: 0 },
  classifierStatus: { sampleCount: 0, categoryCount: 0, updatedAt: null, threshold: 0.85 },
  classifierRetrain: { sampleCount: 0, categoryCount: 0, updatedAt: null, threshold: 0.85 },
  categorizationThresholdSet: { threshold: 0.85 },
  categorizationAccept: null,
  categorizationReject: null,
  categorizationReset: { clearedTransactions: 0, clearedSuggestions: 0, clearedModelSamples: 0 },
  subscriptionsOverview: {
    subscriptions: [],
    totalMonthlyCost: 0,
    totalAnnualCost: 0,
    priceIncreaseCount: 0,
    dormantCount: 0,
    currency: 'EUR',
  },
  subscriptionDismissAlert: null,
  transferCandidatesList: [],
  analyticsOverview: {
    filterRange: { from: '2026-01-01', to: '2026-11-30', focusMonth: '2026-11' },
    hasTransactions: false,
    otherCurrencies: [],
    kpis: {
      income: 0,
      expenses: 0,
      savings: 0,
      net: 0,
      savingsRate: 0,
      transactionCount: 0,
    },
    monthlySeries: [],
    categoryEvolution: { months: [], series: [] },
    categoryBreakdown: [],
    sankey: { nodes: [], links: [] },
    calendarHeatmap: { year: '2026', days: [], maxOutflow: 0 },
    amountHistogram: [],
    monthlySynthesis: {
      month: '2026-11',
      availableMonths: [],
      income: 0,
      expenses: 0,
      savings: 0,
      net: 0,
      savingsRate: 0,
      transactionCount: 0,
      vsPrevMonth: null,
      vsLastYear: null,
      topCategories: [],
      topMerchants: [],
      largestExpenses: [],
      recurringInMonth: [],
      payslipSummary: null,
      insights: [{ kind: 'no-data' }],
    },
    anomalies: [],
  },
  analyticsAnomalies: [],
  analyticsCsvData: { csv: '', rowCount: 0 },
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
    imports: {
      pickFile: vi.fn((): ReturnType<FluxoApi['imports']['pickFile']> =>
        Promise.resolve({ ok: false, reason: 'cancelled' }),
      ),
      registerDroppedFile: vi.fn((): ReturnType<FluxoApi['imports']['registerDroppedFile']> =>
        Promise.resolve({ ok: false, reason: 'invalid-file' }),
      ),
      inspect: vi.fn((): ReturnType<FluxoApi['imports']['inspect']> =>
        Promise.resolve({ ok: true, format: 'csv', encoding: 'utf-8', warnings: [] }),
      ),
      preview: vi.fn((): ReturnType<FluxoApi['imports']['preview']> =>
        Promise.resolve({ ok: false, reason: 'not-found' }),
      ),
      commit: vi.fn((): ReturnType<FluxoApi['imports']['commit']> =>
        Promise.resolve({ ok: false, error: 'not-found' }),
      ),
      batchesList: vi.fn((): ReturnType<FluxoApi['imports']['batchesList']> =>
        Promise.resolve({ ok: true, value: [] }),
      ),
      revert: vi.fn((): ReturnType<FluxoApi['imports']['revert']> =>
        Promise.resolve({ ok: false, error: 'not-found' }),
      ),
      profilesList: vi.fn((): ReturnType<FluxoApi['imports']['profilesList']> =>
        Promise.resolve({ ok: true, value: [] }),
      ),
      profileSave: vi.fn((): ReturnType<FluxoApi['imports']['profileSave']> =>
        Promise.resolve({ ok: false, error: 'invalid' }),
      ),
      profileDelete: vi.fn((): ReturnType<FluxoApi['imports']['profileDelete']> =>
        Promise.resolve({ ok: false, error: 'invalid' }),
      ),
    },
    analytics: {
      exportCsv: vi.fn((): ReturnType<FluxoApi['analytics']['exportCsv']> =>
        Promise.resolve({ ok: true, fileName: 'fluxo-analyses.csv', rowCount: 0 }),
      ),
      exportImage: vi.fn((): ReturnType<FluxoApi['analytics']['exportImage']> =>
        Promise.resolve({ ok: true, fileName: 'chart.png' }),
      ),
      exportMonthlyPdf: vi.fn((): ReturnType<FluxoApi['analytics']['exportMonthlyPdf']> =>
        Promise.resolve({ ok: true, fileName: 'fluxo-rapport.pdf' }),
      ),
    },
  } satisfies FluxoApi
  return api
}

export type FakeApi = ReturnType<typeof createFakeApi>

export function installFakeApi(api: FakeApi = createFakeApi()): FakeApi {
  Object.defineProperty(window, 'fluxo', { value: api, configurable: true })
  return api
}
