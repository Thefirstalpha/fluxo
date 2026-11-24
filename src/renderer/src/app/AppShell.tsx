import { useQueryClient } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { useCallback, useEffect, type ReactNode } from 'react'
import { useLocation } from 'wouter'
import { AuditLogDialog } from '../components/AuditLogDialog'
import { CommandPalette } from '../components/CommandPalette'
import { KeyboardShortcutsDialog } from '../components/KeyboardShortcutsDialog'
import { Button } from '../components/ui/Button'
import { QuickEntryDialog } from '../features/transactions/QuickEntryDialog'
import { useT } from '../i18n'
import { getApi } from '../lib/api'
import { callLedger, ledgerErrorCode } from '../lib/ledger'
import { useRegisterStore } from '../stores/register'
import { useVaultStore } from '../stores/vault'
import { Sidebar } from './Sidebar'
import { StatusBar } from './StatusBar'
import { TitleBar } from './TitleBar'

/** Bandeau du mode démonstration : impossible de le confondre avec le coffre réel. */
function DemoBanner() {
  const t = useT()
  return (
    <div
      role="status"
      className="fx-frame flex shrink-0 items-center gap-3 border-x-0 px-4 py-2 text-sm text-fg"
    >
      <Sparkles size={15} aria-hidden className="shrink-0 text-pink" />
      <span className="min-w-0 flex-1">{t.vault.demo.banner}</span>
      <Button onClick={() => void getApi().vault.exitDemo()}>{t.vault.demo.exit}</Button>
    </div>
  )
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

export function AppShell({ children }: { children: ReactNode }) {
  const t = useT()
  const client = useQueryClient()
  const [location, navigate] = useLocation()
  const demo = useVaultStore((state) => state.status?.demo ?? false)

  const commandPaletteOpen = useRegisterStore((state) => state.commandPaletteOpen)
  const quickEntryOpen = useRegisterStore((state) => state.quickEntryOpen)
  const shortcutsOpen = useRegisterStore((state) => state.shortcutsOpen)
  const auditOpen = useRegisterStore((state) => state.auditOpen)
  const toast = useRegisterStore((state) => state.toast)
  const setCommandPaletteOpen = useRegisterStore((state) => state.setCommandPaletteOpen)
  const setQuickEntryOpen = useRegisterStore((state) => state.setQuickEntryOpen)
  const setShortcutsOpen = useRegisterStore((state) => state.setShortcutsOpen)
  const setAuditOpen = useRegisterStore((state) => state.setAuditOpen)
  const showToast = useRegisterStore((state) => state.showToast)
  const openRegister = useRegisterStore((state) => state.openRegister)

  const runHistory = useCallback(
    async (direction: 'undo' | 'redo') => {
      try {
        await callLedger(direction === 'undo' ? 'ledgerUndo' : 'ledgerRedo', {})
        await client.invalidateQueries({ queryKey: ['ledger'] })
        showToast(direction === 'undo' ? t.transactions.undone : t.transactions.redone)
      } catch (failure) {
        const code = ledgerErrorCode(failure)
        if (code !== 'nothing-to-undo') showToast(t.ledger.errors[code], 'error')
      }
    },
    [client, showToast, t],
  )

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => useRegisterStore.setState({ toast: null }), 3_500)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()

      if (mod && key === 'k') {
        event.preventDefault()
        setCommandPaletteOpen(!useRegisterStore.getState().commandPaletteOpen)
        return
      }
      if (mod && key === 'n') {
        event.preventDefault()
        setQuickEntryOpen(true)
        return
      }
      if (isEditableTarget(event.target)) return

      if (mod && key === 'z') {
        event.preventDefault()
        void runHistory(event.shiftKey ? 'redo' : 'undo')
        return
      }
      if (mod && key === 'y') {
        event.preventDefault()
        void runHistory('redo')
        return
      }
      if (event.key === '?' && !document.querySelector('dialog[open]')) {
        event.preventDefault()
        setShortcutsOpen(true)
        return
      }
      if (
        event.key === '/' &&
        location === '/transactions' &&
        !document.querySelector('dialog[open]')
      ) {
        const search = document.querySelector<HTMLInputElement>('main input[type="search"]')
        if (search) {
          event.preventDefault()
          search.focus()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [location, runHistory, setCommandPaletteOpen, setQuickEntryOpen, setShortcutsOpen])

  return (
    <div className="flex h-full flex-col bg-bg">
      <TitleBar />
      {demo ? <DemoBanner /> : null}
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1360px] px-8 py-7">
            {toast ? (
              <div
                role={toast.tone === 'error' ? 'alert' : 'status'}
                className={
                  toast.tone === 'error'
                    ? 'mb-4 rounded-lg border border-expense bg-surface px-4 py-2 text-sm text-expense'
                    : 'fx-frame mb-4 rounded-lg px-4 py-2 text-sm text-fg'
                }
              >
                {toast.message}
              </div>
            ) : null}
            {children}
          </div>
        </main>
      </div>
      <StatusBar />

      {commandPaletteOpen ? (
        <CommandPalette
          onClose={() => setCommandPaletteOpen(false)}
          onUndo={() => void runHistory('undo')}
          onRedo={() => void runHistory('redo')}
        />
      ) : null}
      {quickEntryOpen ? (
        <QuickEntryDialog
          onClose={() => setQuickEntryOpen(false)}
          onCreated={(id, message) => {
            showToast(message)
            openRegister({}, id)
            if (location !== '/transactions') navigate('/transactions')
          }}
        />
      ) : null}
      {shortcutsOpen ? <KeyboardShortcutsDialog onClose={() => setShortcutsOpen(false)} /> : null}
      {auditOpen ? <AuditLogDialog onClose={() => setAuditOpen(false)} /> : null}
    </div>
  )
}
