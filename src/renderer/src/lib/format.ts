import { useMemo } from 'react'
import { formatMoney, type MinorUnits } from '@shared/money'
import { monthToUtcDate } from '@shared/months'
import type { Settings } from '@shared/settings'
import { useSettingsStore } from '../stores/settings'

export const MASKED_AMOUNT = '••••••'

/** Propriétés-fonctions (et non méthodes) : utilisables détachées, ex. `money: fmt.money`. */
export interface Formatters {
  /** Montant en centimes → texte localisé (masqué si l'utilisateur l'a demandé). */
  money: (amount: MinorUnits, options?: { signed?: boolean; compact?: boolean }) => string
  /** Ratio (0,123) → « 12,3 % ». */
  percent: (value: number, options?: { signed?: boolean; digits?: number }) => string
  /** « 2026-11 » → « novembre 2026 » (long) ou « nov. 26 » (short). */
  month: (month: string, style?: 'long' | 'short') => string
  /** Horodatage ISO → date et heure locales (« 24 nov. 2026, 10:05 »). */
  dateTime: (iso: string) => string
  /** Date calendaire `AAAA-MM-JJ` → « 24 nov. 2026 » (sans fuseau horaire). */
  date: (isoDate: string) => string
  /** Nombre entier localisé (« 1 250 »). */
  count: (value: number) => string
}

export function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1)
}

export function createFormatters({
  locale,
  currency,
  hideAmounts,
}: Pick<Settings, 'locale' | 'currency' | 'hideAmounts'>): Formatters {
  const longMonth = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const shortMonth = new Intl.DateTimeFormat(locale, {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  })
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
  const calendarDate = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' })
  const integer = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
  return {
    money: (amount, { signed = false, compact = false } = {}) =>
      hideAmounts
        ? MASKED_AMOUNT
        : formatMoney(amount, {
            locale,
            currency,
            compact,
            signDisplay: signed ? 'exceptZero' : 'auto',
          }),
    percent: (value, { signed = false, digits = 1 } = {}) =>
      new Intl.NumberFormat(locale, {
        style: 'percent',
        maximumFractionDigits: digits,
        minimumFractionDigits: digits > 0 ? 1 : 0,
        signDisplay: signed ? 'exceptZero' : 'auto',
      }).format(value),
    month: (month, style = 'long') =>
      (style === 'long' ? longMonth : shortMonth).format(monthToUtcDate(month)),
    dateTime: (iso) => dateTime.format(new Date(iso)),
    date: (isoDate) => calendarDate.format(new Date(`${isoDate}T00:00:00Z`)),
    count: (value) => integer.format(value),
  }
}

export function useFormatters(): Formatters {
  const locale = useSettingsStore((state) => state.settings.locale)
  const currency = useSettingsStore((state) => state.settings.currency)
  const hideAmounts = useSettingsStore((state) => state.settings.hideAmounts)
  return useMemo(
    () => createFormatters({ locale, currency, hideAmounts }),
    [locale, currency, hideAmounts],
  )
}
