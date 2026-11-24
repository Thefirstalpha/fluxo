/** Concatène des classes CSS en ignorant les valeurs falsy. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
