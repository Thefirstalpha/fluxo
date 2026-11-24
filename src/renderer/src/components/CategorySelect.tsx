import type { SelectHTMLAttributes } from 'react'
import type { CategorySummary } from '@shared/ledger/model'
import { buildTree } from '../features/categories/category-tree'
import { useT } from '../i18n'
import { cx } from '../lib/cx'
import { INPUT_CLASS } from './ui/Field'

interface CategorySelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'value' | 'onChange'
> {
  categories: readonly CategorySummary[]
  value: string
  onChange: (value: string) => void
  /** Libellé de l'option vide (`''`), ex. « Non catégorisée » ou « Toutes catégories ». */
  emptyLabel: string
  /** Options supplémentaires insérées juste après l'option vide (ex. `UNCATEGORIZED`). */
  extraOptions?: readonly { value: string; label: string }[]
}

/** Sélecteur de catégorie groupé par type (dépense, revenu, épargne, virement) sur deux niveaux. */
export function CategorySelect({
  categories,
  value,
  onChange,
  emptyLabel,
  extraOptions,
  className,
  ...rest
}: CategorySelectProps) {
  const t = useT()
  const active = categories.filter((c) => !c.archived)
  const groups = buildTree(active)

  return (
    <select
      {...rest}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cx(INPUT_CLASS, 'border-border-strong', className)}
    >
      <option value="">{emptyLabel}</option>
      {extraOptions?.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
      {groups.map((group) => (
        <optgroup key={group.kind} label={t.categoryManager.kinds[group.kind]}>
          {group.nodes.flatMap((node) => [
            <option key={node.category.id} value={node.category.id}>
              {node.category.name}
            </option>,
            ...node.children.map((child) => (
              <option key={child.id} value={child.id}>
                {'\u00A0\u00A0'}
                {node.category.name} › {child.name}
              </option>
            )),
          ])}
        </optgroup>
      ))}
    </select>
  )
}
