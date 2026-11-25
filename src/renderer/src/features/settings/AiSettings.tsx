import { Download, KeyRound, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useId, useState } from 'react'
import { formatMicroUsd } from '@shared/documents/ai'
import {
  AI_LOCAL_MODES,
  AI_PROVIDERS,
  ANTHROPIC_MODELS,
  GOOGLE_MODELS,
  OCR_LANGUAGES,
  type AiConfigPublic,
  type AiSendLogEntry,
  type OcrLanguage,
} from '@shared/documents/model'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { SelectField, TextField, INPUT_CLASS } from '../../components/ui/Field'
import { Switch } from '../../components/ui/Switch'
import { useT } from '../../i18n'
import { getApi } from '../../lib/api'
import { cx } from '../../lib/cx'

/** Paramètres Documents, OCR local et assistance IA optionnelle (M7). */
export function AiSettings() {
  const t = useT()
  const sa = t.settingsAi
  const keyInputId = useId()

  const [config, setConfig] = useState<AiConfigPublic | null>(null)
  const [logs, setLogs] = useState<AiSendLogEntry[]>([])
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [endpointDraft, setEndpointDraft] = useState('')
  const [localModelDraft, setLocalModelDraft] = useState('')
  const [capUsdDraft, setCapUsdDraft] = useState('')
  const [busyOcr, setBusyOcr] = useState<OcrLanguage | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const api = getApi().documents
    const [cfg, sendLogs] = await Promise.all([api.aiConfig(), api.aiSendLogList()])
    setConfig(cfg)
    setEndpointDraft(cfg.localEndpoint)
    setLocalModelDraft(cfg.localModel)
    setCapUsdDraft((cfg.monthlyCapMicroUsd / 1_000_000).toFixed(2))
    setLogs(sendLogs)
  }, [])

  useEffect(() => {
    let active = true
    const api = getApi().documents
    Promise.all([api.aiConfig(), api.aiSendLogList()])
      .then(([cfg, sendLogs]) => {
        if (!active) return
        setConfig(cfg)
        setEndpointDraft(cfg.localEndpoint)
        setLocalModelDraft(cfg.localModel)
        setCapUsdDraft((cfg.monthlyCapMicroUsd / 1_000_000).toFixed(2))
        setLogs(sendLogs)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  const patchConfig = async (
    patch: Parameters<ReturnType<typeof getApi>['documents']['aiUpdateConfig']>[0],
  ) => {
    setError(null)
    setNotice(null)
    try {
      const next = await getApi().documents.aiUpdateConfig(patch)
      setConfig(next)
      setNotice(sa.saved)
    } catch {
      setError(t.documents.errors['network-error'])
    }
  }

  const handleSaveKey = async (provider: 'anthropic' | 'google') => {
    if (!apiKeyDraft.trim()) return
    setError(null)
    setNotice(null)
    try {
      const res = await getApi().documents.aiSetApiKey(apiKeyDraft.trim(), provider)
      setConfig(res.config)
      setApiKeyDraft('')
      if (!res.ok) setError(t.documents.errors['missing-key'])
      else setNotice(sa.apiKeyStored)
    } catch {
      setError(t.documents.errors['missing-key'])
    }
  }

  const handleDownloadOcr = async (lang: OcrLanguage) => {
    setBusyOcr(lang)
    setError(null)
    try {
      const res = await getApi().documents.downloadOcrLanguage(lang)
      if (!res.ok) setError(t.documents.errors[res.reason])
      await reload()
    } finally {
      setBusyOcr(null)
    }
  }

  if (!config) return null

  return (
    <Card title={sa.title} subtitle={sa.description}>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={sa.providerLabel}
            value={config.provider}
            options={AI_PROVIDERS.map((p) => ({ value: p, label: sa.providers[p] }))}
            onChange={(provider) => void patchConfig({ provider })}
          />

          {config.provider === 'local' ? (
            <SelectField
              label={sa.localModeLabel}
              value={config.localMode}
              options={AI_LOCAL_MODES.map((m) => ({ value: m, label: sa.localModes[m] }))}
              onChange={(localMode) => void patchConfig({ localMode })}
            />
          ) : null}

          {config.provider === 'google' ? (
            <SelectField
              label={sa.googleModelLabel}
              value={config.googleModel}
              options={GOOGLE_MODELS.map((m) => ({ value: m, label: m }))}
              onChange={(googleModel) => void patchConfig({ googleModel })}
            />
          ) : null}

          {config.provider === 'anthropic' ? (
            <SelectField
              label={sa.anthropicModelLabel}
              value={config.anthropicModel}
              options={ANTHROPIC_MODELS.map((m) => ({ value: m, label: m }))}
              onChange={(anthropicModel) => void patchConfig({ anthropicModel })}
            />
          ) : null}
        </div>

        {config.provider !== 'none' ? (
          <div className="rounded-lg border border-border bg-surface-2 px-3">
            <Switch
              checked={config.autoAnalyzeDocuments}
              label={sa.autoAnalyzeLabel}
              description={sa.autoAnalyzeHint}
              onChange={(autoAnalyzeDocuments) => void patchConfig({ autoAnalyzeDocuments })}
            />
          </div>
        ) : null}

        {config.provider === 'local' && config.localMode === 'ollama' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label={sa.localEndpointLabel}
              value={endpointDraft}
              onChange={setEndpointDraft}
              onBlur={() => {
                if (endpointDraft !== config.localEndpoint) {
                  void patchConfig({ localEndpoint: endpointDraft.trim() })
                }
              }}
            />
            <TextField
              label={sa.localModelLabel}
              value={localModelDraft}
              onChange={setLocalModelDraft}
              onBlur={() => {
                if (localModelDraft.trim() && localModelDraft !== config.localModel) {
                  void patchConfig({ localModel: localModelDraft.trim() })
                }
              }}
            />
          </div>
        ) : null}

        {config.provider === 'anthropic' || config.provider === 'google' ? (
          <div className="space-y-3 rounded-lg border border-border bg-surface-2 p-3">
            {(() => {
              const cloudProvider = config.provider === 'google' ? 'google' : 'anthropic'
              const hasKey =
                cloudProvider === 'google' ? config.hasGoogleKey : config.hasAnthropicKey
              return (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label htmlFor={keyInputId} className="text-sm font-medium text-fg">
                      {cloudProvider === 'google' ? sa.googleApiKeyLabel : sa.apiKeyLabel}
                    </label>
                    <Badge tone={hasKey ? 'accent' : 'neutral'}>
                      {hasKey ? sa.apiKeyStored : sa.apiKeyMissing}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      id={keyInputId}
                      type="password"
                      autoComplete="off"
                      placeholder={
                        cloudProvider === 'google'
                          ? sa.googleApiKeyPlaceholder
                          : sa.apiKeyPlaceholder
                      }
                      value={apiKeyDraft}
                      onChange={(e) => setApiKeyDraft(e.target.value)}
                      className={cx(INPUT_CLASS, 'flex-1 border-border-strong')}
                    />
                    <Button variant="primary" onClick={() => void handleSaveKey(cloudProvider)}>
                      <KeyRound size={14} aria-hidden />
                      {sa.saveKey}
                    </Button>
                    {hasKey ? (
                      <Button
                        onClick={() => {
                          void getApi().documents.aiClearApiKey(cloudProvider).then(setConfig)
                        }}
                      >
                        <Trash2 size={14} aria-hidden />
                        {sa.clearKey}
                      </Button>
                    ) : null}
                  </div>
                </>
              )
            })()}

            <div className="flex flex-wrap items-end gap-3">
              <div style={{ width: '160px' }}>
                <TextField
                  label={sa.monthlyCapLabel}
                  value={capUsdDraft}
                  onChange={setCapUsdDraft}
                  onBlur={() => {
                    const usd = Number.parseFloat(capUsdDraft.replace(',', '.'))
                    if (Number.isFinite(usd) && usd >= 0) {
                      void patchConfig({ monthlyCapMicroUsd: Math.round(usd * 1_000_000) })
                    }
                  }}
                />
              </div>
              <p className="pb-2 text-xs text-muted tabular-nums">
                {sa.monthlySpendSummary(
                  formatMicroUsd(config.spentThisMonthMicroUsd),
                  formatMicroUsd(config.monthlyCapMicroUsd),
                )}
              </p>
            </div>
          </div>
        ) : null}

        <div className="space-y-2 border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-fg">{sa.ocrTitle}</h3>
          <p className="text-xs text-muted">{sa.ocrHint}</p>
          <div className="flex flex-wrap gap-3">
            {OCR_LANGUAGES.map((lang) => {
              const st = config.ocrLanguages[lang]
              const kb = Math.round((st.installed ? st.sizeBytes : st.expectedBytes) / 1024)
              return (
                <div
                  key={lang}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs"
                >
                  <span className="font-semibold uppercase text-fg">{lang}</span>
                  <span className="text-muted">
                    {st.installed ? sa.ocrInstalled(kb) : `${sa.ocrMissing} (${kb} Ko)`}
                  </span>
                  {st.installed ? (
                    <Button
                      onClick={() => {
                        void getApi()
                          .documents.removeOcrLanguage(lang)
                          .then(() => reload())
                      }}
                    >
                      {sa.ocrRemove}
                    </Button>
                  ) : (
                    <Button
                      disabled={busyOcr !== null}
                      onClick={() => void handleDownloadOcr(lang)}
                    >
                      <Download size={14} aria-hidden />
                      {busyOcr === lang ? t.documents.ocrInstalling : sa.ocrDownload}
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-fg">{sa.logsTitle}</h3>
          {logs.length === 0 ? (
            <p className="text-xs text-muted">{sa.logsEmpty}</p>
          ) : (
            <ul className="space-y-1 text-xs text-fg-2">
              {logs.slice(0, 8).map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5"
                >
                  <span>
                    {entry.createdAt.slice(0, 16).replace('T', ' ')} · {entry.model} ·{' '}
                    {entry.purpose}
                  </span>
                  <span className="tabular-nums">
                    {entry.inputTokens + entry.outputTokens} tok ·{' '}
                    {formatMicroUsd(entry.costMicroUsd)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

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
      </div>
    </Card>
  )
}
