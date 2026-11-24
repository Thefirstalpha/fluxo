import type { LedgerIcon, PaletteColor } from '@shared/ledger/model'
import { LEDGER_ICON_COMPONENTS, paletteVar } from '../lib/ledger-visual'

/** Pastille d'icône colorée (décorative : le nom du compte ou de la catégorie est toujours écrit). */
export function LedgerBadge({
  icon,
  color,
  fallback,
  size = 32,
}: {
  icon: LedgerIcon | null
  color: PaletteColor | null
  fallback: LedgerIcon
  size?: number
}) {
  const Icon = LEDGER_ICON_COMPONENTS[icon ?? fallback]
  const tint = paletteVar(color)
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-lg"
      style={{
        width: size,
        height: size,
        color: tint,
        backgroundColor: `color-mix(in srgb, ${tint} 14%, transparent)`,
      }}
    >
      <Icon size={Math.round(size * 0.5)} />
    </span>
  )
}
