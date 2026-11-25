import { createHash } from 'node:crypto'
import {
  DEMO_ACCOUNT_NAMES,
  type DemoAccountKey,
  type DemoCategoryId,
  type DemoLedger,
} from '@shared/demo/demo-ledger'
import { CATEGORY_PACK_FR } from '@shared/ledger/category-pack'
import type { LedgerIcon, PaletteColor } from '@shared/ledger/model'
import { buildDefaultContributionLines } from '@shared/payslip'
import type { Locale } from '@shared/settings'
import { uuidv7 } from '@shared/uuid'
import { recordAudit } from '../db/audit'
import type { Db } from '../db/connection'
import { backfillSavingsLinkedCategories } from '../ledger/categories'

const DEMO_ACCOUNT_LOOK: Readonly<
  Record<DemoAccountKey, { color: PaletteColor; icon: LedgerIcon }>
> = {
  checking: { color: '#0977cb', icon: 'landmark' },
  savings: { color: '#0e9b8f', icon: 'piggy-bank' },
  cash: { color: '#dca81c', icon: 'banknote' },
}

function topLevelCategories(db: Db, locale: Locale): Map<DemoCategoryId, string> {
  const rows = db.prepare('SELECT id, name FROM category WHERE parent_id IS NULL').all() as {
    id: string
    name: string
  }[]
  const byName = new Map(rows.map((row) => [row.name, row.id]))
  const categories = new Map<DemoCategoryId, string>()
  for (const category of CATEGORY_PACK_FR) {
    const id = byName.get(category.names[locale])
    if (id) categories.set(category.key as DemoCategoryId, id)
  }
  return categories
}

/**
 * Remplit un coffre (de démonstration uniquement) avec le grand livre déterministe : comptes,
 * lots « démo » pour les comptes à relevé (ADR-026), opérations ventilées, virements
 * d'épargne liés. Les catégories sont celles du pack France, créé avec le coffre : une
 * opération est classée dans la catégorie de premier niveau de même clé. Une seule entrée
 * d'audit (`seed`) pour l'ensemble.
 */
export function seedDemoVault(
  db: Db,
  ledger: DemoLedger,
  { locale, now }: { locale: Locale; now: Date },
): { accounts: number; transactions: number } {
  const stamp = now.toISOString()
  const firstDate = ledger.transactions[0]?.date ?? stamp.slice(0, 10)
  const lastDate = ledger.transactions.at(-1)?.date ?? firstDate

  db.transaction(() => {
    const categories = topLevelCategories(db, locale)
    const accounts = new Map<DemoAccountKey, { id: string; batch: string | null }>()
    const insertAccount = db.prepare(
      `INSERT INTO account (id, name, type, tracking_mode, currency, opening_balance, opening_date,
         color, icon, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'EUR', ?, ?, ?, ?, ?, ?, ?)`,
    )
    const insertBatch = db.prepare(
      `INSERT INTO import_batch (id, account_id, file_name, file_hash, format, period_start,
         period_end, inserted_count, state, created_at)
       VALUES (?, ?, ?, ?, 'demo', ?, ?, ?, 'committed', ?)`,
    )
    ledger.accounts.forEach((account, index) => {
      const id = uuidv7()
      insertAccount.run(
        id,
        DEMO_ACCOUNT_NAMES[locale][account.key],
        account.type,
        account.trackingMode,
        account.openingBalance,
        firstDate,
        DEMO_ACCOUNT_LOOK[account.key].color,
        DEMO_ACCOUNT_LOOK[account.key].icon,
        index,
        stamp,
        stamp,
      )
      let batch: string | null = null
      if (account.trackingMode === 'statement') {
        batch = uuidv7()
        const count = ledger.transactions.filter((t) => t.account === account.key).length
        const hash = createHash('sha256').update(`fluxo-demo:${account.key}`).digest('hex')
        insertBatch.run(batch, id, 'demonstration', hash, firstDate, lastDate, count, stamp)
      }
      accounts.set(account.key, { id, batch })
    })

    const insertTransaction = db.prepare(
      `INSERT INTO transactions (id, account_id, booking_date, amount, currency, label_raw,
         status, import_batch_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'EUR', ?, 'cleared', ?, ?, ?)`,
    )
    const insertSplit = db.prepare(
      'INSERT INTO split (id, transaction_id, category_id, amount, position) VALUES (?, ?, ?, ?, 0)',
    )
    const linkTransfer = db.prepare('UPDATE transactions SET transfer_id = ? WHERE id = ?')
    const pendingTransfer = new Map<DemoCategoryId, string>()
    const salaryTxByMonth = new Map<string, { id: string; date: string }>()
    for (const transaction of ledger.transactions) {
      const account = accounts.get(transaction.account)
      const category = categories.get(transaction.category)
      if (!account || !category) throw new Error('Grand livre de démonstration incohérent')
      const id = uuidv7()
      insertTransaction.run(
        id,
        account.id,
        transaction.date,
        transaction.amount,
        transaction.label,
        account.batch,
        stamp,
        stamp,
      )
      insertSplit.run(uuidv7(), id, category, transaction.amount)
      if (transaction.category === 'salary') {
        salaryTxByMonth.set(transaction.date.slice(0, 7), { id, date: transaction.date })
      }
      // Les deux écritures d'un virement (épargne, retrait d'espèces) se suivent : on les relie.
      if (transaction.category === 'savings' || transaction.category === 'transfer') {
        const pending = pendingTransfer.get(transaction.category)
        if (pending) {
          linkTransfer.run(id, pending)
          linkTransfer.run(pending, id)
          pendingTransfer.delete(transaction.category)
        } else {
          pendingTransfer.set(transaction.category, id)
        }
      }
    }
    backfillSavingsLinkedCategories(db, now)

    // Bulletins de démonstration M6 reliés aux virements de salaire.
    if (ledger.months.length > 0) {
      const employerId = uuidv7()
      const contractId = uuidv7()
      const firstMonth = ledger.months[0]!.month
      db.prepare(
        `INSERT INTO employer (id, name, siret, address, archived, created_at, updated_at)
         VALUES (?, ?, '12345678900014', '10 Avenue des Nations, 75001 Paris', 0, ?, ?)`,
      ).run(
        employerId,
        locale === 'en-US' ? 'Example Corp SAS' : 'Entreprise Exemple SAS',
        stamp,
        stamp,
      )
      db.prepare(
        `INSERT INTO contract (id, employer_id, title, contract_type, executive_status, work_time,
           work_time_ratio_micros, monthly_hours_hundredths, collective_agreement, classification,
           start_date, end_date, default_base_salary, currency, country_pack, employee_nir,
           archived, created_at, updated_at)
         VALUES (?, ?, ?, 'cdi', 'cadre', 'full_time', 1000000, 15167, 'Syntec', 'Position 2.2 · Coef 130',
           ?, NULL, ?, 'EUR', 'fr', NULL, 0, ?, ?)`,
      ).run(
        contractId,
        employerId,
        locale === 'en-US' ? 'Software Engineer — Permanent' : 'Ingénieur logiciel — CDI',
        `${firstMonth}-01`,
        ledger.months[0]!.payslip.baseSalary,
        stamp,
        stamp,
      )

      const insertPayslip = db.prepare(
        `INSERT INTO payslip (id, contract_id, period, payment_date, country_pack, currency, totals_only,
           base_hours_hundredths, hourly_rate, base_salary, gross, employee_contributions, employer_contributions,
           net_before_tax, taxable_net, social_net, withholding_rate_micros, withholding_personalized,
           withholding_base, withholding_tax, other_adjustments, net_paid, ytd_gross, ytd_taxable_net,
           ytd_withholding, ytd_hours_hundredths, employee_nir, employee_address, transaction_id,
           source_origin, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'fr', 'EUR', 0, 15167, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, 'demo', NULL, ?, ?)`,
      )
      const insertPayslipLine = db.prepare(
        `INSERT INTO payslip_line (id, payslip_id, section, item_kind, label, quantity_hundredths,
           base_amount, employee_rate_micros, employee_amount, employer_rate_micros, employer_amount,
           taxable, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )

      let ytdYear = ''
      let ytdGross = 0
      let ytdTaxable = 0
      let ytdTax = 0
      let ytdHours = 0

      for (const summary of ledger.months) {
        const yr = summary.month.slice(0, 4)
        if (yr !== ytdYear) {
          ytdYear = yr
          ytdGross = 0
          ytdTaxable = 0
          ytdTax = 0
          ytdHours = 0
        }
        const p = summary.payslip
        ytdGross += p.gross
        ytdTaxable += p.taxableNet
        ytdTax += p.withholdingTax
        ytdHours += 15_167

        const payslipId = uuidv7()
        const tx = salaryTxByMonth.get(summary.month)
        const contribTemplate = buildDefaultContributionLines(p.gross)
        // Ajuste la dernière ligne pour que Σ cotisations salariales == p.employeeContributions exactement.
        const rawEmpSum = contribTemplate.reduce((acc, l) => acc + l.employeeAmount, 0)
        if (contribTemplate.length > 0) {
          const last = contribTemplate[contribTemplate.length - 1]!
          last.employeeAmount += p.employeeContributions - rawEmpSum
        }
        const employerContributions = contribTemplate.reduce((acc, l) => acc + l.employerAmount, 0)

        insertPayslip.run(
          payslipId,
          contractId,
          p.period,
          tx?.date ?? null,
          p.baseSalary,
          p.gross,
          p.employeeContributions,
          employerContributions,
          p.netBeforeTax,
          p.taxableNet,
          p.netBeforeTax,
          Math.round(p.withholdingRate * 1_000_000),
          p.withholdingTax,
          p.otherAdjustments,
          p.netPaid,
          ytdGross,
          ytdTaxable,
          ytdTax,
          ytdHours,
          tx?.id ?? null,
          stamp,
          stamp,
        )

        let pos = 0
        for (const extra of p.extras) {
          insertPayslipLine.run(
            uuidv7(),
            payslipId,
            'variable',
            extra.kind,
            extra.kind,
            null,
            null,
            null,
            extra.amount,
            null,
            0,
            1,
            pos++,
          )
        }
        for (const c of contribTemplate) {
          insertPayslipLine.run(
            uuidv7(),
            payslipId,
            'contribution',
            c.itemKind,
            c.label,
            null,
            c.baseAmount,
            c.employeeRateMicros,
            c.employeeAmount,
            c.employerRateMicros,
            c.employerAmount,
            c.taxable ? 1 : 0,
            pos++,
          )
        }
        if (p.otherAdjustments !== 0) {
          insertPayslipLine.run(
            uuidv7(),
            payslipId,
            'after_tax',
            'meal-vouchers',
            locale === 'en-US'
              ? 'Meal vouchers (employee share)'
              : 'Titres-restaurant (part salariale)',
            null,
            null,
            null,
            p.otherAdjustments,
            null,
            0,
            0,
            pos,
          )
        }
      }
    }

    recordAudit(
      db,
      {
        entity: 'vault',
        entityId: null,
        action: 'seed',
        origin: 'system',
        after: { accounts: ledger.accounts.length, transactions: ledger.transactions.length },
      },
      now,
    )
  })()
  return { accounts: ledger.accounts.length, transactions: ledger.transactions.length }
}
