import { shell, type Session, type WebContents } from 'electron'
import { EXTERNAL_LINK_HOSTS } from '@shared/app-meta'
import { logger } from '../logger'
import { isAllowedExternalUrl } from './url'

/** Seule permission web accordée : écrire dans le presse-papiers (copier un montant, un IBAN). */
const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set(['clipboard-sanitized-write'])

/** Durcit une session : permissions refusées par défaut, téléchargements bloqués, correcteur coupé. */
export function hardenSession(session: Session): void {
  session.setPermissionRequestHandler((_contents, permission, callback) => {
    const granted = ALLOWED_PERMISSIONS.has(permission)
    if (!granted) logger.warn(`Permission refusée : ${permission}`)
    callback(granted)
  })
  session.setPermissionCheckHandler((_contents, permission) => ALLOWED_PERMISSIONS.has(permission))
  session.setDevicePermissionHandler(() => false)
  // Les exports passent par une boîte de dialogue du process main, jamais par un téléchargement web.
  session.on('will-download', (event) => event.preventDefault())
  // Le correcteur orthographique peut télécharger des dictionnaires : inutile ici.
  session.setSpellCheckerEnabled(false)
}

/**
 * Durcit chaque WebContents : navigation limitée aux origines de l'application,
 * nouvelles fenêtres interdites (liens HTTPS autorisés → navigateur système), pas de <webview>.
 */
export function hardenWebContents(
  contents: WebContents,
  isTrustedUrl: (url: string) => boolean,
): void {
  const blockUntrusted = (event: { preventDefault: () => void }, url: string): void => {
    if (isTrustedUrl(url)) return
    event.preventDefault()
    logger.warn('Navigation bloquée vers une origine non autorisée.')
  }
  contents.on('will-navigate', (event, url) => blockUntrusted(event, url))
  contents.on('will-redirect', (event, url) => blockUntrusted(event, url))
  contents.on('will-attach-webview', (event) => event.preventDefault())
  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url, EXTERNAL_LINK_HOSTS)) {
      shell
        .openExternal(url)
        .catch((error: unknown) => logger.error('Ouverture du lien impossible', error))
    } else {
      logger.warn('Ouverture de fenêtre refusée.')
    }
    return { action: 'deny' }
  })
}
