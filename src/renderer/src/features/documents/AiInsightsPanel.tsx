import { Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AiConfigPublic, AiInsightsResult, AiSendPreview } from '@shared/documents/model'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { useT } from '../../i18n'
import { getApi } from '../../lib/api'
import { AiConsentDialog } from './AiConsentDialog'

export function AiInsightsPanel({ scope }: { scope: 'analytics' | 'planning' }) {
  const t = useT()
  const sa = t.settingsAi

  const [aiConfig, setAiConfig] = useState<AiConfigPublic | null>(null)
  const [preview, setPreview] = useState<AiSendPreview | null>(null)
  const [result, setResult] = useState<AiInsightsResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void getApi()
      .documents.aiConfig()
      .then(setAiConfig)
      .catch(() => undefined)
  }, [])

  if (!aiConfig || aiConfig.provider === 'none') return null

  const handlePreview = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await getApi().documents.aiPreviewInsights(scope)
      if (!res.ok) {
        if (res.reason !== 'empty') setError(t.documents.errors[res.reason])
        return
      }
      setPreview(res.preview)
    } finally {
      setBusy(false)
    }
  }

  const handleConfirm = async () => {
    if (!preview) return
    setBusy(true)
    setError(null)
    try {
      const res = await getApi().documents.aiExecuteInsights({
        previewToken: preview.token,
        consentConfirmed: true,
      })
      setPreview(null)
      if (!res.ok) {
        if (res.reason !== 'empty') setError(t.documents.errors[res.reason])
        return
      }
      setResult(res.insights)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card
        title={sa.insightsTitle}
        actions={
          <Button variant="primary" disabled={busy} onClick={() => void handlePreview()}>
            <Sparkles size={14} aria-hidden />
            {sa.insightsButton}
          </Button>
        }
      >
        {error ? (
          <p role="alert" className="text-xs font-medium text-expense">
            {error}
          </p>
        ) : null}
        {result ? (
          <div className="space-y-3 text-xs">
            <p className="text-sm text-fg">{result.summary}</p>
            {result.highlights.length > 0 ? (
              <div>
                <p className="font-semibold text-fg-2">{sa.insightsHighlights}</p>
                <ul className="mt-1 space-y-1 text-fg">
                  {result.highlights.map((h, i) => (
                    <li key={i}>• {h}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {result.warnings.length > 0 ? (
              <div>
                <p className="font-semibold text-expense">{sa.insightsWarnings}</p>
                <ul className="mt-1 space-y-1 text-fg">
                  {result.warnings.map((w, i) => (
                    <li key={i}>• {w}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {result.suggestions.length > 0 ? (
              <div>
                <p className="font-semibold text-income">{sa.insightsSuggestions}</p>
                <ul className="mt-1 space-y-1 text-fg">
                  {result.suggestions.map((s, i) => (
                    <li key={i}>• {s}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      {preview ? (
        <AiConsentDialog
          preview={preview}
          busy={busy}
          onConfirm={() => void handleConfirm()}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </>
  )
}
