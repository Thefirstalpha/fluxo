import { describe, expect, it } from 'vitest'
import type { AccountSummary } from '@shared/ledger/model'
import { accountTotals, amountToInput, groupAccounts } from './account-groups'

const account = (overrides: Partial<AccountSummary>): AccountSummary => ({
  id: overrides.name ?? 'id',
  name: 'Compte',
  type: 'checking',
  trackingMode: 'statement',
  institution: null,
  currency: 'EUR',
  openingBalance: 0,
  openingDate: null,
  ibanMasked: null,
  color: null,
  icon: null,
  archived: false,
  sortOrder: 0,
  balance: 0,
  reconciledBalance: 0,
  transactionCount: 0,
  lastTransactionDate: null,
  ...overrides,
})

const accounts = [
  account({ name: 'Courant', balance: 1_234_56 }),
  account({ name: 'Carte', type: 'deferred_card', balance: -320_00 }),
  account({ name: 'Espèces', type: 'cash', trackingMode: 'manual', balance: 45_00 }),
  account({ name: 'Livret', type: 'savings', balance: 8_000_00 }),
  account({ name: 'PEA', type: 'investment', trackingMode: 'valuation', balance: 12_500_00 }),
  account({ name: 'Prêt', type: 'loan', trackingMode: 'valuation', balance: -150_000_00 }),
  account({ name: 'Compte suisse', currency: 'CHF', balance: 999_00 }),
  account({ name: 'Ancien', archived: true, balance: 50_00 }),
]

describe('totaux des comptes', () => {
  it('additionne par famille dans la devise de référence, sans les archivés', () => {
    expect(accountTotals(accounts, 'EUR')).toEqual({
      cash: 1_234_56 - 320_00 + 45_00,
      savings: 8_000_00 + 12_500_00,
      loans: -150_000_00,
      otherCurrencies: ['CHF'],
    })
  })

  it('regroupe les comptes actifs par usage, dans l’ordre des groupes', () => {
    expect(groupAccounts(accounts).map((entry) => [entry.group, entry.accounts.length])).toEqual([
      ['daily', 3],
      ['savings', 1],
      ['manual', 1],
      ['assets', 1],
      ['loans', 1],
    ])
  })

  it('prépare un montant pour la saisie, sans séparateur de milliers', () => {
    expect(amountToInput(1_234_56, 'fr-FR')).toBe('1234,56')
    expect(amountToInput(-5, 'en-US')).toBe('-0.05')
  })
})
