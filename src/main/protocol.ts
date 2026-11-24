import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { protocol } from 'electron'
import { resolveInsideRoot } from './security/paths'
import type { OriginMatcher } from './security/url'

/**
 * Le renderer de production est servi par un protocole privé `app://fluxo/`
 * plutôt que par `file://` (recommandation n°18 de la checklist de sécurité Electron) :
 * origine propre, CSP en en-tête HTTP, accès disque limité au dossier de la build.
 */
export const APP_ORIGIN: OriginMatcher = { protocol: 'app:', host: 'fluxo' }
export const APP_ENTRY_URL = 'app://fluxo/index.html'

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.wasm': 'application/wasm',
}

/** Doit être appelé AVANT l'événement `ready` de l'application. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true },
    },
  ])
}

export function serveAppProtocol(rendererRoot: string, contentSecurityPolicy: string): void {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url)
    if (url.host !== APP_ORIGIN.host || request.method !== 'GET') {
      return new Response(null, { status: 404 })
    }
    const filePath = resolveInsideRoot(rendererRoot, url.pathname)
    if (!filePath) return new Response(null, { status: 403 })

    // Seuls les types de fichiers connus sont servis.
    const contentType = MIME_TYPES[extname(filePath).toLowerCase()]
    if (!contentType) return new Response(null, { status: 404 })

    try {
      const body = await readFile(filePath)
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Security-Policy': contentSecurityPolicy,
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cache-Control': 'no-cache',
        },
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}
