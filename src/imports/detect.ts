import type { StatementFormat } from '@shared/imports/model'
import { decodeBytes } from './encoding'

/**
 * Identifie le format probable d'un relevé par inspection de son en-tête,
 * puis par l'extension du fichier en dernier recours.
 */
export function detectFormat(bytes: Uint8Array, fileName: string): StatementFormat {
  const sample = decodeBytes(bytes.subarray(0, 8192)).text.trimStart()
  const lowerExt = fileName.toLowerCase().slice(Math.max(0, fileName.lastIndexOf('.')))

  if (/(?:^|\r?\n)\s*OFXHEADER:/i.test(sample) || /<OFX[\s>]/i.test(sample)) {
    return lowerExt === '.qfx' ? 'qfx' : 'ofx'
  }

  if (
    sample.startsWith('<?xml') ||
    sample.startsWith('<Document') ||
    sample.includes('<BkToCstmrStmt') ||
    sample.includes('camt.053')
  ) {
    if (sample.includes('<OFX')) return lowerExt === '.qfx' ? 'qfx' : 'ofx'
    return 'camt053'
  }

  if (/^\s*!(?:Type|Account):?/im.test(sample)) {
    return 'qif'
  }

  if (
    sample.startsWith('{1:') ||
    (/(?:^|\r?\n):20:/m.test(sample) && /(?:^|\r?\n):60[FM]:/m.test(sample))
  ) {
    return 'mt940'
  }

  if (lowerExt === '.qfx') return 'qfx'
  if (lowerExt === '.ofx') return 'ofx'
  if (lowerExt === '.qif') return 'qif'
  if (lowerExt === '.mt940' || lowerExt === '.sta' || lowerExt === '.940') return 'mt940'
  if (lowerExt === '.camt') return 'camt053'

  return 'csv'
}
