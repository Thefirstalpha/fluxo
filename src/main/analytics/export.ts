import { mkdir, rename, writeFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { BrowserWindow, dialog } from 'electron'
import type {
  AnalyticsExportOutcome,
  AnalyticsFilter,
  AnalyticsOverview,
} from '@shared/analytics/model'
import type { DialogLabels } from '@shared/i18n/dialogs'
import { formatMoney } from '@shared/money'
import { monthToUtcDate } from '@shared/months'
import type { Settings } from '@shared/settings'
import { writeFileAtomic } from '../fs/atomic-write'
import type { VaultManager } from '../vault/vault-manager'

const MASKED = '••••••'

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

async function pickSavePath(
  defaultPath: string,
  title: string,
  filters: Electron.FileFilter[],
): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const options: Electron.SaveDialogOptions = {
    title,
    defaultPath,
    filters,
  }
  const res = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  return res.canceled || !res.filePath ? null : res.filePath
}

async function writeBufferAtomic(filePath: string, data: Uint8Array): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp`
  await writeFile(tmp, data, { mode: 0o600 })
  await rename(tmp, filePath)
}

export async function exportAnalyticsCsv(
  vault: VaultManager,
  filter: AnalyticsFilter,
  labels: DialogLabels,
): Promise<AnalyticsExportOutcome> {
  const res = await vault.ledger('analyticsCsvData', filter)
  if (!res.ok) return { ok: false, error: res.error }

  const monthTag = filter.focusMonth ?? filter.to?.slice(0, 7) ?? 'export'
  const filePath = await pickSavePath(`fluxo-analyses-${monthTag}.csv`, labels.saveCsvTitle, [
    { name: labels.csvFilter, extensions: ['csv'] },
  ])
  if (!filePath) return { ok: false, canceled: true }

  await writeFileAtomic(filePath, res.value.csv)
  return { ok: true, fileName: basename(filePath), rowCount: res.value.rowCount }
}

export async function exportAnalyticsImage(
  input: { format: 'png' | 'svg'; defaultName: string; data: string },
  labels: DialogLabels,
): Promise<AnalyticsExportOutcome> {
  const ext = input.format
  const filePath = await pickSavePath(`${input.defaultName}.${ext}`, labels.saveImageTitle, [
    { name: ext === 'png' ? labels.pngFilter : labels.svgFilter, extensions: [ext] },
  ])
  if (!filePath) return { ok: false, canceled: true }

  if (ext === 'png') {
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(input.data)
    if (!match) return { ok: false, error: 'invalid' }
    await writeBufferAtomic(filePath, Buffer.from(match[1]!, 'base64'))
    return { ok: true, fileName: basename(filePath) }
  }

  let svgText = input.data
  if (svgText.startsWith('data:image/svg+xml')) {
    const comma = svgText.indexOf(',')
    if (comma < 0) return { ok: false, error: 'invalid' }
    const header = svgText.slice(0, comma)
    const body = svgText.slice(comma + 1)
    svgText = header.includes(';base64')
      ? Buffer.from(body, 'base64').toString('utf8')
      : decodeURIComponent(body)
  }
  const trimmed = svgText.trim()
  if (!trimmed.startsWith('<svg') || /<script[\s>]/i.test(trimmed)) {
    return { ok: false, error: 'invalid' }
  }
  await writeFileAtomic(filePath, trimmed)
  return { ok: true, fileName: basename(filePath) }
}

function buildMonthlyPdfHtml(
  overview: AnalyticsOverview,
  settings: Pick<Settings, 'locale' | 'currency' | 'hideAmounts'>,
): string {
  const s = overview.monthlySynthesis
  const fr = settings.locale === 'fr-FR'
  const fmtMoney = (amount: number, signed = false): string =>
    settings.hideAmounts
      ? MASKED
      : formatMoney(amount, {
          locale: settings.locale,
          currency: settings.currency,
          signDisplay: signed ? 'exceptZero' : 'auto',
        })
  const monthLabel = new Intl.DateTimeFormat(settings.locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(monthToUtcDate(s.month))

  const title = fr ? `Synthèse mensuelle — ${monthLabel}` : `Monthly summary — ${monthLabel}`
  const catRows = s.topCategories
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.name)}</td><td class="num">${escapeHtml(
          fmtMoney(c.amount),
        )}</td><td class="num">${Math.round(c.share * 100)} %</td></tr>`,
    )
    .join('')
  const merchantRows = s.topMerchants
    .map(
      (m) =>
        `<tr><td>${escapeHtml(m.name)}</td><td class="num">${m.transactionCount}</td><td class="num">${escapeHtml(
          fmtMoney(m.total),
        )}</td></tr>`,
    )
    .join('')
  const largeRows = s.largestExpenses
    .map(
      (tx) =>
        `<tr><td>${escapeHtml(tx.bookingDate)}</td><td>${escapeHtml(tx.label)}</td><td>${escapeHtml(
          tx.accountName,
        )}</td><td class="num">${escapeHtml(fmtMoney(tx.amount))}</td></tr>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="${fr ? 'fr' : 'en'}">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; color: #1f1f1f; margin: 28px; font-size: 12px; line-height: 1.45; }
  h1 { font-size: 20px; margin: 0 0 4px; color: #dd2a80; }
  .sub { color: #666; margin: 0 0 18px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
  .tile { border: 1px solid #e5e5e5; border-radius: 8px; padding: 10px; }
  .tile .label { font-size: 10px; color: #666; text-transform: uppercase; }
  .tile .val { font-size: 16px; font-weight: 700; margin-top: 4px; }
  h2 { font-size: 13px; margin: 16px 0 6px; border-bottom: 1px solid #e5e5e5; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th, td { text-align: left; padding: 5px 6px; border-bottom: 1px solid #f0f0f0; }
  th { font-size: 10px; color: #666; text-transform: uppercase; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="sub">${escapeHtml(
    fr ? 'Document généré localement par Fluxo' : 'Generated offline by Fluxo',
  )} · ${escapeHtml(settings.currency)}</p>

  <div class="grid">
    <div class="tile"><div class="label">${fr ? 'Revenus' : 'Income'}</div><div class="val">${escapeHtml(
      fmtMoney(s.income),
    )}</div></div>
    <div class="tile"><div class="label">${fr ? 'Dépenses' : 'Expenses'}</div><div class="val">${escapeHtml(
      fmtMoney(s.expenses),
    )}</div></div>
    <div class="tile"><div class="label">${fr ? 'Épargne placée' : 'Savings'}</div><div class="val">${escapeHtml(
      fmtMoney(s.savings),
    )}</div></div>
    <div class="tile"><div class="label">${fr ? 'Solde net' : 'Net'}</div><div class="val">${escapeHtml(
      fmtMoney(s.net, true),
    )}</div></div>
  </div>

  <h2>${fr ? 'Top catégories' : 'Top categories'}</h2>
  <table><thead><tr><th>${fr ? 'Catégorie' : 'Category'}</th><th class="num">${
    fr ? 'Montant' : 'Amount'
  }</th><th class="num">${fr ? 'Part' : 'Share'}</th></tr></thead><tbody>${catRows}</tbody></table>

  <h2>${fr ? 'Principaux commerçants' : 'Top merchants'}</h2>
  <table><thead><tr><th>${fr ? 'Commerçant' : 'Merchant'}</th><th class="num">${
    fr ? 'Opérations' : 'Count'
  }</th><th class="num">${fr ? 'Montant' : 'Amount'}</th></tr></thead><tbody>${merchantRows}</tbody></table>

  <h2>${fr ? 'Plus grosses dépenses' : 'Largest expenses'}</h2>
  <table><thead><tr><th>${fr ? 'Date' : 'Date'}</th><th>${fr ? 'Libellé' : 'Label'}</th><th>${
    fr ? 'Compte' : 'Account'
  }</th><th class="num">${fr ? 'Montant' : 'Amount'}</th></tr></thead><tbody>${largeRows}</tbody></table>
</body>
</html>`
}

export async function exportMonthlyPdfReport(
  vault: VaultManager,
  filter: AnalyticsFilter,
  settings: Pick<Settings, 'locale' | 'currency' | 'hideAmounts'>,
  labels: DialogLabels,
): Promise<AnalyticsExportOutcome> {
  const res = await vault.ledger('analyticsOverview', filter)
  if (!res.ok) return { ok: false, error: res.error }

  const month = res.value.monthlySynthesis.month
  const filePath = await pickSavePath(`fluxo-rapport-${month}.pdf`, labels.savePdfTitle, [
    { name: labels.pdfFilter, extensions: ['pdf'] },
  ])
  if (!filePath) return { ok: false, canceled: true }

  const html = buildMonthlyPdfHtml(res.value, settings)
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      javascript: false,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: 'fluxo-pdf-render',
    },
  })
  try {
    await win.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
    })
    await writeBufferAtomic(filePath, pdfBuffer)
    return { ok: true, fileName: basename(filePath) }
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}
