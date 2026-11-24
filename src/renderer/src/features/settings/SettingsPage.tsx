import { ExternalLink } from 'lucide-react'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { REPOSITORY_URL } from '@shared/app-meta'
import type { AppInfo } from '@shared/ipc'
import { CURRENCIES, LOCALES } from '@shared/settings'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/PageHeader'
import { Switch } from '../../components/ui/Switch'
import { LOCALE_LABELS, useT } from '../../i18n'
import { getApi } from '../../lib/api'
import { useSettingsStore } from '../../stores/settings'
import { ThemePicker } from './ThemePicker'
import { VaultSettings } from './VaultSettings'

function SelectField<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string
  hint?: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-fg">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const next = options.find((option) => option.value === event.target.value)
          if (next) onChange(next.value)
        }}
        className="h-9 w-full rounded-md border border-border-strong bg-surface-2 px-2.5 text-sm text-fg"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <p className="mt-1.5 text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="text-fg">{children}</dd>
    </>
  )
}

export default function SettingsPage() {
  const t = useT()
  const settings = useSettingsStore((state) => state.settings)
  const update = useSettingsStore((state) => state.update)
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    let active = true
    getApi()
      .app.getInfo()
      .then((value) => {
        if (active) setInfo(value)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  return (
    <>
      <PageHeader title={t.settings.title} subtitle={t.settings.subtitle} />
      <div className="grid max-w-4xl gap-4">
        <Card
          accent
          title={t.settings.appearance.title}
          subtitle={t.settings.appearance.description}
        >
          <ThemePicker value={settings.theme} onChange={(theme) => void update({ theme })} />
        </Card>

        <Card title={t.settings.region.title}>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={t.settings.region.language}
              value={settings.locale}
              options={LOCALES.map((locale) => ({ value: locale, label: LOCALE_LABELS[locale] }))}
              onChange={(locale) => void update({ locale })}
            />
            <SelectField
              label={t.settings.region.currency}
              hint={t.settings.region.currencyHint}
              value={settings.currency}
              options={CURRENCIES.map((currency) => ({ value: currency, label: currency }))}
              onChange={(currency) => void update({ currency })}
            />
          </div>
        </Card>

        <VaultSettings />

        <Card title={t.settings.privacy.title}>
          <div className="divide-y divide-border">
            <Switch
              checked={settings.hideAmounts}
              onChange={(hideAmounts) => void update({ hideAmounts })}
              label={t.settings.privacy.hideAmounts}
              description={t.settings.privacy.hideAmountsHint}
            />
            <Switch
              checked={settings.contentProtection}
              onChange={(contentProtection) => void update({ contentProtection })}
              label={t.settings.privacy.contentProtection}
              description={t.settings.privacy.contentProtectionHint}
            />
          </div>
        </Card>

        <Card title={t.settings.about.title} subtitle={t.settings.about.description}>
          <dl className="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[160px_1fr]">
            <InfoRow label={t.settings.about.version}>{info ? info.version : '—'}</InfoRow>
            <InfoRow label={t.settings.about.runtime}>
              {info
                ? `Electron ${info.electron} · Chromium ${info.chrome} · Node.js ${info.node} · ${info.platform}/${info.arch}`
                : '—'}
            </InfoRow>
            <InfoRow label={t.settings.about.sourceCode}>
              <Button onClick={() => void getApi().app.openExternal(REPOSITORY_URL)}>
                <ExternalLink size={14} aria-hidden />
                {t.settings.about.openRepository}
              </Button>
            </InfoRow>
          </dl>
        </Card>
      </div>
    </>
  )
}
