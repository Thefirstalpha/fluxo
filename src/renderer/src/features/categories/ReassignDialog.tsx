import { useState } from 'react'
import type { CategorySummary } from '@shared/ledger/model'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { SelectField } from '../../components/ui/Field'
import { useT } from '../../i18n'
import { ledgerErrorCode, useLedgerMutation } from '../../lib/ledger'
import { categoryPath, reassignTargets, type CategoryNode } from './category-tree'

const KEEP = ''

/** Fusion (cible obligatoire) ou archivage (réaffectation facultative) d'une catégorie. */
export function ReassignDialog({
  mode,
  node,
  categories,
  onClose,
  onDone,
}: {
  mode: 'merge' | 'archive'
  node: CategoryNode
  categories: readonly CategorySummary[]
  onClose: () => void
  onDone: (reassigned: number) => void
}) {
  const t = useT()
  const merge = useLedgerMutation('categoryMerge')
  const archive = useLedgerMutation('categoryArchive')
  const byId = new Map(categories.map((category) => [category.id, category]))
  const targets = reassignTargets(categories, node.category)
  const [target, setTarget] = useState(mode === 'merge' ? (targets[0]?.id ?? KEEP) : KEEP)
  const [failure, setFailure] = useState<string | null>(null)
  const source = node.category
  const texts = mode === 'merge' ? t.categoryManager.mergeDialog : t.categoryManager.archiveDialog

  const confirm = async () => {
    setFailure(null)
    try {
      const result =
        mode === 'merge'
          ? await merge.mutateAsync({ sourceId: source.id, targetId: target })
          : await archive.mutateAsync({
              id: source.id,
              archived: true,
              reassignTo: target === KEEP ? null : target,
            })
      onDone(result.reassigned)
    } catch (problem) {
      setFailure(t.ledger.errors[ledgerErrorCode(problem)])
    }
  }

  const options = targets.map((category) => ({
    value: category.id,
    label: categoryPath(category, byId),
  }))
  const description =
    mode === 'merge'
      ? t.categoryManager.mergeDialog.description(node.transactionCount)
      : t.categoryManager.archiveDialog.description
  return (
    <Dialog title={texts.title(source.name)} description={description} onClose={onClose}>
      <div className="space-y-5">
        {mode === 'merge' && options.length === 0 ? (
          <p className="text-sm text-fg-2">{t.categoryManager.mergeDialog.noTarget}</p>
        ) : (
          <SelectField
            label={
              mode === 'merge'
                ? t.categoryManager.mergeDialog.target
                : t.categoryManager.archiveDialog.reassign
            }
            value={target}
            onChange={setTarget}
            options={
              mode === 'merge'
                ? options
                : [{ value: KEEP, label: t.categoryManager.archiveDialog.keep }, ...options]
            }
          />
        )}
        {failure ? (
          <p role="alert" className="text-sm font-medium text-expense">
            {failure}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button
            variant="primary"
            disabled={(mode === 'merge' && target === KEEP) || merge.isPending || archive.isPending}
            onClick={() => void confirm()}
          >
            {texts.confirm}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
