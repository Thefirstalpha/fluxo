import type { DocumentKind, ExtractedPage } from './model'

export interface DocumentClassification {
  kind: DocumentKind
  confidence: number
  signals: string[]
}

interface SignalRule {
  pattern: RegExp
  label: string
  weight: number
}

const PAYSLIP_RULES: readonly SignalRule[] = [
  { pattern: /\bbulletin\s+de\s+(?:paie|salaire)\b/i, label: 'bulletin de paie', weight: 4 },
  {
    pattern: /\bsolde\s+de\s+tout\s+compte\b|\bre[cç]u\s+pour\s+solde\b/i,
    label: 'solde de tout compte',
    weight: 4.5,
  },
  {
    pattern:
      /\bindemnit[eé]\s+(?:compensatrice\s+de\s+cong[eé]s|de\s+(?:licenciement|rupture|pr[eé]carit[eé]|fin\s+de\s+contrat))\b/i,
    label: 'indemnité fin de contrat',
    weight: 3.5,
  },
  {
    pattern: /\bdate\s+d['’](?:entr[eé]e|embauche)\b|\bdate\s+de\s+sortie\b/i,
    label: 'dates contrat',
    weight: 2,
  },
  {
    pattern: /\bsolde\s+de\s+tout\s+compte\b|\bre[cç]u\s+pour\s+solde\b/i,
    label: 'solde de tout compte',
    weight: 4.5,
  },
  {
    pattern:
      /\bindemnit[eé]\s+(?:compensatrice\s+de\s+cong[eé]s|de\s+(?:licenciement|rupture|pr[eé]carit[eé]|fin\s+de\s+contrat))\b/i,
    label: 'indemnité fin de contrat',
    weight: 3.5,
  },
  {
    pattern: /\bdate\s+d['’](?:entr[eé]e|embauche)\b|\bdate\s+de\s+sortie\b/i,
    label: 'dates contrat',
    weight: 2,
  },
  { pattern: /\bpayslip\b/i, label: 'payslip', weight: 4 },
  { pattern: /\bmontant\s+net\s+social\b|\bnet\s+social\b/i, label: 'net social', weight: 3 },
  {
    pattern: /\bnet\s+imposable\b|\bcumul\s+net\s+imposable\b/i,
    label: 'net imposable',
    weight: 3,
  },
  {
    pattern: /\bpr[eé]l[eè]vement\s+[àa]\s+la\s+source\b/i,
    label: 'prélèvement à la source',
    weight: 3,
  },
  { pattern: /\bnet\s+[àa]\s+payer\s+avant\s+imp[oô]t\b/i, label: 'net avant impôt', weight: 3 },
  { pattern: /\bnet\s+(?:pay[eé]|[àa]\s+payer)\b/i, label: 'net payé', weight: 2 },
  { pattern: /\bsalaire\s+(?:de\s+base|brut)\b/i, label: 'salaire brut', weight: 2.5 },
  { pattern: /\bcotisations?\s+(?:salariales?|patronales?)\b/i, label: 'cotisations', weight: 2 },
  { pattern: /\bcsg\b|\bcrds\b|\burssaf\b|\bagirc\b/i, label: 'csg/crds/urssaf', weight: 1.5 },
  { pattern: /\bsiret\b|\bconvention\s+collective\b/i, label: 'employeur / SIRET', weight: 1.5 },
]

const STATEMENT_RULES: readonly SignalRule[] = [
  {
    pattern: /\brelev[eé]\s+(?:de\s+compte|bancaire|d'op[eé]rations)\b/i,
    label: 'relevé de compte',
    weight: 4,
  },
  {
    pattern: /\bextrait\s+de\s+compte\b|\bbank\s+statement\b/i,
    label: 'extrait de compte',
    weight: 4,
  },
  { pattern: /\b(?:ancien|nouveau)\s+solde\b/i, label: 'ancien/nouveau solde', weight: 3.5 },
  { pattern: /\b(?:opening|closing)\s+balance\b/i, label: 'opening/closing balance', weight: 3.5 },
  {
    pattern: /\bsolde\s+(?:au|cr[eé]diteur|d[eé]biteur|initial|final)\b/i,
    label: 'solde de période',
    weight: 2.5,
  },
  {
    pattern: /\bdate\s+d['’]op[eé]ration\b|\bdate\s+(?:op[eé]\.?|valeur)\b/i,
    label: 'colonnes de relevé',
    weight: 2,
  },
  {
    pattern: /\bd[eé]bit\b[\s\S]{0,40}\bcr[eé]dit\b|\bcr[eé]dit\b[\s\S]{0,40}\bd[eé]bit\b/i,
    label: 'débit / crédit',
    weight: 2,
  },
  {
    pattern: /\btotal\s+des\s+(?:op[eé]rations|mouvements)\b/i,
    label: 'total mouvements',
    weight: 2,
  },
  { pattern: /\biban\b[\s\S]{0,60}\bbic\b/i, label: 'IBAN / BIC', weight: 1.5 },
]

/**
 * Classifie un document par heuristique locale rapide (aucun réseau) entre bulletin de paie,
 * relevé bancaire ou autre pièce justificative.
 */
export function classifyDocument(
  pages: readonly ExtractedPage[],
  fileName: string,
): DocumentClassification {
  const fullText = pages.map((page) => page.text).join('\n')
  const normalizedName = fileName.toLowerCase()

  let payslipScore = 0
  let statementScore = 0
  const payslipSignals: string[] = []
  const statementSignals: string[] = []

  if (/bulletin|paie|salaire|payslip/.test(normalizedName)) {
    payslipScore += 1.5
    payslipSignals.push('nom de fichier')
  }
  if (/releve|relevé|statement|extrait/.test(normalizedName)) {
    statementScore += 1.5
    statementSignals.push('nom de fichier')
  }

  for (const rule of PAYSLIP_RULES) {
    if (rule.pattern.test(fullText)) {
      payslipScore += rule.weight
      payslipSignals.push(rule.label)
    }
  }
  for (const rule of STATEMENT_RULES) {
    if (rule.pattern.test(fullText)) {
      statementScore += rule.weight
      statementSignals.push(rule.label)
    }
  }

  const maxScore = Math.max(payslipScore, statementScore)
  if (maxScore < 2.5 || Math.abs(payslipScore - statementScore) < 1) {
    return {
      kind: 'other',
      confidence: maxScore === 0 ? 0.2 : 0.45,
      signals: [...payslipSignals, ...statementSignals].slice(0, 6),
    }
  }

  if (payslipScore > statementScore) {
    return {
      kind: 'payslip',
      confidence: Math.min(0.98, 0.55 + payslipScore * 0.04),
      signals: payslipSignals.slice(0, 6),
    }
  }

  return {
    kind: 'statement',
    confidence: Math.min(0.98, 0.55 + statementScore * 0.04),
    signals: statementSignals.slice(0, 6),
  }
}
