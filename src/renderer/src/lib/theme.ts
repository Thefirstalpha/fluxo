import { useSyncExternalStore } from 'react'
import type { ResolvedTheme } from '@shared/settings'

/**
 * Le process main règle `nativeTheme.themeSource` selon la préférence (système/clair/sombre),
 * ce qui fait basculer `prefers-color-scheme`. Le renderer n'a donc qu'à suivre cette media query.
 */
function subscribeTo(query: string) {
  return (onChange: () => void): (() => void) => {
    const media = window.matchMedia(query)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }
}

const DARK_QUERY = '(prefers-color-scheme: dark)'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const subscribeDark = subscribeTo(DARK_QUERY)
const subscribeReducedMotion = subscribeTo(REDUCED_MOTION_QUERY)

export function getResolvedTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribeDark, getResolvedTheme, () => 'light')
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  )
}
