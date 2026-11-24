import { Eye, EyeOff, Lock, Moon, Search, Sun, SunMoon } from 'lucide-react'
import type { ThemePreference } from '@shared/settings'
import { LogoMark, Wordmark } from '../components/Logo'
import { Button } from '../components/ui/Button'
import { useT } from '../i18n'
import { getApi } from '../lib/api'
import { useRegisterStore } from '../stores/register'
import { useSettingsStore } from '../stores/settings'

const NEXT_THEME: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}
const THEME_ICON = { system: SunMoon, light: Sun, dark: Moon } as const

/** Barre de titre intégrée (zone de déplacement), façon éditeur de code. */
export function TitleBar() {
  const t = useT()
  const theme = useSettingsStore((state) => state.settings.theme)
  const hideAmounts = useSettingsStore((state) => state.settings.hideAmounts)
  const update = useSettingsStore((state) => state.update)
  const ThemeIcon = THEME_ICON[theme]
  const shortcut = getApi().platform === 'darwin' ? '⌘K' : 'Ctrl K'

  return (
    <header className="fx-titlebar flex shrink-0 items-center gap-4 border-b border-border bg-titlebar pl-3">
      <div className="flex items-center gap-2">
        <LogoMark size={22} />
        <Wordmark className="pt-0.5 text-[22px]" />
      </div>

      <div className="flex min-w-0 flex-1 justify-center">
        <button
          type="button"
          title={t.titleBar.searchSoon}
          onClick={() => useRegisterStore.getState().setCommandPaletteOpen(true)}
          className="fx-no-drag flex h-7 w-full max-w-md items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 text-xs text-fg-2 transition-colors hover:border-border-strong hover:text-fg"
        >
          <Search size={14} aria-hidden className="text-muted" />
          <span className="flex-1 text-left">{t.titleBar.search}</span>
          <kbd className="rounded border border-border px-1.5 font-sans text-[10px] text-muted">
            {shortcut}
          </kbd>
        </button>
      </div>

      <div className="fx-no-drag flex items-center gap-0.5 pr-2">
        <Button
          variant="ghost"
          iconOnly
          aria-pressed={hideAmounts}
          aria-label={hideAmounts ? t.titleBar.showAmounts : t.titleBar.hideAmounts}
          title={hideAmounts ? t.titleBar.showAmounts : t.titleBar.hideAmounts}
          onClick={() => void update({ hideAmounts: !hideAmounts })}
          className="h-7 w-7"
        >
          {hideAmounts ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
        </Button>
        <Button
          variant="ghost"
          iconOnly
          aria-label={t.titleBar.theme(t.theme[theme])}
          title={t.titleBar.theme(t.theme[theme])}
          onClick={() => void update({ theme: NEXT_THEME[theme] })}
          className="h-7 w-7"
        >
          <ThemeIcon size={16} aria-hidden />
        </Button>
        <Button
          variant="ghost"
          iconOnly
          aria-label={t.vault.lock}
          title={t.vault.lock}
          onClick={() => void getApi().vault.lock()}
          className="h-7 w-7"
        >
          <Lock size={16} aria-hidden />
        </Button>
      </div>
    </header>
  )
}
