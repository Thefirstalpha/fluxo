import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { z } from 'zod'

/**
 * Délais croissants après des échecs de déverrouillage. Ils freinent les essais par l'interface ;
 * contre une copie du fichier, c'est Argon2id et la longueur du mot de passe qui protègent.
 * L'état est conservé sur disque : relancer l'application ne remet pas le compteur à zéro.
 */

const FREE_ATTEMPTS = 3
const MAX_DELAY_MS = 5 * 60_000

/** 3 essais libres, puis 1 s, 2 s, 4 s… plafonné à 5 minutes. */
export function retryDelayMs(failures: number): number {
  if (failures < FREE_ATTEMPTS) return 0
  return Math.min(1000 * 2 ** (failures - FREE_ATTEMPTS), MAX_DELAY_MS)
}

const lockoutSchema = z.object({
  failures: z.number().int().min(0).max(10_000),
  lastFailureAt: z.number().int().min(0),
})

export type LockoutState = z.infer<typeof lockoutSchema>

const CLEAR: LockoutState = { failures: 0, lastFailureAt: 0 }

/** Temps restant avant le prochain essai autorisé. */
export function remainingDelayMs(state: LockoutState, now: number): number {
  const delay = retryDelayMs(state.failures)
  if (delay === 0) return 0
  return Math.max(0, state.lastFailureAt + delay - now)
}

export class Lockout {
  private state: LockoutState = CLEAR

  private constructor(private readonly file: string) {}

  static async load(file: string): Promise<Lockout> {
    const lockout = new Lockout(file)
    try {
      const parsed = lockoutSchema.safeParse(JSON.parse(await readFile(file, 'utf8')))
      // Fichier illisible : on ne remet pas à zéro (ce serait un contournement), on applique le plafond.
      lockout.state = parsed.success ? parsed.data : { failures: 100, lastFailureAt: Date.now() }
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        lockout.state = { failures: 100, lastFailureAt: Date.now() }
      }
    }
    return lockout
  }

  remaining(now = Date.now()): number {
    return remainingDelayMs(this.state, now)
  }

  async recordFailure(now = Date.now()): Promise<number> {
    this.state = { failures: this.state.failures + 1, lastFailureAt: now }
    const temporary = `${this.file}.tmp`
    await writeFile(temporary, JSON.stringify(this.state), { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, this.file)
    return this.remaining(now)
  }

  async reset(): Promise<void> {
    if (this.state.failures === 0) return
    this.state = CLEAR
    await rm(this.file, { force: true })
  }
}
