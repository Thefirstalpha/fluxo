import { app, Menu, type MenuItemConstructorOptions } from 'electron'

/**
 * Menu applicatif minimal.
 * - macOS : menus standard (Application, Édition pour copier/coller, Fenêtre).
 * - Windows/Linux packagés : aucun menu → pas de rechargement ni d'outils de dev par raccourci.
 * - Développement : menu « Affichage » (recharger, outils de développement).
 */
export function installApplicationMenu(): void {
  const isMac = process.platform === 'darwin'
  const devItems: MenuItemConstructorOptions[] = app.isPackaged ? [] : [{ role: 'viewMenu' }]

  if (isMac) {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        { role: 'appMenu' },
        { role: 'editMenu' },
        ...devItems,
        { role: 'windowMenu' },
      ]),
    )
    return
  }
  Menu.setApplicationMenu(devItems.length > 0 ? Menu.buildFromTemplate(devItems) : null)
}
