export interface CspOptions {
  /** Origine du serveur Vite en développement (ex. http://localhost:5173). Absente en production. */
  devServerOrigin?: string
}

/**
 * Content Security Policy de toutes les pages de l'application.
 *
 * Production : aucun script inline, aucun `eval`, aucune ressource distante,
 * aucune connexion réseau depuis le renderer (le réseau passe exclusivement par le process main).
 * Développement : assouplissements limités au serveur Vite local (HMR).
 */
export function buildContentSecurityPolicy({ devServerOrigin }: CspOptions = {}): string {
  const self = "'self'"
  const dev = devServerOrigin !== undefined

  const directives: [string, string[]][] = [
    ['default-src', ["'none'"]],
    // Dev : le préambule React Refresh est un script inline injecté par Vite.
    ['script-src', dev ? [self, "'unsafe-inline'"] : [self]],
    // Dev : Vite injecte le CSS via des balises <style>. Prod : feuilles de style servies par app://.
    ['style-src', dev ? [self, "'unsafe-inline'"] : [self]],
    // Attributs style="" uniquement (infobulles HTML d'ECharts). Les scripts restent bloqués.
    ['style-src-attr', ["'unsafe-inline'"]],
    ['img-src', [self, 'data:', 'blob:']],
    ['font-src', [self, 'data:']],
    ['connect-src', dev ? [self, devServerOrigin, devServerOrigin.replace(/^http/, 'ws')] : [self]],
    ['worker-src', [self, 'blob:']],
    ['object-src', ["'none'"]],
    ['base-uri', ["'none'"]],
    ['form-action', ["'none'"]],
    ['frame-src', ["'none'"]],
    ['frame-ancestors', ["'none'"]],
  ]

  return directives.map(([name, values]) => `${name} ${values.join(' ')}`).join('; ')
}
