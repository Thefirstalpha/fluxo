import { describe, expect, it } from 'vitest'
import { escapeHtml, tooltipHtml } from './tooltip'

describe('escapeHtml', () => {
  it('neutralise toute tentative d’injection HTML', () => {
    expect(escapeHtml(`<img src=x onerror="alert('1')">&`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;',
    )
  })
})

describe('tooltipHtml', () => {
  const html = tooltipHtml({
    title: '<b>Novembre</b>',
    rows: [{ keyClass: 'fx-key--income', label: '<script>alert(1)</script>', value: '1 200 €' }],
    note: '" onmouseover="x',
  })

  it('échappe titre, libellés, valeurs et note', () => {
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&quot; onmouseover=&quot;x')
  })

  it('stylise par classes CSS, sans attribut style inline', () => {
    expect(html).not.toMatch(/style=/)
    expect(html.startsWith('<div class="fx-tt">')).toBe(true)
    expect(html).toContain('class="fx-key fx-key--income"')
  })
})
