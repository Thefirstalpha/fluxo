import { useId } from 'react'
import { cx } from '../lib/cx'

/**
 * Emblème Fluxo : un soleil couchant à rayures sur une vague (« flux »).
 * Création originale — aucun élément de marque tierce. Même dessin que build/icon.svg.
 */
export function LogoMark({ size = 24, title }: { size?: number; title?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const sun = `fx-sun-${id}`
  const sea = `fx-sea-${id}`
  const clip = `fx-clip-${id}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={sun} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFD166" />
          <stop offset="0.45" stopColor="#FF7A3D" />
          <stop offset="0.8" stopColor="#FF3D8B" />
          <stop offset="1" stopColor="#B24BF3" />
        </linearGradient>
        <linearGradient id={sea} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2DE2E6" />
          <stop offset="1" stopColor="#3D8BFF" />
        </linearGradient>
        <clipPath id={clip}>
          <circle cx="32" cy="28" r="17" />
        </clipPath>
      </defs>
      <rect width="64" height="64" rx="15" fill="#141414" />
      <g clipPath={`url(#${clip})`}>
        <rect x="15" y="11" width="34" height="34" fill={`url(#${sun})`} />
        <rect x="15" y="30" width="34" height="1.6" fill="#141414" />
        <rect x="15" y="34" width="34" height="2.2" fill="#141414" />
        <rect x="15" y="38.6" width="34" height="2.8" fill="#141414" />
        <rect x="15" y="43.6" width="34" height="3.4" fill="#141414" />
      </g>
      <path
        d="M11 50.5c5.3-4.6 10.7-4.6 16 0s10.7 4.6 16 0c3.3-2.9 6.7-3.8 10-2.6"
        fill="none"
        stroke={`url(#${sea})`}
        strokeWidth="3.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={cx('fx-display fx-gradient-text', className)}>Fluxo</span>
}
