/**
 * UUID version 7 (RFC 9562) : 48 bits d'horodatage (ms Unix), puis un compteur de 12 bits,
 * puis 62 bits aléatoires. Triables dans l'ordre de création — utile pour l'audit et une
 * future synchronisation entre appareils (ADR-020) — sans révéler autre chose que l'instant.
 *
 * Monotonie (méthode 1 de la RFC) : dans une même milliseconde, le compteur est incrémenté ;
 * il démarre à une valeur aléatoire dont le bit de poids fort est nul, pour laisser de la marge.
 */

export type RandomSource = (length: number) => Uint8Array

const defaultRandom: RandomSource = (length) =>
  globalThis.crypto.getRandomValues(new Uint8Array(length))

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export function createUuidV7Generator(
  clock: () => number = Date.now,
  random: RandomSource = defaultRandom,
): () => string {
  let lastMs = -1
  let counter = 0

  return () => {
    const bytes = random(16)
    let ms = clock()
    if (ms > lastMs) {
      counter = (((bytes[6] ?? 0) & 0x07) << 8) | (bytes[7] ?? 0) // 11 bits aléatoires
    } else {
      // Même milliseconde (ou horloge reculée) : on reste sur la dernière et on incrémente.
      ms = lastMs
      counter += 1
      if (counter > 0xfff) {
        ms += 1
        counter = 0
      }
    }
    lastMs = ms

    bytes[0] = Math.floor(ms / 2 ** 40) & 0xff
    bytes[1] = Math.floor(ms / 2 ** 32) & 0xff
    bytes[2] = (ms >>> 24) & 0xff
    bytes[3] = (ms >>> 16) & 0xff
    bytes[4] = (ms >>> 8) & 0xff
    bytes[5] = ms & 0xff
    bytes[6] = 0x70 | (counter >>> 8)
    bytes[7] = counter & 0xff
    bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f)

    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
}

/** Générateur par défaut (horloge système, aléa cryptographique). */
export const uuidv7 = createUuidV7Generator()

/** Instant de création encodé dans un UUIDv7 (ms Unix). */
export function uuidv7Timestamp(id: string): number {
  return Number.parseInt(id.replace(/-/g, '').slice(0, 12), 16)
}
