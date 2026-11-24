import { ArrowLeftRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useLocation } from 'wouter'
import type { PaletteColor, TagSummary } from '@shared/ledger/model'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Dialog } from '../../components/ui/Dialog'
import { TextField } from '../../components/ui/Field'
import { ColorPicker } from '../../components/ui/Pickers'
import { useT } from '../../i18n'
import { useFormatters } from '../../lib/format'
import { ledgerErrorCode, useLedgerMutation, useLedgerQuery } from '../../lib/ledger'
import { paletteVar } from '../../lib/ledger-visual'
import { useRegisterStore } from '../../stores/register'

/** Étiquettes : total et nombre d'opérations, quelle que soit la catégorie. */
export function TagsView() {
  const t = useT()
  const fmt = useFormatters()
  const [, navigate] = useLocation()
  const openRegister = useRegisterStore((state) => state.openRegister)
  const tags = useLedgerQuery('tagsList', {})
  const create = useLedgerMutation('tagCreate')
  const remove = useLedgerMutation('tagDelete')
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<TagSummary | null>(null)
  const [deleting, setDeleting] = useState<TagSummary | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const add = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return setError(t.tags.nameRequired)
    setError(null)
    try {
      await create.mutateAsync({ name: trimmed, color: null })
      setName('')
      setNotice(t.tags.created(trimmed))
    } catch (failure) {
      setError(t.ledger.errors[ledgerErrorCode(failure)])
    }
  }

  const list = tags.data ?? []
  return (
    <>
      <Card>
        <form onSubmit={(event) => void add(event)} noValidate className="flex items-end gap-2">
          <TextField
            label={t.tags.name}
            value={name}
            onChange={setName}
            maxLength={60}
            error={error}
            className="min-w-0 flex-1"
          />
          <Button type="submit" variant="primary" disabled={create.isPending}>
            <Plus size={15} aria-hidden />
            {t.tags.create}
          </Button>
        </form>
        <p aria-live="polite" className="mt-2 text-sm text-fg-2 empty:hidden">
          {notice}
        </p>
      </Card>

      <div className="mt-5">
        {tags.isPending ? (
          <p role="status" className="text-sm text-muted">
            {t.common.loading}
          </p>
        ) : list.length === 0 ? (
          <Card>
            <div className="py-4 text-center">
              <h2 className="text-base font-semibold text-fg">{t.tags.emptyTitle}</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-fg-2">{t.tags.emptyDescription}</p>
            </div>
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {list.map((tag) => (
                <li key={tag.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span
                    aria-hidden
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: paletteVar(tag.color) }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-fg">{tag.name}</p>
                    <p className="text-xs text-muted">{t.tags.usage(tag.transactionCount)}</p>
                  </div>
                  {tag.transactionCount > 0 ? (
                    <>
                      <span className="text-sm text-fg-2 tabular-nums">{fmt.money(tag.total)}</span>
                      <Button
                        variant="ghost"
                        iconOnly
                        aria-label={t.tags.viewTransactions(tag.name)}
                        title={t.tags.viewTransactions(tag.name)}
                        onClick={() => {
                          openRegister({ tagIds: [tag.id] })
                          navigate('/transactions')
                        }}
                      >
                        <ArrowLeftRight size={15} aria-hidden />
                      </Button>
                    </>
                  ) : null}
                  <Button
                    variant="ghost"
                    iconOnly
                    aria-label={t.tags.edit(tag.name)}
                    title={t.tags.edit(tag.name)}
                    onClick={() => setEditing(tag)}
                  >
                    <Pencil size={15} aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    iconOnly
                    aria-label={t.tags.remove(tag.name)}
                    title={t.tags.remove(tag.name)}
                    onClick={() => setDeleting(tag)}
                  >
                    <Trash2 size={15} aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {editing ? <TagForm tag={editing} onClose={() => setEditing(null)} /> : null}
      {deleting ? (
        <ConfirmDialog
          title={t.tags.confirmDeleteTitle}
          message={t.tags.confirmDelete(deleting.name, deleting.transactionCount)}
          confirmLabel={t.tags.deleteButton}
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            void remove
              .mutateAsync({ id: deleting.id })
              .then(() => setNotice(t.tags.deleted(deleting.name)))
              .catch((failure: unknown) => setError(t.ledger.errors[ledgerErrorCode(failure)]))
          }
        />
      ) : null}
    </>
  )
}

function TagForm({ tag, onClose }: { tag: TagSummary; onClose: () => void }) {
  const t = useT()
  const update = useLedgerMutation('tagUpdate')
  const [name, setName] = useState(tag.name)
  const [color, setColor] = useState<PaletteColor | null>(tag.color)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return setError(t.tags.nameRequired)
    try {
      await update.mutateAsync({ id: tag.id, patch: { name: name.trim(), color } })
      onClose()
    } catch (failure) {
      setError(t.ledger.errors[ledgerErrorCode(failure)])
    }
  }

  return (
    <Dialog title={t.tags.editTitle} onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} noValidate className="space-y-5">
        <TextField
          label={t.tags.name}
          value={name}
          onChange={setName}
          maxLength={60}
          autoFocus
          error={error}
        />
        <ColorPicker name="tag-color" value={color} onChange={setColor} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button type="submit" variant="primary" disabled={update.isPending}>
            {t.tags.save}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
