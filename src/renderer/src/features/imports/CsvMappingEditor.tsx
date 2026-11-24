import { Check, Download, Trash2, Upload } from 'lucide-react'
import { useState } from 'react'
import {
  CSV_DATE_FORMATS,
  CSV_DELIMITERS,
  CSV_ENCODINGS,
  type CsvInspection,
  type CsvProfile,
  type CsvProfileConfig,
} from '@shared/imports/model'
import { csvProfileShareJsonSchema } from '@shared/imports/schemas'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { INPUT_CLASS } from '../../components/ui/Field'
import { useT } from '../../i18n'

function columnValue(ref: string | number | null | undefined, headers: readonly string[]): string {
  if (ref === null || ref === undefined) return ''
  if (typeof ref === 'number') return headers[ref] ?? ''
  return ref
}

const DELIMITER_LABELS: Record<(typeof CSV_DELIMITERS)[number], string> = {
  ';': '; (point-virgule)',
  ',': ', (virgule)',
  '\t': 'Tabulation',
  '|': '| (pipe)',
}

export function CsvMappingEditor({
  profiles,
  selectedProfileId,
  config,
  inspection,
  onSelectProfile,
  onChangeConfig,
  onRefreshPreview,
  onDeleteProfile,
  onImportJsonProfile,
}: {
  profiles: readonly CsvProfile[]
  selectedProfileId: string
  config: CsvProfileConfig
  inspection: CsvInspection
  onSelectProfile: (profileId: string) => void
  onChangeConfig: (next: CsvProfileConfig) => void
  onRefreshPreview: () => void
  onDeleteProfile: (id: string) => void
  onImportJsonProfile: (parsed: {
    name: string
    bank: string | null
    config: CsvProfileConfig
  }) => void
}) {
  const t = useT()
  const [jsonOpen, setJsonOpen] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [exportedJson, setExportedJson] = useState<string | null>(null)

  const headers = inspection.headers
  const selectedProfile = profiles.find((p) => p.id === selectedProfileId)

  const setCol = (key: keyof CsvProfileConfig['columns'], value: string) => {
    onChangeConfig({
      ...config,
      columns: {
        ...config.columns,
        [key]: value === '' ? null : value,
      },
    })
  }

  const setReqCol = (key: 'bookingDate' | 'label', value: string) => {
    onChangeConfig({
      ...config,
      columns: {
        ...config.columns,
        [key]: value,
      },
    })
  }

  const handleExportJson = () => {
    const payload = {
      schema: 'fluxo-csv-profile-v1',
      name: selectedProfile?.name ?? 'Profil CSV Fluxo',
      bank: selectedProfile?.bank ?? null,
      config,
    }
    const serialized = JSON.stringify(payload, null, 2)
    setExportedJson(serialized)
    void navigator.clipboard?.writeText(serialized).catch(() => undefined)
  }

  const handleApplyJson = () => {
    setJsonError(null)
    try {
      const raw = JSON.parse(jsonText) as unknown
      const parsed = csvProfileShareJsonSchema.safeParse(raw)
      if (!parsed.success) {
        setJsonError(t.imports.csv.jsonInvalid)
        return
      }
      onImportJsonProfile({
        name: parsed.data.name,
        bank: parsed.data.bank ?? null,
        config: parsed.data.config,
      })
      setJsonOpen(false)
      setJsonText('')
    } catch {
      setJsonError(t.imports.csv.jsonInvalid)
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">{t.imports.csv.title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => setJsonOpen((open) => !open)}>
            <Upload size={14} aria-hidden />
            {t.imports.csv.importJson}
          </Button>
          <Button variant="ghost" onClick={handleExportJson}>
            <Download size={14} aria-hidden />
            {t.imports.csv.exportJson}
          </Button>
          {selectedProfile && !selectedProfile.builtin ? (
            <Button
              variant="ghost"
              onClick={() => onDeleteProfile(selectedProfile.id)}
              aria-label={t.imports.csv.deleteProfile}
            >
              <Trash2 size={14} aria-hidden />
              {t.imports.csv.deleteProfile}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onRefreshPreview}>
            {t.imports.refreshPreview}
          </Button>
        </div>
      </div>

      {exportedJson ? (
        <div className="space-y-1.5 rounded-md border border-border bg-surface-2 p-2.5 text-xs">
          <p className="flex items-center gap-1.5 font-medium text-teal">
            <Check size={13} aria-hidden />
            {t.imports.csv.jsonCopied}
          </p>
          <textarea
            readOnly
            rows={4}
            value={exportedJson}
            className="w-full rounded border border-border bg-surface p-2 font-mono text-[11px] text-fg"
          />
        </div>
      ) : null}

      {jsonOpen ? (
        <div className="space-y-2 rounded-md border border-border bg-surface-2 p-3">
          <textarea
            rows={4}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder={t.imports.csv.jsonPastePlaceholder}
            aria-label={t.imports.csv.jsonPastePlaceholder}
            className="w-full rounded border border-border-strong bg-surface p-2 font-mono text-xs text-fg"
          />
          {jsonError ? <p className="text-xs text-expense">{jsonError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setJsonOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button variant="primary" onClick={handleApplyJson}>
              {t.imports.csv.jsonApply}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs font-medium text-fg-2">
          {t.imports.csv.profileLabel}
          <select
            value={selectedProfileId}
            onChange={(e) => onSelectProfile(e.target.value)}
            className={`${INPUT_CLASS} mt-1 border-border-strong`}
          >
            <option value="custom">{t.imports.csv.customProfile}</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.builtin ? t.imports.csv.builtinBadge : t.imports.csv.savedBadge})
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium text-fg-2">
          {t.imports.csv.delimiter}
          <select
            value={config.delimiter}
            onChange={(e) =>
              onChangeConfig({
                ...config,
                delimiter: e.target.value as CsvProfileConfig['delimiter'],
              })
            }
            className={`${INPUT_CLASS} mt-1 border-border-strong`}
          >
            {CSV_DELIMITERS.map((d) => (
              <option key={d} value={d}>
                {DELIMITER_LABELS[d]}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium text-fg-2">
          {t.imports.csv.encoding}
          <select
            value={config.encoding}
            onChange={(e) =>
              onChangeConfig({
                ...config,
                encoding: e.target.value as CsvProfileConfig['encoding'],
              })
            }
            className={`${INPUT_CLASS} mt-1 border-border-strong`}
          >
            {CSV_ENCODINGS.map((enc) => (
              <option key={enc} value={enc}>
                {enc === 'auto' ? t.imports.formatAuto : enc.toUpperCase()}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium text-fg-2">
          {t.imports.csv.dateFormat}
          <select
            value={config.dateFormat}
            onChange={(e) =>
              onChangeConfig({
                ...config,
                dateFormat: e.target.value as CsvProfileConfig['dateFormat'],
              })
            }
            className={`${INPUT_CLASS} mt-1 border-border-strong`}
          >
            {CSV_DATE_FORMATS.map((df) => (
              <option key={df} value={df}>
                {df === 'auto' ? t.imports.formatAuto : df}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium text-fg-2">
          {t.imports.csv.skipRows}
          <input
            type="number"
            min={0}
            max={50}
            value={config.skipRows}
            onChange={(e) =>
              onChangeConfig({
                ...config,
                skipRows: Math.max(0, Math.min(50, Number(e.target.value) || 0)),
              })
            }
            className={`${INPUT_CLASS} mt-1 border-border-strong`}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-medium text-fg-2">
          {t.imports.csv.amountMode}
          <select
            value={config.amountMode}
            onChange={(e) =>
              onChangeConfig({
                ...config,
                amountMode: e.target.value as CsvProfileConfig['amountMode'],
              })
            }
            className={`${INPUT_CLASS} mt-1 border-border-strong`}
          >
            <option value="single">{t.imports.csv.amountSingle}</option>
            <option value="split">{t.imports.csv.amountSplit}</option>
          </select>
        </label>

        <label className="text-xs font-medium text-fg-2">
          {t.imports.csv.colDate}
          <select
            value={columnValue(config.columns.bookingDate, headers)}
            onChange={(e) => setReqCol('bookingDate', e.target.value)}
            className={`${INPUT_CLASS} mt-1 border-border-strong`}
          >
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium text-fg-2">
          {t.imports.csv.colLabel}
          <select
            value={columnValue(config.columns.label, headers)}
            onChange={(e) => setReqCol('label', e.target.value)}
            className={`${INPUT_CLASS} mt-1 border-border-strong`}
          >
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>

        {config.amountMode === 'single' ? (
          <label className="text-xs font-medium text-fg-2">
            {t.imports.csv.colAmount}
            <select
              value={columnValue(config.columns.amount, headers)}
              onChange={(e) => setCol('amount', e.target.value)}
              className={`${INPUT_CLASS} mt-1 border-border-strong`}
            >
              <option value="">{t.imports.csv.noneColumn}</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label className="text-xs font-medium text-fg-2">
              {t.imports.csv.colDebit}
              <select
                value={columnValue(config.columns.debit, headers)}
                onChange={(e) => setCol('debit', e.target.value)}
                className={`${INPUT_CLASS} mt-1 border-border-strong`}
              >
                <option value="">{t.imports.csv.noneColumn}</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-fg-2">
              {t.imports.csv.colCredit}
              <select
                value={columnValue(config.columns.credit, headers)}
                onChange={(e) => setCol('credit', e.target.value)}
                className={`${INPUT_CLASS} mt-1 border-border-strong`}
              >
                <option value="">{t.imports.csv.noneColumn}</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <label className="text-xs font-medium text-fg-2">
          {t.imports.csv.colBalance}
          <select
            value={columnValue(config.columns.balance, headers)}
            onChange={(e) => setCol('balance', e.target.value)}
            className={`${INPUT_CLASS} mt-1 border-border-strong`}
          >
            <option value="">{t.imports.csv.noneColumn}</option>
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium text-fg-2">
          {t.imports.csv.colPayee}
          <select
            value={columnValue(config.columns.payee, headers)}
            onChange={(e) => setCol('payee', e.target.value)}
            className={`${INPUT_CLASS} mt-1 border-border-strong`}
          >
            <option value="">{t.imports.csv.noneColumn}</option>
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium text-fg-2">
          {t.imports.csv.colStatus}
          <select
            value={columnValue(config.columns.status, headers)}
            onChange={(e) => setCol('status', e.target.value)}
            className={`${INPUT_CLASS} mt-1 border-border-strong`}
          >
            <option value="">{t.imports.csv.noneColumn}</option>
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Card>
  )
}
