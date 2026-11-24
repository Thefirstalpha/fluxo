import { z } from 'zod'
import { PASSWORD_MAX_LENGTH } from '@shared/vault'
import type { DataServiceApi, DataServiceMethod } from './api'
import { DATABASE_KEY_BYTES } from './db/connection'
import { defineMethod, type MethodDefinition } from './server'
import type { Vault } from './vault'

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

/** Table des méthodes exposées au process main, chacune avec son schéma d'entrée. */
export function createMethods(vault: Vault): Readonly<Record<DataServiceMethod, MethodDefinition>> {
  // Vérifie à la compilation que chaque méthode respecte le contrat `DataServiceApi`.
  const api: DataServiceApi = {
    status: () => vault.status(),
    sessionBlob: () => vault.sessionBlob(),
    create: (params) => vault.create(params),
    unlock: (params) => vault.unlock(params),
    lock: () => vault.lock(),
    changePassword: (params) => vault.changePassword(params),
    exportKeyForSession: (params) => vault.exportKeyForSession(params),
    setSessionMode: (params) => vault.setSessionMode(params),
    createRecoveryCode: (params) => vault.createRecoveryCode(params),
    removeRecoveryCode: (params) => vault.removeRecoveryCode(params),
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
  }
}
