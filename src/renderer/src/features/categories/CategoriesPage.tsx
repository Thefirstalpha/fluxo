import { Archive, ArchiveRestore, Merge, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { CategorySummary } from '@shared/ledger/model'
import { LedgerBadge } from '../../components/LedgerVisual'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { PageHeader } from '../../components/ui/PageHeader'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useT } from '../../i18n'
import { useFormatters } from '../../lib/format'
import { ledgerErrorCode, useLedgerMutation, useLedgerQuery } from '../../lib/ledger'
import { buildTree, type CategoryNode } from './category-tree'
import { CategoryForm } from './CategoryForm'
import { ReassignDialog } from './ReassignDialog'
import { TagsView } from './TagsView'

type Tab = 'categories' | 'tags'

type Editing =
  | { kind: 'create'; parent?: CategorySummary }
  | { kind: 'edit'; category: CategorySummary }
  | { kind: 'merge' | 'archive'; node: CategoryNode }
  | { kind: 'delete'; category: CategorySummary }
  | null

/** Catégories (arbre à deux niveaux, par type) et étiquettes (corrélation transverse). */
export default function CategoriesPage() {
  const t = useT()
  const [tab, setTab] = useState<Tab>('categories')
  return (
    <>
      <PageHeader
        title={t.categoryManager.title}
        subtitle={t.categoryManager.subtitle}
        actions={
          <SegmentedControl
            ariaLabel={t.categoryManager.tabs.aria}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'categories', label: t.categoryManager.tabs.categories },
              { value: 'tags', label: t.categoryManager.tabs.tags },
            ]}
          />
        }
      />
      {tab === 'categories' ? <CategoriesView /> : <TagsView />}
    </>
  )
}

function CategoriesView() {
  const t = useT()
  const categories = useLedgerQuery('categoriesList', { includeArchived: true })
  const accounts = useLedgerQuery('accountsList', { includeArchived: true })
  const unarchive = useLedgerMutation('categoryArchive')
  const remove = useLedgerMutation('categoryDelete')
  const [editing, setEditing] = useState<Editing>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const all = categories.data ?? []
  const accountNames = new Map((accounts.data ?? []).map((a) => [a.id, a.name]))
  const parentsArchived = new Set(all.filter((c) => c.archived && !c.parentId).map((c) => c.id))
  const active = all.filter((c) => !c.archived)
  const archived = all.filter((c) => c.archived && !(c.parentId && parentsArchived.has(c.parentId)))
  const close = () => setEditing(null)
  const done = (message: string) => {
    setEditing(null)
    setError(null)
    setNotice(message)
  }
  const run = async (action: () => Promise<unknown>, message: string) => {
    setNotice(null)
    setError(null)
    try {
      await action()
      setNotice(message)
    } catch (failure) {
      setError(t.ledger.errors[ledgerErrorCode(failure)])
    }
  }

  const actions: RowActions = {
    addChild: (parent) => setEditing({ kind: 'create', parent }),
    edit: (category) => setEditing({ kind: 'edit', category }),
    merge: (node) => setEditing({ kind: 'merge', node }),
    archive: (node) => setEditing({ kind: 'archive', node }),
    remove: (category) => setEditing({ kind: 'delete', category }),
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div aria-live="polite" className="text-sm text-fg-2">
          {notice}
        </div>
        <Button variant="primary" onClick={() => setEditing({ kind: 'create' })}>
          <Plus size={15} aria-hidden />
          {t.categoryManager.add}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mb-4 text-sm font-medium text-expense">
          {error}
        </p>
      ) : null}
      {categories.isPending ? (
        <p role="status" className="text-sm text-muted">
          {t.common.loading}
        </p>
      ) : (
        <div className="space-y-5">
          {buildTree(active).map((group) => (
            <Card
              key={group.kind}
              title={t.categoryManager.kinds[group.kind]}
              subtitle={t.categoryManager.kindHints[group.kind]}
            >
              <CategoryList nodes={group.nodes} accountNames={accountNames} actions={actions} />
            </Card>
          ))}
          {archived.length > 0 ? (
            <div>
              <Button
                variant="ghost"
                aria-expanded={showArchived}
                onClick={() => setShowArchived((value) => !value)}
              >
                {showArchived
                  ? t.categoryManager.hideArchived
                  : t.categoryManager.showArchived(archived.length)}
              </Button>
              {showArchived ? (
                <Card title={t.categoryManager.archivedTitle} className="mt-3">
                  <ul className="divide-y divide-border">
                    {archived.map((category) => (
                      <li key={category.id} className="flex items-center gap-3 py-2.5">
                        <span className="min-w-0 flex-1 text-sm text-fg">{category.name}</span>
                        <Badge>{t.categoryManager.archivedBadge}</Badge>
                        <Button
                          variant="ghost"
                          iconOnly
                          aria-label={t.categoryManager.unarchive(category.name)}
                          title={t.categoryManager.unarchive(category.name)}
                          onClick={() =>
                            void run(
                              () => unarchive.mutateAsync({ id: category.id, archived: false }),
                              t.categoryManager.saved,
                            )
                          }
                        >
                          <ArchiveRestore size={15} aria-hidden />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {editing?.kind === 'create' || editing?.kind === 'edit' ? (
        <CategoryForm
          category={editing.kind === 'edit' ? editing.category : undefined}
          parent={editing.kind === 'create' ? editing.parent : undefined}
          categories={all}
          onClose={close}
          onSaved={() => done(t.categoryManager.saved)}
        />
      ) : null}
      {editing?.kind === 'merge' || editing?.kind === 'archive' ? (
        <ReassignDialog
          mode={editing.kind}
          node={editing.node}
          categories={active}
          onClose={close}
          onDone={(count) =>
            done(
              editing.kind === 'merge'
                ? t.categoryManager.merged(count)
                : t.categoryManager.archived(editing.node.category.name),
            )
          }
        />
      ) : null}
      {editing?.kind === 'delete' ? (
        <ConfirmDialog
          title={t.categoryManager.confirmDeleteTitle}
          message={t.categoryManager.confirmDelete(editing.category.name)}
          confirmLabel={t.categoryManager.deleteButton}
          onClose={close}
          onConfirm={() =>
            void run(
              () => remove.mutateAsync({ id: editing.category.id }),
              t.categoryManager.deleted(editing.category.name),
            )
          }
        />
      ) : null}
    </>
  )
}

interface RowActions {
  addChild: (parent: CategorySummary) => void
  edit: (category: CategorySummary) => void
  merge: (node: CategoryNode) => void
  archive: (node: CategoryNode) => void
  remove: (category: CategorySummary) => void
}

function CategoryList({
  nodes,
  accountNames,
  actions,
}: {
  nodes: CategoryNode[]
  accountNames: ReadonlyMap<string, string>
  actions: RowActions
}) {
  return (
    <ul className="divide-y divide-border">
      {nodes.map((node) => (
        <li key={node.category.id} className="py-2.5 first:pt-0 last:pb-0">
          <CategoryRow node={node} accountNames={accountNames} actions={actions} />
          {node.children.length > 0 ? (
            <ul className="mt-1.5 ml-11 space-y-1 border-l border-border pl-3">
              {node.children.map((child) => (
                <li key={child.id}>
                  <CategoryRow
                    node={{
                      category: child,
                      children: [],
                      transactionCount: child.transactionCount,
                      total: child.total,
                    }}
                    parent={node.category}
                    accountNames={accountNames}
                    actions={actions}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function CategoryRow({
  node,
  parent,
  accountNames,
  actions,
}: {
  node: CategoryNode
  parent?: CategorySummary
  accountNames: ReadonlyMap<string, string>
  actions: RowActions
}) {
  const t = useT()
  const fmt = useFormatters()
  const { category } = node
  const name = category.name
  const linkedName = category.linkedAccountId ? accountNames.get(category.linkedAccountId) : null
  const unused = node.transactionCount === 0 && node.children.length === 0
  const button = (label: string, onClick: () => void, icon: ReactNode) => (
    <Button variant="ghost" iconOnly aria-label={label} title={label} onClick={onClick}>
      {icon}
    </Button>
  )
  return (
    <div className="flex flex-wrap items-center gap-3">
      {parent ? null : (
        <LedgerBadge icon={category.icon} color={category.color} fallback="circle-help" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={parent ? 'text-sm text-fg' : 'text-sm font-semibold text-fg'}>{name}</p>
          {linkedName ? <Badge>{t.categoryManager.linkedAccountBadge(linkedName)}</Badge> : null}
        </div>
        <p className="text-xs text-muted">{t.categoryManager.usage(node.transactionCount)}</p>
      </div>
      {node.transactionCount > 0 ? (
        <span className="text-sm text-fg-2 tabular-nums">{fmt.money(node.total)}</span>
      ) : null}
      <div className="flex items-center gap-0.5">
        {parent
          ? null
          : button(
              t.categoryManager.addChild(name),
              () => actions.addChild(category),
              <Plus size={15} aria-hidden />,
            )}
        {button(
          t.categoryManager.edit(name),
          () => actions.edit(category),
          <Pencil size={15} aria-hidden />,
        )}
        {button(
          t.categoryManager.merge(name),
          () => actions.merge(node),
          <Merge size={15} aria-hidden />,
        )}
        {button(
          t.categoryManager.archive(name),
          () => actions.archive(node),
          <Archive size={15} aria-hidden />,
        )}
        {unused
          ? button(
              t.categoryManager.remove(name),
              () => actions.remove(category),
              <Trash2 size={15} aria-hidden />,
            )
          : null}
      </div>
    </div>
  )
}
