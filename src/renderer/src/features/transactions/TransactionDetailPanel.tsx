import { ArrowLeftRight, History, Plus, Sparkles, Star, Trash2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import {
  TRANSACTION_STATUSES,
  type AccountSummary,
  type CategorySummary,
  type SplitInput,
  type TagSummary,
  type TransactionDetail,
  type TransactionStatus,
} from '@shared/ledger/model'
import { parseAmount } from '@shared/money'
import { CategorySelect } from '../../components/CategorySelect'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { INPUT_CLASS } from '../../components/ui/Field'
import { useT } from '../../i18n'
import { cx } from '../../lib/cx'
import { useFormatters } from '../../lib/format'
import { ledgerErrorCode, useLedgerMutation, useLedgerQuery } from '../../lib/ledger'
import { useSettingsStore } from '../../stores/settings'
import { amountToInput } from '../accounts/account-groups'
import { CreateRuleFromTxDialog } from '../categorization/CreateRuleFromTxDialog'
import { convertedFromRate, rateFromConverted, splitRemainder } from './grouping'

interface DetailPanelProps {
  transactionId: string
  accounts: readonly AccountSummary[]
  categories: readonly CategorySummary[]
  tags: readonly TagSummary[]
  onClose: () => void
  onDeleted: (count: number) => void
  onNotice: (message: string) => void
}

/** Panneau latéral de détail d'une opération : annotations, ventilation, virement et audit. */
export function TransactionDetailPanel({
  transactionId,
  accounts,
  categories,
  tags,
  onClose,
  onDeleted,
  onNotice,
}: DetailPanelProps) {
  const detailQuery = useLedgerQuery('transactionGet', { id: transactionId })
  const t = useT()

  if (detailQuery.isPending) {
    return (
      <aside
        aria-label={t.transactions.detail.title}
        className="w-full shrink-0 rounded-xl border border-border bg-surface p-5 lg:w-[400px]"
      >
        <p role="status" className="text-sm text-muted">
          {t.common.loading}
        </p>
      </aside>
    )
  }

  if (!detailQuery.data) return null

  return (
    <DetailBody
      key={`${detailQuery.data.id}-${detailQuery.dataUpdatedAt}`}
      detail={detailQuery.data}
      accounts={accounts}
      categories={categories}
      tags={tags}
      onClose={onClose}
      onDeleted={onDeleted}
      onNotice={onNotice}
    />
  )
}

function DetailBody({
  detail,
  accounts,
  categories,
  tags,
  onClose,
  onDeleted,
  onNotice,
}: { detail: TransactionDetail } & Omit<DetailPanelProps, 'transactionId'>) {
  const t = useT()
  const d = t.transactions.detail
  const fmt = useFormatters()
  const settings = useSettingsStore((state) => state.settings)

  const account = accounts.find((a) => a.id === detail.accountId)
  const editable = !detail.imported && account?.trackingMode === 'manual'
  const foreignCurrency = detail.currency !== settings.currency

  const updateTx = useLedgerMutation('transactionUpdate')
  const setSplitsTx = useLedgerMutation('transactionSetSplits')
  const deleteTx = useLedgerMutation('transactionsDelete')
  const unlinkTx = useLedgerMutation('transferUnlink')
  const counterpartTx = useLedgerMutation('transferCounterpart')
  const linkTx = useLedgerMutation('transferLink')

  const payees = useLedgerQuery('payeesList', {})
  const audit = useLedgerQuery('auditList', {
    entity: 'transaction',
    entityId: detail.id,
    limit: 20,
  })
  const oppositeAbs = Math.abs(detail.amount)
  const candidates = useLedgerQuery(
    'transactionsList',
    {
      filter: {
        minAmount: oppositeAbs,
        maxAmount: oppositeAbs,
        direction: detail.amount > 0 ? 'out' : 'in',
      },
      limit: 25,
    },
    { enabled: detail.transferId === null && detail.amount !== 0 },
  )

  const [customLabel, setCustomLabel] = useState(detail.customLabel ?? '')
  const [labelRaw, setLabelRaw] = useState(detail.labelRaw)
  const [bookingDate, setBookingDate] = useState(detail.bookingDate)
  const [valueDate, setValueDate] = useState(detail.valueDate ?? '')
  const [amountInput, setAmountInput] = useState(() =>
    amountToInput(detail.amount, settings.locale),
  )
  const [accountId, setAccountId] = useState(detail.accountId)
  const [payee, setPayee] = useState(detail.payee ?? '')
  const [status, setStatus] = useState<TransactionStatus>(detail.status)
  const [favorite, setFavorite] = useState(detail.favorite)
  const [note, setNote] = useState(detail.note ?? '')
  const [rateInput, setRateInput] = useState(() =>
    rateFromConverted(detail.amount, detail.convertedAmount),
  )
  const [convertedInput, setConvertedInput] = useState(() =>
    detail.convertedAmount !== null ? amountToInput(detail.convertedAmount, settings.locale) : '',
  )

  const [splits, setSplits] = useState<SplitInput[]>(() =>
    detail.splits.length > 0
      ? detail.splits.map((s) => ({
          categoryId: s.categoryId,
          amount: s.amount,
          note: s.note,
          tagIds: [...s.tagIds],
        }))
      : [{ categoryId: null, amount: detail.amount, note: null, tagIds: [] }],
  )
  const [splitAmounts, setSplitAmounts] = useState<string[]>(() =>
    (detail.splits.length > 0 ? detail.splits : [{ amount: detail.amount }]).map((s) =>
      amountToInput(s.amount, settings.locale),
    ),
  )

  const [counterpartAccountId, setCounterpartAccountId] = useState('')
  const [linkTargetId, setLinkTargetId] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const manualTargets = accounts.filter(
    (a) =>
      !a.archived &&
      a.trackingMode === 'manual' &&
      a.currency === detail.currency &&
      a.id !== detail.accountId,
  )
  const linkCandidates = (candidates.data?.rows ?? []).filter(
    (row) =>
      row.id !== detail.id &&
      row.accountId !== detail.accountId &&
      row.currency === detail.currency &&
      row.transferId === null &&
      row.amount === -detail.amount,
  )

  const remainder = splitRemainder(detail.amount, splits)
  const canSaveSplits =
    remainder === 0 && (splits.length === 1 || splits.every((split) => split.amount !== 0))

  const onRateChange = (nextRate: string) => {
    setRateInput(nextRate)
    const converted = convertedFromRate(detail.amount, nextRate)
    if (converted !== null) setConvertedInput(amountToInput(converted, settings.locale))
  }

  const saveAnnotations = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    let convertedAmount: number | null = detail.convertedAmount
    if (foreignCurrency) {
      if (!convertedInput.trim()) convertedAmount = null
      else {
        const parsed = parseAmount(convertedInput)
        if (parsed === null) return setError(t.ledger.errors.invalid)
        convertedAmount = parsed
      }
    }

    const patch: Record<string, unknown> = {
      customLabel: customLabel.trim() || null,
      payee: payee.trim() || null,
      status,
      favorite,
      note: note.trim() || null,
      ...(foreignCurrency ? { convertedAmount } : {}),
    }

    if (editable) {
      const parsedAmount = parseAmount(amountInput)
      if (parsedAmount === null) return setError(t.ledger.errors.invalid)
      if (!labelRaw.trim()) return setError(t.ledger.errors.invalid)
      patch.accountId = accountId
      patch.bookingDate = bookingDate
      patch.valueDate = valueDate || null
      patch.amount = parsedAmount
      patch.labelRaw = labelRaw.trim()
    }

    try {
      await updateTx.mutateAsync({ id: detail.id, patch })
      onNotice(d.saved)
    } catch (failure) {
      setError(t.ledger.errors[ledgerErrorCode(failure)])
    }
  }

  const saveSplits = async () => {
    setError(null)
    try {
      await setSplitsTx.mutateAsync({ id: detail.id, splits })
      onNotice(d.splitsSaved)
    } catch (failure) {
      setError(t.ledger.errors[ledgerErrorCode(failure)])
    }
  }

  const updateSplitAmount = (index: number, raw: string) => {
    setSplitAmounts((prev) => prev.map((val, i) => (i === index ? raw : val)))
    const parsed = parseAmount(raw)
    if (parsed !== null) {
      setSplits((prev) =>
        prev.map((split, i) => (i === index ? { ...split, amount: parsed } : split)),
      )
    }
  }

  const toggleSplitTag = (index: number, tagId: string) => {
    setSplits((prev) =>
      prev.map((split, i) => {
        if (i !== index) return split
        const has = split.tagIds.includes(tagId)
        return {
          ...split,
          tagIds: has ? split.tagIds.filter((id) => id !== tagId) : [...split.tagIds, tagId],
        }
      }),
    )
  }

  const addSplit = () => {
    const rest = splitRemainder(detail.amount, splits)
    const nextAmount = rest !== 0 ? rest : 0
    setSplits((prev) => [...prev, { categoryId: null, amount: nextAmount, note: null, tagIds: [] }])
    setSplitAmounts((prev) => [...prev, amountToInput(nextAmount, settings.locale)])
  }

  const removeSplit = (index: number) => {
    setSplits((prev) => prev.filter((_, i) => i !== index))
    setSplitAmounts((prev) => prev.filter((_, i) => i !== index))
  }

  const transferAccount = detail.transferAccountId
    ? (accounts.find((a) => a.id === detail.transferAccountId)?.name ?? '—')
    : null

  return (
    <aside
      aria-label={d.title}
      className="w-full shrink-0 space-y-5 rounded-xl border border-border bg-surface p-5 lg:w-[400px]"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-fg">{d.title}</h2>
          <p className="mt-0.5 text-lg font-semibold text-fg tabular-nums">
            {fmt.money(detail.amount, { signed: true, currency: detail.currency })}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {detail.imported ? <Badge>{t.transactions.badges.imported}</Badge> : null}
            {detail.nature === 'adjustment' ? (
              <Badge tone="accent">{t.transactions.natures.adjustment}</Badge>
            ) : null}
            {detail.transferId ? <Badge>{t.transactions.badges.transfer}</Badge> : null}
          </div>
        </div>
        <Button variant="ghost" iconOnly aria-label={d.close} title={d.close} onClick={onClose}>
          <X size={16} aria-hidden />
        </Button>
      </header>

      {detail.imported ? <p className="text-xs text-muted">{d.importedHint}</p> : null}

      {error ? (
        <p role="alert" className="text-xs font-medium text-expense">
          {error}
        </p>
      ) : null}

      <form onSubmit={(event) => void saveAnnotations(event)} noValidate className="space-y-3">
        <div>
          <p className="mb-1 text-xs font-medium text-fg-2">{d.rawLabel}</p>
          {editable ? (
            <input
              type="text"
              value={labelRaw}
              onChange={(event) => setLabelRaw(event.target.value)}
              maxLength={500}
              className={cx(INPUT_CLASS, 'h-8 border-border-strong text-xs')}
            />
          ) : (
            <p className="rounded bg-surface-2 px-2.5 py-1.5 font-mono text-xs text-fg-2">
              {detail.labelRaw}
            </p>
          )}
        </div>

        <label className="block text-xs text-fg-2">
          <span className="mb-1 block font-medium">{d.customLabel}</span>
          <input
            type="text"
            value={customLabel}
            onChange={(event) => setCustomLabel(event.target.value)}
            placeholder={d.customLabelPlaceholder}
            maxLength={500}
            className={cx(INPUT_CLASS, 'h-8 border-border-strong text-xs')}
          />
        </label>

        {editable ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-fg-2">
              <span className="mb-1 block font-medium">{d.bookingDate}</span>
              <input
                type="date"
                value={bookingDate}
                onChange={(event) => setBookingDate(event.target.value)}
                className={cx(INPUT_CLASS, 'h-8 border-border-strong text-xs')}
              />
            </label>
            <label className="text-xs text-fg-2">
              <span className="mb-1 block font-medium">{d.amount}</span>
              <input
                type="text"
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value)}
                className={cx(INPUT_CLASS, 'h-8 border-border-strong text-xs tabular-nums')}
              />
            </label>
            <label className="text-xs text-fg-2">
              <span className="mb-1 block font-medium">{d.account}</span>
              <select
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
                disabled={detail.transferId !== null}
                className={cx(INPUT_CLASS, 'h-8 border-border-strong text-xs')}
              >
                {accounts
                  .filter(
                    (a) =>
                      !a.archived && a.trackingMode === 'manual' && a.currency === detail.currency,
                  )
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-xs text-fg-2">
              <span className="mb-1 block font-medium">{d.valueDate}</span>
              <input
                type="date"
                value={valueDate}
                onChange={(event) => setValueDate(event.target.value)}
                className={cx(INPUT_CLASS, 'h-8 border-border-strong text-xs')}
              />
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted">{d.account}</span>
              <p className="font-medium text-fg">{account?.name ?? '—'}</p>
            </div>
            <div>
              <span className="text-muted">{d.bookingDate}</span>
              <p className="font-medium text-fg tabular-nums">{fmt.date(detail.bookingDate)}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-fg-2">
            <span className="mb-1 block font-medium">{d.payee}</span>
            <input
              type="text"
              value={payee}
              onChange={(event) => setPayee(event.target.value)}
              list="fluxo-detail-payees"
              maxLength={200}
              className={cx(INPUT_CLASS, 'h-8 border-border-strong text-xs')}
            />
            <datalist id="fluxo-detail-payees">
              {(payees.data ?? []).map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
          </label>
          <label className="text-xs text-fg-2">
            <span className="mb-1 block font-medium">{d.status}</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as TransactionStatus)}
              className={cx(INPUT_CLASS, 'h-8 border-border-strong text-xs')}
            >
              {TRANSACTION_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t.transactions.statuses[value]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {foreignCurrency ? (
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface-2 p-2.5">
            <p className="col-span-2 text-xs font-semibold text-fg">
              {d.currencySection(detail.currency, settings.currency)}
            </p>
            <label className="text-xs text-fg-2">
              <span className="mb-1 block">{d.rate}</span>
              <input
                type="text"
                value={rateInput}
                onChange={(event) => onRateChange(event.target.value)}
                placeholder="1,05"
                className={cx(INPUT_CLASS, 'h-8 border-border-strong text-xs tabular-nums')}
              />
            </label>
            <label className="text-xs text-fg-2">
              <span className="mb-1 block">{d.converted(settings.currency)}</span>
              <input
                type="text"
                value={convertedInput}
                onChange={(event) => setConvertedInput(event.target.value)}
                className={cx(INPUT_CLASS, 'h-8 border-border-strong text-xs tabular-nums')}
              />
            </label>
          </div>
        ) : null}

        <label className="block text-xs text-fg-2">
          <span className="mb-1 block font-medium">{d.note}</span>
          <textarea
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={2000}
            className="w-full rounded-md border border-border-strong bg-surface-2 p-2 text-xs text-fg"
          />
        </label>

        <div className="flex items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-fg-2">
            <input
              type="checkbox"
              checked={favorite}
              onChange={(event) => setFavorite(event.target.checked)}
              className="accent-pink"
            />
            <Star size={13} className="text-gold" aria-hidden />
            {d.favorite}
          </label>
          <Button
            type="submit"
            variant="primary"
            disabled={updateTx.isPending}
            className="h-8 px-3 text-xs"
          >
            {d.saveAnnotations}
          </Button>
        </div>
      </form>

      {/* Ventilation */}
      <section aria-label={d.splitsTitle} className="space-y-2.5 border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold tracking-wider text-fg uppercase">
            {d.splitsTitle}
          </h3>
          <Button onClick={addSplit} className="h-7 px-2 text-xs">
            <Plus size={12} aria-hidden />
            {d.addSplit}
          </Button>
        </div>

        {detail.categorizationExplanation ? (
          <div className="rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-xs text-fg-2">
            <p className="flex items-center gap-1.5 font-medium text-fg">
              <Sparkles size={12} aria-hidden className="text-pink" />
              <span>{d.explanationLabel}</span>
            </p>
            <p className="mt-0.5">
              {detail.categorizationExplanation.reason}{' '}
              {detail.categorizationExplanation.source !== 'rule'
                ? `· ${d.explanationConfidence(Math.round(detail.categorizationExplanation.confidence * 100))}`
                : ''}
            </p>
          </div>
        ) : null}

        <div className="space-y-2.5">
          {splits.map((split, index) => (
            <div
              key={index}
              className="space-y-2 rounded-lg border border-border bg-surface-2 p-2.5"
            >
              <div className="flex items-center gap-2">
                <CategorySelect
                  categories={categories}
                  value={split.categoryId ?? ''}
                  onChange={(value) =>
                    setSplits((prev) =>
                      prev.map((item, i) =>
                        i === index ? { ...item, categoryId: value || null } : item,
                      ),
                    )
                  }
                  emptyLabel={t.transactions.filters.uncategorized}
                  className="h-8 min-w-0 flex-1 text-xs"
                />
                <input
                  type="text"
                  value={splitAmounts[index] ?? ''}
                  onChange={(event) => updateSplitAmount(index, event.target.value)}
                  className={cx(
                    INPUT_CLASS,
                    'h-8 w-24 border-border-strong text-right text-xs tabular-nums',
                  )}
                />
                {splits.length > 1 ? (
                  <Button
                    variant="ghost"
                    iconOnly
                    aria-label={d.removeSplit}
                    onClick={() => removeSplit(index)}
                    className="h-7 w-7"
                  >
                    <Trash2 size={13} aria-hidden />
                  </Button>
                ) : null}
              </div>

              {tags.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {tags.map((tag) => {
                    const active = split.tagIds.includes(tag.id)
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleSplitTag(index, tag.id)}
                        className={cx(
                          'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                          active
                            ? 'border-pink bg-pink/15 font-medium text-fg'
                            : 'border-border bg-surface text-muted hover:text-fg',
                        )}
                      >
                        {tag.name}
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span
            className={cx(
              'text-xs font-medium tabular-nums',
              remainder === 0 ? 'text-muted' : 'text-expense',
            )}
          >
            {remainder === 0
              ? d.remainderOk
              : d.remainderDiff(fmt.money(remainder, { signed: true, currency: detail.currency }))}
          </span>
          <Button
            onClick={() => void saveSplits()}
            disabled={!canSaveSplits || setSplitsTx.isPending}
            className="h-8 px-3 text-xs"
          >
            {d.saveSplits}
          </Button>
        </div>

        <Button onClick={() => setRuleDialogOpen(true)} className="w-full justify-center text-xs">
          <Sparkles size={13} aria-hidden className="text-pink" />
          {d.createRuleButton}
        </Button>
      </section>

      {/* Virement interne */}
      <section aria-label={d.transferTitle} className="space-y-2.5 border-t border-border pt-4">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-fg uppercase">
          <ArrowLeftRight size={13} aria-hidden className="text-teal" />
          {d.transferTitle}
        </h3>
        {detail.transferId ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 p-2.5 text-xs">
            <span className="text-fg-2">{d.linkedTo(transferAccount ?? '—')}</span>
            <Button
              onClick={() =>
                void unlinkTx
                  .mutateAsync({ id: detail.id })
                  .catch((failure: unknown) => setError(t.ledger.errors[ledgerErrorCode(failure)]))
              }
              className="h-7 px-2 text-xs"
            >
              {d.unlinkTransfer}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {manualTargets.length > 0 ? (
              <div className="flex items-center gap-2">
                <select
                  aria-label={d.counterpartAccount}
                  value={counterpartAccountId || manualTargets[0]?.id || ''}
                  onChange={(event) => setCounterpartAccountId(event.target.value)}
                  className={cx(INPUT_CLASS, 'h-8 min-w-0 flex-1 border-border-strong text-xs')}
                >
                  {manualTargets.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.name}
                    </option>
                  ))}
                </select>
                <Button
                  onClick={() => {
                    const targetId = counterpartAccountId || manualTargets[0]?.id
                    if (!targetId) return
                    void counterpartTx
                      .mutateAsync({ transactionId: detail.id, accountId: targetId })
                      .catch((failure: unknown) =>
                        setError(t.ledger.errors[ledgerErrorCode(failure)]),
                      )
                  }}
                  className="h-8 px-2.5 text-xs"
                >
                  {d.counterpartButton}
                </Button>
              </div>
            ) : null}

            {linkCandidates.length > 0 ? (
              <div className="flex items-center gap-2">
                <select
                  aria-label={d.linkTarget}
                  value={linkTargetId || linkCandidates[0]?.id || ''}
                  onChange={(event) => setLinkTargetId(event.target.value)}
                  className={cx(INPUT_CLASS, 'h-8 min-w-0 flex-1 border-border-strong text-xs')}
                >
                  {linkCandidates.map((cand) => {
                    const accName = accounts.find((a) => a.id === cand.accountId)?.name ?? ''
                    return (
                      <option key={cand.id} value={cand.id}>
                        {fmt.date(cand.bookingDate)} · {accName} · {cand.label}
                      </option>
                    )
                  })}
                </select>
                <Button
                  onClick={() => {
                    const target = linkTargetId || linkCandidates[0]?.id
                    if (!target) return
                    void linkTx
                      .mutateAsync({ ids: [detail.id, target] })
                      .catch((failure: unknown) =>
                        setError(t.ledger.errors[ledgerErrorCode(failure)]),
                      )
                  }}
                  className="h-8 px-2.5 text-xs"
                >
                  {d.linkButton}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted">{d.noLinkCandidate}</p>
            )}
          </div>
        )}
      </section>

      {/* Historique */}
      <section aria-label={d.historyTitle} className="space-y-2 border-t border-border pt-4">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-fg uppercase">
          <History size={13} aria-hidden className="text-muted" />
          {d.historyTitle}
        </h3>
        {(audit.data ?? []).length === 0 ? (
          <p className="text-xs text-muted">{d.historyEmpty}</p>
        ) : (
          <ul className="max-h-36 space-y-1 overflow-y-auto text-xs text-fg-2">
            {(audit.data ?? []).map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-2">
                <span>
                  {t.audit.actions[entry.action as keyof typeof t.audit.actions] ?? entry.action} ·{' '}
                  {t.audit.origins[entry.origin as keyof typeof t.audit.origins] ?? entry.origin}
                </span>
                <span className="text-muted tabular-nums">{fmt.dateTime(entry.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editable ? (
        <div className="border-t border-border pt-3">
          <Button
            onClick={() => setConfirmDelete(true)}
            className="w-full justify-center text-expense"
          >
            <Trash2 size={14} aria-hidden />
            {d.delete}
          </Button>
        </div>
      ) : null}

      {confirmDelete ? (
        <ConfirmDialog
          title={d.confirmDeleteTitle}
          message={d.confirmDelete(detail.label)}
          confirmLabel={t.accounts.deleteButton}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() =>
            void deleteTx
              .mutateAsync({ ids: [detail.id] })
              .then((res) => onDeleted(res.count))
              .catch((failure: unknown) => setError(t.ledger.errors[ledgerErrorCode(failure)]))
          }
        />
      ) : null}
      {ruleDialogOpen ? (
        <CreateRuleFromTxDialog
          transactionId={detail.id}
          rawLabel={detail.labelRaw}
          defaultCategoryId={splits[0]?.categoryId ?? null}
          defaultTagIds={splits[0]?.tagIds ?? []}
          categories={categories}
          tags={tags}
          onClose={() => setRuleDialogOpen(false)}
          onCreated={(ruleName) => {
            setRuleDialogOpen(false)
            onNotice(d.createRuleCreated(ruleName))
          }}
        />
      ) : null}
    </aside>
  )
}
