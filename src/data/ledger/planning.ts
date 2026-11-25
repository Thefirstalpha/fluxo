import type { ParsedLedgerInputs } from '@shared/ledger/schemas'
import { addMonths } from '@shared/months'
import { computeLoanSchedule, simulateEarlyRepayment } from '@shared/planning/amortization'
import type {
  BudgetMode,
  BudgetSummary,
  EarlyRepaymentSimulation,
  EndOfMonthForecast,
  ForecastItem,
  GoalSummary,
  InstallmentStatus,
  LoanDetail,
  LoanPeriodicity,
  LoanStatus,
  LoanSummary,
  LoanType,
  NetWorthOverview,
  NetWorthPoint,
  PlannedOrigin,
  PlannedPeriodicity,
  ScenarioDetail,
  ScenarioSummary,
  SimulationProjection,
  ValuationEntry,
} from '@shared/planning/model'
import { projectScenario } from '@shared/planning/simulation'
import { uuidv7 } from '@shared/uuid'
import type { Db } from '../db/connection'
import { listAccounts } from './accounts'
import type { ChangeSet } from './changes'
import { fail } from './failure'
import { detectSubscriptions } from './recurring'

interface ValuationRow {
  id: string
  account_id: string
  valuation_date: string
  value_cents: number
  note: string | null
  created_at: string
}

interface LoanRow {
  id: string
  account_id: string
  account_name: string
  name: string
  loan_type: LoanType
  initial_capital: number
  nominal_rate_micros: number
  taeg_micros: number | null
  insurance_monthly_cents: number
  duration_months: number
  periodicity: LoanPeriodicity
  start_date: string
  end_date: string
  monthly_payment_cents: number
  remaining_principal_cents: number
  status: LoanStatus
  fixed_rate_end_date: string | null
}

interface LoanInstallmentRow {
  id: string
  loan_id: string
  installment_number: number
  due_date: string
  principal_cents: number
  interest_cents: number
  insurance_cents: number
  total_cents: number
  remaining_principal_cents: number
  status: InstallmentStatus
  transaction_id: string | null
}

function daysBetweenIso(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

function monthLastDay(month: string): string {
  const year = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  return new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10)
}

function resolvePrimaryCurrency(db: Db, requested?: string): string {
  if (requested) return requested
  const row = db
    .prepare(
      `SELECT currency FROM account WHERE archived = 0 ORDER BY CASE WHEN type = 'checking' THEN 0 ELSE 1 END, sort_order LIMIT 1`,
    )
    .pluck()
    .get() as string | undefined
  return row ?? 'EUR'
}

// ——— Valorisations manuelles & Patrimoine net ——————————————————————————————

export function listValuations(
  db: Db,
  { accountId }: ParsedLedgerInputs['valuationsList'],
): ValuationEntry[] {
  const rows = db
    .prepare(
      `SELECT id, account_id, valuation_date, value_cents, note, created_at
       FROM valuation_entry WHERE account_id = ?
       ORDER BY valuation_date DESC, created_at DESC`,
    )
    .all(accountId) as ValuationRow[]
  return rows.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    valuationDate: r.valuation_date,
    valueCents: r.value_cents,
    note: r.note,
    createdAt: r.created_at,
  }))
}

export function addValuation(
  changes: ChangeSet,
  input: ParsedLedgerInputs['valuationAdd'],
  now: Date,
): { id: string } {
  const account = changes.db
    .prepare('SELECT id, tracking_mode FROM account WHERE id = ?')
    .get(input.accountId) as { id: string; tracking_mode: string } | undefined
  if (!account) fail('not-found')
  if (account.tracking_mode !== 'valuation') fail('invalid')

  const id = uuidv7()
  const iso = now.toISOString()
  changes.insert('valuation_entry', {
    id,
    account_id: input.accountId,
    valuation_date: input.valuationDate,
    value_cents: input.valueCents,
    note: input.note,
    created_at: iso,
    updated_at: iso,
  })
  return { id }
}

export function deleteValuation(
  changes: ChangeSet,
  { id }: ParsedLedgerInputs['valuationDelete'],
): null {
  const row = changes.db.prepare('SELECT id FROM valuation_entry WHERE id = ?').get(id)
  if (!row) fail('not-found')
  changes.delete('valuation_entry', { id })
  return null
}

function loanRemainingAsOf(db: Db, currency: string, asOfDate: string): number {
  const loans = db
    .prepare(
      `SELECT l.id, l.initial_capital, l.start_date
       FROM loan l
       JOIN account a ON a.id = l.account_id
       WHERE l.status != 'archived' AND a.archived = 0 AND a.currency = ?`,
    )
    .all(currency) as { id: string; initial_capital: number; start_date: string }[]

  let total = 0
  const stmt = db.prepare(
    `SELECT remaining_principal_cents FROM loan_installment
     WHERE loan_id = ? AND due_date <= ?
     ORDER BY installment_number DESC LIMIT 1`,
  )
  for (const l of loans) {
    if (l.start_date > asOfDate) continue
    const last = stmt.pluck().get(l.id, asOfDate) as number | undefined
    total += last ?? l.initial_capital
  }
  return total
}

export function getNetWorthOverview(
  db: Db,
  input: ParsedLedgerInputs['netWorthOverview'],
  now: Date,
): NetWorthOverview {
  const currency = resolvePrimaryCurrency(db, input.currency)
  const todayIso = now.toISOString().slice(0, 10)
  const accounts = listAccounts(db, { includeArchived: false }).filter(
    (a) => a.currency === currency,
  )
  const lastValStmt = db.prepare(
    `SELECT valuation_date FROM valuation_entry WHERE account_id = ? ORDER BY valuation_date DESC, created_at DESC LIMIT 1`,
  )

  const assets = accounts
    .filter((a) => a.type !== 'loan')
    .map((a) => {
      const lastVal =
        a.trackingMode === 'valuation'
          ? ((lastValStmt.pluck().get(a.id) as string | undefined) ?? null)
          : null
      const staleValuation =
        a.trackingMode === 'valuation' &&
        (lastVal === null || daysBetweenIso(lastVal, todayIso) > 90)
      return {
        accountId: a.id,
        name: a.name,
        type: a.type,
        trackingMode: a.trackingMode,
        currency: a.currency,
        balanceCents: a.balance,
        lastValuationDate: lastVal,
        staleValuation,
      }
    })

  const loans = listLoans(db, { includeArchived: false }, now).filter((l) => {
    const acc = accounts.find((a) => a.id === l.accountId)
    return acc !== undefined
  })

  const totalAssetsCents = assets.reduce((s, a) => s + a.balanceCents, 0)
  const totalLiabilitiesCents = loans.reduce((s, l) => s + l.remainingPrincipalCents, 0)
  const netWorthCents = totalAssetsCents - totalLiabilitiesCents

  const curMonth = todayIso.slice(0, 7)
  const history: NetWorthPoint[] = []
  for (let offset = -5; offset <= 0; offset++) {
    const month = addMonths(curMonth, offset)
    const asOf = offset === 0 ? todayIso : monthLastDay(month)
    const monthAccs = listAccounts(db, { includeArchived: false, asOf }).filter(
      (a) => a.currency === currency && a.type !== 'loan',
    )
    const assetsCents = monthAccs.reduce((s, a) => s + a.balance, 0)
    const liabilitiesCents = loanRemainingAsOf(db, currency, asOf)
    history.push({
      month,
      assetsCents,
      liabilitiesCents,
      netWorthCents: assetsCents - liabilitiesCents,
    })
  }

  return {
    currency,
    asOfDate: todayIso,
    totalAssetsCents,
    totalLiabilitiesCents,
    netWorthCents,
    assets,
    loans,
    history,
  }
}

// ——— Crédits & Amortissement ———————————————————————————————————————————————

function buildLoanSummary(db: Db, row: LoanRow, todayIso: string): LoanSummary {
  const agg = db
    .prepare(
      `SELECT count(*) AS total_count,
         sum(CASE WHEN status != 'planned' THEN 1 ELSE 0 END) AS paid_count,
         coalesce(sum(interest_cents), 0) AS total_interest,
         coalesce(sum(insurance_cents), 0) AS total_insurance
       FROM loan_installment WHERE loan_id = ?`,
    )
    .get(row.id) as {
    total_count: number
    paid_count: number
    total_interest: number
    total_insurance: number
  }

  let upcomingImportantNotice: string | null = null
  if (row.fixed_rate_end_date) {
    const days = daysBetweenIso(todayIso, row.fixed_rate_end_date)
    if (days >= 0 && days <= 90) {
      upcomingImportantNotice = `fixed_rate_end:${row.fixed_rate_end_date}`
    }
  }
  if (!upcomingImportantNotice && row.status === 'active') {
    const daysEnd = daysBetweenIso(todayIso, row.end_date)
    if (daysEnd >= 0 && daysEnd <= 60) {
      upcomingImportantNotice = `final_installment:${row.end_date}`
    }
  }

  return {
    id: row.id,
    accountId: row.account_id,
    accountName: row.account_name,
    name: row.name,
    loanType: row.loan_type,
    initialCapital: row.initial_capital,
    nominalRateMicros: row.nominal_rate_micros,
    taegMicros: row.taeg_micros,
    insuranceMonthlyCents: row.insurance_monthly_cents,
    durationMonths: row.duration_months,
    periodicity: row.periodicity,
    startDate: row.start_date,
    endDate: row.end_date,
    monthlyPaymentCents: row.monthly_payment_cents,
    remainingPrincipalCents: row.remaining_principal_cents,
    totalInterestCents: agg.total_interest,
    totalInsuranceCents: agg.total_insurance,
    paidInstallments: agg.paid_count ?? 0,
    totalInstallments: agg.total_count ?? 0,
    status: row.status,
    fixedRateEndDate: row.fixed_rate_end_date,
    upcomingImportantNotice,
  }
}

export function listLoans(
  db: Db,
  { includeArchived = false }: ParsedLedgerInputs['loansList'],
  now: Date,
): LoanSummary[] {
  const todayIso = now.toISOString().slice(0, 10)
  const rows = db
    .prepare(
      `SELECT l.id, l.account_id, a.name AS account_name, l.name, l.loan_type,
         l.initial_capital, l.nominal_rate_micros, l.taeg_micros, l.insurance_monthly_cents,
         l.duration_months, l.periodicity, l.start_date, l.end_date, l.monthly_payment_cents,
         l.remaining_principal_cents, l.status, l.fixed_rate_end_date
       FROM loan l
       JOIN account a ON a.id = l.account_id
       WHERE @all = 1 OR l.status != 'archived'
       ORDER BY l.end_date DESC, l.name COLLATE NOCASE`,
    )
    .all({ all: includeArchived ? 1 : 0 }) as LoanRow[]

  return rows.map((r) => buildLoanSummary(db, r, todayIso))
}

export function getLoanDetail(db: Db, id: string, now: Date): LoanDetail {
  const todayIso = now.toISOString().slice(0, 10)
  const row = db
    .prepare(
      `SELECT l.id, l.account_id, a.name AS account_name, l.name, l.loan_type,
         l.initial_capital, l.nominal_rate_micros, l.taeg_micros, l.insurance_monthly_cents,
         l.duration_months, l.periodicity, l.start_date, l.end_date, l.monthly_payment_cents,
         l.remaining_principal_cents, l.status, l.fixed_rate_end_date
       FROM loan l
       JOIN account a ON a.id = l.account_id
       WHERE l.id = ?`,
    )
    .get(id) as LoanRow | undefined
  if (!row) fail('not-found')

  const instRows = db
    .prepare(
      `SELECT id, loan_id, installment_number, due_date, principal_cents, interest_cents,
         insurance_cents, total_cents, remaining_principal_cents, status, transaction_id
       FROM loan_installment WHERE loan_id = ? ORDER BY installment_number ASC`,
    )
    .all(id) as LoanInstallmentRow[]

  return {
    loan: buildLoanSummary(db, row, todayIso),
    installments: instRows.map((i) => ({
      id: i.id,
      loanId: i.loan_id,
      installmentNumber: i.installment_number,
      dueDate: i.due_date,
      principalCents: i.principal_cents,
      interestCents: i.interest_cents,
      insuranceCents: i.insurance_cents,
      totalCents: i.total_cents,
      remainingPrincipalCents: i.remaining_principal_cents,
      status: i.status,
      transactionId: i.transaction_id,
    })),
  }
}

function insertInstallments(
  changes: ChangeSet,
  loanId: string,
  schedule: ReturnType<typeof computeLoanSchedule>,
  todayIso: string,
  existingLinks: Map<number, string>,
): number {
  let remainingPrincipal = schedule.installments[0]
    ? schedule.installments[0].principalCents + schedule.installments[0].remainingPrincipalCents
    : 0
  for (const inst of schedule.installments) {
    const txId = existingLinks.get(inst.installmentNumber) ?? null
    const isPast = inst.dueDate <= todayIso
    const status: InstallmentStatus = txId ? 'reconciled' : isPast ? 'paid' : 'planned'
    if (status !== 'planned') {
      remainingPrincipal = inst.remainingPrincipalCents
    }
    changes.insert('loan_installment', {
      id: uuidv7(),
      loan_id: loanId,
      installment_number: inst.installmentNumber,
      due_date: inst.dueDate,
      principal_cents: inst.principalCents,
      interest_cents: inst.interestCents,
      insurance_cents: inst.insuranceCents,
      total_cents: inst.totalCents,
      remaining_principal_cents: inst.remainingPrincipalCents,
      status,
      transaction_id: txId,
    })
  }
  return remainingPrincipal
}

export function createLoan(
  changes: ChangeSet,
  input: ParsedLedgerInputs['loanCreate'],
  now: Date,
): { id: string; accountId: string } {
  const iso = now.toISOString()
  const todayIso = iso.slice(0, 10)
  let accountId = input.accountId

  if (accountId) {
    const acc = changes.db
      .prepare('SELECT id, type, tracking_mode FROM account WHERE id = ?')
      .get(accountId) as { id: string; type: string; tracking_mode: string } | undefined
    if (!acc) fail('not-found')
    if (acc.type !== 'loan' || acc.tracking_mode !== 'valuation') fail('invalid')
  } else {
    accountId = uuidv7()
    const maxOrder =
      (changes.db.prepare('SELECT coalesce(max(sort_order), -1) FROM account').pluck().get() as
        number | undefined) ?? -1
    changes.insert('account', {
      id: accountId,
      name: input.name,
      type: 'loan',
      tracking_mode: 'valuation',
      institution: null,
      currency: input.currency,
      opening_balance: -input.initialCapital,
      opening_date: input.startDate,
      iban: null,
      color: '#cc272e',
      icon: 'landmark',
      archived: 0,
      sort_order: maxOrder + 1,
      created_at: iso,
      updated_at: iso,
    })
  }

  const schedule = computeLoanSchedule({
    initialCapital: input.initialCapital,
    nominalRateMicros: input.nominalRateMicros,
    insuranceMonthlyCents: input.insuranceMonthlyCents,
    durationMonths: input.durationMonths,
    periodicity: input.periodicity,
    startDate: input.startDate,
  })

  const loanId = uuidv7()
  changes.insert('loan', {
    id: loanId,
    account_id: accountId,
    name: input.name,
    loan_type: input.loanType,
    initial_capital: input.initialCapital,
    nominal_rate_micros: input.nominalRateMicros,
    taeg_micros: input.taegMicros,
    insurance_monthly_cents: input.insuranceMonthlyCents,
    duration_months: input.durationMonths,
    periodicity: input.periodicity,
    start_date: input.startDate,
    end_date: schedule.endDate,
    monthly_payment_cents: schedule.monthlyPaymentCents,
    remaining_principal_cents: input.initialCapital,
    status: 'active',
    fixed_rate_end_date: input.fixedRateEndDate,
    created_at: iso,
    updated_at: iso,
  })

  const remainingPrincipal = insertInstallments(changes, loanId, schedule, todayIso, new Map())
  changes.update(
    'loan',
    { id: loanId },
    {
      remaining_principal_cents: remainingPrincipal,
      status: remainingPrincipal === 0 ? 'paid_off' : 'active',
    },
  )

  return { id: loanId, accountId }
}

export function updateLoan(
  changes: ChangeSet,
  { id, patch }: ParsedLedgerInputs['loanUpdate'],
  now: Date,
): null {
  const existing = changes.db
    .prepare(
      `SELECT id, name, loan_type, initial_capital, nominal_rate_micros, taeg_micros,
         insurance_monthly_cents, duration_months, periodicity, start_date, status, fixed_rate_end_date
       FROM loan WHERE id = ?`,
    )
    .get(id) as
    | {
        id: string
        name: string
        loan_type: LoanType
        initial_capital: number
        nominal_rate_micros: number
        taeg_micros: number | null
        insurance_monthly_cents: number
        duration_months: number
        periodicity: LoanPeriodicity
        start_date: string
        status: LoanStatus
        fixed_rate_end_date: string | null
      }
    | undefined
  if (!existing) fail('not-found')

  const next = {
    name: patch.name ?? existing.name,
    loanType: patch.loanType ?? existing.loan_type,
    initialCapital: patch.initialCapital ?? existing.initial_capital,
    nominalRateMicros: patch.nominalRateMicros ?? existing.nominal_rate_micros,
    taegMicros: patch.taegMicros !== undefined ? patch.taegMicros : existing.taeg_micros,
    insuranceMonthlyCents: patch.insuranceMonthlyCents ?? existing.insurance_monthly_cents,
    durationMonths: patch.durationMonths ?? existing.duration_months,
    periodicity: patch.periodicity ?? existing.periodicity,
    startDate: patch.startDate ?? existing.start_date,
    fixedRateEndDate:
      patch.fixedRateEndDate !== undefined ? patch.fixedRateEndDate : existing.fixed_rate_end_date,
    status: patch.status ?? existing.status,
  }

  const prevInst = changes.db
    .prepare(
      'SELECT id, installment_number, transaction_id FROM loan_installment WHERE loan_id = ?',
    )
    .all(id) as { id: string; installment_number: number; transaction_id: string | null }[]
  const links = new Map<number, string>()
  for (const row of prevInst) {
    if (row.transaction_id) links.set(row.installment_number, row.transaction_id)
    changes.delete('loan_installment', { id: row.id })
  }

  const schedule = computeLoanSchedule({
    initialCapital: next.initialCapital,
    nominalRateMicros: next.nominalRateMicros,
    insuranceMonthlyCents: next.insuranceMonthlyCents,
    durationMonths: next.durationMonths,
    periodicity: next.periodicity,
    startDate: next.startDate,
  })
  const todayIso = now.toISOString().slice(0, 10)
  const remaining = insertInstallments(changes, id, schedule, todayIso, links)

  changes.update(
    'loan',
    { id },
    {
      name: next.name,
      loan_type: next.loanType,
      initial_capital: next.initialCapital,
      nominal_rate_micros: next.nominalRateMicros,
      taeg_micros: next.taegMicros,
      insurance_monthly_cents: next.insuranceMonthlyCents,
      duration_months: next.durationMonths,
      periodicity: next.periodicity,
      start_date: next.startDate,
      end_date: schedule.endDate,
      monthly_payment_cents: schedule.monthlyPaymentCents,
      remaining_principal_cents: remaining,
      status: next.status === 'archived' ? 'archived' : remaining === 0 ? 'paid_off' : 'active',
      fixed_rate_end_date: next.fixedRateEndDate,
      updated_at: now.toISOString(),
    },
  )
  return null
}

export function deleteLoan(changes: ChangeSet, id: string): null {
  const row = changes.db.prepare('SELECT id FROM loan WHERE id = ?').get(id)
  if (!row) fail('not-found')
  const insts = changes.db.prepare('SELECT id FROM loan_installment WHERE loan_id = ?').all(id) as {
    id: string
  }[]
  for (const inst of insts) changes.delete('loan_installment', { id: inst.id })
  changes.delete('loan', { id })
  return null
}

export function linkLoanInstallment(
  changes: ChangeSet,
  { installmentId, transactionId }: ParsedLedgerInputs['loanLinkInstallment'],
  now: Date,
): null {
  const inst = changes.db
    .prepare(
      'SELECT id, loan_id, due_date, remaining_principal_cents FROM loan_installment WHERE id = ?',
    )
    .get(installmentId) as
    { id: string; loan_id: string; due_date: string; remaining_principal_cents: number } | undefined
  if (!inst) fail('not-found')
  if (transactionId) {
    const tx = changes.db.prepare('SELECT id FROM transactions WHERE id = ?').get(transactionId)
    if (!tx) fail('not-found')
  }
  const todayIso = now.toISOString().slice(0, 10)
  const nextStatus: InstallmentStatus = transactionId
    ? 'reconciled'
    : inst.due_date <= todayIso
      ? 'paid'
      : 'planned'
  changes.update(
    'loan_installment',
    { id: installmentId },
    { transaction_id: transactionId, status: nextStatus },
  )

  const latest = changes.db
    .prepare(
      `SELECT remaining_principal_cents FROM loan_installment
       WHERE loan_id = ? AND status != 'planned'
       ORDER BY installment_number DESC LIMIT 1`,
    )
    .pluck()
    .get(inst.loan_id) as number | undefined
  const initCap = changes.db
    .prepare('SELECT initial_capital FROM loan WHERE id = ?')
    .pluck()
    .get(inst.loan_id) as number
  const remaining = latest ?? initCap
  changes.update(
    'loan',
    { id: inst.loan_id },
    {
      remaining_principal_cents: remaining,
      status: remaining === 0 ? 'paid_off' : 'active',
      updated_at: now.toISOString(),
    },
  )
  return null
}

export function simulateLoanEarlyRepaymentFromDb(
  db: Db,
  input: ParsedLedgerInputs['loanSimulateEarlyRepayment'],
): EarlyRepaymentSimulation {
  const row = db
    .prepare(
      `SELECT initial_capital, nominal_rate_micros, insurance_monthly_cents,
         duration_months, periodicity, start_date
       FROM loan WHERE id = ?`,
    )
    .get(input.loanId) as
    | {
        initial_capital: number
        nominal_rate_micros: number
        insurance_monthly_cents: number
        duration_months: number
        periodicity: LoanPeriodicity
        start_date: string
      }
    | undefined
  if (!row) fail('not-found')

  return simulateEarlyRepayment({
    initialCapital: row.initial_capital,
    nominalRateMicros: row.nominal_rate_micros,
    insuranceMonthlyCents: row.insurance_monthly_cents,
    durationMonths: row.duration_months,
    periodicity: row.periodicity,
    startDate: row.start_date,
    extraPrincipalCents: input.extraPrincipalCents,
    atInstallmentNumber: input.atInstallmentNumber,
    mode: input.mode,
  })
}

// ——— Budgets & Objectifs d'épargne —————————————————————————————————————————

function categorySubtreeIds(db: Db, rootId: string): string[] {
  const rows = db.prepare('SELECT id, parent_id FROM category').all() as {
    id: string
    parent_id: string | null
  }[]
  const children = new Map<string, string[]>()
  for (const r of rows) {
    if (r.parent_id) {
      const list = children.get(r.parent_id) ?? []
      list.push(r.id)
      children.set(r.parent_id, list)
    }
  }
  const result = [rootId]
  for (const child of children.get(rootId) ?? []) {
    result.push(child)
  }
  return result
}

function monthCategoryExpenseCents(db: Db, categoryIds: readonly string[], month: string): number {
  const start = `${month}-01`
  const end = monthLastDay(month)
  const placeholders = categoryIds.map(() => '?').join(', ')
  const raw = db
    .prepare(
      `SELECT coalesce(sum(-s.amount), 0)
       FROM split s
       JOIN transactions t ON t.id = s.transaction_id
       WHERE t.nature = 'operation'
         AND t.booking_date BETWEEN ? AND ?
         AND s.category_id IN (${placeholders})
         AND s.amount < 0`,
    )
    .pluck()
    .get(start, end, ...categoryIds) as number
  return Math.max(0, raw ?? 0)
}

function monthTotalIncomeCents(db: Db, month: string): number {
  const start = `${month}-01`
  const end = monthLastDay(month)
  const total = db
    .prepare(
      `SELECT coalesce(sum(s.amount), 0)
       FROM split s
       JOIN transactions t ON t.id = s.transaction_id
       LEFT JOIN category c ON c.id = s.category_id
       WHERE t.nature = 'operation'
         AND t.booking_date BETWEEN ? AND ?
         AND s.amount > 0
         AND (c.kind IS NULL OR c.kind = 'income')`,
    )
    .pluck()
    .get(start, end) as number
  return Math.max(0, total ?? 0)
}

export function listBudgets(
  db: Db,
  input: ParsedLedgerInputs['budgetsList'],
  now: Date,
): BudgetSummary[] {
  const month = input.month ?? now.toISOString().slice(0, 7)
  const rows = db
    .prepare(
      `SELECT b.id, b.category_id, c.name AS category_name, c.color AS category_color,
         b.mode, b.amount_cents, b.percent_micros, b.rollover, b.alert_80, b.alert_100, b.archived
       FROM budget b
       JOIN category c ON c.id = b.category_id
       WHERE @all = 1 OR b.archived = 0
       ORDER BY c.name COLLATE NOCASE`,
    )
    .all({ all: input.includeArchived ? 1 : 0 }) as {
    id: string
    category_id: string
    category_name: string
    category_color: string | null
    mode: BudgetMode
    amount_cents: number
    percent_micros: number | null
    rollover: 0 | 1
    alert_80: 0 | 1
    alert_100: 0 | 1
    archived: 0 | 1
  }[]

  const curIncome = monthTotalIncomeCents(db, month)
  const fallbackIncome =
    curIncome > 0
      ? curIncome
      : Math.round(
          (monthTotalIncomeCents(db, addMonths(month, -1)) +
            monthTotalIncomeCents(db, addMonths(month, -2)) +
            monthTotalIncomeCents(db, addMonths(month, -3))) /
            3,
        )

  const computeBaseLimit = (
    mode: BudgetMode,
    amountCents: number,
    percentMicros: number | null,
    catIds: readonly string[],
    targetMonth: string,
  ): number => {
    if (mode === 'fixed') return amountCents
    if (mode === 'income_percent') {
      const inc = targetMonth === month ? fallbackIncome : monthTotalIncomeCents(db, targetMonth)
      return Math.round((inc * (percentMicros ?? 0)) / 1_000_000)
    }
    const prevSum =
      monthCategoryExpenseCents(db, catIds, addMonths(targetMonth, -1)) +
      monthCategoryExpenseCents(db, catIds, addMonths(targetMonth, -2)) +
      monthCategoryExpenseCents(db, catIds, addMonths(targetMonth, -3))
    return Math.round(prevSum / 3)
  }

  return rows.map((row) => {
    const catIds = categorySubtreeIds(db, row.category_id)
    const baseLimitCents = computeBaseLimit(
      row.mode,
      row.amount_cents,
      row.percent_micros,
      catIds,
      month,
    )
    let rolloverCents = 0
    if (row.rollover === 1) {
      const prevMonth = addMonths(month, -1)
      const prevBase = computeBaseLimit(
        row.mode,
        row.amount_cents,
        row.percent_micros,
        catIds,
        prevMonth,
      )
      const prevSpent = monthCategoryExpenseCents(db, catIds, prevMonth)
      rolloverCents = Math.max(-baseLimitCents, prevBase - prevSpent)
    }
    const effectiveLimitCents = Math.max(0, baseLimitCents + rolloverCents)
    const spentCents = monthCategoryExpenseCents(db, catIds, month)
    const remainingCents = effectiveLimitCents - spentCents
    const ratioMicros =
      effectiveLimitCents > 0
        ? Math.round((spentCents * 1_000_000) / effectiveLimitCents)
        : spentCents > 0
          ? 2_000_000
          : 0
    const alertLevel: BudgetSummary['alertLevel'] =
      row.alert_100 === 1 && spentCents > effectiveLimitCents && effectiveLimitCents > 0
        ? 'exceeded_100'
        : row.alert_80 === 1 && ratioMicros >= 800_000 && effectiveLimitCents > 0
          ? 'warning_80'
          : 'ok'

    return {
      id: row.id,
      categoryId: row.category_id,
      categoryName: row.category_name,
      categoryColor: row.category_color,
      mode: row.mode,
      amountCents: row.amount_cents,
      percentMicros: row.percent_micros,
      rollover: row.rollover === 1,
      alert80: row.alert_80 === 1,
      alert100: row.alert_100 === 1,
      archived: row.archived === 1,
      effectiveLimitCents,
      baseLimitCents,
      rolloverCents,
      spentCents,
      remainingCents,
      ratioMicros,
      alertLevel,
    }
  })
}

export function saveBudget(
  changes: ChangeSet,
  input: ParsedLedgerInputs['budgetSave'],
  now: Date,
): { id: string } {
  const cat = changes.db.prepare('SELECT id FROM category WHERE id = ?').get(input.categoryId)
  if (!cat) fail('not-found')

  const existingByCat = changes.db
    .prepare('SELECT id FROM budget WHERE category_id = ?')
    .pluck()
    .get(input.categoryId) as string | undefined
  const targetId = input.id ?? existingByCat
  const iso = now.toISOString()

  if (targetId) {
    const exists = changes.db.prepare('SELECT id FROM budget WHERE id = ?').get(targetId)
    if (!exists) fail('not-found')
    changes.update(
      'budget',
      { id: targetId },
      {
        category_id: input.categoryId,
        mode: input.mode,
        amount_cents: input.amountCents,
        percent_micros: input.percentMicros,
        rollover: input.rollover ? 1 : 0,
        alert_80: input.alert80 ? 1 : 0,
        alert_100: input.alert100 ? 1 : 0,
        archived: input.archived ? 1 : 0,
        updated_at: iso,
      },
    )
    return { id: targetId }
  }

  const id = uuidv7()
  changes.insert('budget', {
    id,
    category_id: input.categoryId,
    mode: input.mode,
    amount_cents: input.amountCents,
    percent_micros: input.percentMicros,
    rollover: input.rollover ? 1 : 0,
    alert_80: input.alert80 ? 1 : 0,
    alert_100: input.alert100 ? 1 : 0,
    archived: input.archived ? 1 : 0,
    created_at: iso,
    updated_at: iso,
  })
  return { id }
}

export function deleteBudget(changes: ChangeSet, id: string): null {
  const row = changes.db.prepare('SELECT id FROM budget WHERE id = ?').get(id)
  if (!row) fail('not-found')
  changes.delete('budget', { id })
  return null
}

export function listGoals(
  db: Db,
  input: ParsedLedgerInputs['goalsList'],
  now: Date,
): GoalSummary[] {
  const todayIso = now.toISOString().slice(0, 10)
  const curMonth = todayIso.slice(0, 7)
  const paceStart = `${addMonths(curMonth, -3)}-01`
  const accounts = listAccounts(db, { includeArchived: true })
  const accMap = new Map(accounts.map((a) => [a.id, a]))

  const rows = db
    .prepare(
      `SELECT id, name, target_cents, target_date, account_id, archived
       FROM goal
       WHERE @all = 1 OR archived = 0
       ORDER BY archived, target_date IS NULL, target_date, name COLLATE NOCASE`,
    )
    .all({ all: input.includeArchived ? 1 : 0 }) as {
    id: string
    name: string
    target_cents: number
    target_date: string | null
    account_id: string | null
    archived: 0 | 1
  }[]

  const defaultSavingsIds = accounts
    .filter((a) => !a.archived && (a.type === 'savings' || a.type === 'investment'))
    .map((a) => a.id)

  return rows.map((row) => {
    const linked = row.account_id ? accMap.get(row.account_id) : null
    const currentCents = linked
      ? Math.max(0, linked.balance)
      : Math.max(
          0,
          accounts
            .filter((a) => !a.archived && (a.type === 'savings' || a.type === 'investment'))
            .reduce((s, a) => s + a.balance, 0),
        )
    const targetAccountIds = linked ? [linked.id] : defaultSavingsIds
    let monthlyPaceCents = 0
    if (targetAccountIds.length > 0) {
      const ph = targetAccountIds.map(() => '?').join(', ')
      const netIn = db
        .prepare(
          `SELECT coalesce(sum(amount), 0) FROM transactions
           WHERE nature = 'operation' AND booking_date >= ? AND booking_date <= ?
             AND account_id IN (${ph})`,
        )
        .pluck()
        .get(paceStart, todayIso, ...targetAccountIds) as number
      monthlyPaceCents = Math.max(0, Math.round((netIn ?? 0) / 3))
    }

    const progressMicros = Math.min(
      1_000_000,
      Math.round((currentCents * 1_000_000) / row.target_cents),
    )
    let projectedDate: string | null = null
    if (currentCents >= row.target_cents) {
      projectedDate = todayIso
    } else if (monthlyPaceCents > 0) {
      const monthsNeeded = Math.ceil((row.target_cents - currentCents) / monthlyPaceCents)
      projectedDate = monthLastDay(addMonths(curMonth, Math.min(120, monthsNeeded)))
    }

    return {
      id: row.id,
      name: row.name,
      targetCents: row.target_cents,
      targetDate: row.target_date,
      accountId: row.account_id,
      accountName: linked?.name ?? null,
      currency: linked?.currency ?? resolvePrimaryCurrency(db),
      currentCents,
      progressMicros,
      monthlyPaceCents,
      projectedDate,
      archived: row.archived === 1,
    }
  })
}

export function saveGoal(
  changes: ChangeSet,
  input: ParsedLedgerInputs['goalSave'],
  now: Date,
): { id: string } {
  if (input.accountId) {
    const acc = changes.db.prepare('SELECT id FROM account WHERE id = ?').get(input.accountId)
    if (!acc) fail('not-found')
  }
  const iso = now.toISOString()
  if (input.id) {
    const exists = changes.db.prepare('SELECT id FROM goal WHERE id = ?').get(input.id)
    if (!exists) fail('not-found')
    changes.update(
      'goal',
      { id: input.id },
      {
        name: input.name,
        target_cents: input.targetCents,
        target_date: input.targetDate,
        account_id: input.accountId,
        archived: input.archived ? 1 : 0,
        updated_at: iso,
      },
    )
    return { id: input.id }
  }
  const id = uuidv7()
  changes.insert('goal', {
    id,
    name: input.name,
    target_cents: input.targetCents,
    target_date: input.targetDate,
    account_id: input.accountId,
    archived: input.archived ? 1 : 0,
    created_at: iso,
    updated_at: iso,
  })
  return { id }
}

export function deleteGoal(changes: ChangeSet, id: string): null {
  const row = changes.db.prepare('SELECT id FROM goal WHERE id = ?').get(id)
  if (!row) fail('not-found')
  changes.delete('goal', { id })
  return null
}

// ——— Prévisions de fin de mois & Simulation à long terme ————————————————————

export function getEndOfMonthForecast(
  db: Db,
  input: ParsedLedgerInputs['forecastOverview'],
  now: Date,
): EndOfMonthForecast {
  const currency = resolvePrimaryCurrency(db, input.currency)
  const todayIso = now.toISOString().slice(0, 10)
  const curMonth = todayIso.slice(0, 7)
  const monthEnd = monthLastDay(curMonth)
  const accounts = listAccounts(db, { includeArchived: false }).filter(
    (a) => a.currency === currency,
  )
  const checkingAccounts = accounts.filter((a) => a.type === 'checking')
  const checkingIds = new Set(checkingAccounts.map((a) => a.id))
  const currentCheckingBalanceCents = checkingAccounts.reduce((s, a) => s + a.balance, 0)
  const accNameMap = new Map(accounts.map((a) => [a.id, a.name]))

  const upcomingItems: ForecastItem[] = []
  const horizon30 = new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10)

  // 1. Récurrences M4 à venir (prochains 30 jours)
  const subs = detectSubscriptions(db, { currency }, now).subscriptions.filter((s) => !s.dormant)
  const recs = subs.filter((s) => s.nextExpectedDate >= todayIso && s.nextExpectedDate <= horizon30)

  for (const r of recs) {
    upcomingItems.push({
      id: `rec:${r.signature}`,
      dueDate: r.nextExpectedDate,
      label: r.merchant,
      amountCents: -r.expectedAmount,
      origin: 'recurrence',
      accountId: r.accountId,
      accountName: r.accountName,
    })
  }

  // 2. Mensualités de crédit M8 à venir (prochains 30 jours)
  const loanInsts = db
    .prepare(
      `SELECT li.id, li.due_date, li.total_cents, l.name
       FROM loan_installment li
       JOIN loan l ON l.id = li.loan_id
       WHERE l.status = 'active' AND li.status = 'planned'
         AND li.due_date >= ? AND li.due_date <= ?`,
    )
    .all(todayIso, horizon30) as {
    id: string
    due_date: string
    total_cents: number
    name: string
  }[]

  for (const li of loanInsts) {
    upcomingItems.push({
      id: `loan:${li.id}`,
      dueDate: li.due_date,
      label: li.name,
      amountCents: -li.total_cents,
      origin: 'loan',
      accountId: checkingAccounts[0]?.id ?? null,
      accountName: checkingAccounts[0]?.name ?? null,
    })
  }

  // 3. Salaire M6 attendu d'ici la fin du mois s'il n'a pas encore été perçu ce mois-ci
  const latestPayslip = db
    .prepare(
      `SELECT p.net_paid, e.name AS employer_name
       FROM payslip p
       JOIN contract c ON c.id = p.contract_id
       JOIN employer e ON e.id = c.employer_id
       WHERE c.archived = 0 AND (c.end_date IS NULL OR c.end_date >= ?)
       ORDER BY p.period DESC LIMIT 1`,
    )
    .get(todayIso) as { net_paid: number; employer_name: string } | undefined

  if (latestPayslip && checkingIds.size > 0) {
    const salaryAlreadyThisMonth = db
      .prepare(`SELECT count(*) FROM payslip WHERE period = ?`)
      .pluck()
      .get(curMonth) as number
    if (salaryAlreadyThisMonth === 0) {
      upcomingItems.push({
        id: 'salary:expected',
        dueDate: monthEnd,
        label: latestPayslip.employer_name,
        amountCents: latestPayslip.net_paid,
        origin: 'salary',
        accountId: checkingAccounts[0]?.id ?? null,
        accountName: checkingAccounts[0]?.name ?? null,
      })
    }
  }

  upcomingItems.sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  const thisMonthItems = upcomingItems.filter((i) => i.dueDate <= monthEnd)
  const upcomingIncomeCents = thisMonthItems
    .filter((i) => i.amountCents > 0)
    .reduce((s, i) => s + i.amountCents, 0)
  const upcomingExpensesCents = thisMonthItems
    .filter((i) => i.amountCents < 0)
    .reduce((s, i) => s + Math.abs(i.amountCents), 0)

  // Dépenses variables moyennes restantes sur le mois (pro-rata des jours restants).
  const totalDays = Number(monthEnd.slice(8, 10))
  const todayDay = Number(todayIso.slice(8, 10))
  const remainingDays = Math.max(0, totalDays - todayDay)
  let estimatedVariableCents = 0
  if (checkingIds.size > 0 && remainingDays > 0) {
    const start3m = `${addMonths(curMonth, -3)}-01`
    const end3m = monthLastDay(addMonths(curMonth, -1))
    const ph = [...checkingIds].map(() => '?').join(', ')
    const avg3m = db
      .prepare(
        `SELECT coalesce(sum(-t.amount), 0)
         FROM transactions t
         WHERE t.nature = 'operation' AND t.transfer_id IS NULL
           AND t.amount < 0 AND t.booking_date BETWEEN ? AND ?
           AND t.account_id IN (${ph})`,
      )
      .pluck()
      .get(start3m, end3m, ...checkingIds) as number
    const monthlyAvg = Math.max(0, Math.round((avg3m ?? 0) / 3))
    // Retranche les charges récurrentes mensuelles déjà identifiées pour éviter le double comptage.
    const recurringOut = subs.reduce((s, r) => s + r.monthlyEquivalent, 0)
    const variableMonthly = Math.max(0, monthlyAvg - recurringOut)
    estimatedVariableCents = Math.round((variableMonthly * remainingDays) / totalDays)
  }

  const projectedEndBalanceCents =
    currentCheckingBalanceCents +
    upcomingIncomeCents -
    upcomingExpensesCents -
    estimatedVariableCents
  const margin = Math.round(estimatedVariableCents * 0.2)

  return {
    currency,
    asOfDate: todayIso,
    monthEnd,
    currentCheckingBalanceCents,
    upcomingIncomeCents,
    upcomingExpensesCents,
    estimatedVariableCents,
    projectedEndBalanceCents,
    projectedLowCents: projectedEndBalanceCents - margin,
    projectedHighCents: projectedEndBalanceCents + margin,
    disposableRemainingCents: projectedEndBalanceCents,
    overdraftRisk: projectedEndBalanceCents < 0 || projectedEndBalanceCents - margin < 0,
    upcomingItems: upcomingItems.map((item) => ({
      ...item,
      accountName: item.accountId ? (accNameMap.get(item.accountId) ?? item.accountName) : null,
    })),
  }
}

function hydrateScenarioRow(
  db: Db,
  row: {
    id: string
    name: string
    base_scenario_id: string | null
    horizon_months: number
    account_ids_json: string
    default_indexation_micros: number
    savings_rate_overrides_json: string
    is_base: 0 | 1
    created_at: string
    updated_at: string
  },
): ScenarioSummary {
  const itemCount = db
    .prepare('SELECT count(*) FROM planned_item WHERE scenario_id = ?')
    .pluck()
    .get(row.id) as number
  return {
    id: row.id,
    name: row.name,
    baseScenarioId: row.base_scenario_id,
    horizonMonths: row.horizon_months,
    accountIds: JSON.parse(row.account_ids_json) as string[],
    defaultIndexationMicros: row.default_indexation_micros,
    savingsRateOverrides: JSON.parse(row.savings_rate_overrides_json) as Record<string, number>,
    isBase: row.is_base === 1,
    itemCount: itemCount ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listScenarios(db: Db): ScenarioSummary[] {
  const rows = db
    .prepare('SELECT * FROM scenario ORDER BY is_base DESC, created_at DESC')
    .all() as Parameters<typeof hydrateScenarioRow>[1][]
  return rows.map((r) => hydrateScenarioRow(db, r))
}

export function getScenarioDetail(db: Db, id: string): ScenarioDetail {
  const row = db.prepare('SELECT * FROM scenario WHERE id = ?').get(id) as
    Parameters<typeof hydrateScenarioRow>[1] | undefined
  if (!row) fail('not-found')
  const items = db
    .prepare(
      'SELECT * FROM planned_item WHERE scenario_id = ? ORDER BY start_date ASC, label COLLATE NOCASE',
    )
    .all(id) as {
    id: string
    scenario_id: string
    account_id: string
    label: string
    category_id: string | null
    amount_cents: number
    periodicity: PlannedPeriodicity
    start_date: string
    end_date: string | null
    indexation_micros: number
    origin: PlannedOrigin
    source_ref_id: string | null
    enabled: 0 | 1
  }[]

  return {
    scenario: hydrateScenarioRow(db, row),
    items: items.map((i) => ({
      id: i.id,
      scenarioId: i.scenario_id,
      accountId: i.account_id,
      label: i.label,
      categoryId: i.category_id,
      amountCents: i.amount_cents,
      periodicity: i.periodicity,
      startDate: i.start_date,
      endDate: i.end_date,
      indexationMicros: i.indexation_micros,
      origin: i.origin,
      sourceRefId: i.source_ref_id,
      enabled: i.enabled === 1,
    })),
  }
}

export function generateBaseScenario(
  changes: ChangeSet,
  input: ParsedLedgerInputs['scenarioGenerateBase'],
  now: Date,
): ScenarioDetail {
  const db = changes.db
  const currency = resolvePrimaryCurrency(db, input.currency)
  const horizonMonths = input.horizonMonths ?? 36
  const iso = now.toISOString()
  const todayIso = iso.slice(0, 10)
  const curMonth = todayIso.slice(0, 7)

  const cashAccounts = listAccounts(db, { includeArchived: false }).filter(
    (a) => a.currency === currency && (a.type === 'checking' || a.type === 'savings'),
  )
  const accountIds = cashAccounts.map((a) => a.id)
  const defaultAccountId = cashAccounts.find((a) => a.type === 'checking')?.id ?? accountIds[0]

  const existingBase = db
    .prepare('SELECT id FROM scenario WHERE is_base = 1 ORDER BY created_at LIMIT 1')
    .pluck()
    .get() as string | undefined

  let scenarioId: string
  if (existingBase) {
    scenarioId = existingBase
    const oldItems = db
      .prepare('SELECT id FROM planned_item WHERE scenario_id = ?')
      .all(scenarioId) as { id: string }[]
    for (const old of oldItems) changes.delete('planned_item', { id: old.id })
    changes.update(
      'scenario',
      { id: scenarioId },
      {
        horizon_months: horizonMonths,
        account_ids_json: JSON.stringify(accountIds),
        updated_at: iso,
      },
    )
  } else {
    scenarioId = uuidv7()
    changes.insert('scenario', {
      id: scenarioId,
      name: 'Scénario de base',
      base_scenario_id: null,
      horizon_months: horizonMonths,
      account_ids_json: JSON.stringify(accountIds),
      default_indexation_micros: 20_000, // 2 % / an par défaut
      savings_rate_overrides_json: '{}',
      is_base: 1,
      created_at: iso,
      updated_at: iso,
    })
  }

  if (defaultAccountId) {
    const nextId = () => uuidv7()

    // 1. Salaire M6
    const salary = db
      .prepare(
        `SELECT p.net_paid, e.name AS employer_name
         FROM payslip p JOIN contract c ON c.id = p.contract_id JOIN employer e ON e.id = c.employer_id
         WHERE c.archived = 0 ORDER BY p.period DESC LIMIT 1`,
      )
      .get() as { net_paid: number; employer_name: string } | undefined
    if (salary) {
      changes.insert('planned_item', {
        id: nextId(),
        scenario_id: scenarioId,
        account_id: defaultAccountId,
        label: `Salaire — ${salary.employer_name}`.slice(0, 200),
        category_id: null,
        amount_cents: salary.net_paid,
        periodicity: 'monthly',
        start_date: `${curMonth}-01`,
        end_date: null,
        indexation_micros: 0,
        origin: 'salary',
        source_ref_id: null,
        enabled: 1,
        created_at: iso,
        updated_at: iso,
      })
    }

    // 2. Récurrences M4
    const subs = detectSubscriptions(db, { currency }, now).subscriptions.filter((s) => !s.dormant)
    for (const r of subs) {
      const periodicity: PlannedPeriodicity =
        r.frequency === 'quarterly' ? 'quarterly' : r.frequency === 'annual' ? 'annual' : 'monthly'
      changes.insert('planned_item', {
        id: nextId(),
        scenario_id: scenarioId,
        account_id: r.accountId,
        label: r.merchant.slice(0, 200),
        category_id: r.categoryId,
        amount_cents: -r.expectedAmount,
        periodicity,
        start_date: `${curMonth}-01`,
        end_date: null,
        indexation_micros: 20_000,
        origin: 'recurrence',
        source_ref_id: r.signature,
        enabled: 1,
        created_at: iso,
        updated_at: iso,
      })
    }

    // 3. Crédits actifs M8
    const loans = db
      .prepare(
        `SELECT id, name, monthly_payment_cents, start_date, end_date FROM loan WHERE status = 'active'`,
      )
      .all() as {
      id: string
      name: string
      monthly_payment_cents: number
      start_date: string
      end_date: string
    }[]
    for (const l of loans) {
      changes.insert('planned_item', {
        id: nextId(),
        scenario_id: scenarioId,
        account_id: defaultAccountId,
        label: `Mensualité — ${l.name}`.slice(0, 200),
        category_id: null,
        amount_cents: -l.monthly_payment_cents,
        periodicity: 'monthly',
        start_date: l.start_date,
        end_date: l.end_date,
        indexation_micros: 0,
        origin: 'loan',
        source_ref_id: l.id,
        enabled: 1,
        created_at: iso,
        updated_at: iso,
      })
    }
  }

  return getScenarioDetail(db, scenarioId)
}

export function cloneScenarioVariant(
  changes: ChangeSet,
  input: ParsedLedgerInputs['scenarioCloneVariant'],
  now: Date,
): ScenarioDetail {
  const source = getScenarioDetail(changes.db, input.sourceScenarioId)
  const iso = now.toISOString()
  const newId = uuidv7()
  changes.insert('scenario', {
    id: newId,
    name: input.name,
    base_scenario_id: source.scenario.id,
    horizon_months: source.scenario.horizonMonths,
    account_ids_json: JSON.stringify(source.scenario.accountIds),
    default_indexation_micros: source.scenario.defaultIndexationMicros,
    savings_rate_overrides_json: JSON.stringify(source.scenario.savingsRateOverrides),
    is_base: 0,
    created_at: iso,
    updated_at: iso,
  })

  for (const item of source.items) {
    changes.insert('planned_item', {
      id: uuidv7(),
      scenario_id: newId,
      account_id: item.accountId,
      label: item.label,
      category_id: item.categoryId,
      amount_cents: item.amountCents,
      periodicity: item.periodicity,
      start_date: item.startDate,
      end_date: item.endDate,
      indexation_micros: item.indexationMicros,
      origin: item.origin,
      source_ref_id: item.sourceRefId,
      enabled: item.enabled ? 1 : 0,
      created_at: iso,
      updated_at: iso,
    })
  }
  return getScenarioDetail(changes.db, newId)
}

export function updateScenario(
  changes: ChangeSet,
  { id, patch }: ParsedLedgerInputs['scenarioUpdate'],
  now: Date,
): null {
  const row = changes.db.prepare('SELECT id FROM scenario WHERE id = ?').get(id)
  if (!row) fail('not-found')
  const updates: Record<string, string | number | null> = { updated_at: now.toISOString() }
  if (patch.name !== undefined) updates.name = patch.name
  if (patch.horizonMonths !== undefined) updates.horizon_months = patch.horizonMonths
  if (patch.accountIds !== undefined) updates.account_ids_json = JSON.stringify(patch.accountIds)
  if (patch.defaultIndexationMicros !== undefined) {
    updates.default_indexation_micros = patch.defaultIndexationMicros
  }
  if (patch.savingsRateOverrides !== undefined) {
    updates.savings_rate_overrides_json = JSON.stringify(patch.savingsRateOverrides)
  }
  changes.update('scenario', { id }, updates)
  return null
}

export function deleteScenario(changes: ChangeSet, id: string): null {
  const row = changes.db.prepare('SELECT id FROM scenario WHERE id = ?').get(id)
  if (!row) fail('not-found')
  const items = changes.db.prepare('SELECT id FROM planned_item WHERE scenario_id = ?').all(id) as {
    id: string
  }[]
  for (const item of items) changes.delete('planned_item', { id: item.id })
  changes.delete('scenario', { id })
  return null
}

export function savePlannedItem(
  changes: ChangeSet,
  input: ParsedLedgerInputs['plannedItemSave'],
  now: Date,
): { id: string } {
  const sc = changes.db.prepare('SELECT id FROM scenario WHERE id = ?').get(input.scenarioId)
  const acc = changes.db.prepare('SELECT id FROM account WHERE id = ?').get(input.accountId)
  if (!sc || !acc) fail('not-found')
  const iso = now.toISOString()

  if (input.id) {
    const exists = changes.db.prepare('SELECT id FROM planned_item WHERE id = ?').get(input.id)
    if (!exists) fail('not-found')
    changes.update(
      'planned_item',
      { id: input.id },
      {
        account_id: input.accountId,
        label: input.label,
        category_id: input.categoryId,
        amount_cents: input.amountCents,
        periodicity: input.periodicity,
        start_date: input.startDate,
        end_date: input.endDate,
        indexation_micros: input.indexationMicros,
        enabled: input.enabled ? 1 : 0,
        updated_at: iso,
      },
    )
    return { id: input.id }
  }

  const id = uuidv7()
  changes.insert('planned_item', {
    id,
    scenario_id: input.scenarioId,
    account_id: input.accountId,
    label: input.label,
    category_id: input.categoryId,
    amount_cents: input.amountCents,
    periodicity: input.periodicity,
    start_date: input.startDate,
    end_date: input.endDate,
    indexation_micros: input.indexationMicros,
    origin: 'manual',
    source_ref_id: null,
    enabled: input.enabled ? 1 : 0,
    created_at: iso,
    updated_at: iso,
  })
  return { id }
}

export function deletePlannedItem(changes: ChangeSet, id: string): null {
  const row = changes.db.prepare('SELECT id FROM planned_item WHERE id = ?').get(id)
  if (!row) fail('not-found')
  changes.delete('planned_item', { id })
  return null
}

export function simulateScenario(db: Db, scenarioId: string, now: Date): SimulationProjection {
  const detail = getScenarioDetail(db, scenarioId)
  const allAccounts = listAccounts(db, { includeArchived: false })
  const includedSet = new Set(detail.scenario.accountIds)
  const simAccounts = allAccounts
    .filter((a) =>
      includedSet.size > 0 ? includedSet.has(a.id) : a.type === 'checking' || a.type === 'savings',
    )
    .map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      balanceCents: a.balance,
      interestRateMicros:
        detail.scenario.savingsRateOverrides[a.id] ?? (a.type === 'savings' ? 25_000 : 0),
    }))
  const currency = simAccounts[0]?.type
    ? (allAccounts.find((a) => a.id === simAccounts[0]!.id)?.currency ?? 'EUR')
    : resolvePrimaryCurrency(db)
  const goals = listGoals(db, { includeArchived: false }, now)

  return projectScenario({
    scenarioId: detail.scenario.id,
    scenarioName: detail.scenario.name,
    currency,
    startMonth: now.toISOString().slice(0, 7),
    horizonMonths: detail.scenario.horizonMonths,
    accounts: simAccounts,
    items: detail.items,
    goals,
  })
}
