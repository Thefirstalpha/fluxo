import { CATEGORY_KINDS, type CategoryKind, type CategorySummary } from '@shared/ledger/model'
import type { MinorUnits } from '@shared/money'

export interface CategoryNode {
  category: CategorySummary
  children: CategorySummary[]
  /** Opérations et total de la catégorie et de ses sous-catégories. */
  transactionCount: number
  total: MinorUnits
}

/** Arbre par type (dépenses, revenus, épargne, virements), dans l'ordre de la liste reçue. */
export function buildTree(
  categories: readonly CategorySummary[],
): { kind: CategoryKind; nodes: CategoryNode[] }[] {
  const nodes = new Map<string, CategoryNode>()
  for (const category of categories) {
    if (category.parentId === null) {
      nodes.set(category.id, {
        category,
        children: [],
        transactionCount: category.transactionCount,
        total: category.total,
      })
    }
  }
  for (const category of categories) {
    const parent = category.parentId ? nodes.get(category.parentId) : undefined
    if (!parent) continue
    parent.children.push(category)
    parent.transactionCount += category.transactionCount
    parent.total += category.total
  }
  return CATEGORY_KINDS.map((kind) => ({
    kind,
    nodes: [...nodes.values()].filter((node) => node.category.kind === kind),
  })).filter((group) => group.nodes.length > 0)
}

/** Libellé complet « Parent › Enfant ». */
export function categoryPath(
  category: CategorySummary,
  byId: ReadonlyMap<string, CategorySummary>,
): string {
  const parent = category.parentId ? byId.get(category.parentId) : undefined
  return parent ? `${parent.name} › ${category.name}` : category.name
}

/**
 * Cibles possibles d'une fusion ou d'une réaffectation : catégories actives du même type, hors
 * la catégorie elle-même et ses sous-catégories (règles aussi vérifiées par le service).
 */
export function reassignTargets(
  categories: readonly CategorySummary[],
  source: CategorySummary,
): CategorySummary[] {
  return categories.filter(
    (category) =>
      !category.archived &&
      category.kind === source.kind &&
      category.id !== source.id &&
      category.parentId !== source.id,
  )
}
