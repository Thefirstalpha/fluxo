import { randomBytes } from 'node:crypto'
import { rmSync } from 'node:fs'
import { generateDemoLedger } from '@shared/demo/demo-ledger'
import { monthOf } from '@shared/months'
import type { Locale } from '@shared/settings'
import type { ServiceStatus } from './api'
import { seedDemoVault } from './demo/seed'
import { ServiceError } from './rpc'
import type { ServiceLogger } from './server'
import { Vault, type VaultOptions, type VaultPaths } from './vault'

/** Enveloppe factice : la clé du coffre de démonstration n'existe qu'en mémoire. */
const DEMO_SESSION_BLOB = Buffer.from('fluxo-demo').toString('base64')

/**
 * Hôte des coffres du service : le coffre réel et, à la demande, un coffre de démonstration
 * **séparé** (autre dossier, autre clé aléatoire jamais enregistrée), recréé à chaque entrée et
 * supprimé à la sortie. Entrer en démonstration verrouille le coffre réel ; rien de ce qui se
 * passe dans la démonstration ne peut l'atteindre.
 */
export class VaultHost {
  private demo: Vault | null = null

  private constructor(
    private readonly real: Vault,
    private readonly demoPaths: VaultPaths,
    private readonly log: ServiceLogger,
    private readonly options: VaultOptions,
  ) {}

  static async open(
    realPaths: VaultPaths,
    demoPaths: VaultPaths,
    log: ServiceLogger,
    options: VaultOptions = {},
  ): Promise<VaultHost> {
    // Démonstration interrompue (arrêt brutal) : on repart de zéro.
    rmSync(demoPaths.directory, { recursive: true, force: true })
    return new VaultHost(await Vault.open(realPaths, log, options), demoPaths, log, options)
  }

  /** Coffre sur lequel portent les requêtes (démonstration si elle est active). */
  active(): Vault {
    return this.demo ?? this.real
  }

  /** Coffre réel, pour les opérations interdites en démonstration (clés, sauvegardes, effacement). */
  realOnly(): Vault {
    if (this.demo) throw new ServiceError('NOT_ALLOWED')
    return this.real
  }

  isDemo(): boolean {
    return this.demo !== null
  }

  status(): ServiceStatus {
    return { ...this.active().status(), demo: this.isDemo() }
  }

  async enterDemo({ locale }: { locale: Locale }): Promise<ServiceStatus> {
    if (this.demo) return this.status()
    this.real.lock()
    rmSync(this.demoPaths.directory, { recursive: true, force: true })
    const demo = await Vault.open(this.demoPaths, this.log, this.options)
    await demo.create({ mode: 'session', key: randomBytes(32), sessionBlob: DEMO_SESSION_BLOB })
    const now = new Date()
    const ledger = generateDemoLedger({ endMonth: monthOf(now), count: 18 })
    const seeded = seedDemoVault(demo.database(), ledger, { locale, now })
    this.demo = demo
    this.log('info', `Démonstration ouverte (${seeded.transactions} opérations fictives).`)
    return this.status()
  }

  exitDemo(): ServiceStatus {
    if (this.demo) {
      this.demo.lock()
      this.demo = null
      rmSync(this.demoPaths.directory, { recursive: true, force: true })
      this.log('info', 'Démonstration fermée (coffre de démonstration supprimé).')
    }
    return this.status()
  }

  /** Arrêt du service : verrouille tout et supprime la démonstration. */
  shutdown(): void {
    this.exitDemo()
    this.real.lock()
  }
}
