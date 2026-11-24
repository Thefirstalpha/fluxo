/**
 * Point d'entrée du service de données (`utilityProcess` lancé par le process main).
 * Il détient la base SQLCipher et, une fois le coffre déverrouillé, sa clé en clair :
 * aucune autre partie de l'application ne voit la clé ni le fichier de base ouvert.
 */
import type { ServiceInit } from './api'
import { createMethods } from './methods'
import { createPortLogger, describeError, serveMethods } from './server'
import { resolveVaultPaths, Vault } from './vault'

function isInit(value: unknown): value is ServiceInit {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return candidate.kind === 'init' && typeof candidate.vaultDirectory === 'string'
}

process.parentPort.once('message', (event) => {
  const [port] = event.ports
  if (!port || !isInit(event.data)) {
    process.exit(1)
  }
  const log = createPortLogger(port)
  Vault.open(resolveVaultPaths(event.data.vaultDirectory), log)
    .then((vault) => {
      serveMethods(port, createMethods(vault), log)
      process.on('exit', () => vault.lock())
      log('info', 'Service de données prêt.')
    })
    .catch((error: unknown) => {
      log('error', `Service de données : démarrage impossible (${describeError(error)}).`)
      process.exit(1)
    })
})
