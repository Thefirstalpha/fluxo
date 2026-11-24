import { cleanTransactionLabel } from './normalize'

export interface MerchantEntry {
  /** Clés normalisées reconnues dans les libellés bancaires. */
  aliases: readonly string[]
  /** Nom propre du marchand / libellé proposé. */
  merchant: string
  /** Clé dans `CATEGORY_PACK_FR` (`groceries.shopping`, `subscriptions.telecom`…). */
  categoryKey: string
  /** Indique s'il s'agit typiquement d'un abonnement ou prélèvement récurrent. */
  recurringHint?: boolean
}

/**
 * Dictionnaire communautaire France (démarrage à froid, aucune enseigne non publique sensible).
 * Permet de suggérer immédiatement marchand et catégorie avant même d'avoir un historique appris.
 */
export const FRENCH_MERCHANT_PACK: readonly MerchantEntry[] = [
  // Alimentation & courses
  {
    aliases: [
      'carrefour',
      'auchan',
      'e leclerc',
      'leclerc',
      'intermarche',
      'super u',
      'hyper u',
      'monoprix',
      'franprix',
      'lidl',
      'aldi',
      'biocoop',
      'picard',
      'supermarche du centre',
      'epicerie du quartier',
    ],
    merchant: 'Supermarché / Courses',
    categoryKey: 'groceries.shopping',
  },
  {
    aliases: [
      'boulangerie',
      'boulangerie des lilas',
      'paul',
      'marie blachere',
      'primeur du marche',
    ],
    merchant: 'Boulangerie & marché',
    categoryKey: 'groceries.shopping',
  },
  {
    aliases: [
      'deliveroo',
      'uber eats',
      'just eat',
      'mcdo',
      'mcdonalds',
      'burger king',
      'restaurant la terrasse',
    ],
    merchant: 'Restauration',
    categoryKey: 'groceries.restaurants',
  },

  // Logement & énergie
  {
    aliases: ['edf', 'engie', 'totalenergies', 'enercoop', 'energie du sud'],
    merchant: 'Énergie',
    categoryKey: 'housing.energy',
    recurringHint: true,
  },
  {
    aliases: ['veolia', 'suez', 'eau de paris'],
    merchant: 'Eau',
    categoryKey: 'housing.water',
    recurringHint: true,
  },
  {
    aliases: ['loyer residence', 'foncia', 'nexity'],
    merchant: 'Loyer',
    categoryKey: 'housing.rent',
    recurringHint: true,
  },
  {
    aliases: ['maif', 'macif', 'axa', 'allianz', 'luko', 'assurance habitation'],
    merchant: 'Assurance habitation',
    categoryKey: 'housing.insurance',
    recurringHint: true,
  },
  {
    aliases: ['leroy merlin', 'castorama', 'brico depot', 'ikea'],
    merchant: 'Bricolage & maison',
    categoryKey: 'shopping.home',
  },

  // Transports
  {
    aliases: ['sncf', 'oui sncf', 'ratp', 'navigo', 'transports urbains', 'blablacar'],
    merchant: 'Transports en commun',
    categoryKey: 'transport.public',
  },
  {
    aliases: [
      'total',
      'esso',
      'bp ',
      'shell',
      'aviam',
      'station service',
      'ionity',
      'tesla supercharger',
    ],
    merchant: 'Carburant & recharge',
    categoryKey: 'transport.fuel',
  },
  {
    aliases: [
      'vinci autoroutes',
      'aprr',
      'sanef',
      'effia',
      'indigo',
      'peage autoroute',
      'parking de la gare',
    ],
    merchant: 'Péages & parking',
    categoryKey: 'transport.parking',
  },

  // Santé
  {
    aliases: ['pharmacie', 'pharmacie de la place'],
    merchant: 'Pharmacie',
    categoryKey: 'health.pharmacy',
  },
  {
    aliases: ['doctolib', 'cabinet medical', 'clinique', 'opticien'],
    merchant: 'Consultations & optique',
    categoryKey: 'health.doctors',
  },
  {
    aliases: ['alan', 'harmonie mutuelle', 'mgen', 'mutuelle'],
    merchant: 'Mutuelle',
    categoryKey: 'health.insurance',
    recurringHint: true,
  },

  // Abonnements & télécom
  {
    aliases: [
      'orange',
      'sfr',
      'bouygues telecom',
      'free mobile',
      'freebox',
      'sosh',
      'red by sfr',
      'telephone mobile',
      'box internet',
    ],
    merchant: 'Télécom & internet',
    categoryKey: 'subscriptions.telecom',
    recurringHint: true,
  },
  {
    aliases: [
      'spotify',
      'deezer',
      'netflix',
      'disney',
      'canal',
      'amazon prime',
      'apple com bill',
      'streaming musique',
    ],
    merchant: 'Streaming',
    categoryKey: 'subscriptions.streaming',
    recurringHint: true,
  },
  {
    aliases: [
      'ovh',
      'github',
      'adobe',
      'microsoft',
      'dropbox',
      'icloud',
      'notion',
      'mediapart',
      'le monde',
    ],
    merchant: 'Logiciels & presse',
    categoryKey: 'subscriptions.software',
    recurringHint: true,
  },

  // Loisirs & culture
  {
    aliases: ['fnac', 'cultura', 'gibert', 'librairie des arts', 'ugc', 'pathe', 'cinema le rex'],
    merchant: 'Culture & cinéma',
    categoryKey: 'leisure.culture',
  },
  {
    aliases: ['decathlon', 'basic fit', 'keepcool', 'salle de sport'],
    merchant: 'Sport',
    categoryKey: 'leisure.sport',
  },
  {
    aliases: ['airbnb', 'booking', 'air france', 'transavia'],
    merchant: 'Voyages',
    categoryKey: 'leisure.travel',
  },

  // Banque & divers
  {
    aliases: ['frais bancaires', 'commission intervention', 'cotisation carte', 'agios'],
    merchant: 'Frais bancaires',
    categoryKey: 'banking.fees',
  },
  {
    aliases: ['cpam', 'assurance maladie', 'ameli', 'remboursement assurance maladie'],
    merchant: 'Assurance maladie',
    categoryKey: 'refunds.health',
  },
  {
    aliases: ['salaire', 'vir salaire'],
    merchant: 'Salaire',
    categoryKey: 'salary.net',
    recurringHint: true,
  },
]

export interface MerchantMatch {
  merchant: string
  categoryKey: string
  alias: string
  recurringHint: boolean
}

interface IndexedMerchantAlias {
  entry: MerchantEntry
  alias: string
}

const MERCHANT_PREFIX_INDEX = new Map<number, IndexedMerchantAlias[]>()

for (const entry of FRENCH_MERCHANT_PACK) {
  for (const alias of entry.aliases) {
    if (alias.length < 2) continue
    const key = (alias.charCodeAt(0) << 16) | alias.charCodeAt(1)
    let bucket = MERCHANT_PREFIX_INDEX.get(key)
    if (!bucket) {
      bucket = []
      MERCHANT_PREFIX_INDEX.set(key, bucket)
    }
    bucket.push({ entry, alias })
  }
}

export function matchFrenchMerchant(
  rawLabel: string,
  precleaned?: { canonical: string },
): MerchantMatch | null {
  const canonical = precleaned ? precleaned.canonical : cleanTransactionLabel(rawLabel).canonical
  const len = canonical.length
  if (len < 2) return null

  let best: { entry: MerchantEntry; alias: string; score: number } | null = null
  for (let idx = 0; idx < len - 1; idx++) {
    const key = (canonical.charCodeAt(idx) << 16) | canonical.charCodeAt(idx + 1)
    const bucket = MERCHANT_PREFIX_INDEX.get(key)
    if (!bucket) continue

    const prevIsSpace = idx === 0 || canonical.charCodeAt(idx - 1) === 32
    for (let j = 0; j < bucket.length; j++) {
      const item = bucket[j]!
      if (!canonical.startsWith(item.alias, idx)) continue
      const end = idx + item.alias.length
      const nextIsSpace = end === len || canonical.charCodeAt(end) === 32
      // Privilégie la correspondance la plus longue (ex. "free mobile" avant "free").
      const score = item.alias.length + (prevIsSpace && nextIsSpace ? 20 : 0)
      if (!best || score > best.score) {
        best = { entry: item.entry, alias: item.alias, score }
      }
    }
  }

  if (!best) return null
  return {
    merchant: best.entry.merchant,
    categoryKey: best.entry.categoryKey,
    alias: best.alias,
    recurringHint: best.entry.recurringHint ?? false,
  }
}
