import { Settings, type LucideIcon } from 'lucide-react'
import { Link, useLocation } from 'wouter'
import { useT } from '../i18n'
import { cx } from '../lib/cx'
import { isActivePath, NAV_ITEMS, SETTINGS_PATH } from './navigation'

function NavLink({
  href,
  icon: Icon,
  label,
  active,
  hint,
}: {
  href: string
  icon: LucideIcon
  label: string
  active: boolean
  hint?: string
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'group relative flex h-9 items-center gap-3 rounded-md px-3 text-[13px] font-medium transition-colors',
        active ? 'bg-surface-2 text-fg' : 'text-fg-2 hover:bg-surface-2 hover:text-fg',
      )}
    >
      {active ? (
        <span
          aria-hidden
          className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-[image:var(--fx-gradient-sunset)]"
        />
      ) : null}
      <Icon
        size={17}
        aria-hidden
        className={active ? 'text-pink' : 'text-muted group-hover:text-fg-2'}
      />
      <span className="flex-1 truncate">{label}</span>
      {hint ? <span className="text-[10px] font-semibold text-muted">{hint}</span> : null}
    </Link>
  )
}

export function Sidebar() {
  const t = useT()
  const [location] = useLocation()

  return (
    <nav
      aria-label={t.nav.main}
      className="flex w-56 shrink-0 flex-col border-r border-border px-2 py-3"
    >
      <ul className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <li key={item.key}>
            <NavLink
              href={item.path}
              icon={item.icon}
              label={t.nav[item.key]}
              active={isActivePath(location, item.path)}
              hint={item.milestone}
            />
          </li>
        ))}
      </ul>
      <div className="mt-auto border-t border-border pt-2">
        <NavLink
          href={SETTINGS_PATH}
          icon={Settings}
          label={t.nav.settings}
          active={isActivePath(location, SETTINGS_PATH)}
        />
      </div>
    </nav>
  )
}
