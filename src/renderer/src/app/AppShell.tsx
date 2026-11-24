import { Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '../components/ui/Button'
import { useT } from '../i18n'
import { getApi } from '../lib/api'
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

export function AppShell({ children }: { children: ReactNode }) {
  const demo = useVaultStore((state) => state.status?.demo ?? false)
  return (
    <div className="flex h-full flex-col bg-bg">
      <TitleBar />
      {demo ? <DemoBanner /> : null}
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1360px] px-8 py-7">{children}</div>
        </main>
      </div>
      <StatusBar />
    </div>
  )
}
