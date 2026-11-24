import type { ReactNode } from 'react'
import { useT } from '../../i18n'
import { useVaultStore } from '../../stores/vault'
import { NewPasswordScreen } from './NewPasswordScreen'
import { RecoveryCodePanel } from './RecoveryCodePanel'
import { SetupScreen } from './SetupScreen'
import { UnlockScreen } from './UnlockScreen'

/**
 * Porte du coffre : l'application n'est rendue que coffre déverrouillé. Au verrouillage,
 * toute l'interface est démontée — rien de ce qui était affiché ne reste en mémoire de rendu.
 */
export function VaultGate({ children }: { children: ReactNode }) {
  const t = useT()
  const status = useVaultStore((state) => state.status)
  const pendingRecoveryCode = useVaultStore((state) => state.pendingRecoveryCode)
  const setupInProgress = useVaultStore((state) => state.setupInProgress)
  const dismissRecoveryCode = useVaultStore((state) => state.dismissRecoveryCode)

  if (!status) {
    return (
      <p role="status" className="flex h-full items-center justify-center text-sm text-muted">
        {t.vault.loading}
      </p>
    )
  }
  if (pendingRecoveryCode && status.state === 'unlocked') {
    return <RecoveryCodePanel code={pendingRecoveryCode} onDone={dismissRecoveryCode} />
  }
  if (status.state === 'absent' || (setupInProgress && status.state === 'unlocked')) {
    return <SetupScreen status={status} />
  }
  if (status.state === 'locked') return <UnlockScreen status={status} />
  if (status.needsNewPassword) return <NewPasswordScreen />
  return <>{children}</>
}
