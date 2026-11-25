import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { CategorySummary } from '@shared/ledger/model'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { useSettingsStore } from '../../stores/settings'
import { installFakeApi } from '../../test/fake-api'
import { renderWithQuery } from '../../test/render'
import { buildTree, reassignTargets } from './category-tree'
import CategoriesPage from './CategoriesPage'

const id = (n: number) => `0192f0c8-0000-7000-8000-${String(n).padStart(12, '0')}`

const category = (n: number, overrides: Partial<CategorySummary>): CategorySummary => ({
  id: id(n),
  parentId: null,
  name: `Catégorie ${n}`,
  kind: 'expense',
  icon: null,
  color: null,
  sortOrder: n,
  archived: false,
  linkedAccountId: null,
  transactionCount: 0,
  total: 0,
  ...overrides,
})

const HOUSING = category(1, { name: 'Logement', icon: 'house', color: '#dd2a80' })
const ENERGY = category(2, {
  name: 'Énergie',
  parentId: id(1),
  transactionCount: 3,
  total: -240_00,
})
const RENT = category(3, { name: 'Loyer', parentId: id(1), transactionCount: 1, total: -800_00 })
const LEISURE = category(4, { name: 'Loisirs', transactionCount: 2, total: -55_00 })
const SALARY = category(5, {
  name: 'Salaire',
  kind: 'income',
  transactionCount: 1,
  total: 2_500_00,
})
const LIST = [HOUSING, ENERGY, RENT, LEISURE, SALARY]

beforeEach(() => {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, ready: true })
})

describe('arbre des catégories', () => {
  it('regroupe par type et additionne les sous-catégories dans leur parent', () => {
    const tree = buildTree(LIST)
    expect(tree.map((group) => group.kind)).toEqual(['expense', 'income'])
    expect(tree[0]?.nodes[0]).toMatchObject({ transactionCount: 4, total: -1_040_00 })
    expect(tree[0]?.nodes[0]?.children.map((c) => c.name)).toEqual(['Énergie', 'Loyer'])
  })

  it('propose comme cible les catégories actives du même type, hors la source et ses enfants', () => {
    expect(reassignTargets(LIST, HOUSING).map((c) => c.name)).toEqual(['Loisirs'])
    expect(reassignTargets(LIST, ENERGY).map((c) => c.name)).toEqual([
      'Logement',
      'Loyer',
      'Loisirs',
    ])
  })
})

describe('CategoriesPage', () => {
  it('affiche l’arbre par type, avec totaux, et crée une sous-catégorie', async () => {
    const api = installFakeApi()
    api.ledger.categoriesList.mockResolvedValue({ ok: true, value: LIST })
    renderWithQuery(<CategoriesPage />)
    expect(await screen.findByRole('heading', { name: 'Dépenses' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Revenus' })).toBeVisible()
    expect(screen.getByText('Énergie')).toBeVisible()
    expect(screen.getByText(/−?-?1\s040,00\s€/)).toBeVisible()
    // Une catégorie utilisée ne se supprime pas ; une inutilisée, si.
    expect(screen.queryByRole('button', { name: 'Supprimer Loisirs' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une sous-catégorie à Logement' }))
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Nouvelle sous-catégorie de Logement' }),
    )
    fireEvent.change(dialog.getByLabelText('Nom'), { target: { value: 'Eau' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Créer' }))
    await waitFor(() =>
      expect(api.ledger.categoryCreate).toHaveBeenCalledWith({
        name: 'Eau',
        parentId: HOUSING.id,
        icon: null,
        color: null,
      }),
    )
  })

  it('fusionne dans une catégorie du même type et annonce les parts réaffectées', async () => {
    const api = installFakeApi()
    api.ledger.categoriesList.mockResolvedValue({ ok: true, value: LIST })
    api.ledger.categoryMerge.mockResolvedValue({ ok: true, value: { reassigned: 3 } })
    renderWithQuery(<CategoriesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Fusionner Énergie' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Fusionner Énergie' }))
    fireEvent.change(dialog.getByLabelText('Fusionner dans'), { target: { value: RENT.id } })
    fireEvent.click(dialog.getByRole('button', { name: 'Fusionner' }))
    await waitFor(() =>
      expect(api.ledger.categoryMerge).toHaveBeenCalledWith({
        sourceId: ENERGY.id,
        targetId: RENT.id,
      }),
    )
    expect(await screen.findByText(/3 parts réaffectées/)).toBeVisible()
  })

  it('gère les étiquettes : ajout, totaux, nom déjà pris', async () => {
    const api = installFakeApi()
    api.ledger.tagsList.mockResolvedValue({
      ok: true,
      value: [{ id: id(9), name: 'Pro', color: null, total: -120_00, transactionCount: 4 }],
    })
    api.ledger.tagCreate.mockResolvedValueOnce({ ok: false, error: 'name-taken' })
    renderWithQuery(<CategoriesPage />)
    fireEvent.click(screen.getByRole('radio', { name: 'Étiquettes' }))
    expect(await screen.findByText('Pro')).toBeVisible()
    expect(screen.getByText('4 opérations')).toBeVisible()
    fireEvent.change(screen.getByLabelText('Nom de l’étiquette'), { target: { value: 'pro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ce nom est déjà utilisé.')
  })
})
