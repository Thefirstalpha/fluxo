import { Undo2 } from 'lucide-react'
import { useState } from 'react'
import type { ImportBatchSummary } from '@shared/imports/model'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useT } from '../../i18n'
import { useFormatters } from '../../lib/format'

export function ImportHistoryCard({
  batches,
  onRevert,
}: {
  batches: readonly ImportBatchSummary[]
  onRevert: (batchId: string) => void
}) {
  const t = useT()
  const fmt = useFormatters()
  const [reverting, setReverting] = useState<ImportBatchSummary | null>(null)

  return (
    <Card>
      <h2 className="mb-3 text-base font-semibold text-fg">{t.imports.history.title}</h2>
      {batches.length === 0 ? (
        <p className="text-sm text-fg-2">{t.imports.history.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border text-fg-2">
                <th className="py-2 pr-3 font-medium">{t.imports.history.date}</th>
                <th className="py-2 pr-3 font-medium">{t.imports.history.account}</th>
                <th className="py-2 pr-3 font-medium">{t.imports.history.file}</th>
                <th className="py-2 pr-3 font-medium">{t.imports.history.format}</th>
                <th className="py-2 pr-3 font-medium">{t.imports.history.period}</th>
                <th className="py-2 pr-3 font-medium">{t.imports.history.volume}</th>
                <th className="py-2 pr-3 font-medium">{t.imports.history.discrepancy}</th>
                <th className="py-2 pr-3 font-medium">{t.imports.history.state}</th>
                <th className="py-2 text-right font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {batches.map((batch) => (
                <tr key={batch.id} className="hover:bg-surface-2/50">
                  <td className="py-2.5 pr-3 whitespace-nowrap text-fg-2">
                    {fmt.date(batch.createdAt.slice(0, 10))}
                  </td>
                  <td className="py-2.5 pr-3 font-medium text-fg">{batch.accountName}</td>
                  <td className="py-2.5 pr-3 text-fg">{batch.fileName}</td>
                  <td className="py-2.5 pr-3 uppercase text-fg-2">
                    {batch.format}
                    {batch.profile ? ` · ${batch.profile}` : ''}
                  </td>
                  <td className="py-2.5 pr-3 whitespace-nowrap text-fg-2">
                    {batch.periodStart && batch.periodEnd
                      ? `${fmt.date(batch.periodStart)} → ${fmt.date(batch.periodEnd)}`
                      : '—'}
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums text-fg">
                    {t.imports.history.volumeValue(batch.insertedCount, batch.duplicateCount)}
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums text-fg-2">
                    {batch.balanceDiscrepancy === null
                      ? '—'
                      : batch.balanceDiscrepancy === 0
                        ? '0'
                        : fmt.money(batch.balanceDiscrepancy, { signed: true })}
                  </td>
                  <td className="py-2.5 pr-3">
                    <Badge tone={batch.state === 'committed' ? 'accent' : 'neutral'}>
                      {t.imports.history.states[batch.state]}
                    </Badge>
                  </td>
                  <td className="py-2.5 text-right">
                    {batch.state === 'committed' ? (
                      <Button
                        variant="ghost"
                        onClick={() => setReverting(batch)}
                        aria-label={`${t.imports.history.revertButton} (${batch.fileName})`}
                      >
                        <Undo2 size={14} aria-hidden />
                        {t.imports.history.revertButton}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reverting ? (
        <ConfirmDialog
          title={t.imports.history.revertTitle}
          message={t.imports.history.revertMessage(reverting.fileName, reverting.insertedCount)}
          confirmLabel={t.imports.history.revertButton}
          onConfirm={() => onRevert(reverting.id)}
          onClose={() => setReverting(null)}
        />
      ) : null}
    </Card>
  )
}
