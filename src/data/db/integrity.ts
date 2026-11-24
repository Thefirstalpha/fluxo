import type { Db } from './connection'

/**
 * Contrôle de cohérence : transactions dont la somme des ventilations diffère du montant.
 * Une transaction sans ventilation a une part implicite (non ventilée) : elle est cohérente.
 */
export function findUnbalancedTransactions(
  db: Db,
): { id: string; amount: number; splits: number }[] {
  return db
    .prepare(
      `SELECT t.id, t.amount, SUM(s.amount) AS splits
       FROM transactions t JOIN split s ON s.transaction_id = t.id
       GROUP BY t.id HAVING SUM(s.amount) <> t.amount`,
    )
    .all() as { id: string; amount: number; splits: number }[]
}
