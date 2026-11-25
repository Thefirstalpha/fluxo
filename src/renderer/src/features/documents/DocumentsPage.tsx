import { useQueryClient } from '@tanstack/react-query'
import { Download, FileScan, ShieldCheck, Upload } from 'lucide-react'
import { useCallback, useEffect, useState, type DragEvent } from 'react'
import type {
  AiConfigPublic,
  AiSendPreview,
  DocumentDetail,
  DocumentKind,
  DocumentListItem,
  DocumentStageOutcome,
  OcrLanguage,
} from '@shared/documents/model'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/PageHeader'
import { useT } from '../../i18n'
import { getApi } from '../../lib/api'
import { cx } from '../../lib/cx'
import { useLedgerQuery } from '../../lib/ledger'
import { AiConsentDialog } from './AiConsentDialog'
import { DocumentReviewPane } from './DocumentReviewPane'

export default function DocumentsPage() {
  const t = useT()
  const dt = t.documents
  const queryClient = useQueryClient()

  const accountsQuery = useLedgerQuery('accountsList', { includeArchived: true })
  const contractsQuery = useLedgerQuery('contractsList', { includeArchived: true })

  const [queue, setQueue] = useState<DocumentListItem[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [detail, setDetail] = useState<DocumentDetail | null>(null)
  const [aiConfig, setAiConfig] = useState<AiConfigPublic | null>(null)
  const [missingOcrLang, setMissingOcrLang] = useState<OcrLanguage | null>(null)
  const [aiPreview, setAiPreview] = useState<AiSendPreview | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshQueue = useCallback(async (preferId?: string) => {
    const api = getApi().documents
    const [items, cfg] = await Promise.all([api.list(), api.aiConfig()])
    setQueue(items)
    setAiConfig(cfg)
    const targetId = preferId ?? items[0]?.id ?? ''
    setSelectedId(targetId)
    if (targetId) {
      const full = await api.get(targetId)
      setDetail(full)
    } else {
      setDetail(null)
    }
  }, [])

  useEffect(() => {
    let active = true
    const api = getApi().documents
    Promise.all([api.list(), api.aiConfig()])
      .then(async ([items, cfg]) => {
        if (!active) return
        setQueue(items)
        setAiConfig(cfg)
        const targetId = items[0]?.id ?? ''
        setSelectedId(targetId)
        if (targetId) {
          const full = await api.get(targetId)
          if (active) setDetail(full)
        }
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  const selectDoc = async (docId: string) => {
    setSelectedId(docId)
    setError(null)
    const full = await getApi().documents.get(docId)
    setDetail(full)
  }

  const handleStageOutcome = async (res: DocumentStageOutcome) => {
    setBusy(false)
    if (!res.ok) {
      if (res.reason !== 'cancelled') setError(dt.errors[res.reason])
      return
    }
    setError(null)
    setMissingOcrLang(res.ocrMissingLanguage)
    if (res.duplicateOf) {
      setNotice(dt.duplicateNotice(res.duplicateOf.fileName))
    } else {
      setNotice(null)
    }
    await refreshQueue(res.document.id)
    setDetail(res.document)
  }

  const handlePickFile = async () => {
    setBusy(true)
    setError(null)
    const res = await getApi().documents.pickFile()
    await handleStageOutcome(res)
  }

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (!file) return
    setBusy(true)
    setError(null)
    const res = await getApi().documents.registerDroppedFile(file)
    await handleStageOutcome(res)
  }

  const handleInstallOcr = async () => {
    if (!missingOcrLang || !detail) return
    setBusy(true)
    setError(null)
    try {
      const dl = await getApi().documents.downloadOcrLanguage(missingOcrLang)
      if (!dl.ok) {
        setError(dt.errors[dl.reason])
        return
      }
      const rerun = await getApi().documents.rerunExtraction({
        documentId: detail.id,
        ocrLanguage: missingOcrLang,
      })
      await handleStageOutcome(rerun)
    } finally {
      setBusy(false)
    }
  }

  const handleAskAiAssist = async () => {
    if (!detail) return
    setBusy(true)
    setError(null)
    try {
      const res = await getApi().documents.aiPreviewAssist(detail.id)
      if (!res.ok) {
        setError(dt.errors[res.reason])
        return
      }
      setAiPreview(res.preview)
    } finally {
      setBusy(false)
    }
  }

  const handleConfirmAiAssist = async () => {
    if (!detail || !aiPreview) return
    setBusy(true)
    setError(null)
    try {
      const res = await getApi().documents.aiExecuteAssist({
        documentId: detail.id,
        previewToken: aiPreview.token,
        consentConfirmed: true,
      })
      setAiPreview(null)
      if (!res.ok) {
        setError(dt.errors[res.reason])
        return
      }
      setDetail(res.document)
      await refreshQueue(res.document.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title={dt.title} subtitle={dt.subtitle} />

      <Card accent>
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => void handleDrop(e)}
          className={cx(
            'flex flex-col items-center justify-center gap-3 rounded-xl border border-border-strong bg-surface-2 p-6 text-center',
            dragging && 'border-pink',
          )}
        >
          <Upload size={24} className="text-pink" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-medium text-fg">{dt.dropzoneTitle}</p>
            <p className="text-xs text-muted">{dt.dropzoneHint}</p>
          </div>
          <Button variant="primary" disabled={busy} onClick={() => void handlePickFile()}>
            <FileScan size={14} aria-hidden />
            {busy ? dt.analyzing : dt.chooseFile}
          </Button>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <ShieldCheck size={14} aria-hidden />
            {dt.privacyNote}
          </p>
        </div>
      </Card>

      {missingOcrLang && detail ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
          <span className="text-fg">{dt.ocrMissingBanner(missingOcrLang)}</span>
          <Button variant="primary" disabled={busy} onClick={() => void handleInstallOcr()}>
            <Download size={14} aria-hidden />
            {busy ? dt.ocrInstalling : dt.ocrInstallNow}
          </Button>
        </div>
      ) : null}

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

      {queue.length === 0 ? (
        <Card className="space-y-1 p-6 text-center">
          <p className="text-sm font-medium text-fg">{dt.emptyQueue}</p>
          <p className="text-xs text-muted">{dt.emptyQueueHint}</p>
        </Card>
      ) : (
        <>
          <Card title={dt.queueTitle}>
            <div className="flex flex-wrap gap-2">
              {queue.map((item) => {
                const selected = item.id === (detail?.id ?? selectedId)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void selectDoc(item.id)}
                    className={cx(
                      'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors',
                      selected
                        ? 'border-pink bg-surface-2 text-fg'
                        : 'border-border bg-surface text-fg-2',
                    )}
                  >
                    <span className="font-medium">{item.fileName}</span>
                    <Badge tone={item.status === 'needs_review' ? 'accent' : 'neutral'}>
                      {dt.statuses[item.status]}
                    </Badge>
                    <span className="text-muted">{dt.kinds[item.kind]}</span>
                  </button>
                )
              })}
            </div>
          </Card>

          {detail ? (
            <DocumentReviewPane
              key={`${detail.id}-${detail.updatedAt}`}
              detail={detail}
              aiConfig={aiConfig}
              contracts={contractsQuery.data ?? []}
              accounts={accountsQuery.data ?? []}
              busy={busy}
              onRerunExtraction={(kindOverride: DocumentKind) => {
                setBusy(true)
                void getApi()
                  .documents.rerunExtraction({ documentId: detail.id, kindOverride })
                  .then((res) => handleStageOutcome(res))
                  .finally(() => setBusy(false))
              }}
              onAskAiAssist={() => void handleAskAiAssist()}
              onExportOriginal={() => {
                void getApi()
                  .documents.exportOriginal(detail.id)
                  .then((res) => {
                    if (res.ok) setNotice(dt.review.exportedNotice(res.fileName))
                  })
              }}
              onCommitPayslip={(payload) => {
                setBusy(true)
                setError(null)
                void getApi()
                  .documents.commitPayslip({ documentId: detail.id, ...payload })
                  .then(async (res) => {
                    if (!res.ok) {
                      setError(dt.errors[res.reason])
                      return
                    }
                    setNotice(dt.review.committedPayslip)
                    await queryClient.invalidateQueries({ queryKey: ['ledger'] })
                    await refreshQueue(detail.id)
                  })
                  .finally(() => setBusy(false))
              }}
              onCommitStatement={(payload) => {
                setBusy(true)
                setError(null)
                void getApi()
                  .documents.commitStatement({ documentId: detail.id, ...payload })
                  .then(async (res) => {
                    if (!res.ok) {
                      setError(dt.errors[res.reason])
                      return
                    }
                    setNotice(dt.review.committedStatement(res.importedInserted ?? 0))
                    await queryClient.invalidateQueries({ queryKey: ['ledger'] })
                    await refreshQueue(detail.id)
                  })
                  .finally(() => setBusy(false))
              }}
              onReject={() => {
                setBusy(true)
                void getApi()
                  .documents.reject(detail.id)
                  .then(() => refreshQueue(detail.id))
                  .finally(() => setBusy(false))
              }}
              onDelete={() => {
                setBusy(true)
                void getApi()
                  .documents.delete(detail.id)
                  .then(() => refreshQueue())
                  .finally(() => setBusy(false))
              }}
            />
          ) : null}
        </>
      )}

      {aiPreview ? (
        <AiConsentDialog
          preview={aiPreview}
          busy={busy}
          onConfirm={() => void handleConfirmAiAssist()}
          onClose={() => setAiPreview(null)}
        />
      ) : null}
    </div>
  )
}
