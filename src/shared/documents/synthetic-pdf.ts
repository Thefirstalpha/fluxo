/**
 * Génère un fichier PDF 1.4 minimal valide contenant les lignes passées en texte positionné.
 * Utile pour tester l'extraction PDF locale, la suite d'évaluation hors-ligne et les tests E2E.
 */
export function buildSyntheticPdf(lines: readonly string[]): Uint8Array {
  const esc = (raw: string) =>
    raw
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/€/g, 'EUR')
      .replace(/[éèêë]/g, 'e')
      .replace(/[àâ]/g, 'a')
      .replace(/[îï]/g, 'i')
      .replace(/[ôö]/g, 'o')
      .replace(/[ûüù]/g, 'u')
      .replace(/ç/g, 'c')
      .replace(/[ÉÈÊ]/g, 'E')
      .replace(/’/g, "'")

  const ops: string[] = ['BT', '/F1 10 Tf']
  let y = 780
  for (const line of lines) {
    ops.push(`1 0 0 1 48 ${y} Tm (${esc(line)}) Tj`)
    y -= 18
  }
  ops.push('ET')
  const streamContent = `${ops.join('\n')}\n`

  const enc = new TextEncoder()
  const byteLength = (text: string) => enc.encode(text).byteLength

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${byteLength(streamContent)} >>\nstream\n${streamContent}endstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ]

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = [0]
  for (const obj of objects) {
    offsets.push(byteLength(pdf))
    pdf += obj
  }
  const xrefStart = byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  return enc.encode(pdf)
}
