import { EXPENSE_CATEGORY_IDS, type ExpenseCategoryId } from '../categories'
import type { MinorUnits } from '../money'
import { parseMonth } from '../months'
import type { Locale } from '../settings'
import { generateDemoMonths, type DemoOptions, type MonthlySummary } from './demo-data'

/**
 * Opérations de démonstration DÉTERMINISTES, dérivées des synthèses mensuelles de
 * `generateDemoMonths` : pour chaque mois, la somme des opérations d'une catégorie égale
 * exactement le montant de la synthèse (vérifié par test). Données entièrement fictives.
 */

export type DemoAccountKey = 'checking' | 'savings' | 'cash'
export type DemoIncomeCategoryId = 'salary' | 'refunds'
export type DemoCategoryId = ExpenseCategoryId | DemoIncomeCategoryId | 'savings'

export interface DemoAccount {
  key: DemoAccountKey
  type: 'checking' | 'savings' | 'cash'
  trackingMode: 'statement' | 'manual'
  openingBalance: MinorUnits
}

export interface DemoTransaction {
  account: DemoAccountKey
  /** AAAA-MM-JJ */
  date: string
  /** Signé : négatif pour une dépense. */
  amount: MinorUnits
  label: string
  category: DemoCategoryId
}

export interface DemoLedger {
  accounts: readonly DemoAccount[]
  months: readonly MonthlySummary[]
  transactions: readonly DemoTransaction[]
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { key: 'checking', type: 'checking', trackingMode: 'statement', openingBalance: 185_000 },
  { key: 'savings', type: 'savings', trackingMode: 'statement', openingBalance: 650_000 },
  { key: 'cash', type: 'cash', trackingMode: 'manual', openingBalance: 6_000 },
]

/** Virement mensuel vers le livret (catégorie « épargne » : ni dépense, ni revenu). */
const MONTHLY_SAVINGS: MinorUnits = 20_000

/** Libellés bancaires fictifs, par catégorie (aucune enseigne réelle). */
const LABELS: Record<ExpenseCategoryId, readonly string[]> = {
  housing: [
    'PRLV LOYER RESIDENCE DES TILLEULS',
    'PRLV ENERGIE DU SUD',
    'PRLV ASSURANCE HABITATION',
  ],
  groceries: [
    'CB SUPERMARCHE DU CENTRE',
    'CB EPICERIE DU QUARTIER',
    'CB BOULANGERIE DES LILAS',
    'CB PRIMEUR DU MARCHE',
  ],
  transport: [
    'CB STATION SERVICE',
    'CB TRANSPORTS URBAINS',
    'CB PARKING DE LA GARE',
    'CB PEAGE AUTOROUTE',
  ],
  health: ['CB PHARMACIE DE LA PLACE', 'CB CABINET MEDICAL', 'CB OPTICIEN'],
  leisure: [
    'CB CINEMA LE REX',
    'CB RESTAURANT LA TERRASSE',
    'CB LIBRAIRIE DES ARTS',
    'CB SALLE DE SPORT',
  ],
  subscriptions: ['PRLV TELEPHONE MOBILE', 'PRLV BOX INTERNET', 'PRLV STREAMING MUSIQUE'],
  shopping: ['CB MAGASIN DE VETEMENTS', 'CB BRICOLAGE ET JARDIN', 'CB BOUTIQUE EN LIGNE'],
  other: ['CB CADEAUX ET FLEURS', 'CB PRESSING', 'FRAIS BANCAIRES'],
}

/** Nombre d'opérations par mois et par catégorie (au moins 1). */
const OPERATIONS: Record<ExpenseCategoryId, readonly [number, number]> = {
  housing: [3, 3],
  groceries: [6, 10],
  transport: [2, 5],
  health: [1, 2],
  leisure: [3, 6],
  subscriptions: [3, 3],
  shopping: [1, 4],
  other: [1, 3],
}

/** Abonnements : montants fixes dont la somme est le total de la synthèse (le reste sur le dernier). */
const SUBSCRIPTION_SHARES = [0.3, 0.45] as const

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function daysInMonth(month: string): number {
  const { year, month: m } = parseMonth(month)
  return new Date(Date.UTC(year, m, 0)).getUTCDate()
}

const day = (month: string, dayOfMonth: number) => `${month}-${String(dayOfMonth).padStart(2, '0')}`

/**
 * Découpe un total (centimes, positif) en `parts` montants entiers ≥ 1 centime dont la somme
 * est exactement le total (fonction pure, déterministe pour un aléa donné).
 */
export function splitAmount(total: MinorUnits, parts: number, random: () => number): MinorUnits[] {
  const count = Math.max(1, Math.min(parts, total))
  const weights = Array.from({ length: count }, () => 0.4 + random())
  const weightSum = weights.reduce((a, b) => a + b, 0)
  const amounts = weights.map((weight) => Math.max(1, Math.floor((total * weight) / weightSum)))
  const remainder = total - amounts.reduce((a, b) => a + b, 0)
  amounts[amounts.length - 1] = (amounts[amounts.length - 1] ?? 0) + remainder
  return amounts
}

export function generateDemoLedger(options: DemoOptions): DemoLedger {
  const months = generateDemoMonths(options)
  const random = mulberry32((options.seed ?? 2026) ^ 0x5eed)
  const transactions: DemoTransaction[] = []
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T

  for (const summary of months) {
    const { month } = summary
    const lastDay = daysInMonth(month)

    // Revenus : salaire (net payé du bulletin), remboursements éventuels.
    transactions.push({
      account: 'checking',
      date: day(month, Math.min(28, lastDay)),
      amount: summary.payslip.netPaid,
      label: 'VIR SALAIRE ENTREPRISE EXEMPLE SAS',
      category: 'salary',
    })
    const refunds = summary.income - summary.payslip.netPaid
    if (refunds > 0) {
      transactions.push({
        account: 'checking',
        date: day(month, 12),
        amount: refunds,
        label: 'VIR REMBOURSEMENT ASSURANCE MALADIE',
        category: 'refunds',
      })
    }

    // Dépenses : chaque total de catégorie découpé en plusieurs opérations.
    for (const category of EXPENSE_CATEGORY_IDS) {
      const total = summary.byCategory[category]
      if (total <= 0) continue
      const [min, max] = OPERATIONS[category]
      let amounts: MinorUnits[]
      if (category === 'subscriptions') {
        const first = Math.round(total * SUBSCRIPTION_SHARES[0])
        const second = Math.round(total * SUBSCRIPTION_SHARES[1])
        amounts = [first, second, total - first - second]
      } else {
        amounts = splitAmount(total, min + Math.floor(random() * (max - min + 1)), random)
      }
      amounts.forEach((amount, index) => {
        const fixed = category === 'housing' || category === 'subscriptions'
        transactions.push({
          // Une course au marché par mois, payée en espèces.
          account: category === 'groceries' && index === 0 ? 'cash' : 'checking',
          date: day(month, fixed ? 2 + index * 3 : 1 + Math.floor(random() * lastDay)),
          amount: -amount,
          label: fixed
            ? (LABELS[category][index] ?? pick(LABELS[category]))
            : pick(LABELS[category]),
          category,
        })
      })
    }

    // Épargne : virement du compte courant vers le livret (deux écritures).
    transactions.push(
      {
        account: 'checking',
        date: day(month, 5),
        amount: -MONTHLY_SAVINGS,
        label: 'VIR LIVRET A',
        category: 'savings',
      },
      {
        account: 'savings',
        date: day(month, 5),
        amount: MONTHLY_SAVINGS,
        label: 'VIR DEPUIS COMPTE COURANT',
        category: 'savings',
      },
    )
  }

  transactions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return { accounts: DEMO_ACCOUNTS, months, transactions }
}

// ——— Libellés des comptes, par langue (catégories : pack France, `@shared/ledger/category-pack`) ———

export const DEMO_ACCOUNT_NAMES: Readonly<Record<Locale, Record<DemoAccountKey, string>>> = {
  'fr-FR': { checking: 'Compte courant', savings: 'Livret A', cash: 'Espèces' },
  'en-US': { checking: 'Current account', savings: 'Savings account', cash: 'Cash' },
}
