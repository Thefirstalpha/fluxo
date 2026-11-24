/**
 * Deux noms saisis désignent la même chose s'ils ne diffèrent que par la casse — y compris hors
 * ASCII (« Énergie » = « énergie »), ce que `COLLATE NOCASE` de SQLite ne sait pas faire.
 * Les accents restent distinctifs (« Pâte » ≠ « Pate »).
 */
export function sameName(a: string, b: string): boolean {
  return a.normalize('NFC').toLocaleLowerCase('fr') === b.normalize('NFC').toLocaleLowerCase('fr')
}
