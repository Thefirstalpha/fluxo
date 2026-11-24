import { z } from 'zod'
import type { DataServiceApi, DataServiceMethod } from './api'
import { defineMethod, type MethodDefinition } from './server'
import type { Vault } from './vault'

const noParams = z.undefined()

/** Table des méthodes exposées au process main, chacune avec son schéma d'entrée. */
export function createMethods(vault: Vault): Readonly<Record<DataServiceMethod, MethodDefinition>> {
  const api: DataServiceApi = {
    status: () => vault.status(),
  }
  return {
    status: defineMethod(noParams, () => api.status()),
  }
}
