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
}

export type DialogLabels = typeof fr

const en: DialogLabels = {
  chooseBackupDirectory: 'Choose the Fluxo backup folder',
  chooseExportDirectory: 'Choose where to export your data (unencrypted files)',
  chooseBackupFile: 'Choose a Fluxo backup to restore',
  backupFilter: 'Fluxo backup',
}

export const DIALOG_LABELS: Readonly<Record<Locale, DialogLabels>> = { 'fr-FR': fr, 'en-US': en }
