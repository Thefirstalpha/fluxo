import { Moon, Sun, SunMoon, type LucideIcon } from 'lucide-react'
import type { ThemePreference } from '@shared/settings'
import { useT } from '../../i18n'
import { cx } from '../../lib/cx'

const OPTIONS: readonly { value: ThemePreference; icon: LucideIcon }[] = [
  { value: 'system', icon: SunMoon },
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
]

/** Miniature fidèle de l'interface dans un thème donné (couleurs fixes, indépendantes du thème actif). */
function Preview({ variant }: { variant: 'light' | 'dark' }) {
  const light = variant === 'light'
  return (
    <div className={cx('flex h-full flex-col', light ? 'bg-[#f8f8f8]' : 'bg-[#181818]')}>
      <div className={cx('h-2.5 border-b', light ? 'border-[#e5e5e5]' : 'border-[#2b2b2b]')} />
      <div className="flex flex-1 gap-1.5 p-1.5">
        <div className="flex w-5 flex-col gap-1">
          <span className="h-1 rounded-full bg-[linear-gradient(100deg,#ff5fa2,#ff8a3d)]" />
          <span className={cx('h-1 rounded-full', light ? 'bg-[#d4d4d4]' : 'bg-[#3c3c3c]')} />
          <span className={cx('h-1 rounded-full', light ? 'bg-[#d4d4d4]' : 'bg-[#3c3c3c]')} />
        </div>
        <div
          className={cx(
            'relative flex-1 overflow-hidden rounded border',
            light ? 'border-[#e5e5e5] bg-white' : 'border-[#2b2b2b] bg-[#1f1f1f]',
          )}
        >
          <span className="absolute inset-x-0 top-0 h-[2px] bg-[linear-gradient(100deg,#ffb347,#ff3d8b,#a970ff)]" />
          <div className="flex h-full items-end gap-1 p-1.5">
            {[40, 65, 50, 80, 60].map((height, index) => (
              <span
                key={index}
                className={cx('flex-1 rounded-t-sm', index % 2 ? 'bg-[#e26b1b]' : 'bg-[#10a89b]')}
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function ThemePicker({
  value,
  onChange,
}: {
  value: ThemePreference
  onChange: (value: ThemePreference) => void
}) {
  const t = useT()
  return (
    <div
      role="group"
      aria-label={t.settings.appearance.title}
      className="grid gap-3 sm:grid-cols-3"
    >
      {OPTIONS.map(({ value: option, icon: Icon }) => {
        const selected = option === value
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option)}
            className={cx(
              'rounded-xl p-2 text-left transition-shadow',
              selected
                ? 'fx-frame shadow-[0_0_0_4px_var(--fx-glow)]'
                : 'border border-border hover:border-border-strong',
            )}
          >
            <div className="h-20 overflow-hidden rounded-lg border border-border">
              {option === 'system' ? (
                <div className="grid h-full grid-cols-2">
                  <Preview variant="light" />
                  <Preview variant="dark" />
                </div>
              ) : (
                <Preview variant={option} />
              )}
            </div>
            <span className="mt-2 flex items-center gap-2 px-1 text-sm font-medium text-fg">
              <Icon size={15} aria-hidden className={selected ? 'text-pink' : 'text-muted'} />
              {t.theme[option]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
