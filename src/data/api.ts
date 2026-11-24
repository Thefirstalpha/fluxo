/**
 * Contrat du service de données (process utilitaire) vu par le process main.
 * Chaque méthode est validée côté service par un schéma (voir `methods.ts`).
 * Ce module ne contient que des types : il est importé par le main et par le service.
 */

export type VaultState = 'absent' | 'locked' | 'unlocked'

export interface ServiceStatus {
  state: VaultState
}

export interface DataServiceApi {
  status(): ServiceStatus
}

export type DataServiceMethod = keyof DataServiceApi
export type MethodParams<M extends DataServiceMethod> = Parameters<DataServiceApi[M]>[0]
export type MethodResult<M extends DataServiceMethod> = Awaited<ReturnType<DataServiceApi[M]>>

/** Message d'initialisation envoyé par le main avec le port de communication. */
export interface ServiceInit {
  kind: 'init'
  /** Dossier du coffre (base, enveloppe de clé, sauvegardes par défaut). */
  vaultDirectory: string
}
