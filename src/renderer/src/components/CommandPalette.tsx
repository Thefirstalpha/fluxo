import {
  ArrowLeftRight,
  Eye,
  History,
  Keyboard,
  Lock,
  Plus,
  Redo2,
  Search,
  Settings,
  Sparkles,
  SunMoon,
  Undo2,
} from 'lucide-react'
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useLocation } from 'wouter'
import type { ThemePreference } from '@shared/settings'
import { NAV_ITEMS, SETTINGS_PATH } from '../app/navigation'
import { useT } from '../i18n'
import { getApi } from '../lib/api'
import { cx } from '../lib/cx'
import { useFormatters } from '../lib/format'
import { useLedgerMutation, useLedgerQuery } from '../lib/ledger'
import { useRegisterStore } from '../stores/register'
import { useSettingsStore } from '../stores/settings'
import { Dialog } from './ui/Dialog'

interface PaletteCommand {
  id: string
  group: 'navigation' | 'actions' | 'transactions'
  label: string
  hint?: string
  icon: ReactNode
  run: () => void
}

const NEXT_THEME: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}

/** Palette de commandes (Ctrl/⌘ K) : navigation, actions rapides et recherche d'opérations. */
export function CommandPalette({
  onClose,
  onUndo,
  onRedo,
}: {
  onClose: () => void
  onUndo: () => void
  onRedo: () => void
}) {
  const t = useT()
  const fmt = useFormatters()
  const [, navigate] = useLocation()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const settings = useSettingsStore((state) => state.settings)
  const updateSettings = useSettingsStore((state) => state.update)
  const openRegister = useRegisterStore((state) => state.openRegister)
  const setQuickEntryOpen = useRegisterStore((state) => state.setQuickEntryOpen)
  const setShortcutsOpen = useRegisterStore((state) => state.setShortcutsOpen)
  const setAuditOpen = useRegisterStore((state) => state.setAuditOpen)
  const showToast = useRegisterStore((state) => state.showToast)
  const autoCategorize = useLedgerMutation('categorizeAutoRun')

  const trimmed = query.trim()
  const history = useLedgerQuery('ledgerHistoryStatus', {})
  const txSearch = useLedgerQuery(
    'transactionsList',
    { filter: { search: trimmed }, limit: 8 },
    { enabled: trimmed.length >= 2 },
  )

  const commands = useMemo<PaletteCommand[]>(() => {
    const q = trimmed.toLocaleLowerCase()
    const items: PaletteCommand[] = []

    for (const item of NAV_ITEMS) {
      const label = t.nav[item.key]
      const hint = item.milestone ? t.common.milestone(item.milestone) : undefined
      if (!q || label.toLocaleLowerCase().includes(q)) {
        const Icon = item.icon
        items.push({
          id: `nav:${item.key}`,
          group: 'navigation',
          label,
          hint,
          icon: <Icon size={15} aria-hidden className="text-muted" />,
          run: () => {
            onClose()
            navigate(item.path)
          },
        })
      }
    }
    if (!q || t.nav.settings.toLocaleLowerCase().includes(q)) {
      items.push({
        id: 'nav:settings',
        group: 'navigation',
        label: t.nav.settings,
        icon: <Settings size={15} aria-hidden className="text-muted" />,
        run: () => {
          onClose()
          navigate(SETTINGS_PATH)
        },
      })
    }

    const actions: PaletteCommand[] = [
      {
        id: 'act:new-tx',
        group: 'actions',
        label: t.commandPalette.actions.newTransaction,
        hint: getApi().platform === 'darwin' ? '⌘N' : 'Ctrl N',
        icon: <Plus size={15} aria-hidden className="text-pink" />,
        run: () => {
          onClose()
          setQuickEntryOpen(true)
        },
      },
      ...(history.data?.canUndo
        ? [
            {
              id: 'act:undo',
              group: 'actions' as const,
              label: t.commandPalette.actions.undo,
              hint: getApi().platform === 'darwin' ? '⌘Z' : 'Ctrl Z',
              icon: <Undo2 size={15} aria-hidden className="text-muted" />,
              run: () => {
                onClose()
                onUndo()
              },
            },
          ]
        : []),
      ...(history.data?.canRedo
        ? [
            {
              id: 'act:redo',
              group: 'actions' as const,
              label: t.commandPalette.actions.redo,
              hint: getApi().platform === 'darwin' ? '⌘⇧Z' : 'Ctrl Maj Z',
              icon: <Redo2 size={15} aria-hidden className="text-muted" />,
              run: () => {
                onClose()
                onRedo()
              },
            },
          ]
        : []),
      {
        id: 'act:auto-categorize',
        group: 'actions',
        label: t.commandPalette.actions.autoCategorize,
        icon: <Sparkles size={15} aria-hidden className="text-pink" />,
        run: () => {
          onClose()
          void autoCategorize.mutateAsync({}).then((res) => {
            showToast(
              t.categorization.queue.autoSummary(
                res.evaluatedCount,
                res.autoAppliedCount,
                res.queuedCount,
                res.durationMs,
              ),
            )
            navigate('/categorization')
          })
        },
      },
      {
        id: 'act:audit',
        group: 'actions',
        label: t.commandPalette.actions.auditLog,
        icon: <History size={15} aria-hidden className="text-muted" />,
        run: () => {
          onClose()
          setAuditOpen(true)
        },
      },
      {
        id: 'act:hide-amounts',
        group: 'actions',
        label: t.commandPalette.actions.toggleAmounts,
        icon: <Eye size={15} aria-hidden className="text-muted" />,
        run: () => {
          onClose()
          void updateSettings({ hideAmounts: !settings.hideAmounts })
        },
      },
      {
        id: 'act:theme',
        group: 'actions',
        label: t.commandPalette.actions.cycleTheme,
        hint: t.theme[settings.theme],
        icon: <SunMoon size={15} aria-hidden className="text-muted" />,
        run: () => {
          onClose()
          void updateSettings({ theme: NEXT_THEME[settings.theme] })
        },
      },
      {
        id: 'act:shortcuts',
        group: 'actions',
        label: t.commandPalette.actions.shortcuts,
        hint: '?',
        icon: <Keyboard size={15} aria-hidden className="text-muted" />,
        run: () => {
          onClose()
          setShortcutsOpen(true)
        },
      },
      {
        id: 'act:lock',
        group: 'actions',
        label: t.commandPalette.actions.lockVault,
        icon: <Lock size={15} aria-hidden className="text-muted" />,
        run: () => {
          onClose()
          void getApi().vault.lock()
        },
      },
    ]
    for (const action of actions) {
      if (!q || action.label.toLocaleLowerCase().includes(q)) items.push(action)
    }

    if (trimmed.length >= 2 && txSearch.data) {
      for (const row of txSearch.data.rows) {
        items.push({
          id: `tx:${row.id}`,
          group: 'transactions',
          label: `${row.label}${row.payee ? ` · ${row.payee}` : ''}`,
          hint: `${fmt.date(row.bookingDate)} · ${fmt.money(row.amount, { signed: true, currency: row.currency })}`,
          icon: <ArrowLeftRight size={15} aria-hidden className="text-teal" />,
          run: () => {
            onClose()
            openRegister({ search: trimmed }, row.id)
            navigate('/transactions')
          },
        })
      }
    }

    return items
  }, [
    trimmed,
    t,
    history.data,
    txSearch.data,
    settings.hideAmounts,
    settings.theme,
    fmt,
    onClose,
    navigate,
    setQuickEntryOpen,
    onUndo,
    onRedo,
    setAuditOpen,
    updateSettings,
    setShortcutsOpen,
    openRegister,
    showToast,
    autoCategorize,
  ])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (commands.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % commands.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (index - 1 + commands.length) % commands.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      commands[activeIndex]?.run()
    }
  }

  let lastGroup: PaletteCommand['group'] | null = null

  return (
    <Dialog title={t.commandPalette.title} onClose={onClose} size="md">
      <div onKeyDown={onKeyDown} className="space-y-3">
        <div className="flex items-center gap-2 rounded-md border border-border-strong bg-surface-2 px-3">
          <Search size={15} aria-hidden className="shrink-0 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            placeholder={t.commandPalette.placeholder}
            aria-label={t.commandPalette.title}
            autoFocus
            className="h-10 w-full bg-transparent text-sm text-fg outline-none placeholder:text-muted"
          />
        </div>

        {commands.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{t.commandPalette.empty}</p>
        ) : (
          <ul
            role="listbox"
            aria-label={t.commandPalette.title}
            className="max-h-80 overflow-y-auto"
          >
            {commands.map((command, index) => {
              const showHeader = command.group !== lastGroup
              lastGroup = command.group
              const selected = index === activeIndex
              return (
                <li key={command.id}>
                  {showHeader ? (
                    <p className="px-2 pt-2.5 pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase first:pt-0">
                      {t.commandPalette.groups[command.group]}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={command.run}
                    className={cx(
                      'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                      selected ? 'fx-frame text-fg' : 'text-fg-2 hover:bg-surface-2 hover:text-fg',
                    )}
                  >
                    {command.icon}
                    <span className="min-w-0 flex-1 truncate">{command.label}</span>
                    {command.hint ? (
                      <span className="shrink-0 text-xs text-muted tabular-nums">
                        {command.hint}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Dialog>
  )
}
