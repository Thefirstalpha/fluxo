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
  chooseDocumentFile: 'Choisir un document (PDF ou image) à analyser',
  documentFilterAll: 'Documents acceptés (PDF, PNG, JPEG)',
  saveOriginalDocumentTitle: 'Enregistrer une copie de l’original avant purge',
  pngJpegFilter: 'Image PNG / JPEG',
  statementFilterAll: 'Relevés bancaires (CSV, OFX, QFX, QIF, CAMT.053, MT940)',
  statementFilterCsv: 'CSV / Texte',
  statementFilterOfx: 'OFX / QFX',
  statementFilterQif: 'QIF',
  statementFilterCamt: 'CAMT.053 (XML)',
  statementFilterMt940: 'MT940 (SWIFT)',
  saveCsvTitle: 'Exporter les opérations filtrées (CSV)',
  saveImageTitle: 'Exporter le graphique',
  savePdfTitle: 'Exporter le rapport mensuel (PDF)',
  csvFilter: 'CSV (RFC 4180)',
  pngFilter: 'Image PNG',
  svgFilter: 'Image SVG',
  pdfFilter: 'Document PDF',
}

export type DialogLabels = typeof fr

const en: DialogLabels = {
  chooseBackupDirectory: 'Choose the Fluxo backup folder',
  chooseExportDirectory: 'Choose where to export your data (unencrypted files)',
  chooseBackupFile: 'Choose a Fluxo backup to restore',
  backupFilter: 'Fluxo backup',
  chooseStatementFile: 'Choose a bank statement to import',
  chooseDocumentFile: 'Choose a document (PDF or image) to analyze',
  documentFilterAll: 'Supported documents (PDF, PNG, JPEG)',
  saveOriginalDocumentTitle: 'Save a copy of original document before purge',
  pngJpegFilter: 'PNG / JPEG image',
  statementFilterAll: 'Bank statements (CSV, OFX, QFX, QIF, CAMT.053, MT940)',
  statementFilterCsv: 'CSV / Text',
  statementFilterOfx: 'OFX / QFX',
  statementFilterQif: 'QIF',
  statementFilterCamt: 'CAMT.053 (XML)',
  statementFilterMt940: 'MT940 (SWIFT)',
  saveCsvTitle: 'Export filtered transactions (CSV)',
  saveImageTitle: 'Export chart image',
  savePdfTitle: 'Export monthly report (PDF)',
  csvFilter: 'CSV (RFC 4180)',
  pngFilter: 'PNG image',
  svgFilter: 'SVG image',
  pdfFilter: 'PDF document',
}

export const DIALOG_LABELS: Readonly<Record<Locale, DialogLabels>> = { 'fr-FR': fr, 'en-US': en }
