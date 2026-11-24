import { useState, type FormEvent } from 'react'
import { useLocation } from 'wouter'
import { TRANSACTION_STATUSES, type TransactionStatus } from '@shared/ledger/model'
import { parseAmount } from '@shared/money'
import { useT } from '../../i18n'
import { todayIso } from '../../lib/dates'
import { ledgerErrorCode, useLedgerMutation, useLedgerQuery } from '../../lib/ledger'
import { useSettingsStore } from '../../stores/settings'
import { CategorySelect } from '../../components/CategorySelect'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { FieldShell, SelectField, TextField } from '../../components/ui/Field'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { convertedFromRate } from './grouping'

type Mode = 'operation' | 'transfer'

interface QuickEntryDialogProps {
  onClose: () => void
  onCreated?: (id: string, message: string) => void
}

/** Saisie rapide (Ctrl/⌘ N) : opération sur un compte manuel ou virement interne entre comptes manuels. */
export function QuickEntryDialog({ onClose, onCreated }: QuickEntryDialogProps) {
  const t = useT()
  const q = t.transactions.quickEntry
  const [, navigate] = useLocation()
  const refCurrency = useSettingsStore((state) => state.settings.currency)
  const accounts = useLedgerQuery('accountsList', { includeArchived: false })
  const categories = useLedgerQuery('categoriesList', { includeArchived: false })
  const payees = useLedgerQuery('payeesList', {})
  const createTx = useLedgerMutation('transactionCreate')
  const createTransfer = useLedgerMutation('transferCreate')

  const manualAccounts = (accounts.data ?? []).filter((a) => a.trackingMode === 'manual')
  const [mode, setMode] = useState<Mode>('operation')
  const [accountId, setAccountId] = useState('')
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [bookingDate, setBookingDate] = useState(() => todayIso())
  const [label, setLabel] = useState('')
  const [amountInput, setAmountInput] = useState('')
  const [rateInput, setRateInput] = useState('')
  const [convertedInput, setConvertedInput] = useState('')
  const [payee, setPayee] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState<TransactionStatus>('cleared')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const selectedAccountId = accountId || manualAccounts[0]?.id || ''
  const selectedAccount = manualAccounts.find((a) => a.id === selectedAccountId)
  const foreignCurrency = Boolean(selectedAccount && selectedAccount.currency !== refCurrency)

  const selectedFromId = fromId || manualAccounts[0]?.id || ''
  const selectedToId = toId || manualAccounts[1]?.id || manualAccounts[0]?.id || ''

  const busy = createTx.isPending || createTransfer.isPending

  const onRateChange = (nextRate: string) => {
    setRateInput(nextRate)
    const parsed = parseAmount(amountInput)
    if (parsed !== null) {
      const converted = convertedFromRate(parsed, nextRate)
      if (converted !== null) setConvertedInput((converted / 100).toFixed(2))
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    const trimmedLabel = label.trim()
    if (!trimmedLabel) return setError(q.labelRequired)
    const parsedAmount = parseAmount(amountInput)
    if (parsedAmount === null) return setError(q.amountRequired)

    try {
      if (mode === 'operation') {
        if (!selectedAccountId) return
        let convertedAmount: number | null = null
        if (foreignCurrency && convertedInput.trim()) {
          const parsedConverted = parseAmount(convertedInput)
          if (parsedConverted === null) return setError(q.amountRequired)
          convertedAmount = parsedConverted
        } else if (foreignCurrency && rateInput.trim()) {
          convertedAmount = convertedFromRate(parsedAmount, rateInput)
        }
        const res = await createTx.mutateAsync({
          accountId: selectedAccountId,
          label: trimmedLabel,
          bookingDate,
          valueDate: null,
          amount: parsedAmount,
          convertedAmount,
          payee: payee.trim() || null,
          note: note.trim() || null,
          status,
          splits: categoryId
            ? [{ categoryId, amount: parsedAmount, note: null, tagIds: [] }]
            : undefined,
        })
        onCreated?.(res.id, q.created)
        onClose()
      } else {
        if (parsedAmount <= 0) return setError(q.positiveRequired)
        if (!selectedFromId || !selectedToId || selectedFromId === selectedToId) {
          return setError(q.sameAccount)
        }
        const fromAcc = manualAccounts.find((a) => a.id === selectedFromId)
        const toAcc = manualAccounts.find((a) => a.id === selectedToId)
        if (fromAcc && toAcc && fromAcc.currency !== toAcc.currency) {
          return setError(q.currencyMismatch)
        }
        const res = await createTransfer.mutateAsync({
          fromAccountId: selectedFromId,
          toAccountId: selectedToId,
          bookingDate,
          amount: parsedAmount,
          label: trimmedLabel,
        })
        onCreated?.(res.fromId, q.transferCreated)
        onClose()
      }
    } catch (failure) {
      setError(t.ledger.errors[ledgerErrorCode(failure)])
    }
  }

  return (
    <Dialog title={q.title} onClose={onClose} size="md">
      {accounts.isPending ? (
        <p role="status" className="text-sm text-muted">
          {t.common.loading}
        </p>
      ) : manualAccounts.length === 0 ? (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-fg">{q.noManualTitle}</h3>
          <p className="text-sm text-fg-2">{q.noManualDescription}</p>
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>{t.common.close}</Button>
            <Button
              variant="primary"
              onClick={() => {
                onClose()
                navigate('/accounts')
              }}
            >
              {q.goToAccounts}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
          {manualAccounts.length >= 2 ? (
            <SegmentedControl<Mode>
              ariaLabel={q.title}
              value={mode}
              onChange={(next) => {
                setMode(next)
                setError(null)
              }}
              options={[
                { value: 'operation', label: q.tabOperation },
                { value: 'transfer', label: q.tabTransfer },
              ]}
            />
          ) : null}

          {mode === 'operation' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label={q.account}
                value={selectedAccountId}
                onChange={setAccountId}
                options={manualAccounts.map((a) => ({
                  value: a.id,
                  label: `${a.name} (${a.currency})`,
                }))}
              />
              <TextField
                label={q.date}
                type="date"
                value={bookingDate}
                onChange={setBookingDate}
                required
              />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label={q.fromAccount}
                value={selectedFromId}
                onChange={setFromId}
                options={manualAccounts.map((a) => ({
                  value: a.id,
                  label: `${a.name} (${a.currency})`,
                }))}
              />
              <SelectField
                label={q.toAccount}
                value={selectedToId}
                onChange={setToId}
                options={manualAccounts.map((a) => ({
                  value: a.id,
                  label: `${a.name} (${a.currency})`,
                }))}
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={q.label}
              value={label}
              onChange={setLabel}
              placeholder={q.labelPlaceholder}
              maxLength={500}
              autoFocus
              required
            />
            <TextField
              label={q.amount}
              value={amountInput}
              onChange={setAmountInput}
              placeholder={mode === 'operation' ? '-12,50' : '50,00'}
              hint={mode === 'operation' ? q.amountHint : q.transferAmountHint}
              inputClassName="tabular-nums"
              required
            />
          </div>

          {mode === 'transfer' ? (
            <TextField
              label={q.date}
              type="date"
              value={bookingDate}
              onChange={setBookingDate}
              required
            />
          ) : (
            <>
              {foreignCurrency && selectedAccount ? (
                <div className="grid gap-4 rounded-lg border border-border bg-surface-2 p-3 sm:grid-cols-2">
                  <TextField
                    label={q.rateLabel(selectedAccount.currency, refCurrency)}
                    value={rateInput}
                    onChange={onRateChange}
                    placeholder="1,05"
                    inputClassName="tabular-nums"
                  />
                  <TextField
                    label={q.convertedAmount(refCurrency)}
                    value={convertedInput}
                    onChange={setConvertedInput}
                    placeholder="-13,13"
                    inputClassName="tabular-nums"
                  />
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label={q.payee}
                  value={payee}
                  onChange={setPayee}
                  placeholder={q.payeePlaceholder}
                  list="fluxo-quick-payees"
                  maxLength={200}
                />
                <datalist id="fluxo-quick-payees">
                  {(payees.data ?? []).map((p) => (
                    <option key={p.id} value={p.name} />
                  ))}
                </datalist>

                <FieldShell label={q.category}>
                  {(control) => (
                    <CategorySelect
                      {...control}
                      categories={categories.data ?? []}
                      value={categoryId}
                      onChange={setCategoryId}
                      emptyLabel={t.transactions.filters.uncategorized}
                    />
                  )}
                </FieldShell>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label={q.status}
                  value={status}
                  onChange={setStatus}
                  options={TRANSACTION_STATUSES.map((value) => ({
                    value,
                    label: t.transactions.statuses[value],
                  }))}
                />
                <TextField label={q.note} value={note} onChange={setNote} maxLength={2000} />
              </div>
            </>
          )}

          {error ? (
            <p role="alert" className="text-sm font-medium text-expense">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button onClick={onClose}>{t.common.cancel}</Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {q.create}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}
