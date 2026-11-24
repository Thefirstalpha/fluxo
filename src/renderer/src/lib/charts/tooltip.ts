/**
 * Construction du HTML des infobulles ECharts.
 * ECharts insère ce HTML tel quel : TOUTE valeur (libellés de catégories, noms de comptes
 * importés…) est échappée ici. Le style passe par des classes CSS, pas par des attributs inline.
 */
const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char)
}

export interface TooltipRow {
  /** Classe de la clé de série (ex. `fx-key--income`). */
  keyClass: string
  label: string
  value: string
}

export function tooltipHtml({
  title,
  rows,
  note,
}: {
  title: string
  rows: TooltipRow[]
  note?: string
}): string {
  const body = rows
    .map(
      (row) =>
        `<div class="fx-tt__row"><span class="fx-key ${escapeHtml(row.keyClass)}"></span>` +
        `<span class="fx-tt__label">${escapeHtml(row.label)}</span>` +
        `<span class="fx-tt__value">${escapeHtml(row.value)}</span></div>`,
    )
    .join('')
  const footer = note ? `<div class="fx-tt__note">${escapeHtml(note)}</div>` : ''
  return `<div class="fx-tt"><div class="fx-tt__title">${escapeHtml(title)}</div>${body}${footer}</div>`
}

/** Options communes : conteneur transparent, l'habillage est porté par `.fx-tt` (index.css). */
export const TOOLTIP_CONTAINER = {
  className: 'fx-chart-tooltip',
  backgroundColor: 'transparent',
  borderWidth: 0,
  padding: 0,
  extraCssText: 'box-shadow: none;',
  confine: true,
} as const
