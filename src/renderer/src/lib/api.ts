import type { FluxoApi } from '@shared/ipc'

/** Accès à l'API exposée par le preload. Le renderer n'a aucune autre porte vers le système. */
export function getApi(): FluxoApi {
  if (!('fluxo' in window)) {
    throw new Error('API Fluxo indisponible : le script preload n’est pas chargé.')
  }
  return window.fluxo
}
