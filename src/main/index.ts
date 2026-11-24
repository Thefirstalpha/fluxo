import { homedir } from 'node:os'
import { join } from 'node:path'
import { app, BrowserWindow, nativeTheme, powerMonitor, session } from 'electron'
import { DIALOG_LABELS } from '@shared/i18n/dialogs'
import { IPC_CHANNELS } from '@shared/ipc'
import { DataServiceClient } from './data/data-service'
import { registerIpcHandlers } from './ipc/register'
import { clearLogs, initFileLogging, logger } from './logger'
import { installApplicationMenu } from './menu'
import { APP_ENTRY_URL, APP_ORIGIN, registerAppScheme, serveAppProtocol } from './protocol'
import { buildContentSecurityPolicy } from './security/csp'
import { hardenSession, hardenWebContents } from './security/hardening'
import { matchesOrigin, type OriginMatcher } from './security/url'
import { SettingsStore } from './settings/settings-store'
import { applyThemePreference, resolvedTheme, syncWindowChrome } from './theme'
import { startAutoLock } from './vault/auto-lock'
import { electronVaultDialogs } from './vault/dialogs'
import { electronSecureStorage } from './vault/secure-storage'
import { VaultManager } from './vault/vault-manager'
import { createMainWindow } from './window'
import { readInitialBounds, trackWindowState } from './window-state/track'

const APP_USER_MODEL_ID = 'app.fluxo.desktop'

// ——— Avant `ready` ————————————————————————————————————————————————
app.enableSandbox()
registerAppScheme()

/** URL du serveur Vite : uniquement en développement (jamais dans une app packagée). */
const devServerUrl = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL

/** Dossier de données isolé pour les tests E2E (ignoré dans une app packagée). */
const isolatedUserData = app.isPackaged ? undefined : process.env.FLUXO_USER_DATA_DIR
if (isolatedUserData) app.setPath('userData', isolatedUserData)

/** Tests E2E : fenêtre jamais affichée, sans focus (ignoré dans une app packagée). */
const hiddenWindow = !app.isPackaged && process.env.FLUXO_HIDDEN_WINDOW === '1'

// Une seule instance : évite deux processus écrivant les mêmes données.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows()
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.focus()
  })
  app
    .whenReady()
    .then(start)
    .catch((error: unknown) => {
      logger.error('Échec du démarrage', error)
      app.exit(1)
    })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ——— Démarrage ————————————————————————————————————————————————————
async function start(): Promise<void> {
  initFileLogging(join(app.getPath('userData'), 'logs'), {
    homeDir: homedir(),
    debug: !app.isPackaged,
  })
  if (process.platform === 'win32') app.setAppUserModelId(APP_USER_MODEL_ID)
  installApplicationMenu()

  const devOrigin = devServerUrl ? new URL(devServerUrl) : undefined
  const trustedOrigins: OriginMatcher[] = [
    APP_ORIGIN,
    ...(devOrigin ? [{ protocol: devOrigin.protocol, host: devOrigin.host }] : []),
  ]
  const isTrustedUrl = (url: string): boolean =>
    trustedOrigins.some((origin) => matchesOrigin(url, origin))

  // Sécurité : session, contenus web, protocole app:// et CSP.
  hardenSession(session.defaultSession)
  app.on('web-contents-created', (_event, contents) => hardenWebContents(contents, isTrustedUrl))

  const csp = buildContentSecurityPolicy(devOrigin ? { devServerOrigin: devOrigin.origin } : {})
  serveAppProtocol(join(__dirname, '../renderer'), csp)
  if (devOrigin) {
    session.defaultSession.webRequest.onHeadersReceived(
      { urls: [`${devOrigin.origin}/*`] },
      (details, callback) => {
        callback({
          responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] },
        })
      },
    )
  }

  // Service de données (base chiffrée) dans un processus utilitaire dédié.
  const dataService = new DataServiceClient(
    join(app.getPath('userData'), 'vault'),
    app.getVersion(),
  )
  app.on('will-quit', (event) => {
    event.preventDefault()
    dataService
      .stop()
      .catch((error: unknown) => logger.error('Arrêt du service de données', error))
      .finally(() => app.exit(0))
  })

  // Préférences.
  const settings = await SettingsStore.open(join(app.getPath('userData'), 'settings.json'))
  applyThemePreference(settings.get().theme)

  // Coffre : état diffusé à l'interface, verrouillage automatique, déverrouillage en mode session.
  const vault = new VaultManager(
    dataService,
    electronSecureStorage(),
    electronVaultDialogs(() => DIALOG_LABELS[settings.get().locale]),
    clearLogs,
  )
  vault.onStatusChange((status) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC_CHANNELS.vaultStatusChanged, status)
    }
  })
  dataService.onExit(() => {
    vault
      .publish()
      .catch((error: unknown) => logger.error('Service de données indisponible', error))
  })
  startAutoLock({
    power: powerMonitor,
    settings: () => settings.get(),
    lock: (reason) => vault.lock(reason),
    onError: (error) => logger.error('Verrouillage automatique impossible', error),
  })
  // Sauvegarde automatique : au déverrouillage, puis vérification toutes les heures.
  setInterval(() => vault.runAutoBackup(), 60 * 60 * 1000).unref()
  try {
    await vault.unlockAtStartup()
    logger.info(`Coffre : ${(await vault.status()).state}.`)
  } catch (error) {
    logger.error('Service de données indisponible', error)
  }

  registerIpcHandlers({ settings, vault, isTrustedSender: isTrustedUrl })

  settings.onChange((next) => {
    applyThemePreference(next.theme)
    for (const window of BrowserWindow.getAllWindows()) {
      window.setContentProtection(next.contentProtection)
      window.webContents.send(IPC_CHANNELS.settingsChanged, next)
    }
  })
  nativeTheme.on('updated', () => {
    for (const window of BrowserWindow.getAllWindows()) syncWindowChrome(window)
  })

  const windowStateFile = join(app.getPath('userData'), 'window-state.json')
  const openMainWindow = async (): Promise<void> => {
    const window = createMainWindow({
      theme: resolvedTheme(),
      contentProtection: settings.get().contentProtection,
      bounds: await readInitialBounds(windowStateFile),
      hidden: hiddenWindow,
    })
    trackWindowState(window, windowStateFile)
    window.loadURL(devServerUrl ?? APP_ENTRY_URL).catch((error: unknown) => {
      logger.error('Chargement de l’interface impossible', error)
    })
  }

  await openMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length > 0) return
    openMainWindow().catch((error: unknown) => {
      logger.error('Ouverture de la fenêtre impossible', error)
    })
  })
  logger.info(`Fluxo ${app.getVersion()} démarré (${process.platform}/${process.arch}).`)
}
