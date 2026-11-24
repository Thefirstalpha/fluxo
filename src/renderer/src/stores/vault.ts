import { create } from 'zustand'
import type { VaultStatus } from '@shared/vault'
import { getApi } from '../lib/api'

interface VaultStoreState {
  /** `null` tant que l'état n'a pas été lu auprès du process main. */
  status: VaultStatus | null
  /** Code de récupération tout juste créé, à afficher une seule fois. */
  pendingRecoveryCode: string | null
  /** Création en cours : l'écran de création reste affiché jusqu'au code de récupération. */
  setupInProgress: boolean
  setSetupInProgress: (value: boolean) => void
  showRecoveryCode: (code: string) => void
  dismissRecoveryCode: () => void
}

export const useVaultStore = create<VaultStoreState>()((set) => ({
  status: null,
  pendingRecoveryCode: null,
  setupInProgress: false,
  setSetupInProgress: (value) => set({ setupInProgress: value }),
  showRecoveryCode: (code) => set({ pendingRecoveryCode: code }),
  dismissRecoveryCode: () => set({ pendingRecoveryCode: null }),
}))

let unsubscribe: (() => void) | undefined

/** Lit l'état du coffre et suit ses changements (verrouillage automatique, autre fenêtre…). */
export async function initVault(): Promise<void> {
  const api = getApi()
  unsubscribe?.()
  unsubscribe = api.vault.onStatusChange((status) => {
    // Coffre verrouillé : on oublie aussi un code de récupération non encore confirmé.
    useVaultStore.setState(
      status.state === 'unlocked' ? { status } : { status, pendingRecoveryCode: null },
    )
  })
  useVaultStore.setState({ status: await api.vault.getStatus() })
}
