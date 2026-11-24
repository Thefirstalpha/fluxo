export interface OriginMatcher {
  /** Avec le « : » final, ex. `app:` ou `http:`. */
  protocol: string
  /** Hôte, port inclus, ex. `fluxo` ou `localhost:5173`. */
  host: string
}

/**
 * Compare protocole + hôte. On n'utilise pas `URL.origin` : pour un schéma
 * personnalisé (`app://`), Node.js renvoie une origine opaque (`"null"`).
 */
export function matchesOrigin(rawUrl: string, expected: OriginMatcher): boolean {
  try {
    const url = new URL(rawUrl)
    return url.protocol === expected.protocol && url.host === expected.host
  } catch {
    return false
  }
}

/**
 * Lien externe autorisé : HTTPS uniquement, sans identifiants intégrés,
 * vers un hôte de la liste blanche (ou l'un de ses sous-domaines).
 */
export function isAllowedExternalUrl(rawUrl: string, allowedHosts: readonly string[]): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return false
  const host = url.hostname.toLowerCase()
  return allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
}
