import { useState } from 'react'
import { AUDIT_ENTITIES, type AuditEntity } from '@shared/ledger/model'
import { useT } from '../i18n'
import { useFormatters } from '../lib/format'
import { useLedgerQuery } from '../lib/ledger'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { Dialog } from './ui/Dialog'
import { SelectField } from './ui/Field'

/** Journal d'audit en lecture seule (modifications tracées du coffre chiffré). */
export function AuditLogDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const fmt = useFormatters()
  const [entity, setEntity] = useState<string>('')
  const entries = useLedgerQuery('auditList', {
    entity: entity ? (entity as AuditEntity) : undefined,
    limit: 100,
  })

  const list = entries.data ?? []

  return (
    <Dialog title={t.audit.title} description={t.audit.description} onClose={onClose} size="lg">
      <div className="space-y-4">
        <SelectField
          label={t.audit.filterEntity}
          value={entity}
          onChange={setEntity}
          options={[
            { value: '', label: t.audit.allEntities },
            ...AUDIT_ENTITIES.map((value) => ({ value, label: t.audit.entities[value] })),
          ]}
        />

        {entries.isPending ? (
          <p role="status" className="text-sm text-muted">
            {t.common.loading}
          </p>
        ) : list.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{t.audit.empty}</p>
        ) : (
          <ul className="max-h-96 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-surface-2 px-3">
            {list.map((entry) => {
              const entityLabel = t.audit.entities[entry.entity] ?? entry.entity
              const actionLabel =
                t.audit.actions[entry.action as keyof typeof t.audit.actions] ?? entry.action
              const originLabel =
                t.audit.origins[entry.origin as keyof typeof t.audit.origins] ?? entry.origin
              return (
                <li key={entry.id} className="flex flex-wrap items-center gap-2 py-2.5 text-xs">
                  <Badge tone={entry.action === 'revert' ? 'accent' : 'neutral'}>
                    {actionLabel}
                  </Badge>
                  <span className="font-semibold text-fg">{entityLabel}</span>
                  <span className="text-muted">· {originLabel}</span>
                  {entry.entityId ? (
                    <span className="font-mono text-[11px] text-muted">
                      {entry.entityId.slice(0, 8)}
                    </span>
                  ) : null}
                  <span className="ml-auto text-muted tabular-nums">{fmt.dateTime(entry.at)}</span>
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose}>
            {t.common.close}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
