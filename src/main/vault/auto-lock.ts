import type { AutoLockMinutes } from '@shared/vault'

/** Le délai d'inactivité est-il atteint ? (0 minute = jamais). */
export function idleLockDue(idleSeconds: number, minutes: AutoLockMinutes): boolean {
  return minutes > 0 && idleSeconds >= minutes * 60
}

export interface PowerEvents {
  on(event: 'lock-screen' | 'suspend', listener: () => void): unknown
  removeListener(event: 'lock-screen' | 'suspend', listener: () => void): unknown
  getSystemIdleTime(): number
}

export interface AutoLockOptions {
  power: PowerEvents
  settings: () => { autoLockMinutes: AutoLockMinutes; lockOnSystemLock: boolean }
  lock: (reason: string) => Promise<void>
  onError: (error: unknown) => void
  /** Horodatage du dernier déverrouillage (évite de re-verrouiller 15 s après l'ouverture). */
  unlockedSinceMs?: () => number
  /** Fréquence de vérification de l'inactivité. */
  intervalMs?: number
}

/**
 * Verrouillage automatique : session du système verrouillée, mise en veille, ou inactivité
 * prolongée (mesurée par le système : clavier et souris, toutes applications confondues).
 * Retourne une fonction d'arrêt.
 */
export function startAutoLock({
  power,
  settings,
  lock,
  onError,
  unlockedSinceMs,
  intervalMs = 15_000,
}: AutoLockOptions): () => void {
  const run = (reason: string): void => {
    lock(reason).catch(onError)
  }
  const onSystemLock = (): void => {
    if (settings().lockOnSystemLock) run('session du système verrouillée ou mise en veille')
  }
  power.on('lock-screen', onSystemLock)
  power.on('suspend', onSystemLock)
  const timer = setInterval(() => {
    const idleSeconds = power.getSystemIdleTime()
    const sinceUnlock = unlockedSinceMs
      ? Math.max(0, (Date.now() - unlockedSinceMs()) / 1000)
      : idleSeconds
    if (idleLockDue(Math.min(idleSeconds, sinceUnlock), settings().autoLockMinutes)) {
      run('inactivité')
    }
  }, intervalMs)
  timer.unref?.()
  return () => {
    clearInterval(timer)
    power.removeListener('lock-screen', onSystemLock)
    power.removeListener('suspend', onSystemLock)
  }
}
