import { Download, FolderOpen, HardDriveDownload, Trash2, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import type { BackupInfo } from '@shared/vault'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { PasswordField } from '../../components/ui/PasswordField'
import { Switch } from '../../components/ui/Switch'
import { useT } from '../../i18n'
import { getApi } from '../../lib/api'
import { useFormatters } from '../../lib/format'
import { useVaultStore } from '../../stores/vault'
import { failureMessage } from '../vault/messages'
import { RestoreFlow } from '../vault/RestoreFlow'

/** Section « Sauvegardes et données » : sauvegardes chiffrées, restauration, export, effacement. */
export function DataSettings() {
  const t = useT()
  const fmt = useFormatters()
  const d = t.settings.data
  const status = useVaultStore((state) => state.status)
  const [info, setInfo] = useState<BackupInfo | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [erasing, setErasing] = useState(false)
  const [confirmWord, setConfirmWord] = useState('')
  const [password, setPassword] = useState('')
  const confirmId = useId()
  const api = getApi().vault

  const refresh = useCallback(() => {
    api
      .backupInfo()
      .then(setInfo)
      .catch(() => setInfo(null))
  }, [api])

  useEffect(refresh, [refresh])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
    } catch {
      setError(t.vault.errors.generic)
    } finally {
      setBusy(false)
    }
  }

  const backupNow = () =>
    run(async () => {
      const result = await api.backupNow()
      if (result.ok) setNotice(d.backupDone(fmt.dateTime(result.createdAt)))
      else setError(failureMessage(t, result))
      refresh()
    })

  const chooseFolder = (reset: boolean) =>
    run(async () => {
      const result = reset ? await api.resetBackupDirectory() : await api.chooseBackupDirectory()
      if (result.ok) setInfo(result.info)
      else if (result.reason !== 'cancelled') setError(failureMessage(t, result))
    })

  const exportData = () =>
    run(async () => {
      const result = await api.exportData()
      if (result.ok) setNotice(d.exportDone(result.folderName, result.rows))
      else if (result.reason !== 'cancelled') setError(failureMessage(t, result))
    })

  const erase = (event: FormEvent) => {
    event.preventDefault()
    if (confirmWord.trim().toUpperCase() !== d.eraseConfirmWord) return
    void run(async () => {
      const result = await api.eraseAll(
        status?.mode === 'password' ? { currentPassword: password } : {},
      )
      if (!result.ok) setError(failureMessage(t, result))
    })
  }

  return (
    <Card title={d.title} subtitle={d.description}>
      <div className="grid gap-5">
        <section className="grid gap-2" aria-label={d.title}>
          <p className="text-sm text-fg">
            {info?.lastAutomaticAt
              ? d.lastAutomatic(fmt.dateTime(info.lastAutomaticAt))
              : d.noAutomatic}
          </p>
          {info ? (
            <p className="text-xs text-muted">
              {d.count(info.count)} · {d.folder} :{' '}
              <span className="font-mono break-all text-fg-2">{info.directory}</span>
              {info.isDefault ? ` (${d.folderDefault})` : null}
            </p>
          ) : null}
          {info && !info.portable ? (
            <p className="flex gap-2 text-xs text-fg-2">
              <TriangleAlert size={14} aria-hidden className="mt-0.5 shrink-0 text-orange" />
              {d.notPortable}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={busy} onClick={() => void backupNow()}>
              <HardDriveDownload size={14} aria-hidden />
              {d.backupNow}
            </Button>
            <Button disabled={busy} onClick={() => void chooseFolder(false)}>
              <FolderOpen size={14} aria-hidden />
              {d.chooseFolder}
            </Button>
            {info && !info.isDefault ? (
              <Button variant="ghost" disabled={busy} onClick={() => void chooseFolder(true)}>
                {d.defaultFolder}
              </Button>
            ) : null}
          </div>
          {info ? (
            <Switch
              checked={info.auto}
              onChange={(auto) => {
                void api
                  .setAutoBackup(auto)
                  .then(setInfo)
                  .catch(() => setError(t.vault.errors.generic))
              }}
              label={d.auto}
              description={d.autoHint}
            />
          ) : null}
        </section>

        <section className="grid gap-2 border-t border-border pt-4">
          {restoring ? (
            <RestoreFlow
              onClose={() => {
                setRestoring(false)
                refresh()
              }}
            />
          ) : (
            <Button className="justify-self-start" onClick={() => setRestoring(true)}>
              {d.restore}
            </Button>
          )}
        </section>

        <section className="grid gap-2 border-t border-border pt-4">
          <p className="text-xs text-muted">{d.exportHint}</p>
          <Button className="justify-self-start" disabled={busy} onClick={() => void exportData()}>
            <Download size={14} aria-hidden />
            {d.export}
          </Button>
        </section>

        {notice ? (
          <p role="status" className="text-sm text-income">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm font-medium text-expense">
            {error}
          </p>
        ) : null}

        <section
          className="grid gap-3 rounded-lg border border-expense/40 p-4"
          aria-labelledby={`${confirmId}-title`}
        >
          <h3 id={`${confirmId}-title`} className="text-sm font-semibold text-expense">
            {d.eraseTitle}
          </h3>
          <p className="text-xs text-fg-2">{d.eraseDescription}</p>
          {erasing ? (
            <form className="grid gap-3" onSubmit={erase} noValidate>
              <div>
                <label htmlFor={confirmId} className="mb-1.5 block text-sm font-medium text-fg">
                  {d.eraseConfirmLabel(d.eraseConfirmWord)}
                </label>
                <input
                  id={confirmId}
                  value={confirmWord}
                  onChange={(event) => setConfirmWord(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  className="h-9 w-48 rounded-md border border-border-strong bg-surface-2 px-2.5 font-mono text-sm text-fg uppercase"
                />
              </div>
              {status?.mode === 'password' ? (
                <PasswordField
                  label={t.settings.security.currentPassword}
                  value={password}
                  onChange={setPassword}
                  autoComplete="current-password"
                />
              ) : null}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy || confirmWord.trim().toUpperCase() !== d.eraseConfirmWord}
                  className="fx-btn bg-expense text-white disabled:opacity-50"
                >
                  <Trash2 size={14} aria-hidden />
                  {d.eraseButton}
                </button>
                <Button variant="ghost" onClick={() => setErasing(false)}>
                  {t.settings.security.cancel}
                </Button>
              </div>
            </form>
          ) : (
            <Button className="justify-self-start" onClick={() => setErasing(true)}>
              {d.erase}
            </Button>
          )}
        </section>
      </div>
    </Card>
  )
}
