import { z } from 'zod'
import { LOCALES } from '@shared/settings'
import { PASSWORD_MAX_LENGTH } from '@shared/vault'
import type { DataServiceApi, DataServiceMethod } from './api'
import { DATABASE_KEY_BYTES } from './db/connection'
import { defineMethod, type MethodDefinition } from './server'
import type { VaultHost } from './host'

const noParams = z.undefined()
/** Borne large (en unités UTF-16) : la règle de longueur exacte est vérifiée par le coffre. */
const secret = z
  .string()
  .min(1)
  .max(PASSWORD_MAX_LENGTH * 2)
const key = z.instanceof(Uint8Array).refine((value) => value.length === DATABASE_KEY_BYTES)
const sessionBlob = z
  .string()
  .regex(/^[A-Za-z0-9+/]+={0,2}$/)
  .max(4096)
const currentPassword = z.strictObject({ currentPassword: secret.optional() })
/** Chemin absolu fourni par une boîte de dialogue du main (vérifié aussi par le coffre). */
const path = z.string().min(1).max(4096)
const token = z.string().regex(/^[0-9a-f]{32}$/)

/** Table des méthodes exposées au process main, chacune avec son schéma d'entrée. */
export function createMethods(
  host: VaultHost,
): Readonly<Record<DataServiceMethod, MethodDefinition>> {
  // Vérifie à la compilation que chaque méthode respecte le contrat `DataServiceApi`.
  const real = () => host.realOnly()
  const api: DataServiceApi = {
    status: () => host.status(),
    sessionBlob: () => (host.isDemo() ? Promise.resolve(null) : real().sessionBlob()),
    create: async (params) => {
      await real().create(params)
      return host.status()
    },
    unlock: (params) => real().unlock(params),
    // Verrouiller pendant la démonstration la referme (le coffre réel est déjà verrouillé).
    lock: () => (host.isDemo() ? host.exitDemo() : { ...real().lock(), demo: false }),
    changePassword: (params) => real().changePassword(params),
    exportKeyForSession: (params) => real().exportKeyForSession(params),
    setSessionMode: (params) => real().setSessionMode(params),
    createRecoveryCode: (params) => real().createRecoveryCode(params),
    removeRecoveryCode: (params) => real().removeRecoveryCode(params),
    backupNow: () => real().backupNow(),
    autoBackupIfDue: () => (host.isDemo() ? Promise.resolve(false) : real().autoBackupIfDue()),
    backupInfo: () => real().backupInfo(),
    setBackupDirectory: (params) => real().setBackupDirectory(params),
    setAutoBackup: (params) => real().setAutoBackup(params),
    inspectBackup: (params) => real().inspectBackup(params),
    previewRestore: (params) => real().previewRestore(params),
    confirmRestore: (params) => real().confirmRestore(params),
    cancelRestore: () => real().cancelRestore(),
    exportData: (params) => real().exportData(params),
    eraseAll: (params) => real().eraseAll(params),
    enterDemo: (params) => host.enterDemo(params),
    exitDemo: () => host.exitDemo(),
  }
  return {
    status: defineMethod(noParams, () => api.status()),
    sessionBlob: defineMethod(noParams, () => api.sessionBlob()),
    create: defineMethod(
      z.discriminatedUnion('mode', [
        z.strictObject({ mode: z.literal('session'), key, sessionBlob }),
        z.strictObject({ mode: z.literal('password'), password: secret }),
      ]),
      (params) => api.create(params),
    ),
    unlock: defineMethod(
      z.discriminatedUnion('method', [
        z.strictObject({ method: z.literal('key'), key }),
        z.strictObject({ method: z.literal('password'), password: secret }),
        z.strictObject({ method: z.literal('recovery'), code: z.string().min(1).max(200) }),
      ]),
      (params) => api.unlock(params),
    ),
    lock: defineMethod(noParams, () => api.lock()),
    changePassword: defineMethod(
      z.strictObject({ currentPassword: secret.optional(), newPassword: secret }),
      (params) => api.changePassword(params),
    ),
    exportKeyForSession: defineMethod(currentPassword, (params) => api.exportKeyForSession(params)),
    setSessionMode: defineMethod(z.strictObject({ sessionBlob }), (params) =>
      api.setSessionMode(params),
    ),
    createRecoveryCode: defineMethod(currentPassword, (params) => api.createRecoveryCode(params)),
    removeRecoveryCode: defineMethod(currentPassword, (params) => api.removeRecoveryCode(params)),
    backupNow: defineMethod(noParams, () => api.backupNow()),
    autoBackupIfDue: defineMethod(noParams, () => api.autoBackupIfDue()),
    backupInfo: defineMethod(noParams, () => api.backupInfo()),
    setBackupDirectory: defineMethod(z.strictObject({ directory: path.nullable() }), (params) =>
      api.setBackupDirectory(params),
    ),
    setAutoBackup: defineMethod(z.strictObject({ enabled: z.boolean() }), (params) =>
      api.setAutoBackup(params),
    ),
    inspectBackup: defineMethod(z.strictObject({ file: path }), (params) =>
      api.inspectBackup(params),
    ),
    previewRestore: defineMethod(
      z.strictObject({
        token,
        secret: z
          .strictObject({ method: z.enum(['password', 'recovery']), value: secret })
          .optional(),
      }),
      (params) => api.previewRestore(params),
    ),
    confirmRestore: defineMethod(z.strictObject({ token }), (params) => api.confirmRestore(params)),
    cancelRestore: defineMethod(noParams, () => api.cancelRestore()),
    exportData: defineMethod(z.strictObject({ directory: path }), (params) =>
      api.exportData(params),
    ),
    eraseAll: defineMethod(currentPassword, (params) => api.eraseAll(params)),
    enterDemo: defineMethod(z.strictObject({ locale: z.enum(LOCALES) }), (params) =>
      api.enterDemo(params),
    ),
    exitDemo: defineMethod(noParams, () => api.exitDemo()),
  }
}
