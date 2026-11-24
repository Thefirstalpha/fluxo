import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EXPENSE_CATEGORY_IDS } from '@shared/categories'
import { generateDemoLedger } from '@shared/demo/demo-ledger'
import { monthOf } from '@shared/months'
import { listAudit } from './db/audit'
import { findUnbalancedTransactions } from './db/integrity'
import { VaultHost } from './host'
import { createMethods } from './methods'
import { ServiceError } from './rpc'
import { resolveVaultPaths } from './vault'

const FAST = { memoryKiB: 64, iterations: 1, parallelism: 1 }
const PASSWORD = 'une phrase de passe solide'

let root: string
let host: VaultHost

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'fluxo-host-'))
  host = await VaultHost.open(
    resolveVaultPaths(join(root, 'vault')),
    resolveVaultPaths(join(root, 'demo-vault')),
    vi.fn(),
    { kdf: FAST },
  )
})

afterEach(async () => {
  host.shutdown()
  await rm(root, { recursive: true, force: true })
})

describe('coffre de démonstration', () => {
  it('s’ouvre à part, sans créer ni toucher le coffre réel', async () => {
    expect(await host.enterDemo({ locale: 'fr-FR' })).toMatchObject({
      state: 'unlocked',
      demo: true,
    })
    expect(existsSync(join(root, 'vault', 'keystore.json'))).toBe(false)
    expect(existsSync(join(root, 'demo-vault', 'fluxo.db'))).toBe(true)

    expect(host.exitDemo()).toMatchObject({ state: 'absent', demo: false })
    expect(existsSync(join(root, 'demo-vault'))).toBe(false)
  })

  it('verrouille le coffre réel en entrant, et le laisse intact', async () => {
    const real = host.active()
    await real.create({ mode: 'password', password: PASSWORD })
    const before = readFileSync(join(root, 'vault', 'keystore.json'), 'utf8')
    await host.enterDemo({ locale: 'fr-FR' })
    expect(real.status().state).toBe('locked')
    host.exitDemo()
    expect(host.status()).toMatchObject({ state: 'locked', demo: false })
    expect(readFileSync(join(root, 'vault', 'keystore.json'), 'utf8')).toBe(before)
  })

  it('contient le grand livre déterministe, cohérent avec le tableau de bord', async () => {
    await host.enterDemo({ locale: 'fr-FR' })
    const db = host.active().database()
    const ledger = generateDemoLedger({ endMonth: monthOf(new Date()), count: 18 })
    expect(db.prepare('SELECT count(*) FROM transactions').pluck().get()).toBe(
      ledger.transactions.length,
    )
    expect(findUnbalancedTransactions(db)).toEqual([])
    // Dépenses du dernier mois, par catégorie : identiques aux synthèses du tableau de bord.
    const last = ledger.months.at(-1)
    if (!last) throw new Error('mois attendu')
    const rows = db
      .prepare(
        `SELECT c.sort_order AS position, -SUM(s.amount) AS spent
         FROM split s JOIN transactions t ON t.id = s.transaction_id JOIN category c ON c.id = s.category_id
         WHERE c.kind = 'expense' AND substr(t.booking_date, 1, 7) = ?
         GROUP BY c.id ORDER BY c.sort_order`,
      )
      .all(last.month) as { position: number; spent: number }[]
    expect(rows.map((row) => row.spent)).toEqual(
      EXPENSE_CATEGORY_IDS.map((id) => last.byCategory[id]),
    )
    expect(listAudit(db).map((entry) => entry.action)).toEqual(['migrate', 'create', 'seed'])
    // Les virements d'épargne sont reliés deux à deux.
    expect(
      db.prepare('SELECT count(*) FROM transactions WHERE transfer_id IS NOT NULL').pluck().get(),
    ).toBe(ledger.transactions.filter((t) => t.category === 'savings').length)
  })

  it('refuse clés, sauvegardes et effacement pendant la démonstration', async () => {
    await host.enterDemo({ locale: 'en-US' })
    const methods = createMethods(host)
    // Comme le serveur RPC : une erreur synchrone devient un rejet.
    const call = async (name: keyof typeof methods, params?: unknown) =>
      await Promise.resolve().then(() => methods[name].run(methods[name].schema.parse(params)))
    await expect(call('backupNow')).rejects.toThrow(ServiceError)
    await expect(call('eraseAll', {})).rejects.toThrow(ServiceError)
    await expect(call('createRecoveryCode', {})).rejects.toThrow(ServiceError)
    expect(await call('autoBackupIfDue')).toBe(false)
    expect(readdirSync(join(root, 'demo-vault'))).not.toContain('backups')
    // Verrouiller referme la démonstration.
    expect(await call('lock')).toMatchObject({ demo: false })
  })

  it('libellés des comptes et catégories dans la langue demandée', async () => {
    await host.enterDemo({ locale: 'en-US' })
    const db = host.active().database()
    expect(db.prepare('SELECT name FROM account ORDER BY sort_order').pluck().all()).toEqual([
      'Current account',
      'Savings account',
      'Cash',
    ])
  })
})
