import type { FluxoApi } from '@shared/ipc'

declare global {
  interface Window {
    /** API exposée par le preload — seule porte d'accès du renderer au système. */
    readonly fluxo: FluxoApi
  }
}

export {}
