/**
 * Point d'entrée du service de données (`utilityProcess` lancé par le process main).
 * Il détient la base SQLCipher et, une fois le coffre déverrouillé, sa clé en clair :
 * aucune autre partie de l'application ne voit la clé ni le fichier de base ouvert.
 */
import type { ServiceInit } from './api'
import { createMethods } from './methods'
import { createPortLogger, describeError, serveMethods } from './server'
import { dirname, join } from 'node:path'
import { VaultHost } from './host'
import { resolveVaultPaths } from './vault'

function isInit(value: unknown): value is ServiceInit {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    candidate.kind === 'init' &&
    typeof candidate.vaultDirectory === 'string' &&
    typeof candidate.appVersion === 'string'
  )
}

process.parentPort.once('message', (event) => {
  const [port] = event.ports
  if (!port || !isInit(event.data)) {
    process.exit(1)
  }
  const log = createPortLogger(port)
  const { vaultDirectory, appVersion } = event.data
  VaultHost.open(
    resolveVaultPaths(vaultDirectory),
    resolveVaultPaths(join(dirname(vaultDirectory), 'demo-vault')),
    log,
    { appVersion },
  )
    .then((host) => {
      serveMethods(port, createMethods(host), log)
      process.on('exit', () => host.shutdown())
      log('info', 'Service de données prêt.')
    })
    .catch((error: unknown) => {
      log('error', `Service de données : démarrage impossible (${describeError(error)}).`)
      process.exit(1)
    })
})
