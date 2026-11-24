import type { CsvDelimiter, CsvProfile, CsvProfileConfig } from './model'

/**
 * Profils CSV communautaires intégrés pour les principales banques françaises et néobanques.
 * Chacun respecte `csvProfileConfigSchema` et peut être sélectionné tel quel ou personnalisé
 * avant d'être enregistré localement ou partagé au format JSON.
 */
export const BUILTIN_CSV_PROFILES: readonly CsvProfile[] = [
  {
    id: 'builtin:boursobank',
    name: 'BoursoBank (Boursorama)',
    bank: 'BoursoBank',
    builtin: true,
    config: {
      delimiter: ';',
      encoding: 'utf-8',
      dateFormat: 'YYYY-MM-DD',
      skipRows: 0,
      hasHeader: true,
      amountMode: 'single',
      columns: {
        bookingDate: 'dateOp',
        valueDate: 'dateVal',
        label: 'label',
        payee: 'supplierFound',
        note: 'comment',
        amount: 'amount',
        balance: 'accountbalance',
      },
    },
  },
  {
    id: 'builtin:credit-agricole',
    name: 'Crédit Agricole',
    bank: 'Crédit Agricole',
    builtin: true,
    config: {
      delimiter: ';',
      encoding: 'windows-1252',
      dateFormat: 'DD/MM/YYYY',
      skipRows: 0,
      hasHeader: true,
      amountMode: 'split',
      columns: {
        bookingDate: 'Date',
        label: 'Libellé',
        debit: 'Débit euros',
        credit: 'Crédit euros',
      },
    },
  },
  {
    id: 'builtin:bnp-paribas',
    name: 'BNP Paribas',
    bank: 'BNP Paribas',
    builtin: true,
    config: {
      delimiter: ';',
      encoding: 'windows-1252',
      dateFormat: 'DD/MM/YYYY',
      skipRows: 0,
      hasHeader: true,
      amountMode: 'single',
      columns: {
        bookingDate: 'Date operation',
        label: 'Libelle',
        amount: 'Montant',
      },
    },
  },
  {
    id: 'builtin:societe-generale',
    name: 'Société Générale',
    bank: 'Société Générale',
    builtin: true,
    config: {
      delimiter: ';',
      encoding: 'windows-1252',
      dateFormat: 'DD/MM/YYYY',
      skipRows: 0,
      hasHeader: true,
      amountMode: 'single',
      columns: {
        bookingDate: "Date de l'opération",
        label: 'Libellé',
        note: "Détail de l'écriture",
        amount: "Montant de l'opération",
        currency: 'Devise',
      },
    },
  },
  {
    id: 'builtin:credit-mutuel-cic',
    name: 'Crédit Mutuel / CIC',
    bank: 'Crédit Mutuel / CIC',
    builtin: true,
    config: {
      delimiter: ';',
      encoding: 'windows-1252',
      dateFormat: 'DD/MM/YYYY',
      skipRows: 0,
      hasHeader: true,
      amountMode: 'split',
      columns: {
        bookingDate: 'Date',
        valueDate: 'Date de valeur',
        debit: 'Débit',
        credit: 'Crédit',
        label: 'Libellé',
        balance: 'Solde',
      },
    },
  },
  {
    id: 'builtin:la-banque-postale',
    name: 'La Banque Postale',
    bank: 'La Banque Postale',
    builtin: true,
    config: {
      delimiter: ';',
      encoding: 'windows-1252',
      dateFormat: 'DD/MM/YYYY',
      skipRows: 0,
      hasHeader: true,
      amountMode: 'single',
      columns: {
        bookingDate: 'Date',
        label: 'Libellé',
        amount: 'Montant(EUROS)',
      },
    },
  },
  {
    id: 'builtin:revolut',
    name: 'Revolut',
    bank: 'Revolut',
    builtin: true,
    config: {
      delimiter: ',',
      encoding: 'utf-8',
      dateFormat: 'YYYY-MM-DD',
      skipRows: 0,
      hasHeader: true,
      amountMode: 'single',
      columns: {
        bookingDate: 'Completed Date',
        valueDate: 'Started Date',
        label: 'Description',
        amount: 'Amount',
        currency: 'Currency',
        status: 'State',
        balance: 'Balance',
      },
    },
  },
]

function normHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function findHeaderByAliases(
  headers: readonly string[],
  aliases: readonly string[],
): string | null {
  const normalizedHeaders = headers.map((h) => ({ raw: h, norm: normHeader(h) }))
  for (const alias of aliases) {
    const exact = normalizedHeaders.find((h) => h.norm === alias)
    if (exact) return exact.raw
  }
  for (const alias of aliases) {
    const partial = normalizedHeaders.find((h) => h.norm.includes(alias))
    if (partial) return partial.raw
  }
  return null
}

/**
 * Compare les en-têtes détectés aux profils intégrés puis déduit à défaut une
 * configuration raisonnable pour éviter toute saisie manuelle sur les formats courants.
 */
export function matchBuiltinProfile(
  headers: readonly string[],
  delimiter: CsvDelimiter,
): CsvProfile | null {
  const normSet = new Set(headers.map(normHeader))
  for (const profile of BUILTIN_CSV_PROFILES) {
    if (profile.config.delimiter !== delimiter) continue
    const required = [profile.config.columns.bookingDate, profile.config.columns.label]
    if (profile.config.amountMode === 'single' && profile.config.columns.amount) {
      required.push(profile.config.columns.amount)
    } else if (profile.config.amountMode === 'split') {
      if (profile.config.columns.debit) required.push(profile.config.columns.debit)
      if (profile.config.columns.credit) required.push(profile.config.columns.credit)
    }
    const matches = required.every((col) => typeof col === 'string' && normSet.has(normHeader(col)))
    if (matches) return profile
  }
  return null
}

export function suggestCsvConfig(
  headers: readonly string[],
  delimiter: CsvDelimiter,
  skipRows: number,
  hasHeader: boolean,
): { profileId: string | null; config: CsvProfileConfig } {
  const matched = hasHeader ? matchBuiltinProfile(headers, delimiter) : null
  if (matched) {
    return {
      profileId: matched.id,
      config: { ...matched.config, skipRows },
    }
  }

  if (!hasHeader || headers.length === 0) {
    return {
      profileId: null,
      config: {
        delimiter,
        encoding: 'auto',
        dateFormat: 'auto',
        skipRows,
        hasHeader: false,
        amountMode: 'single',
        columns: { bookingDate: 0, label: 1, amount: 2 },
      },
    }
  }

  const bookingDate =
    findHeaderByAliases(headers, [
      'date operation',
      'dateop',
      'date de l operation',
      'completed date',
      'booking date',
      'date comptable',
      'date',
    ]) ??
    headers[0] ??
    0

  const valueDate = findHeaderByAliases(headers, [
    'date valeur',
    'dateval',
    'date de valeur',
    'value date',
    'started date',
  ])

  const label =
    findHeaderByAliases(headers, [
      'libelle',
      'label',
      'description',
      'intitule',
      'label raw',
      'motif',
      'operation',
    ]) ??
    headers[1] ??
    headers[0] ??
    1

  const labelSecondary = findHeaderByAliases(headers, ['libelle complementaire', 'detail'])
  const payee = findHeaderByAliases(headers, ['tiers', 'payee', 'supplierfound', 'beneficiaire'])
  const note = findHeaderByAliases(headers, ['note', 'commentaire', 'comment', 'memo'])
  const debit = findHeaderByAliases(headers, ['debit euros', 'debit', 'sortie', 'depense'])
  const credit = findHeaderByAliases(headers, ['credit euros', 'credit', 'entree', 'recette'])
  const amount = findHeaderByAliases(headers, ['montant euros', 'montant', 'amount', 'valeur'])
  const balance = findHeaderByAliases(headers, ['accountbalance', 'solde', 'balance'])
  const currency = findHeaderByAliases(headers, ['devise', 'currency', 'monnaie'])
  const status = findHeaderByAliases(headers, ['statut', 'status', 'state', 'etat'])

  const useSplit = Boolean(debit && credit && !amount)

  return {
    profileId: null,
    config: {
      delimiter,
      encoding: 'auto',
      dateFormat: 'auto',
      skipRows,
      hasHeader: true,
      amountMode: useSplit ? 'split' : 'single',
      columns: {
        bookingDate,
        valueDate,
        label,
        labelSecondary,
        payee,
        note,
        amount: useSplit ? null : (amount ?? headers[2] ?? 2),
        debit: useSplit ? debit : null,
        credit: useSplit ? credit : null,
        balance,
        currency,
        status,
      },
    },
  }
}
