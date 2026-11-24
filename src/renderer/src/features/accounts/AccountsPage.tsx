import { Archive, ArchiveRestore, ArrowLeftRight, Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useLocation } from 'wouter'
import type { AccountSummary } from '@shared/ledger/model'
import { LedgerBadge } from '../../components/LedgerVisual'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatTile } from '../../components/ui/StatTile'
import { useT } from '../../i18n'
import { todayIso } from '../../lib/dates'
import { useFormatters } from '../../lib/format'
import { callLedger, ledgerErrorCode, useLedgerMutation, useLedgerQuery } from '../../lib/ledger'
import { useRegisterStore } from '../../stores/register'
import { useSettingsStore } from '../../stores/settings'
import { accountTotals, DEFAULT_ACCOUNT_ICON, groupAccounts } from './account-groups'
import { AccountForm } from './AccountForm'

type Editing = { kind: 'create' } | { kind: 'edit'; account: AccountSummary } | null

/** Comptes : soldes à date, regroupés par usage ; création, modification, archivage. */
export default function AccountsPage() {
  const t = useT()
  const fmt = useFormatters()
  const [, navigate] = useLocation()
  const openRegister = useRegisterStore((state) => state.openRegister)
  const currency = useSettingsStore((state) => state.settings.currency)
  const accounts = useLedgerQuery('accountsList', { includeArchived: true })
  const archive = useLedgerMutation('accountSetArchived')
  const remove = useLedgerMutation('accountDelete')
  const [editing, setEditing] = useState<Editing>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [deleting, setDeleting] = useState<AccountSummary | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const list = accounts.data ?? []
  const archived = list.filter((account) => account.archived)
  const totals = accountTotals(list, currency)
  const today = todayIso()

  const act = async (action: () => Promise<unknown>, success: string) => {
    setError(null)
    setNotice(null)
    try {
      await action()
      setNotice(success)
    } catch (failure) {
      setError(t.ledger.errors[ledgerErrorCode(failure)])
    }
  }

  const handlers: RowHandlers = {
    viewTransactions: (account) => {
      openRegister({ accountIds: [account.id] })
      navigate('/transactions')
    },
    edit: (account) => setEditing({ kind: 'edit', account }),
    archive: (account) =>
      void act(
        () => archive.mutateAsync({ id: account.id, archived: !account.archived }),
        account.archived ? '' : t.accounts.archivedNotice(account.name),
      ),
    remove: setDeleting,
    copyIban: (account) =>
      void act(async () => {
        const iban = await callLedger('accountRevealIban', { id: account.id })
        if (iban) await navigator.clipboard.writeText(iban)
      }, t.accounts.ibanCopied),
  }

  return (
    <>
      <PageHeader
        title={t.accounts.title}
        subtitle={t.accounts.subtitle(fmt.date(today))}
        actions={
          <Button variant="primary" onClick={() => setEditing({ kind: 'create' })}>
            <Plus size={15} aria-hidden />
            {t.accounts.add}
          </Button>
        }
      />

      <div aria-live="polite" className="empty:hidden mb-4">
        {notice ? <p className="text-sm text-fg-2">{notice}</p> : null}
      </div>
      {error ? (
        <p role="alert" className="mb-4 text-sm font-medium text-expense">
          {error}
        </p>
      ) : null}

      {accounts.isPending ? (
        <p role="status" className="text-sm text-muted">
          {t.common.loading}
        </p>
      ) : list.length === 0 ? (
        <Card accent>
          <div className="py-6 text-center">
            <h2 className="text-base font-semibold text-fg">{t.accounts.emptyTitle}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-fg-2">{t.accounts.emptyDescription}</p>
            <Button
              variant="primary"
              className="mt-4"
              onClick={() => setEditing({ kind: 'create' })}
            >
              <Plus size={15} aria-hidden />
              {t.accounts.add}
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <section aria-label={t.accounts.balance} className="mb-6 grid gap-3 sm:grid-cols-3">
            <StatTile label={t.accounts.totals.cash} value={fmt.money(totals.cash)} />
            <StatTile label={t.accounts.totals.savings} value={fmt.money(totals.savings)} />
            <StatTile label={t.accounts.totals.loans} value={fmt.money(totals.loans)} />
          </section>
          {totals.otherCurrencies.length > 0 ? (
            <p className="-mt-3 mb-5 text-xs text-muted">
              {t.accounts.totals.otherCurrencies(totals.otherCurrencies.join(', '))}
            </p>
          ) : null}

          <div className="space-y-5">
            {groupAccounts(list).map(({ group, accounts: members }) => (
              <Card key={group} title={t.accounts.groups[group]}>
                <AccountList accounts={members} handlers={handlers} />
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
                    ? t.accounts.hideArchived
                    : t.accounts.showArchived(archived.length)}
                </Button>
                {showArchived ? (
                  <Card title={t.accounts.groups.archived} className="mt-3">
                    <AccountList accounts={archived} handlers={handlers} />
                  </Card>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      )}

      {deleting ? (
        <ConfirmDialog
          title={t.accounts.confirmDeleteTitle}
          message={t.accounts.confirmDelete(deleting.name)}
          confirmLabel={t.accounts.deleteButton}
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            void act(
              () => remove.mutateAsync({ id: deleting.id }),
              t.accounts.deleted(deleting.name),
            )
          }
        />
      ) : null}
      {editing ? (
        <AccountForm
          account={editing.kind === 'edit' ? editing.account : undefined}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      ) : null}
    </>
  )
}

interface RowHandlers {
  viewTransactions: (account: AccountSummary) => void
  edit: (account: AccountSummary) => void
  archive: (account: AccountSummary) => void
  remove: (account: AccountSummary) => void
  copyIban: (account: AccountSummary) => void
}

function AccountList({
  accounts,
  handlers,
}: {
  accounts: readonly AccountSummary[]
  handlers: RowHandlers
}) {
  const t = useT()
  const fmt = useFormatters()
  return (
    <ul className="divide-y divide-border">
      {accounts.map((account) => {
        const money = (amount: number) => fmt.money(amount, { currency: account.currency })
        const details = [
          t.accounts.types[account.type],
          account.institution,
          account.ibanMasked,
        ].filter(Boolean)
        return (
          <li
            key={account.id}
            className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
          >
            <LedgerBadge
              icon={account.icon}
              color={account.color}
              fallback={DEFAULT_ACCOUNT_ICON[account.type]}
            />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
                {account.name}
                <Badge>{t.accounts.modes[account.trackingMode].label}</Badge>
              </p>
              <p className="mt-0.5 truncate text-xs text-muted">{details.join(' · ')}</p>
            </div>
            <div className="text-right">
              <p className="text-base font-semibold text-fg tabular-nums">
                {money(account.balance)}
              </p>
              <p className="text-xs text-muted tabular-nums">
                {account.trackingMode === 'valuation'
                  ? t.accounts.modes.valuation.label
                  : account.transactionCount > 0
                    ? t.accounts.reconciled(money(account.reconciledBalance))
                    : t.accounts.operations(0)}
              </p>
            </div>
            <div className="flex items-center gap-0.5">
              {account.trackingMode !== 'valuation' && account.transactionCount > 0 ? (
                <Button
                  variant="ghost"
                  iconOnly
                  aria-label={t.accounts.viewTransactions(account.name)}
                  title={t.accounts.viewTransactions(account.name)}
                  onClick={() => handlers.viewTransactions(account)}
                >
                  <ArrowLeftRight size={15} aria-hidden />
                </Button>
              ) : null}
              {account.ibanMasked ? (
                <Button
                  variant="ghost"
                  iconOnly
                  aria-label={t.accounts.copyIban(account.name)}
                  title={t.accounts.copyIban(account.name)}
                  onClick={() => handlers.copyIban(account)}
                >
                  <Copy size={15} aria-hidden />
                </Button>
              ) : null}
              <Button
                variant="ghost"
                iconOnly
                aria-label={t.accounts.edit(account.name)}
                title={t.accounts.edit(account.name)}
                onClick={() => handlers.edit(account)}
              >
                <Pencil size={15} aria-hidden />
              </Button>
              <Button
                variant="ghost"
                iconOnly
                aria-label={
                  account.archived
                    ? t.accounts.unarchive(account.name)
                    : t.accounts.archive(account.name)
                }
                title={
                  account.archived
                    ? t.accounts.unarchive(account.name)
                    : t.accounts.archive(account.name)
                }
                onClick={() => handlers.archive(account)}
              >
                {account.archived ? (
                  <ArchiveRestore size={15} aria-hidden />
                ) : (
                  <Archive size={15} aria-hidden />
                )}
              </Button>
              {account.transactionCount === 0 ? (
                <Button
                  variant="ghost"
                  iconOnly
                  aria-label={t.accounts.remove(account.name)}
                  title={t.accounts.remove(account.name)}
                  onClick={() => handlers.remove(account)}
                >
                  <Trash2 size={15} aria-hidden />
                </Button>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
