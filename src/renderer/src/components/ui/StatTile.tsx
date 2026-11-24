import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { cx } from '../../lib/cx'

export interface StatDelta {
  /** Valeur signée déjà formatée : « +4,2 % », « −120 € ». */
  text: string
  direction: 'up' | 'down' | 'flat'
  /** Bonne ou mauvaise nouvelle (dépend de l'indicateur : des dépenses en hausse sont « bad »). */
  tone: 'good' | 'bad' | 'neutral'
  /** Période de comparaison nommée : « vs oct. 26 ». */
  caption: string
}

const TONE_CLASS: Record<StatDelta['tone'], string> = {
  good: 'text-income',
  bad: 'text-expense',
  neutral: 'text-muted',
}

/** Tuile KPI : libellé · valeur · variation (icône + signe : jamais la couleur seule). */
export function StatTile({
  label,
  value,
  delta,
}: {
  label: string
  value: string
  delta?: StatDelta
}) {
  const Icon =
    delta?.direction === 'up' ? TrendingUp : delta?.direction === 'down' ? TrendingDown : Minus
  return (
    <div className="fx-card fx-card--accent px-4 py-3.5">
      <p className="text-xs font-medium text-fg-2">{label}</p>
      <p className="mt-1 text-[26px] leading-tight font-semibold tracking-tight text-fg">{value}</p>
      {delta ? (
        <p
          className={cx(
            'mt-1 flex items-center gap-1 text-xs font-semibold',
            TONE_CLASS[delta.tone],
          )}
        >
          <Icon size={14} aria-hidden />
          <span>{delta.text}</span>
          <span className="font-normal text-muted">{delta.caption}</span>
        </p>
      ) : null}
    </div>
  )
}
