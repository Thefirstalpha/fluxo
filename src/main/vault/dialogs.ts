import { BrowserWindow, dialog } from 'electron'
import type { DialogLabels } from '@shared/i18n/dialogs'
import type { VaultDialogs } from './vault-manager'

/**
 * Boîtes de dialogue natives : seul le process main manipule des chemins. Le renderer demande
 * « choisir un dossier », il ne reçoit qu'un résultat (ou un jeton pour la restauration).
 */
export function electronVaultDialogs(labels: () => DialogLabels): VaultDialogs {
  const show = async (options: Electron.OpenDialogOptions): Promise<string | null> => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  }
  return {
    chooseDirectory: (purpose) =>
      show({
        title:
          purpose === 'backup' ? labels().chooseBackupDirectory : labels().chooseExportDirectory,
        properties: ['openDirectory', 'createDirectory'],
      }),
    chooseBackupFile: () =>
      show({
        title: labels().chooseBackupFile,
        properties: ['openFile'],
        filters: [{ name: labels().backupFilter, extensions: ['fluxo-backup'] }],
      }),
  }
}
