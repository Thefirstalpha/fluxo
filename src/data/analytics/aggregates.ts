import type { Db } from '../db/connection'

export const UNCATEGORIZED_AGG_KEY = '__none__'

/**
 * Recalcule `monthly_category_aggregate` lorsque `meta.aggregates_dirty` vaut `'1'`.
 * En lecture courante sans modification récente, cette vérification ne coûte qu'une clé `meta`.
 */
export function ensureFreshMonthlyAggregates(db: Db): void {
  const dirty = db
    .prepare("SELECT value FROM meta WHERE key = 'aggregates_dirty'")
    .pluck()
    .get() as string | undefined
  if (dirty === '0') return

  const recompute = db.transaction(() => {
    db.exec('DELETE FROM monthly_category_aggregate')
    db.exec(`
      WITH parts AS (
        SELECT
          substr(t.booking_date, 1, 7) AS month,
          t.id AS tx_id,
          t.account_id,
          coalesce(s.category_id, '${UNCATEGORIZED_AGG_KEY}') AS category_id,
          t.currency,
          c.kind AS kind,
          t.transfer_id AS transfer_id,
          coalesce(s.amount, t.amount) AS part_raw,
          CASE
            WHEN t.converted_amount IS NOT NULL THEN
              CASE
                WHEN s.amount IS NULL OR t.amount = 0 THEN t.converted_amount
                ELSE CAST(ROUND(CAST(s.amount AS REAL) * t.converted_amount / t.amount) AS INTEGER)
              END
            ELSE NULL
          END AS part_conv
        FROM transactions t
        LEFT JOIN split s ON s.transaction_id = t.id
        LEFT JOIN category c ON c.id = s.category_id
        WHERE t.nature = 'operation'
      ),
      classified AS (
        SELECT
          month,
          account_id,
          category_id,
          currency,
          tx_id,
          (coalesce(kind, '') = 'transfer' OR (transfer_id IS NOT NULL AND coalesce(kind, '') != 'savings')) AS is_transfer,
          (coalesce(kind, '') = 'savings') AS is_savings,
          (coalesce(kind, '') = 'income' OR (kind IS NULL AND part_raw > 0 AND transfer_id IS NULL)) AS is_income,
          part_raw,
          part_conv
        FROM parts
      )
      INSERT INTO monthly_category_aggregate (
        month, account_id, category_id, currency,
        income, expenses, savings, transfer_in, transfer_out,
        income_conv, expenses_conv, savings_conv, transfer_in_conv, transfer_out_conv,
        unconverted, tx_count
      )
      SELECT
        month,
        account_id,
        category_id,
        currency,
        coalesce(SUM(CASE WHEN NOT is_transfer AND NOT is_savings AND is_income AND part_raw > 0 THEN part_raw ELSE 0 END), 0),
        coalesce(SUM(CASE WHEN NOT is_transfer AND NOT is_savings AND NOT is_income AND part_raw < 0 THEN -part_raw ELSE 0 END), 0),
        coalesce(SUM(CASE WHEN is_savings AND part_raw > 0 THEN part_raw ELSE 0 END), 0),
        coalesce(SUM(CASE WHEN is_transfer AND part_raw > 0 THEN part_raw ELSE 0 END), 0),
        coalesce(SUM(CASE WHEN is_transfer AND part_raw < 0 THEN -part_raw ELSE 0 END), 0),
        coalesce(SUM(CASE WHEN NOT is_transfer AND NOT is_savings AND is_income AND coalesce(part_conv, 0) > 0 THEN part_conv ELSE 0 END), 0),
        coalesce(SUM(CASE WHEN NOT is_transfer AND NOT is_savings AND NOT is_income AND coalesce(part_conv, 0) < 0 THEN -part_conv ELSE 0 END), 0),
        coalesce(SUM(CASE WHEN is_savings AND coalesce(part_conv, 0) > 0 THEN part_conv ELSE 0 END), 0),
        coalesce(SUM(CASE WHEN is_transfer AND coalesce(part_conv, 0) > 0 THEN part_conv ELSE 0 END), 0),
        coalesce(SUM(CASE WHEN is_transfer AND coalesce(part_conv, 0) < 0 THEN -part_conv ELSE 0 END), 0),
        coalesce(MAX(CASE WHEN part_conv IS NULL THEN 1 ELSE 0 END), 0),
        COUNT(DISTINCT tx_id)
      FROM classified
      GROUP BY month, account_id, category_id, currency
    `)
    db.prepare(
      `INSERT INTO meta (key, value) VALUES ('aggregates_dirty', '0')
       ON CONFLICT (key) DO UPDATE SET value = '0'`,
    ).run()
  })
  recompute.immediate()
}
