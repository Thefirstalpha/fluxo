import { Construction } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Card } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/PageHeader'
import { useT, type Dictionary } from '../../i18n'

export type ComingSoonSection = keyof Dictionary['coming']

/** Page d'attente : annonce le jalon et le contenu prévu (cf. docs/planning/). */
export function ComingSoonPage({ section }: { section: ComingSoonSection }) {
  const t = useT()
  const content = t.coming[section]
  return (
    <>
      <PageHeader
        title={t.nav[section]}
        subtitle={content.description}
        actions={<Badge tone="accent">{t.common.milestone(content.milestone)}</Badge>}
      />
      <Card accent title={t.common.plannedFeatures}>
        <ul className="grid gap-3 md:grid-cols-2">
          {content.features.map((feature) => (
            <li
              key={feature}
              className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 p-3 text-sm text-fg-2"
            >
              <Construction size={16} aria-hidden className="mt-0.5 shrink-0 text-orange" />
              {feature}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted">
          {t.common.seeRoadmap} : <code className="font-mono">docs/planning/</code>
        </p>
      </Card>
    </>
  )
}
