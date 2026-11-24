import { CATEGORY_PACK_FR } from '@shared/ledger/category-pack'
import type { Locale } from '@shared/settings'
import { uuidv7 } from '@shared/uuid'
import type { Db } from '../db/connection'

/**
 * Crée le pack de catégories France (deux niveaux) dans la langue donnée. Appelé à la création
 * d'un coffre (et du coffre de démonstration), dans la transaction de l'appelant.
 * Renvoie l'identifiant de chaque catégorie par clé du pack (`housing`, `housing.rent`…).
 */
export function seedCategoryPack(db: Db, locale: Locale, now: Date): Map<string, string> {
  const stamp = now.toISOString()
  const ids = new Map<string, string>()
  const insert = db.prepare(
    `INSERT INTO category (id, parent_id, name, kind, icon, color, sort_order, created_at, updated_at)
     VALUES (@id, @parent, @name, @kind, @icon, @color, @order, @stamp, @stamp)`,
  )
  CATEGORY_PACK_FR.forEach((category, index) => {
    const id = uuidv7()
    ids.set(category.key, id)
    insert.run({
      id,
      parent: null,
      name: category.names[locale],
      kind: category.kind,
      icon: category.icon,
      color: category.color,
      order: index,
      stamp,
    })
    category.children.forEach((child, childIndex) => {
      const childId = uuidv7()
      ids.set(child.key, childId)
      insert.run({
        id: childId,
        parent: id,
        name: child.names[locale],
        kind: category.kind,
        icon: null,
        color: null,
        order: childIndex,
        stamp,
      })
    })
  })
  return ids
}
