import type { Locale } from '../settings'

/**
 * Libellés des boîtes de dialogue natives, affichées par le process main (qui n'a pas accès aux
 * dictionnaires du renderer). Même règle : le français définit la forme, l'anglais la respecte.
 */
const fr = {
  chooseBackupDirectory: 'Choisir le dossier des sauvegardes Fluxo',
  chooseExportDirectory: 'Choisir où exporter vos données (fichiers non chiffrés)',
  chooseBackupFile: 'Choisir une sauvegarde Fluxo à restaurer',
  backupFilter: 'Sauvegarde Fluxo',
  chooseStatementFile: 'Choisir un relevé bancaire à importer',
  statementFilterAll: 'Relevés bancaires (CSV, OFX, QFX, QIF, CAMT.053, MT940)',
  statementFilterCsv: 'CSV / Texte',
  statementFilterOfx: 'OFX / QFX',
  statementFilterQif: 'QIF',
  statementFilterCamt: 'CAMT.053 (XML)',
  statementFilterMt940: 'MT940 (SWIFT)',
}

export type DialogLabels = typeof fr

const en: DialogLabels = {
  chooseBackupDirectory: 'Choose the Fluxo backup folder',
  chooseExportDirectory: 'Choose where to export your data (unencrypted files)',
  chooseBackupFile: 'Choose a Fluxo backup to restore',
  backupFilter: 'Fluxo backup',
  chooseStatementFile: 'Choose a bank statement to import',
  statementFilterAll: 'Bank statements (CSV, OFX, QFX, QIF, CAMT.053, MT940)',
  statementFilterCsv: 'CSV / Text',
  statementFilterOfx: 'OFX / QFX',
  statementFilterQif: 'QIF',
  statementFilterCamt: 'CAMT.053 (XML)',
  statementFilterMt940: 'MT940 (SWIFT)',
}

export const DIALOG_LABELS: Readonly<Record<Locale, DialogLabels>> = { 'fr-FR': fr, 'en-US': en }
