/**
 * Pack de catégories « France » (deux niveaux), créé dans chaque nouveau coffre dans la langue
 * de l'interface. Les catégories de premier niveau reprennent les clés du tableau de bord de
 * démonstration (`salary`, `housing`…) : le coffre de démonstration utilise le même pack.
 */
import type { Locale } from '../settings'
import type { CategoryKind, LedgerIcon, PaletteColor } from './model'
import { PALETTE } from './model'

type Names = Readonly<Record<Locale, string>>

export interface PackSubcategory {
  key: string
  names: Names
}

export interface PackCategory {
  key: string
  kind: CategoryKind
  icon: LedgerIcon
  color: PaletteColor
  names: Names
  children: readonly PackSubcategory[]
}

const sub = (key: string, fr: string, en: string): PackSubcategory => ({
  key,
  names: { 'fr-FR': fr, 'en-US': en },
})

const top = (
  key: string,
  kind: CategoryKind,
  icon: LedgerIcon,
  slot: number,
  [fr, en]: readonly [string, string],
  children: readonly PackSubcategory[] = [],
): PackCategory => ({
  key,
  kind,
  icon,
  color: PALETTE[slot % PALETTE.length] ?? PALETTE[0],
  names: { 'fr-FR': fr, 'en-US': en },
  children,
})

export const CATEGORY_PACK_FR: readonly PackCategory[] = [
  top(
    'salary',
    'income',
    'briefcase',
    7,
    ['Salaire', 'Salary'],
    [
      sub('salary.net', 'Salaire net', 'Net salary'),
      sub('salary.bonus', 'Primes et intéressement', 'Bonuses & profit-sharing'),
    ],
  ),
  top(
    'refunds',
    'income',
    'receipt',
    2,
    ['Remboursements', 'Refunds'],
    [
      sub('refunds.health', 'Santé (Sécurité sociale, mutuelle)', 'Health insurance'),
      sub('refunds.purchases', 'Achats remboursés', 'Purchase refunds'),
    ],
  ),
  top(
    'other_income',
    'income',
    'gift',
    3,
    ['Autres revenus', 'Other income'],
    [
      sub('other_income.benefits', 'Allocations', 'Benefits'),
      sub('other_income.rent', 'Revenus locatifs', 'Rental income'),
      sub('other_income.gifts', 'Cadeaux reçus', 'Gifts received'),
    ],
  ),
  top(
    'housing',
    'expense',
    'house',
    0,
    ['Logement', 'Housing'],
    [
      sub('housing.rent', 'Loyer ou crédit immobilier', 'Rent or mortgage'),
      sub('housing.energy', 'Énergie', 'Energy'),
      sub('housing.water', 'Eau', 'Water'),
      sub('housing.insurance', 'Assurance habitation', 'Home insurance'),
      sub('housing.upkeep', 'Travaux et entretien', 'Repairs & upkeep'),
    ],
  ),
  top(
    'groceries',
    'expense',
    'shopping-cart',
    1,
    ['Alimentation', 'Groceries'],
    [
      sub('groceries.shopping', 'Courses', 'Groceries'),
      sub('groceries.restaurants', 'Restaurants et livraisons', 'Restaurants & delivery'),
    ],
  ),
  top(
    'transport',
    'expense',
    'car',
    6,
    ['Transport', 'Transport'],
    [
      sub('transport.fuel', 'Carburant et recharge', 'Fuel & charging'),
      sub('transport.public', 'Transports en commun', 'Public transport'),
      sub('transport.car', 'Assurance et entretien du véhicule', 'Car insurance & upkeep'),
      sub('transport.parking', 'Péages et stationnement', 'Tolls & parking'),
    ],
  ),
  top(
    'health',
    'expense',
    'heart-pulse',
    5,
    ['Santé', 'Health'],
    [
      sub('health.doctors', 'Consultations', 'Doctors'),
      sub('health.pharmacy', 'Pharmacie', 'Pharmacy'),
      sub('health.insurance', 'Mutuelle', 'Health insurance'),
    ],
  ),
  top(
    'leisure',
    'expense',
    'ticket',
    4,
    ['Loisirs & sorties', 'Leisure & outings'],
    [
      sub('leisure.outings', 'Sorties', 'Outings'),
      sub('leisure.travel', 'Voyages', 'Travel'),
      sub('leisure.sport', 'Sport', 'Sport'),
      sub('leisure.culture', 'Culture', 'Culture'),
    ],
  ),
  top(
    'subscriptions',
    'expense',
    'repeat',
    2,
    ['Abonnements', 'Subscriptions'],
    [
      sub('subscriptions.telecom', 'Téléphone et internet', 'Phone & internet'),
      sub('subscriptions.streaming', 'Streaming', 'Streaming'),
      sub('subscriptions.software', 'Presse et logiciels', 'Press & software'),
    ],
  ),
  top(
    'shopping',
    'expense',
    'shopping-bag',
    3,
    ['Shopping', 'Shopping'],
    [
      sub('shopping.clothing', 'Vêtements', 'Clothing'),
      sub('shopping.home', 'Équipement de la maison', 'Home equipment'),
      sub('shopping.electronics', 'High-tech', 'Electronics'),
    ],
  ),
  top(
    'family',
    'expense',
    'baby',
    1,
    ['Enfants & éducation', 'Children & education'],
    [
      sub('family.childcare', 'Garde et scolarité', 'Childcare & school'),
      sub('family.activities', 'Activités', 'Activities'),
    ],
  ),
  top(
    'taxes',
    'expense',
    'landmark',
    6,
    ['Impôts & taxes', 'Taxes'],
    [
      sub('taxes.income', 'Impôt sur le revenu', 'Income tax'),
      sub('taxes.property', 'Taxe foncière', 'Property tax'),
    ],
  ),
  top(
    'banking',
    'expense',
    'credit-card',
    5,
    ['Banque & frais', 'Bank & fees'],
    [
      sub('banking.fees', 'Frais bancaires', 'Bank fees'),
      sub('banking.interest', 'Intérêts et agios', 'Interest & overdraft'),
    ],
  ),
  top(
    'other',
    'expense',
    'circle-help',
    7,
    ['Divers', 'Miscellaneous'],
    [
      sub('other.gifts', 'Cadeaux et dons', 'Gifts & donations'),
      sub('other.pets', 'Animaux', 'Pets'),
    ],
  ),
  top('savings', 'savings', 'piggy-bank', 2, ['Épargne', 'Savings']),
  top('transfer', 'transfer', 'arrow-left-right', 4, ['Virements internes', 'Internal transfers']),
]
