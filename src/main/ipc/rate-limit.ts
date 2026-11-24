/**
 * Limiteur à fenêtre glissante : au plus `limit` appels acceptés par période de `windowMs`.
 * Sert à borner ce qu'un renderer (non fiable) peut écrire dans le journal local.
 */
export function createRateLimiter(
  limit: number,
  windowMs: number,
  now: () => number = Date.now,
): () => boolean {
  const accepted: number[] = []
  return () => {
    const current = now()
    while (accepted.length > 0 && current - (accepted[0] ?? 0) >= windowMs) accepted.shift()
    if (accepted.length >= limit) return false
    accepted.push(current)
    return true
  }
}
