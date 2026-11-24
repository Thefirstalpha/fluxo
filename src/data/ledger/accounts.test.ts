import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AccountDraft } from '@shared/ledger/model'
import { listAudit } from '../db/audit'
import { ACCOUNT_DEFAULTS, insertImported, openTestLedger, type TestLedger } from './testing'

let t: TestLedger

beforeEach(() => {
  t = openTestLedger()
})

afterEach(() => t.close())

const IBAN = 'FR76 3000 6000 0112 3456 7890 189'

function createChecking(extra: Partial<AccountDraft> = {}) {
  return t.ok('accountCreate', {
    ...ACCOUNT_DEFAULTS,
    name: 'Compte courant',
    type: 'checking',
    trackingMode: 'statement',
    openingBalance: 100_00,
    ...extra,
  }).id
}

describe('comptes — création et liste', () => {
  it('crée un compte, masque son IBAN et calcule son solde d’ouverture', () => {
    const id = createChecking({ iban: IBAN, institution: '  Banque  ' })
    const [account] = t.ok('accountsList', {})
    expect(account).toMatchObject({
      id,
      name: 'Compte courant',
      institution: 'Banque',
      ibanMasked: 'FR76 •••• •••• 0189',
      balance: 100_00,
      reconciledBalance: 100_00,
      transactionCount: 0,
      archived: false,
    })
    expect(JSON.stringify(account)).not.toContain('30006000011234567890')
    expect(t.ok('accountRevealIban', { id })).toBe('FR7630006000011234567890189')
  })

  it('refuse un IBAN invalide, un mode de suivi interdit et une entrée mal formée', () => {
    const base = { ...ACCOUNT_DEFAULTS, name: 'Prêt', type: 'loan' as const }
    expect(t.ledger.run('accountCreate', { ...base, trackingMode: 'statement' })).toEqual({
      ok: false,
      error: 'invalid',
    })
    expect(
      t.ledger.run('accountCreate', {
        ...base,
        type: 'checking',
        trackingMode: 'statement',
        iban: 'FR76 3000 6000 0112 3456 7890 188',
      }),
    ).toEqual({ ok: false, error: 'invalid' })
    expect(t.ledger.run('accountCreate', { ...base, openingBalance: 12.5 })).toEqual({
      ok: false,
      error: 'invalid',
    })
    expect(t.ok('accountsList', {})).toEqual([])
  })

  it('calcule le solde à date et la part rapprochée', () => {
    const id = createChecking()
    insertImported(t.db, id, { date: '2026-10-01', amount: -30_00 })
    const second = insertImported(t.db, id, { date: '2026-11-05', amount: 2_500_00 })
    insertImported(t.db, id, { date: '2026-11-20', amount: -45_90 })
    t.db.prepare("UPDATE transactions SET status = 'reconciled' WHERE id = ?").run(second)

    expect(t.ok('accountsList', {})[0]).toMatchObject({
      balance: 100_00 - 30_00 + 2_500_00 - 45_90,
      reconciledBalance: 100_00 + 2_500_00,
      transactionCount: 3,
      lastTransactionDate: '2026-11-20',
    })
    expect(t.ok('accountsList', { asOf: '2026-10-31' })[0]).toMatchObject({
      balance: 70_00,
      transactionCount: 1,
    })
  })

  it('range les comptes dans l’ordre choisi, archivés à part', () => {
    const first = createChecking()
    const second = t.ok('accountCreate', {
      ...ACCOUNT_DEFAULTS,
      name: 'Espèces',
      type: 'cash',
      trackingMode: 'manual',
    }).id
    t.ok('accountsReorder', { ids: [second, first] })
    expect(t.ok('accountsList', {}).map((a) => a.id)).toEqual([second, first])

    t.ok('accountSetArchived', { id: second, archived: true })
    expect(t.ok('accountsList', {}).map((a) => a.id)).toEqual([first])
    expect(t.ok('accountsList', { includeArchived: true }).map((a) => a.id)).toEqual([
      first,
      second,
    ])
  })
})

describe('comptes — modification et suppression', () => {
  it('fige le mode de suivi et la devise dès qu’il y a des opérations (ADR-026)', () => {
    const id = createChecking()
    t.ok('accountUpdate', { id, patch: { trackingMode: 'manual' } })
    t.ok('accountUpdate', { id, patch: { trackingMode: 'statement', currency: 'CHF' } })
    insertImported(t.db, id, { date: '2026-11-01', amount: -10_00 })

    expect(t.ledger.run('accountUpdate', { id, patch: { trackingMode: 'manual' } })).toEqual({
      ok: false,
      error: 'tracking-mode-locked',
    })
    expect(t.ledger.run('accountUpdate', { id, patch: { currency: 'EUR' } })).toEqual({
      ok: false,
      error: 'currency-mismatch',
    })
    // Le trigger de la base garantit la règle même sans passer par le service.
    expect(() =>
      t.db.prepare("UPDATE account SET tracking_mode = 'manual' WHERE id = ?").run(id),
    ).toThrow(/tracking_mode_locked/)

    t.ok('accountUpdate', {
      id,
      patch: { name: 'Compte joint', color: '#0977cb', icon: 'landmark' },
    })
    expect(t.ok('accountsList', {})[0]).toMatchObject({
      name: 'Compte joint',
      color: '#0977cb',
      icon: 'landmark',
      trackingMode: 'statement',
    })
  })

  it('ne supprime qu’un compte vide ; sinon, il s’archive', () => {
    const used = createChecking()
    insertImported(t.db, used, { date: '2026-11-01', amount: -10_00 })
    expect(t.ledger.run('accountDelete', { id: used })).toEqual({
      ok: false,
      error: 'account-not-empty',
    })
    const empty = createChecking()
    t.ok('accountDelete', { id: empty })
    expect(t.ok('accountsList', {}).map((a) => a.id)).toEqual([used])
    expect(t.ledger.run('accountDelete', { id: empty })).toEqual({ ok: false, error: 'not-found' })
  })

  it('consigne chaque écriture dans l’audit, IBAN masqué', () => {
    const id = createChecking({ iban: IBAN })
    t.ok('accountUpdate', { id, patch: { name: 'Principal' } })
    t.ok('accountUpdate', { id, patch: { name: 'Principal' } })
    const entries = listAudit(t.db, { entity: 'account' })
    expect(entries.map((entry) => entry.action)).toEqual(['create', 'update'])
    expect(JSON.stringify(entries)).not.toContain('30006000011234567890')
    expect(entries[1]).toMatchObject({
      entityId: id,
      origin: 'user',
      before: { name: 'Compte courant' },
      after: { name: 'Principal' },
    })
  })
})
