import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CATEGORY_PACK_FR } from '@shared/ledger/category-pack'
import { findUnbalancedTransactions } from '../db/integrity'
import { ACCOUNT_DEFAULTS, insertImported, openTestLedger, type TestLedger } from './testing'

let t: TestLedger
let bank: string

beforeEach(() => {
  t = openTestLedger()
  bank = t.ok('accountCreate', {
    ...ACCOUNT_DEFAULTS,
    name: 'Courant',
    type: 'checking',
    trackingMode: 'statement',
  }).id
})

afterEach(() => t.close())

const category = (key: string) => {
  const id = t.categories.get(key)
  if (!id) throw new Error(`catégorie ${key}`)
  return id
}

function spendIn(key: string, amount: number) {
  const id = insertImported(t.db, bank, { date: '2026-11-10', amount })
  t.ok('transactionsCategorize', { ids: [id], categoryId: category(key) })
  return id
}

const summary = (id: string) =>
  t.ok('categoriesList', { includeArchived: true }).find((c) => c.id === id)

/** Σ de toutes les parts catégorisées : une réorganisation ne doit jamais la changer. */
const categorizedTotal = () =>
  t.db.prepare('SELECT sum(amount) FROM split WHERE category_id IS NOT NULL').pluck().get()

describe('arbre des catégories', () => {
  it('liste le pack France, parents suivis de leurs sous-catégories', () => {
    const list = t.ok('categoriesList', {})
    const expected = CATEGORY_PACK_FR.reduce((n, c) => n + 1 + c.children.length, 0)
    expect(list).toHaveLength(expected)
    expect(list[0]).toMatchObject({ name: 'Salaire', parentId: null, kind: 'income' })
    expect(list[1]).toMatchObject({ name: 'Salaire net', parentId: list[0]?.id, kind: 'income' })
  })

  it('crée une sous-catégorie du type de son parent, refuse un troisième niveau et un doublon', () => {
    const housing = category('housing')
    const { id } = t.ok('categoryCreate', {
      name: 'Box internet',
      parentId: housing,
      kind: 'income',
      icon: null,
      color: null,
    })
    expect(summary(id)).toMatchObject({ parentId: housing, kind: 'expense' })
    expect(
      t.ledger.run('categoryCreate', { name: 'Trop', parentId: id, icon: null, color: null }),
    ).toEqual({ ok: false, error: 'invalid' })
    expect(
      t.ledger.run('categoryCreate', {
        name: 'énergie',
        parentId: housing,
        icon: null,
        color: null,
      }),
    ).toEqual({ ok: false, error: 'name-taken' })
    expect(
      t.ledger.run('categoryCreate', {
        name: 'Sans type',
        parentId: null,
        icon: null,
        color: null,
      }),
    ).toEqual({ ok: false, error: 'invalid' })
    const { id: pets } = t.ok('categoryCreate', {
      name: 'Animaux de compagnie',
      parentId: null,
      kind: 'expense',
      icon: 'paw-print',
      color: '#278733',
    })
    expect(summary(pets)).toMatchObject({ parentId: null, kind: 'expense', icon: 'paw-print' })
  })

  it('déplace une sous-catégorie (le type suit le parent) ; un parent ne descend pas', () => {
    const energy = category('housing.energy')
    t.ok('categoryUpdate', { id: energy, patch: { parentId: category('subscriptions') } })
    expect(summary(energy)).toMatchObject({ parentId: category('subscriptions'), kind: 'expense' })
    t.ok('categoryUpdate', { id: energy, patch: { parentId: category('salary') } })
    expect(summary(energy)?.kind).toBe('income')
    expect(
      t.ledger.run('categoryUpdate', {
        id: category('housing'),
        patch: { parentId: category('leisure') },
      }),
    ).toEqual({ ok: false, error: 'invalid' })
    expect(t.ledger.run('categoryUpdate', { id: energy, patch: { kind: 'expense' } })).toEqual({
      ok: false,
      error: 'invalid',
    })
    // Changer le type d'un parent : ses sous-catégories suivent.
    t.ok('categoryUpdate', { id: category('family'), patch: { kind: 'savings' } })
    expect(summary(category('family.childcare'))?.kind).toBe('savings')
  })
})

describe('réorganisation avec réaffectation', () => {
  it('fusionne une sous-catégorie : parts réaffectées, total conservé', () => {
    spendIn('groceries.restaurants', -32_00)
    spendIn('groceries.shopping', -80_00)
    const before = categorizedTotal()
    expect(
      t.ok('categoryMerge', {
        sourceId: category('groceries.restaurants'),
        targetId: category('groceries.shopping'),
      }),
    ).toEqual({ reassigned: 1 })
    expect(summary(category('groceries.restaurants'))).toBeUndefined()
    expect(summary(category('groceries.shopping'))).toMatchObject({
      transactionCount: 2,
      total: -112_00,
    })
    expect(categorizedTotal()).toBe(before)
  })

  it('fusionne une catégorie parente : ses sous-catégories rejoignent la cible', () => {
    spendIn('family.childcare', -300_00)
    spendIn('family', -20_00)
    const before = categorizedTotal()
    t.ok('categoryMerge', { sourceId: category('family'), targetId: category('other') })
    expect(summary(category('family.childcare'))?.parentId).toBe(category('other'))
    expect(summary(category('other'))?.total).toBe(-20_00)
    expect(categorizedTotal()).toBe(before)
    expect(
      t.ledger.run('categoryMerge', { sourceId: category('salary'), targetId: category('other') }),
    ).toEqual({ ok: false, error: 'invalid' })
  })

  it('archive avec réaffectation ; une catégorie archivée ne se choisit plus', () => {
    const kept = spendIn('leisure.sport', -40_00)
    t.ok('categoryArchive', { id: category('leisure'), archived: true })
    expect(t.ok('categoriesList', {}).some((c) => c.id === category('leisure.sport'))).toBe(false)
    // L'opération garde sa catégorie archivée (historique)…
    expect(t.ok('transactionGet', { id: kept }).categoryIds).toEqual([category('leisure.sport')])
    // …mais on ne peut plus y classer une opération.
    const other = insertImported(t.db, bank, { date: '2026-11-11', amount: -5_00 })
    expect(
      t.ledger.run('transactionsCategorize', { ids: [other], categoryId: category('leisure') }),
    ).toEqual({ ok: false, error: 'invalid' })

    t.ok('categoryArchive', { id: category('leisure'), archived: false })
    const before = categorizedTotal()
    expect(
      t.ok('categoryArchive', {
        id: category('leisure'),
        archived: true,
        reassignTo: category('other'),
      }),
    ).toEqual({ reassigned: 1 })
    expect(t.ok('transactionGet', { id: kept }).categoryIds).toEqual([category('other')])
    expect(categorizedTotal()).toBe(before)
    expect(findUnbalancedTransactions(t.db)).toEqual([])
  })

  it('ne supprime qu’une catégorie inutilisée', () => {
    spendIn('other.pets', -15_00)
    expect(t.ledger.run('categoryDelete', { id: category('other.pets') })).toEqual({
      ok: false,
      error: 'category-in-use',
    })
    expect(t.ledger.run('categoryDelete', { id: category('other') })).toEqual({
      ok: false,
      error: 'category-in-use',
    })
    t.ok('categoryDelete', { id: category('other.gifts') })
    expect(summary(category('other.gifts'))).toBeUndefined()
  })
})
