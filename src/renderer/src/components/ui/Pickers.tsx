import { LEDGER_ICONS, PALETTE, type LedgerIcon, type PaletteColor } from '@shared/ledger/model'
import { useT } from '../../i18n'
import { cx } from '../../lib/cx'
import { LEDGER_ICON_COMPONENTS, paletteVar } from '../../lib/ledger-visual'

/** Couleur parmi les emplacements de la palette validée (groupe de boutons radio). */
export function ColorPicker({
  name,
  value,
  onChange,
}: {
  name: string
  value: PaletteColor | null
  onChange: (value: PaletteColor | null) => void
}) {
  const t = useT()
  const p = t.ledger.pickers
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-fg">{p.color}</legend>
      <div className="flex flex-wrap gap-2">
        <Swatch
          name={name}
          label={p.noColor}
          checked={value === null}
          onSelect={() => onChange(null)}
          tint="var(--fx-surface-3)"
        />
        {PALETTE.map((color, index) => (
          <Swatch
            key={color}
            name={name}
            label={p.colorName(index + 1)}
            checked={value === color}
            onSelect={() => onChange(color)}
            tint={paletteVar(color)}
          />
        ))}
      </div>
    </fieldset>
  )
}

function Swatch({
  name,
  label,
  checked,
  onSelect,
  tint,
}: {
  name: string
  label: string
  checked: boolean
  onSelect: () => void
  tint: string
}) {
  return (
    <label
      title={label}
      className={cx(
        'flex size-8 cursor-pointer items-center justify-center rounded-full border-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-pink',
        checked ? 'border-fg' : 'border-transparent',
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        aria-label={label}
        className="sr-only"
      />
      <span aria-hidden className="size-5 rounded-full" style={{ backgroundColor: tint }} />
    </label>
  )
}

/** Icône parmi la liste fermée ; `fallback` est cochée quand aucune n'est choisie. */
export function IconPicker({
  name,
  value,
  fallback,
  onChange,
}: {
  name: string
  value: LedgerIcon | null
  fallback: LedgerIcon
  onChange: (value: LedgerIcon) => void
}) {
  const t = useT()
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-fg">{t.ledger.pickers.icon}</legend>
      <div className="flex flex-wrap gap-1.5">
        {LEDGER_ICONS.map((icon) => {
          const Icon = LEDGER_ICON_COMPONENTS[icon]
          const checked = (value ?? fallback) === icon
          return (
            <label
              key={icon}
              title={t.ledger.icons[icon]}
              className={cx(
                'flex size-9 cursor-pointer items-center justify-center rounded-md border has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-pink',
                checked ? 'fx-frame text-pink' : 'border-border text-fg-2 hover:text-fg',
              )}
            >
              <input
                type="radio"
                name={name}
                value={icon}
                checked={checked}
                onChange={() => onChange(icon)}
                aria-label={t.ledger.icons[icon]}
                className="sr-only"
              />
              <Icon size={16} aria-hidden />
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
