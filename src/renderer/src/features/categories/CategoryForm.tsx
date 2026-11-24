import { useState, type FormEvent } from 'react'
import {
  CATEGORY_KINDS,
  type CategoryKind,
  type CategorySummary,
  type LedgerIcon,
  type PaletteColor,
} from '@shared/ledger/model'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { SelectField, TextField } from '../../components/ui/Field'
import { ColorPicker, IconPicker } from '../../components/ui/Pickers'
import { useT } from '../../i18n'
import { ledgerErrorCode, useLedgerMutation } from '../../lib/ledger'

const TOP_LEVEL = ''

/** Création (éventuellement sous un parent) ou modification d'une catégorie. */
export function CategoryForm({
  category,
  parent,
  categories,
  onClose,
  onSaved,
}: {
  /** Catégorie modifiée ; absente : création. */
  category?: CategorySummary
  /** Parent imposé à la création d'une sous-catégorie. */
  parent?: CategorySummary
  categories: readonly CategorySummary[]
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT()
  const f = t.categoryManager.form
  const create = useLedgerMutation('categoryCreate')
  const update = useLedgerMutation('categoryUpdate')
  const [name, setName] = useState(category?.name ?? '')
  const [kind, setKind] = useState<CategoryKind>(category?.kind ?? parent?.kind ?? 'expense')
  const [parentId, setParentId] = useState(category?.parentId ?? parent?.id ?? TOP_LEVEL)
  const [icon, setIcon] = useState<LedgerIcon | null>(category?.icon ?? null)
  const [color, setColor] = useState<PaletteColor | null>(category?.color ?? null)
  const [error, setError] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const hasChildren = category ? categories.some((c) => c.parentId === category.id) : false
  // Parents possibles : catégories actives de premier niveau (un parent ne descend pas d'un niveau).
  const parents = categories.filter(
    (c) => c.parentId === null && !c.archived && c.id !== category?.id,
  )
  const topLevel = parentId === TOP_LEVEL
  const busy = create.isPending || update.isPending

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return setError(f.nameRequired)
    setError(null)
    setFailure(null)
    const look = topLevel ? { icon, color } : { icon: null, color: null }
    try {
      if (category) {
        await update.mutateAsync({
          id: category.id,
          patch: {
            name: name.trim(),
            parentId: topLevel ? null : parentId,
            ...(topLevel ? { kind } : {}),
            ...look,
          },
        })
      } else {
        await create.mutateAsync({
          name: name.trim(),
          parentId: topLevel ? null : parentId,
          ...(topLevel ? { kind } : {}),
          ...look,
        })
      }
      onSaved()
    } catch (problem) {
      setFailure(t.ledger.errors[ledgerErrorCode(problem)])
    }
  }

  const title = category ? f.editTitle : parent ? f.createChildTitle(parent.name) : f.createTitle

  return (
    <Dialog title={title} onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} noValidate className="space-y-5">
        <TextField
          label={f.name}
          value={name}
          onChange={setName}
          maxLength={100}
          autoFocus
          required
          error={error}
        />
        {parent && !category ? null : (
          <SelectField
            label={f.parent}
            value={parentId}
            onChange={setParentId}
            disabled={hasChildren}
            hint={f.parentHint}
            options={[
              { value: TOP_LEVEL, label: f.noParent },
              ...parents.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        )}
        {topLevel ? (
          <>
            <SelectField
              label={f.kind}
              value={kind}
              onChange={setKind}
              hint={t.categoryManager.kindHints[kind]}
              options={CATEGORY_KINDS.map((value) => ({
                value,
                label: t.categoryManager.kinds[value],
              }))}
            />
            <ColorPicker name="category-color" value={color} onChange={setColor} />
            <IconPicker
              name="category-icon"
              value={icon}
              fallback="circle-help"
              onChange={setIcon}
            />
          </>
        ) : null}
        {failure ? (
          <p role="alert" className="text-sm font-medium text-expense">
            {failure}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {category ? f.save : f.create}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
