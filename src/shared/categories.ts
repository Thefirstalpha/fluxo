/**
 * Catégories de dépenses par défaut (pack « France »). Les libellés sont traduits côté
 * renderer (clé i18n `categories.<id>`). Les catégories personnalisées arrivent au jalon M2.
 */
export const EXPENSE_CATEGORY_IDS = [
  'housing',
  'groceries',
  'transport',
  'health',
  'leisure',
  'subscriptions',
  'shopping',
  'other',
] as const

export type ExpenseCategoryId = (typeof EXPENSE_CATEGORY_IDS)[number]
