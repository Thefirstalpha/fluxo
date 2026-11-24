import { useId } from 'react'
import { cx } from '../lib/cx'

/**
 * Emblème Fluxo : le F de Fluxo en grand, rempli d'un dégradé coucher de soleil et
 * traversé de bandes sombres façon horizon. Création originale — aucun élément de
 * marque tierce. Même dessin que build/icon.svg.
 */
export function LogoMark({ size = 24, title }: { size?: number; title?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const fill = `fx-fill-${id}`
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
        <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFD166" />
          <stop offset="0.45" stopColor="#FF7A3D" />
          <stop offset="0.8" stopColor="#FF3D8B" />
          <stop offset="1" stopColor="#B24BF3" />
        </linearGradient>
        <clipPath id={clip}>
          <path d="M15,8 L49,8 L49,20 L27,20 L27,31 L45,31 L45,42 L27,42 L27,56 L15,56 Z" />
        </clipPath>
      </defs>
      <rect width="64" height="64" rx="15" fill="#141414" />
      <g clipPath={`url(#${clip})`}>
        <rect x="8" y="2" width="48" height="60" fill={`url(#${fill})`} />
        <rect x="8" y="35.0" width="48" height="1.8" fill="#141414" />
        <rect x="8" y="39.2" width="48" height="2.4" fill="#141414" />
        <rect x="8" y="44.0" width="48" height="3.0" fill="#141414" />
        <rect x="8" y="49.4" width="48" height="8" fill="#141414" />
      </g>
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={cx('fx-display fx-gradient-text', className)}>Fluxo</span>
}
