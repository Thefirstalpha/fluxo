import { useState, type FormEvent } from 'react'
import { isValidIban, normalizeIban } from '@shared/ledger/iban'
import {
  ACCOUNT_TYPES,
  allowedTrackingModes,
  DEFAULT_TRACKING_MODE,
  isSavingsAccountType,
  type AccountDraft,
  type AccountSummary,
  type AccountType,
  type LedgerIcon,
  type PaletteColor,
  type TrackingMode,
} from '@shared/ledger/model'
import { parseAmount } from '@shared/money'
import { CURRENCIES } from '@shared/settings'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { ColorPicker, IconPicker } from '../../components/ui/Pickers'
import { SelectField, TextField } from '../../components/ui/Field'
import { useT } from '../../i18n'
import { cx } from '../../lib/cx'
import { ledgerErrorCode, useLedgerMutation } from '../../lib/ledger'
import { useSettingsStore } from '../../stores/settings'
import { amountToInput, DEFAULT_ACCOUNT_ICON } from './account-groups'

type IbanAction = 'keep' | 'replace' | 'remove'

interface AccountFormProps {
  /** Compte modifié ; absent : création. */
  account?: AccountSummary
  onClose: () => void
  onSaved: (id: string) => void
}

/** Création ou modification d'un compte (boîte de dialogue). */
export function AccountForm({ account, onClose, onSaved }: AccountFormProps) {
  const t = useT()
  const f = t.accounts.form
  const settings = useSettingsStore((state) => state.settings)
  const create = useLedgerMutation('accountCreate')
  const update = useLedgerMutation('accountUpdate')
  const locked = (account?.transactionCount ?? 0) > 0

  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'checking')
  const [mode, setMode] = useState<TrackingMode>(account?.trackingMode ?? 'statement')
  const [institution, setInstitution] = useState(account?.institution ?? '')
  const [currency, setCurrency] = useState(account?.currency ?? settings.currency)
  const [opening, setOpening] = useState(
    account ? amountToInput(account.openingBalance, settings.locale) : '',
  )
  const [openingDate, setOpeningDate] = useState(account?.openingDate ?? '')
  const [ibanAction, setIbanAction] = useState<IbanAction>(account?.ibanMasked ? 'keep' : 'replace')
  const [iban, setIban] = useState('')
  const [color, setColor] = useState<PaletteColor | null>(account?.color ?? null)
  const [icon, setIcon] = useState<LedgerIcon | null>(account?.icon ?? null)
  const [errors, setErrors] = useState<Partial<Record<'name' | 'opening' | 'iban', string>>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const busy = create.isPending || update.isPending

  const changeType = (next: AccountType) => {
    setType(next)
    if (!locked) setMode(DEFAULT_TRACKING_MODE[next])
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const problems: typeof errors = {}
    if (!name.trim()) problems.name = f.nameRequired
    const openingBalance = opening.trim() ? parseAmount(opening) : 0
    if (openingBalance === null) problems.opening = f.amountInvalid
    const normalizedIban = ibanAction === 'replace' && iban.trim() ? normalizeIban(iban) : null
    if (normalizedIban && !isValidIban(normalizedIban)) problems.iban = f.ibanInvalid
    setErrors(problems)
    if (Object.keys(problems).length > 0 || openingBalance === null) return

    const draft: AccountDraft = {
      name: name.trim(),
      type,
      trackingMode: mode,
      institution: institution.trim() || null,
      currency,
      openingBalance,
      openingDate: openingDate || null,
      iban: normalizedIban,
      color,
      icon,
    }
    setFailure(null)
    try {
      if (account) {
        const { iban: newIban, ...rest } = draft
        await update.mutateAsync({
          id: account.id,
          patch: ibanAction === 'keep' ? rest : { ...rest, iban: newIban },
        })
        onSaved(account.id)
      } else {
        onSaved((await create.mutateAsync(draft)).id)
      }
    } catch (error) {
      setFailure(t.ledger.errors[ledgerErrorCode(error)])
    }
  }

  const modes = allowedTrackingModes(type)

  return (
    <Dialog title={account ? f.editTitle : f.createTitle} onClose={onClose} size="lg">
      <form onSubmit={(event) => void submit(event)} noValidate className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={f.name}
            value={name}
            onChange={setName}
            placeholder={f.namePlaceholder}
            maxLength={200}
            autoFocus
            required
            error={errors.name}
          />
          <SelectField
            label={f.type}
            value={type}
            onChange={changeType}
            options={ACCOUNT_TYPES.map((value) => ({ value, label: t.accounts.types[value] }))}
          />
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-fg">{f.trackingMode}</legend>
          {locked ? <p className="mb-2 text-xs text-muted">{f.trackingModeLocked}</p> : null}
          <div className="grid gap-2 sm:grid-cols-3">
            {(['statement', 'manual', 'valuation'] as const).map((value) => {
              const disabled = locked || !modes.includes(value)
              return (
                <label
                  key={value}
                  className={cx(
                    'flex cursor-pointer gap-2.5 rounded-lg border p-3',
                    mode === value ? 'fx-frame' : 'border-border bg-surface-2',
                    disabled && mode !== value && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <input
                    type="radio"
                    name="tracking-mode"
                    value={value}
                    checked={mode === value}
                    disabled={disabled}
                    onChange={() => setMode(value)}
                    className="mt-0.5 accent-[var(--fx-pink)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-fg">
                      {t.accounts.modes[value].label}
                    </span>
                    <span className="mt-0.5 block text-xs text-fg-2">
                      {t.accounts.modes[value].description}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
          {!locked && isSavingsAccountType(type) ? (
            <p className="mt-2 text-xs text-fg-2">{f.savingsTrackingHint}</p>
          ) : null}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label={f.institution}
            value={institution}
            onChange={setInstitution}
            placeholder={f.institutionPlaceholder}
            maxLength={200}
            className="sm:col-span-2"
          />
          <SelectField
            label={f.currency}
            value={currency}
            onChange={setCurrency}
            disabled={locked}
            options={CURRENCIES.map((value) => ({ value, label: value }))}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={type === 'loan' ? f.openingBalanceLoan : f.openingBalance}
            value={opening}
            onChange={setOpening}
            inputMode="decimal"
            placeholder="0,00"
            hint={f.openingBalanceHint}
            error={errors.opening}
          />
          <TextField
            label={f.openingDate}
            type="date"
            value={openingDate}
            onChange={setOpeningDate}
          />
        </div>

        {ibanAction === 'keep' && account?.ibanMasked ? (
          <div>
            <p className="mb-1.5 text-sm font-medium text-fg">{f.iban}</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-fg-2">
                {f.ibanStored(account.ibanMasked)}
              </span>
              <Button variant="ghost" onClick={() => setIbanAction('replace')}>
                {f.ibanReplace}
              </Button>
              <Button variant="ghost" onClick={() => setIbanAction('remove')}>
                {f.ibanRemove}
              </Button>
            </div>
          </div>
        ) : ibanAction === 'replace' ? (
          <TextField
            label={f.iban}
            value={iban}
            onChange={setIban}
            autoComplete="off"
            spellCheck={false}
            maxLength={60}
            inputClassName="font-mono"
            hint={f.ibanHint}
            error={errors.iban}
          />
        ) : null}

        <ColorPicker name="account-color" value={color} onChange={setColor} />
        <IconPicker
          name="account-icon"
          value={icon}
          fallback={DEFAULT_ACCOUNT_ICON[type]}
          onChange={setIcon}
        />

        {failure ? (
          <p role="alert" className="text-sm font-medium text-expense">
            {failure}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {account ? f.save : f.create}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
