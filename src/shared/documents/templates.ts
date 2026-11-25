import type { MinorUnits } from '../money'
import { checkPayslipDetailed, type PayslipLineInput } from '../payslip'
import type {
  DocumentBox,
  ExtractedOtherDraft,
  ExtractedPage,
  ExtractedPayslipDraft,
  ExtractedStatementDraft,
  ExtractedStatementRow,
  ExtractedTextItem,
  FieldConfidenceZone,
  SourceZone,
} from './model'

interface VisualLine {
  page: number
  y: number
  text: string
  items: ExtractedTextItem[]
  box: DocumentBox
}

const FRENCH_MONTHS: Readonly<Record<string, string>> = {
  janvier: '01',
  janv: '01',
  fevrier: '02',
  février: '02',
  fevr: '02',
  mars: '03',
  avril: '04',
  avr: '04',
  mai: '05',
  juin: '06',
  juillet: '07',
  juil: '07',
  aout: '08',
  août: '08',
  septembre: '09',
  sept: '09',
  octobre: '10',
  oct: '10',
  novembre: '11',
  nov: '11',
  decembre: '12',
  décembre: '12',
  dec: '12',
}

/** Parse un montant français ou anglo-saxon (`1 234,56 €`, `-42,50`, `1,234.56`) en centimes. */
export function parseAmountCents(raw: string): MinorUnits | null {
  const cleaned = raw.replace(/[\u00a0\u202f\s€$£]/g, '').replace(/^\((.+)\)$/, '-$1')
  if (!cleaned) return null
  const match = cleaned.match(/^([+-]?)(\d+(?:[.,]\d{3})*|\d+)(?:([.,])(\d{1,2}))?$/)
  if (!match) return null

  const sign = match[1] === '-' ? -1 : 1
  const rawInt = (match[2] ?? '').replace(/[.,](?=\d{3}(?:\D|$))/g, '')
  const dec = match[4] ?? ''
  if (!/^\d+$/.test(rawInt)) return null

  const euros = Number.parseInt(rawInt, 10)
  const cents =
    dec.length === 0
      ? 0
      : dec.length === 1
        ? Number.parseInt(dec, 10) * 10
        : Number.parseInt(dec, 10)
  if (!Number.isSafeInteger(euros) || !Number.isSafeInteger(cents)) return null
  return sign * (euros * 100 + cents)
}

export function parseRateMicros(raw: string): number | null {
  const cleaned = raw.replace(/[\s\u00a0\u202f%]/g, '').replace(',', '.')
  const num = Number.parseFloat(cleaned)
  if (!Number.isFinite(num) || num < 0 || num > 100) return null
  return Math.round(num * 10_000)
}

export function parseFrenchDate(raw: string): string | null {
  const iso = raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (iso) {
    const [, y, m, d] = iso
    return validateIso(`${y}-${m}-${d}`)
  }
  const dmy = raw.match(/\b(\d{2})[/.-](\d{2})[/.-](\d{4})\b/)
  if (dmy) {
    const [, d, m, y] = dmy
    return validateIso(`${y}-${m}-${d}`)
  }
  return null
}

function validateIso(candidate: string): string | null {
  const parsed = new Date(`${candidate}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate
    ? candidate
    : null
}

function mergeBoxes(items: readonly ExtractedTextItem[]): DocumentBox {
  if (items.length === 0) return { x: 0, y: 0, width: 1, height: 0.04 }
  let minX = 1
  let minY = 1
  let maxX = 0
  let maxY = 0
  for (const item of items) {
    minX = Math.min(minX, item.box.x)
    minY = Math.min(minY, item.box.y)
    maxX = Math.max(maxX, item.box.x + item.box.width)
    maxY = Math.max(maxY, item.box.y + item.box.height)
  }
  return {
    x: Math.max(0, minX),
    y: Math.max(0, minY),
    width: Math.min(1 - minX, Math.max(0.01, maxX - minX)),
    height: Math.min(1 - minY, Math.max(0.01, maxY - minY)),
  }
}

/** Reconstruit les lignes visuelles ordonnées haut→bas, gauche→droite depuis les boîtes PDF/OCR. */
export function reconstructLines(pages: readonly ExtractedPage[]): VisualLine[] {
  const lines: VisualLine[] = []
  for (const page of pages) {
    if (page.items.length === 0) {
      const rawLines = page.text.split(/\r?\n/)
      rawLines.forEach((rawLine, index) => {
        const text = rawLine.trim()
        if (!text) return
        const y = Math.min(0.95, (index + 0.5) / Math.max(1, rawLines.length))
        lines.push({
          page: page.pageNumber,
          y,
          text,
          items: [],
          box: { x: 0.04, y, width: 0.92, height: 0.025 },
        })
      })
      continue
    }

    const sorted = [...page.items].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
    const clusters: ExtractedTextItem[][] = []
    for (const item of sorted) {
      const last = clusters.at(-1)
      if (!last) {
        clusters.push([item])
        continue
      }
      const refY = last[0]!.box.y
      const tolerance = Math.max(0.008, last[0]!.box.height * 0.65)
      if (Math.abs(item.box.y - refY) <= tolerance) {
        last.push(item)
      } else {
        clusters.push([item])
      }
    }

    for (const cluster of clusters) {
      cluster.sort((a, b) => a.box.x - b.box.x)
      const joined = cluster
        .map((c) => c.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (!joined) continue
      lines.push({
        page: page.pageNumber,
        y: cluster[0]!.box.y,
        text: joined,
        items: cluster,
        box: mergeBoxes(cluster),
      })
    }
  }
  return lines
}

function zoneOf(line: VisualLine): SourceZone {
  return {
    page: line.page,
    box: line.box,
    snippet: line.text.slice(0, 140),
  }
}

const AMOUNT_TOKEN_RE =
  /[+-]?\d{1,3}(?:[\s\u00a0\u202f.]\d{3})*[,.]\d{2}(?:\s?€)?|[+-]?\d+[,.]\d{2}(?:\s?€)?/g

function lastAmountOnLine(line: VisualLine): MinorUnits | null {
  const matches = [...line.text.matchAll(AMOUNT_TOKEN_RE)]
  for (let i = matches.length - 1; i >= 0; i--) {
    const parsed = parseAmountCents(matches[i]![0])
    if (parsed !== null) return parsed
  }
  return null
}

function matchAmountLine(
  lines: readonly VisualLine[],
  pattern: RegExp,
  options: { preferLast?: boolean; nonNegative?: boolean } = {},
): { value: MinorUnits; zone: SourceZone; line: VisualLine } | null {
  const candidates = lines.filter((line) => pattern.test(line.text))
  const ordered = options.preferLast ? [...candidates].reverse() : candidates
  for (const line of ordered) {
    const raw = lastAmountOnLine(line)
    if (raw === null) continue
    if (options.nonNegative && raw < 0) continue
    return { value: raw, zone: zoneOf(line), line }
  }
  return null
}

function detectPayslipPeriod(lines: readonly VisualLine[]): {
  value: string | null
  zone: SourceZone | null
} {
  for (const line of lines) {
    const iso = line.text.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/)
    if (iso && /p[eé]riode|mois|paie|bulletin|du/i.test(line.text)) {
      return { value: `${iso[1]}-${iso[2]}`, zone: zoneOf(line) }
    }
    const named = line.text.match(
      new RegExp(`\\b(${Object.keys(FRENCH_MONTHS).join('|')})\\s+(20\\d{2})\\b`, 'i'),
    )
    if (named) {
      const monthKey = named[1]!.toLowerCase()
      const month = FRENCH_MONTHS[monthKey]
      if (month) return { value: `${named[2]}-${month}`, zone: zoneOf(line) }
    }
    const range = line.text.match(/\b(?:du|p[eé]riode)\s+\d{2}[/.-](\d{2})[/.-](20\d{2})/i)
    if (range) {
      return { value: `${range[2]}-${range[1]}`, zone: zoneOf(line) }
    }
    const mmYyyy = line.text.match(/\b(0[1-9]|1[0-2])[/.-](20\d{2})\b/)
    if (mmYyyy && /p[eé]riode|mois|paie|bulletin/i.test(line.text)) {
      return { value: `${mmYyyy[2]}-${mmYyyy[1]}`, zone: zoneOf(line) }
    }
  }
  // Second passage sans contrainte de mot-clé.
  for (const line of lines) {
    const named = line.text.match(
      new RegExp(`\\b(${Object.keys(FRENCH_MONTHS).join('|')})\\s+(20\\d{2})\\b`, 'i'),
    )
    if (named) {
      const month = FRENCH_MONTHS[named[1]!.toLowerCase()]
      if (month) return { value: `${named[2]}-${month}`, zone: zoneOf(line) }
    }
  }
  return { value: null, zone: null }
}

/**
 * Extraction déterministe d'un bulletin de paie français (M6/M7) à partir des pages extraites.
 * Retourne chaque montant en centimes entiers, la confiance par champ et sa `SourceZone`.
 */
export function extractFrenchPayslip(pages: readonly ExtractedPage[]): ExtractedPayslipDraft {
  const lines = reconstructLines(pages)
  const fieldZones: Record<string, FieldConfidenceZone> = {}

  const setZone = (key: string, confidence: number, zone: SourceZone | null) => {
    fieldZones[key] = { confidence, sourceZone: zone }
  }

  // Employeur & SIRET.
  let employerSiret: string | null = null
  let employerName: string | null = null
  for (const line of lines) {
    if (!employerSiret) {
      const siretMatch = line.text.match(/\bSIRET\s*[:.]?\s*([\d\s.]{14,20})/i)
      if (siretMatch) {
        const digits = siretMatch[1]!.replace(/[\s.]/g, '').slice(0, 14)
        if (/^\d{14}$/.test(digits)) {
          employerSiret = digits
          setZone('employerSiret', 0.96, zoneOf(line))
        }
      }
    }
    if (!employerName) {
      const empExplicit = line.text.match(/^(?:Employeur|Soci[eé]t[eé]|Entreprise)\s*[:]\s*(.+)$/i)
      if (empExplicit && empExplicit[1]!.trim().length >= 2) {
        employerName = empExplicit[1]!.trim().slice(0, 120)
        setZone('employerName', 0.92, zoneOf(line))
      }
    }
  }
  if (!employerName) {
    const firstHeader = lines.find(
      (line) =>
        line.page === 1 &&
        line.y < 0.25 &&
        !/bulletin|salaire|siret|nir|n°|matricule|adresse|page/i.test(line.text) &&
        line.text.length >= 3 &&
        line.text.length <= 80,
    )
    if (firstHeader) {
      employerName = firstHeader.text
      setZone('employerName', 0.65, zoneOf(firstHeader))
    }
  }

  const periodMatch = detectPayslipPeriod(lines)
  if (periodMatch.value) setZone('period', 0.94, periodMatch.zone)

  let paymentDate: string | null = null
  for (const line of lines) {
    if (/paiement|pay[eé]\s+le|vers[eé]\s+le|virement\s+le|r[eè]glement/i.test(line.text)) {
      const d = parseFrenchDate(line.text)
      if (d) {
        paymentDate = d
        setZone('paymentDate', 0.92, zoneOf(line))
        break
      }
    }
  }

  const baseMatch = matchAmountLine(lines, /\bsalaire\s+(?:de\s+)?base\b|\bappointements?\b/i, {
    nonNegative: true,
  })
  const grossMatch = matchAmountLine(lines, /\b(?:salaire\s+brut|total\s+brut)\b/i, {
    preferLast: true,
    nonNegative: true,
  })
  const empContribMatch = matchAmountLine(
    lines,
    /\btotal\s+(?:des\s+)?(?:cotisations?\s+et\s+contributions?\s+salariales?|retenues?\s+salariales?|cotisations?\s+salariales?)\b/i,
    { preferLast: true, nonNegative: true },
  )
  const erContribMatch = matchAmountLine(
    lines,
    /\btotal\s+(?:des\s+)?(?:cotisations?\s+patronales?|charges?\s+patronales?|part\s+patronale)\b/i,
    { preferLast: true, nonNegative: true },
  )
  const netBeforeTaxMatch = matchAmountLine(
    lines,
    /\bnet\s+[àa]\s+payer\s+avant\s+imp[oô]t\b|\bnet\s+avant\s+(?:imp[oô]t|pas)\b/i,
    { preferLast: true },
  )
  const taxableNetMatch = matchAmountLine(lines, /^(?!.*cumul).*\bnet\s+imposable\b/i, {
    preferLast: true,
  })
  const socialNetMatch = matchAmountLine(lines, /\bmontant\s+net\s+social\b|\bnet\s+social\b/i, {
    preferLast: true,
    nonNegative: true,
  })
  const pasMatch = matchAmountLine(
    lines,
    /^(?!.*cumul).*\b(?:imp[oô]t\s+sur\s+le\s+revenu|pr[eé]l[eè]vement\s+[àa]\s+la\s+source|montant\s+pas)\b/i,
    { preferLast: true, nonNegative: true },
  )
  const netPaidMatch = matchAmountLine(
    lines,
    /\bnet\s+(?:pay[eé](?!\p{L})|[àa]\s+payer(?:\s+au\s+salari[eé])?(?!\s+avant)\b)/iu,
    { preferLast: true },
  )

  const ytdGrossMatch = matchAmountLine(lines, /\bcumul\s+(?:annuel\s+)?(?:du\s+)?brut\b/i, {
    nonNegative: true,
  })
  const ytdTaxableMatch = matchAmountLine(
    lines,
    /\bcumul\s+(?:annuel\s+)?(?:du\s+)?net\s+imposable\b/i,
    {
      nonNegative: true,
    },
  )
  const ytdWithholdingMatch = matchAmountLine(
    lines,
    /\bcumul\s+(?:annuel\s+)?(?:du\s+)?(?:pas|pr[eé]l[eè]vement|imp[oô]t)\b/i,
    { nonNegative: true },
  )

  let withholdingRateMicros = 0
  if (pasMatch) {
    const rateMatch = pasMatch.line.text.match(/(\d{1,2}[,.]\d{1,2})\s*%/)
    if (rateMatch) {
      withholdingRateMicros = parseRateMicros(rateMatch[1]!) ?? 0
    }
  }
  if (withholdingRateMicros === 0) {
    for (const line of lines) {
      if (/\btaux\s+(?:personnalis[eé]|pas|pr[eé]l[eè]vement)\b/i.test(line.text)) {
        const m = line.text.match(/(\d{1,2}[,.]\d{1,2})\s*%/)
        if (m) {
          withholdingRateMicros = parseRateMicros(m[1]!) ?? 0
          if (withholdingRateMicros > 0) {
            setZone('withholdingRateMicros', 0.9, zoneOf(line))
            break
          }
        }
      }
    }
  }

  // Éléments variables / après impôt détectés.
  const extractedLines: PayslipLineInput[] = []
  let afterTaxAdjustments = 0
  const variablePatterns: { kind: string; pattern: RegExp; taxable: boolean }[] = [
    { kind: 'on-call', pattern: /\bastreintes?(?!\p{L})/iu, taxable: true },
    { kind: 'overtime', pattern: /\bheures?\s+suppl[eé]mentaires?(?!\p{L})/iu, taxable: true },
    {
      kind: 'thirteenth-month',
      pattern: /\b13[eè]me\s+mois\b|\btreizi[eè]me\s+mois\b/i,
      taxable: true,
    },
    { kind: 'seniority-bonus', pattern: /\bprime\s+d['’]anciennet[eé](?!\p{L})/iu, taxable: true },
    { kind: 'performance-bonus', pattern: /\bprime\b/i, taxable: true },
  ]
  for (const line of lines) {
    if (/\b(?:total|cumul|brut|net)\b/i.test(line.text)) continue
    if (/titres?[\s-]+restaurant|tickets?[\s-]+restaurant/i.test(line.text)) {
      const amount = lastAmountOnLine(line)
      if (amount !== null) {
        const signed = -Math.abs(amount)
        afterTaxAdjustments += signed
        extractedLines.push({
          section: 'after_tax',
          itemKind: 'meal-vouchers',
          label: 'Titres-restaurant (part salarié)',
          quantityHundredths: null,
          baseAmount: null,
          employeeRateMicros: null,
          employeeAmount: signed,
          employerRateMicros: null,
          employerAmount: 0,
          taxable: false,
        })
      }
      continue
    }
    for (const vp of variablePatterns) {
      if (vp.pattern.test(line.text)) {
        const amount = lastAmountOnLine(line)
        if (amount !== null && amount > 0) {
          extractedLines.push({
            section: 'variable',
            itemKind: vp.kind,
            label: line.text.slice(0, 120),
            quantityHundredths: null,
            baseAmount: null,
            employeeRateMicros: null,
            employeeAmount: amount,
            employerRateMicros: null,
            employerAmount: 0,
            taxable: vp.taxable,
          })
          break
        }
      }
    }
  }

  let baseHoursHundredths: number | null = null
  for (const line of lines) {
    if (/\b(?:heures?\s+travail|base\s+horaire|salaire\s+(?:de\s+)?base)\b/i.test(line.text)) {
      const h = line.text.match(/\b(1\d{2}(?:[,.]\d{1,2})?)\s*(?:h|heures?)\b/i)
      if (h) {
        baseHoursHundredths = Math.round(Number.parseFloat(h[1]!.replace(',', '.')) * 100)
        break
      }
    }
  }

  const baseSalary = baseMatch?.value ?? grossMatch?.value ?? 0
  const gross = grossMatch?.value ?? baseSalary
  const employeeContributions = empContribMatch?.value ?? 0
  const employerContributions = erContribMatch?.value ?? 0
  const netBeforeTax =
    netBeforeTaxMatch?.value ??
    (gross > 0 && employeeContributions > 0 ? gross - employeeContributions : 0)
  const taxableNet = taxableNetMatch?.value ?? netBeforeTax
  const withholdingTax = pasMatch?.value ?? 0
  const netPaid =
    netPaidMatch?.value ??
    (netBeforeTax > 0 ? netBeforeTax - withholdingTax + afterTaxAdjustments : 0)

  if (baseMatch) setZone('baseSalary', 0.93, baseMatch.zone)
  if (grossMatch) setZone('gross', 0.95, grossMatch.zone)
  if (empContribMatch) setZone('employeeContributions', 0.92, empContribMatch.zone)
  if (erContribMatch) setZone('employerContributions', 0.9, erContribMatch.zone)
  if (netBeforeTaxMatch) setZone('netBeforeTax', 0.94, netBeforeTaxMatch.zone)
  if (taxableNetMatch) setZone('taxableNet', 0.94, taxableNetMatch.zone)
  if (socialNetMatch) setZone('socialNet', 0.94, socialNetMatch.zone)
  if (pasMatch) setZone('withholdingTax', 0.94, pasMatch.zone)
  if (netPaidMatch) setZone('netPaid', 0.96, netPaidMatch.zone)

  if (withholdingRateMicros === 0 && taxableNet > 0 && withholdingTax > 0) {
    withholdingRateMicros = Math.round((withholdingTax / taxableNet) * 1_000_000)
  }

  const missingFields: string[] = []
  if (!periodMatch.value) missingFields.push('period')
  if (!grossMatch) missingFields.push('gross')
  if (!empContribMatch) missingFields.push('employeeContributions')
  if (!taxableNetMatch) missingFields.push('taxableNet')
  if (!netPaidMatch) missingFields.push('netPaid')

  const issues = checkPayslipDetailed({
    countryPack: 'fr',
    period: periodMatch.value ?? '2026-01',
    totalsOnly: extractedLines.filter((l) => l.section === 'contribution').length === 0,
    baseHoursHundredths,
    hourlyRate: null,
    baseSalary,
    gross,
    employeeContributions,
    employerContributions,
    netBeforeTax,
    taxableNet,
    socialNet: socialNetMatch?.value ?? null,
    withholdingRateMicros,
    withholdingBase: taxableNet > 0 ? taxableNet : null,
    withholdingTax,
    otherAdjustments: afterTaxAdjustments,
    netPaid,
    ytdGross: ytdGrossMatch?.value ?? null,
    ytdTaxableNet: ytdTaxableMatch?.value ?? null,
    ytdWithholding: ytdWithholdingMatch?.value ?? null,
    ytdHoursHundredths: null,
    lines: extractedLines,
  })

  const errorCount = issues.filter((issue) => issue.severity === 'error').length
  const foundRequired = 5 - missingFields.length
  const baseConfidence = Math.max(0.15, foundRequired / 5)
  const overallConfidence = Math.max(
    0.1,
    Math.min(0.98, baseConfidence - errorCount * 0.15 + (errorCount === 0 ? 0.05 : 0)),
  )

  return {
    kind: 'payslip',
    employerName,
    employerSiret,
    period: periodMatch.value,
    paymentDate,
    currency: 'EUR',
    baseHoursHundredths,
    hourlyRate: null,
    baseSalary,
    gross,
    employeeContributions,
    employerContributions,
    netBeforeTax,
    taxableNet,
    socialNet: socialNetMatch?.value ?? null,
    withholdingRateMicros,
    withholdingPersonalized: true,
    withholdingBase: taxableNet > 0 ? taxableNet : null,
    withholdingTax,
    otherAdjustments: afterTaxAdjustments,
    netPaid,
    ytdGross: ytdGrossMatch?.value ?? null,
    ytdTaxableNet: ytdTaxableMatch?.value ?? null,
    ytdWithholding: ytdWithholdingMatch?.value ?? null,
    ytdHoursHundredths: null,
    lines: extractedLines,
    fieldZones,
    missingFields,
    overallConfidence,
    needsAiAssist: missingFields.length > 0 || errorCount > 0 || gross === 0,
  }
}

/**
 * Extraction déterministe d'un relevé bancaire PDF depuis les lignes visuelles reconstruites.
 * Gère les colonnes unique `Montant` ou séparées `Débit / Crédit` et vérifie la cohérence des soldes.
 */
export function extractPdfBankStatement(
  pages: readonly ExtractedPage[],
  defaultCurrency = 'EUR',
): ExtractedStatementDraft {
  const lines = reconstructLines(pages)

  let currency = defaultCurrency
  let accountHint: string | null = null
  let openingBalance: MinorUnits | null = null
  let closingBalance: MinorUnits | null = null
  let periodStart: string | null = null
  let periodEnd: string | null = null
  let debitColX: number | null = null
  let creditColX: number | null = null

  for (const line of lines) {
    if (!accountHint) {
      const iban = line.text.match(/\b([A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7})\b/)
      if (iban) {
        const clean = iban[1]!.replace(/\s+/g, '')
        accountHint = `${clean.slice(0, 4)}…${clean.slice(-4)}`
      }
    }
    const currMatch = line.text.match(/\b(EUR|USD|CHF|GBP|CAD)\b/)
    if (currMatch && currency === defaultCurrency) {
      currency = currMatch[1]!
    }
    if (
      openingBalance === null &&
      /\b(?:ancien\s+solde|solde\s+initial|opening\s+balance)\b/i.test(line.text)
    ) {
      const amt = lastAmountOnLine(line)
      if (amt !== null) {
        openingBalance = /d[eé]bit(?:eur)?/i.test(line.text) && amt > 0 ? -amt : amt
      }
    }
    if (
      closingBalance === null &&
      /\b(?:nouveau\s+solde|solde\s+final|closing\s+balance)\b/i.test(line.text)
    ) {
      const amt = lastAmountOnLine(line)
      if (amt !== null) {
        closingBalance = /d[eé]bit(?:eur)?/i.test(line.text) && amt > 0 ? -amt : amt
      }
    }
    if (
      !periodStart &&
      /\b(?:p[eé]riode|du)\s+(\d{2}[/.-]\d{2}[/.-]\d{4})\s+(?:au|to)\s+(\d{2}[/.-]\d{2}[/.-]\d{4})/i.test(
        line.text,
      )
    ) {
      const m = line.text.match(
        /(\d{2}[/.-]\d{2}[/.-]\d{4})\s+(?:au|to)\s+(\d{2}[/.-]\d{2}[/.-]\d{4})/i,
      )
      if (m) {
        periodStart = parseFrenchDate(m[1]!)
        periodEnd = parseFrenchDate(m[2]!)
      }
    }
    if (
      debitColX === null &&
      creditColX === null &&
      /\bd[eé]bit\b/i.test(line.text) &&
      /\bcr[eé]dit\b/i.test(line.text)
    ) {
      for (const item of line.items) {
        if (/\bd[eé]bit\b/i.test(item.text)) debitColX = item.box.x + item.box.width / 2
        if (/\bcr[eé]dit\b/i.test(item.text)) creditColX = item.box.x + item.box.width / 2
      }
    }
  }

  // Année de repli si les lignes de relevé sont au format JJ/MM.
  const fallbackYearMatch = lines
    .map((l) => l.text.match(/\b(20\d{2})\b/)?.[1] ?? null)
    .find((y) => y !== null)
  const fallbackYear = fallbackYearMatch ?? '2026'

  const rows: ExtractedStatementRow[] = []
  let index = 0

  for (const line of lines) {
    if (
      /\b(?:ancien|nouveau)\s+solde\b|\bsolde\s+(?:initial|final|au)\b|\btotal\s+des\b/i.test(
        line.text,
      )
    ) {
      continue
    }

    const fullDateMatch = line.text.match(/^(\d{2}[/.-]\d{2}[/.-]\d{4}|\d{4}-\d{2}-\d{2})\s+(.+)$/)
    const shortDateMatch = !fullDateMatch ? line.text.match(/^(\d{2})[/.-](\d{2})\s+(.+)$/) : null

    let bookingDate: string | null = null
    let remainder = ''
    if (fullDateMatch) {
      bookingDate = parseFrenchDate(fullDateMatch[1]!)
      remainder = fullDateMatch[2]!
    } else if (shortDateMatch) {
      bookingDate = validateIso(`${fallbackYear}-${shortDateMatch[2]}-${shortDateMatch[1]}`)
      remainder = shortDateMatch[3]!
    }
    if (!bookingDate || !remainder) continue

    const amountMatches = [...remainder.matchAll(AMOUNT_TOKEN_RE)]
    if (amountMatches.length === 0) continue

    const lastMatch = amountMatches.at(-1)!
    const rawAmount = parseAmountCents(lastMatch[0])
    if (rawAmount === null) continue

    let amount = rawAmount
    // Résolution du signe via position horizontale si colonnes Débit / Crédit détectées.
    if (
      debitColX !== null &&
      creditColX !== null &&
      line.items.length > 0 &&
      !/^[+-]/.test(lastMatch[0].trim())
    ) {
      const amountItem = [...line.items]
        .reverse()
        .find((it) => new RegExp(AMOUNT_TOKEN_RE.source).test(it.text.trim()))
      if (amountItem) {
        const cx = amountItem.box.x + amountItem.box.width / 2
        const distDebit = Math.abs(cx - debitColX)
        const distCredit = Math.abs(cx - creditColX)
        amount = distDebit <= distCredit ? -Math.abs(rawAmount) : Math.abs(rawAmount)
      }
    } else if (!/^[+-]/.test(lastMatch[0].trim())) {
      // Heuristique de signe quand il n'y a pas de colonnes x explicites.
      if (/\b(?:virement\s+re[cç]u|salaire|remboursement|avoir|cr[eé]dit)\b/i.test(remainder)) {
        amount = Math.abs(rawAmount)
      } else if (
        /\b(?:cb|carte|pr[eé]l[eè]vement|prlv|retrait|virement\s+[eé]mis|facture)\b/i.test(
          remainder,
        )
      ) {
        amount = -Math.abs(rawAmount)
      }
    }

    const labelRaw = remainder
      .slice(0, lastMatch.index)
      .replace(/^\d{2}[/.-]\d{2}(?:[/.-]\d{4})?\s+/, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!labelRaw) continue

    rows.push({
      index: index++,
      bookingDate,
      valueDate: null,
      amount,
      currency,
      labelRaw: labelRaw.slice(0, 500),
      payee: null,
      note: null,
      status: 'cleared',
      externalId: null,
      runningBalance: null,
      confidence: 0.9,
      sourceZone: zoneOf(line),
    })
  }

  if (!periodStart && rows.length > 0) {
    periodStart = rows.reduce(
      (min, r) => (r.bookingDate < min ? r.bookingDate : min),
      rows[0]!.bookingDate,
    )
  }
  if (!periodEnd && rows.length > 0) {
    periodEnd = rows.reduce(
      (max, r) => (r.bookingDate > max ? r.bookingDate : max),
      rows[0]!.bookingDate,
    )
  }

  let balanceDiscrepancy: MinorUnits | null = null
  if (openingBalance !== null && closingBalance !== null) {
    const sumRows = rows.reduce((acc, row) => acc + row.amount, 0)
    balanceDiscrepancy = closingBalance - (openingBalance + sumRows)
  }

  const balanced = balanceDiscrepancy === null || balanceDiscrepancy === 0
  const overallConfidence = rows.length === 0 ? 0.25 : balanced ? 0.93 : 0.65

  return {
    kind: 'statement',
    currency,
    accountHint,
    periodStart,
    periodEnd,
    openingBalance,
    closingBalance,
    rows,
    balanceDiscrepancy,
    overallConfidence,
    needsAiAssist: rows.length === 0 || balanceDiscrepancy !== 0,
  }
}

export function extractOtherDocument(
  pages: readonly ExtractedPage[],
  fileName: string,
): ExtractedOtherDraft {
  const lines = reconstructLines(pages)
  let detectedDate: string | null = null
  let detectedAmount: MinorUnits | null = null

  for (const line of lines) {
    if (!detectedDate) detectedDate = parseFrenchDate(line.text)
    if (detectedAmount === null) {
      const m = lastAmountOnLine(line)
      if (m !== null && m > 0) detectedAmount = m
    }
    if (detectedDate && detectedAmount !== null) break
  }

  return {
    kind: 'other',
    title: fileName.replace(/\.[^.]+$/, ''),
    detectedDate,
    detectedAmount,
    currency: detectedAmount !== null ? 'EUR' : null,
    overallConfidence: lines.length > 0 ? 0.6 : 0.2,
    needsAiAssist: lines.length === 0,
  }
}
