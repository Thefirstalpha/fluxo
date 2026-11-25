import type { MinorUnits } from '@shared/money'
import { addMonths, parseMonth } from '@shared/months'
import {
  checkPayslipDetailed,
  maskAddress,
  maskNir,
  toPayslipSummary,
  type ContractSummary,
  type ContractType,
  type EmployerSummary,
  type ExecutiveStatus,
  type PayslipCountryPackId,
  type PayslipDetail,
  type PayslipDuplicateDraft,
  type PayslipLine,
  type PayslipLineSection,
  type PayslipListItem,
  type PayslipSourceOrigin,
  type PayslipTransferCandidate,
  type SalaryAnnualRecap,
  type SalaryDashboardOverview,
  type SalaryMonthlyPoint,
  type WorkTime,
} from '@shared/payslip'
import type { ParsedLedgerInputs } from '@shared/ledger/schemas'
import { uuidv7 } from '@shared/uuid'
import type { Db } from '../db/connection'
import type { ChangeSet } from './changes'
import { fail } from './failure'

interface EmployerRow {
  id: string
  name: string
  siret: string | null
  address: string | null
  archived: 0 | 1
}

interface EmployerListRow extends EmployerRow {
  contract_count: number
}

interface ContractRow {
  id: string
  employer_id: string
  employer_name: string
  title: string
  contract_type: ContractType
  executive_status: ExecutiveStatus
  work_time: WorkTime
  work_time_ratio_micros: number
  monthly_hours_hundredths: number | null
  collective_agreement: string | null
  classification: string | null
  start_date: string
  end_date: string | null
  default_base_salary: number | null
  currency: string
  country_pack: PayslipCountryPackId
  employee_nir: string | null
  archived: 0 | 1
  payslip_count?: number
}

interface PayslipRow {
  id: string
  contract_id: string
  contract_title: string
  employer_id: string
  employer_name: string
  period: string
  payment_date: string | null
  country_pack: PayslipCountryPackId
  currency: string
  totals_only: 0 | 1
  base_hours_hundredths: number | null
  hourly_rate: number | null
  base_salary: number
  gross: number
  employee_contributions: number
  employer_contributions: number
  net_before_tax: number
  taxable_net: number
  social_net: number | null
  withholding_rate_micros: number
  withholding_personalized: 0 | 1
  withholding_base: number | null
  withholding_tax: number
  other_adjustments: number
  net_paid: number
  ytd_gross: number | null
  ytd_taxable_net: number | null
  ytd_withholding: number | null
  ytd_hours_hundredths: number | null
  employee_nir: string | null
  employee_address: string | null
  transaction_id: string | null
  matched_tx_label: string | null
  matched_tx_date: string | null
  matched_tx_amount: number | null
  source_origin: PayslipSourceOrigin
  notes: string | null
}

interface PayslipLineRow {
  id: string
  payslip_id: string
  section: PayslipLineSection
  item_kind: string
  label: string
  quantity_hundredths: number | null
  base_amount: number | null
  employee_rate_micros: number | null
  employee_amount: number
  employer_rate_micros: number | null
  employer_amount: number
  taxable: 0 | 1
  position: number
}

function mapLine(row: PayslipLineRow): PayslipLine {
  return {
    id: row.id,
    payslipId: row.payslip_id,
    section: row.section,
    itemKind: row.item_kind,
    label: row.label,
    quantityHundredths: row.quantity_hundredths,
    baseAmount: row.base_amount,
    employeeRateMicros: row.employee_rate_micros,
    employeeAmount: row.employee_amount,
    employerRateMicros: row.employer_rate_micros,
    employerAmount: row.employer_amount,
    taxable: row.taxable === 1,
    position: row.position,
  }
}

function mapContract(row: ContractRow): ContractSummary {
  return {
    id: row.id,
    employerId: row.employer_id,
    employerName: row.employer_name,
    title: row.title,
    contractType: row.contract_type,
    executiveStatus: row.executive_status,
    workTime: row.work_time,
    workTimeRatioMicros: row.work_time_ratio_micros,
    monthlyHoursHundredths: row.monthly_hours_hundredths,
    collectiveAgreement: row.collective_agreement,
    classification: row.classification,
    startDate: row.start_date,
    endDate: row.end_date,
    defaultBaseSalary: row.default_base_salary,
    currency: row.currency,
    countryPack: row.country_pack,
    nirMasked: row.employee_nir ? maskNir(row.employee_nir) : null,
    hasNir: row.employee_nir !== null,
    archived: row.archived === 1,
    payslipCount: row.payslip_count ?? 0,
  }
}

function readYearMonthsForContract(
  db: Db,
  contractId: string,
  yearPrefix: string,
): {
  id: string
  period: string
  gross: number
  taxableNet: number
  withholdingTax: number
  baseHoursHundredths: number | null
}[] {
  return db
    .prepare(
      `SELECT id, period, gross, taxable_net AS taxableNet, withholding_tax AS withholdingTax,
           base_hours_hundredths AS baseHoursHundredths
         FROM payslip
         WHERE contract_id = ? AND period LIKE ?
         ORDER BY period ASC`,
    )
    .all(contractId, `${yearPrefix}-%`) as {
    id: string
    period: string
    gross: number
    taxableNet: number
    withholdingTax: number
    baseHoursHundredths: number | null
  }[]
}

function readLinesByPayslipIds(db: Db, ids: readonly string[]): Map<string, PayslipLine[]> {
  const map = new Map<string, PayslipLine[]>()
  if (ids.length === 0) return map
  const placeholders = ids.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `SELECT * FROM payslip_line WHERE payslip_id IN (${placeholders}) ORDER BY position ASC`,
    )
    .all(...ids) as PayslipLineRow[]
  for (const row of rows) {
    const line = mapLine(row)
    const bucket = map.get(row.payslip_id)
    if (bucket) bucket.push(line)
    else map.set(row.payslip_id, [line])
  }
  return map
}

function buildDetailFromRow(
  db: Db,
  row: PayslipRow,
  lines: PayslipLine[],
  yearPoints: readonly {
    period: string
    gross: number
    taxableNet: number
    withholdingTax: number
    baseHoursHundredths: number | null
  }[],
): PayslipDetail {
  const checkTarget = {
    countryPack: row.country_pack,
    period: row.period,
    totalsOnly: row.totals_only === 1,
    baseHoursHundredths: row.base_hours_hundredths,
    hourlyRate: row.hourly_rate,
    baseSalary: row.base_salary,
    gross: row.gross,
    employeeContributions: row.employee_contributions,
    employerContributions: row.employer_contributions,
    netBeforeTax: row.net_before_tax,
    taxableNet: row.taxable_net,
    socialNet: row.social_net,
    withholdingRateMicros: row.withholding_rate_micros,
    withholdingBase: row.withholding_base,
    withholdingTax: row.withholding_tax,
    otherAdjustments: row.other_adjustments,
    netPaid: row.net_paid,
    ytdGross: row.ytd_gross,
    ytdTaxableNet: row.ytd_taxable_net,
    ytdWithholding: row.ytd_withholding,
    ytdHoursHundredths: row.ytd_hours_hundredths,
    lines,
  }
  const issues = checkPayslipDetailed(checkTarget, yearPoints)
  const errorCount = issues.filter((issue) => issue.severity === 'error').length
  return {
    id: row.id,
    contractId: row.contract_id,
    contractTitle: row.contract_title,
    employerId: row.employer_id,
    employerName: row.employer_name,
    period: row.period,
    paymentDate: row.payment_date,
    countryPack: row.country_pack,
    currency: row.currency,
    totalsOnly: row.totals_only === 1,
    baseHoursHundredths: row.base_hours_hundredths,
    hourlyRate: row.hourly_rate,
    baseSalary: row.base_salary,
    gross: row.gross,
    employeeContributions: row.employee_contributions,
    employerContributions: row.employer_contributions,
    employerCost: row.gross + row.employer_contributions,
    netBeforeTax: row.net_before_tax,
    taxableNet: row.taxable_net,
    socialNet: row.social_net,
    withholdingRateMicros: row.withholding_rate_micros,
    withholdingPersonalized: row.withholding_personalized === 1,
    withholdingBase: row.withholding_base,
    withholdingTax: row.withholding_tax,
    otherAdjustments: row.other_adjustments,
    netPaid: row.net_paid,
    ytdGross: row.ytd_gross,
    ytdTaxableNet: row.ytd_taxable_net,
    ytdWithholding: row.ytd_withholding,
    ytdHoursHundredths: row.ytd_hours_hundredths,
    nirMasked: row.employee_nir ? maskNir(row.employee_nir) : null,
    hasNir: row.employee_nir !== null,
    addressMasked: row.employee_address ? maskAddress(row.employee_address) : null,
    hasAddress: row.employee_address !== null,
    transactionId: row.transaction_id,
    matchedTransactionLabel: row.matched_tx_label,
    matchedTransactionDate: row.matched_tx_date,
    matchedTransactionAmount: row.matched_tx_amount,
    sourceOrigin: row.source_origin,
    notes: row.notes,
    lines,
    issues,
    issueCount: issues.length,
    errorCount,
    summary: toPayslipSummary(checkTarget),
  }
}

// ——— Employeurs —————————————————————————————————————————————————————————

export function listEmployers(
  db: Db,
  { includeArchived = false }: ParsedLedgerInputs['employersList'],
): EmployerSummary[] {
  const rows = db
    .prepare(
      `SELECT e.id, e.name, e.siret, e.address, e.archived,
         count(c.id) AS contract_count
       FROM employer e
       LEFT JOIN contract c ON c.employer_id = e.id
       WHERE @all = 1 OR e.archived = 0
       GROUP BY e.id
       ORDER BY e.archived ASC, e.name COLLATE NOCASE ASC`,
    )
    .all({ all: includeArchived ? 1 : 0 }) as EmployerListRow[]
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    siret: row.siret,
    addressMasked: row.address ? maskAddress(row.address) : null,
    hasAddress: row.address !== null,
    archived: row.archived === 1,
    contractCount: row.contract_count,
  }))
}

export function createEmployer(
  changes: ChangeSet,
  input: ParsedLedgerInputs['employerCreate'],
  now: Date,
): { id: string } {
  const id = uuidv7()
  const stamp = now.toISOString()
  changes.insert('employer', {
    id,
    name: input.name,
    siret: input.siret,
    address: input.address,
    archived: 0,
    created_at: stamp,
    updated_at: stamp,
  })
  return { id }
}

export function updateEmployer(
  changes: ChangeSet,
  { id, patch }: ParsedLedgerInputs['employerUpdate'],
  now: Date,
): null {
  const existing = changes.get('employer', { id })
  if (!existing) fail('not-found')
  const sqlPatch: Record<string, string | number | null> = { updated_at: now.toISOString() }
  if (patch.name !== undefined) sqlPatch.name = patch.name
  if (patch.siret !== undefined) sqlPatch.siret = patch.siret
  if (patch.address !== undefined) sqlPatch.address = patch.address
  if (patch.archived !== undefined) sqlPatch.archived = patch.archived ? 1 : 0
  changes.update('employer', { id }, sqlPatch)
  return null
}

export function deleteEmployer(changes: ChangeSet, id: string): null {
  const existing = changes.get('employer', { id })
  if (!existing) fail('not-found')
  const hasContracts =
    changes.db.prepare('SELECT 1 FROM contract WHERE employer_id = ? LIMIT 1').get(id) !== undefined
  if (hasContracts) fail('conflict')
  changes.delete('employer', { id })
  return null
}

export function revealEmployerAddress(db: Db, id: string): string | null {
  const row = db.prepare('SELECT address FROM employer WHERE id = ?').get(id) as
    { address: string | null } | undefined
  if (!row) fail('not-found')
  return row.address
}

// ——— Contrats ———————————————————————————————————————————————————————————

export function listContracts(
  db: Db,
  { employerId, includeArchived = false }: ParsedLedgerInputs['contractsList'],
): ContractSummary[] {
  const rows = db
    .prepare(
      `SELECT c.*, e.name AS employer_name, count(p.id) AS payslip_count
       FROM contract c
       JOIN employer e ON e.id = c.employer_id
       LEFT JOIN payslip p ON p.contract_id = c.id
       WHERE (@employerId IS NULL OR c.employer_id = @employerId)
         AND (@all = 1 OR c.archived = 0)
       GROUP BY c.id
       ORDER BY c.archived ASC, c.start_date DESC, c.title COLLATE NOCASE ASC`,
    )
    .all({ employerId: employerId ?? null, all: includeArchived ? 1 : 0 }) as ContractRow[]
  return rows.map(mapContract)
}

export function createContract(
  changes: ChangeSet,
  input: ParsedLedgerInputs['contractCreate'],
  now: Date,
): { id: string } {
  if (!changes.get('employer', { id: input.employerId })) fail('not-found')
  if (input.endDate && input.startDate > input.endDate) fail('invalid')
  const id = uuidv7()
  const stamp = now.toISOString()
  changes.insert('contract', {
    id,
    employer_id: input.employerId,
    title: input.title,
    contract_type: input.contractType,
    executive_status: input.executiveStatus,
    work_time: input.workTime,
    work_time_ratio_micros: input.workTimeRatioMicros ?? 1_000_000,
    monthly_hours_hundredths: input.monthlyHoursHundredths ?? null,
    collective_agreement: input.collectiveAgreement ?? null,
    classification: input.classification ?? null,
    start_date: input.startDate,
    end_date: input.endDate ?? null,
    default_base_salary: input.defaultBaseSalary ?? null,
    currency: input.currency,
    country_pack: input.countryPack ?? 'fr',
    employee_nir: input.employeeNir ?? null,
    archived: 0,
    created_at: stamp,
    updated_at: stamp,
  })
  return { id }
}

export function updateContract(
  changes: ChangeSet,
  { id, patch }: ParsedLedgerInputs['contractUpdate'],
  now: Date,
): null {
  const existing = changes.get('contract', { id })
  if (!existing) fail('not-found')
  const startDate = patch.startDate ?? (existing.start_date as string)
  const endDate = patch.endDate === undefined ? (existing.end_date as string | null) : patch.endDate
  if (endDate && startDate > endDate) fail('invalid')
  const sqlPatch: Record<string, string | number | null> = { updated_at: now.toISOString() }
  if (patch.employerId !== undefined) {
    if (!changes.get('employer', { id: patch.employerId })) fail('not-found')
    sqlPatch.employer_id = patch.employerId
  }
  if (patch.title !== undefined) sqlPatch.title = patch.title
  if (patch.contractType !== undefined) sqlPatch.contract_type = patch.contractType
  if (patch.executiveStatus !== undefined) sqlPatch.executive_status = patch.executiveStatus
  if (patch.workTime !== undefined) sqlPatch.work_time = patch.workTime
  if (patch.workTimeRatioMicros !== undefined) {
    sqlPatch.work_time_ratio_micros = patch.workTimeRatioMicros
  }
  if (patch.monthlyHoursHundredths !== undefined) {
    sqlPatch.monthly_hours_hundredths = patch.monthlyHoursHundredths
  }
  if (patch.collectiveAgreement !== undefined) {
    sqlPatch.collective_agreement = patch.collectiveAgreement
  }
  if (patch.classification !== undefined) sqlPatch.classification = patch.classification
  if (patch.startDate !== undefined) sqlPatch.start_date = patch.startDate
  if (patch.endDate !== undefined) sqlPatch.end_date = patch.endDate
  if (patch.defaultBaseSalary !== undefined) sqlPatch.default_base_salary = patch.defaultBaseSalary
  if (patch.currency !== undefined) sqlPatch.currency = patch.currency
  if (patch.employeeNir !== undefined) sqlPatch.employee_nir = patch.employeeNir
  if (patch.archived !== undefined) sqlPatch.archived = patch.archived ? 1 : 0
  changes.update('contract', { id }, sqlPatch)
  return null
}

export function deleteContract(changes: ChangeSet, id: string): null {
  const existing = changes.get('contract', { id })
  if (!existing) fail('not-found')
  const hasPayslips =
    changes.db.prepare('SELECT 1 FROM payslip WHERE contract_id = ? LIMIT 1').get(id) !== undefined
  if (hasPayslips) fail('conflict')
  changes.delete('contract', { id })
  return null
}

export function revealContractNir(db: Db, id: string): string | null {
  const row = db.prepare('SELECT employee_nir FROM contract WHERE id = ?').get(id) as
    { employee_nir: string | null } | undefined
  if (!row) fail('not-found')
  return row.employee_nir
}

// ——— Bulletins de paie ——————————————————————————————————————————————————

const PAYSLIP_SELECT = `
  SELECT p.*, c.title AS contract_title, c.employer_id AS employer_id, e.name AS employer_name,
    coalesce(tx.label, tx.label_raw) AS matched_tx_label,
    tx.booking_date AS matched_tx_date,
    tx.amount AS matched_tx_amount
  FROM payslip p
  JOIN contract c ON c.id = p.contract_id
  JOIN employer e ON e.id = c.employer_id
  LEFT JOIN transactions tx ON tx.id = p.transaction_id
`

export function listPayslips(
  db: Db,
  { contractId, year, limit = 120 }: ParsedLedgerInputs['payslipsList'],
): PayslipListItem[] {
  const rows = db
    .prepare(
      `${PAYSLIP_SELECT}
       WHERE (@contractId IS NULL OR p.contract_id = @contractId)
         AND (@yearPrefix IS NULL OR p.period LIKE @yearPrefix)
       ORDER BY p.period DESC, p.created_at DESC
       LIMIT @limit`,
    )
    .all({
      contractId: contractId ?? null,
      yearPrefix: year === undefined ? null : `${year}-%`,
      limit,
    }) as PayslipRow[]

  const linesById = readLinesByPayslipIds(
    db,
    rows.map((r) => r.id),
  )
  const ytdCache = new Map<
    string,
    {
      period: string
      gross: number
      taxableNet: number
      withholdingTax: number
      baseHoursHundredths: number | null
    }[]
  >()

  return rows.map((row) => {
    const yearKey = `${row.contract_id}:${row.period.slice(0, 4)}`
    let points = ytdCache.get(yearKey)
    if (!points) {
      points = readYearMonthsForContract(db, row.contract_id, row.period.slice(0, 4))
      ytdCache.set(yearKey, points)
    }
    const detail = buildDetailFromRow(db, row, linesById.get(row.id) ?? [], points)
    return {
      id: detail.id,
      contractId: detail.contractId,
      contractTitle: detail.contractTitle,
      employerId: detail.employerId,
      employerName: detail.employerName,
      period: detail.period,
      paymentDate: detail.paymentDate,
      countryPack: detail.countryPack,
      currency: detail.currency,
      totalsOnly: detail.totalsOnly,
      baseSalary: detail.baseSalary,
      gross: detail.gross,
      employeeContributions: detail.employeeContributions,
      employerContributions: detail.employerContributions,
      employerCost: detail.employerCost,
      netBeforeTax: detail.netBeforeTax,
      taxableNet: detail.taxableNet,
      socialNet: detail.socialNet,
      withholdingRateMicros: detail.withholdingRateMicros,
      withholdingPersonalized: detail.withholdingPersonalized,
      withholdingTax: detail.withholdingTax,
      otherAdjustments: detail.otherAdjustments,
      netPaid: detail.netPaid,
      transactionId: detail.transactionId,
      matchedTransactionLabel: detail.matchedTransactionLabel,
      matchedTransactionDate: detail.matchedTransactionDate,
      matchedTransactionAmount: detail.matchedTransactionAmount,
      sourceOrigin: detail.sourceOrigin,
      issueCount: detail.issueCount,
      errorCount: detail.errorCount,
    }
  })
}

export function getPayslipDetail(db: Db, id: string): PayslipDetail {
  const row = db.prepare(`${PAYSLIP_SELECT} WHERE p.id = ?`).get(id) as PayslipRow | undefined
  if (!row) fail('not-found')
  const lines = readLinesByPayslipIds(db, [row.id]).get(row.id) ?? []
  const yearPoints = readYearMonthsForContract(db, row.contract_id, row.period.slice(0, 4))
  return buildDetailFromRow(db, row, lines, yearPoints)
}

export function savePayslip(
  changes: ChangeSet,
  input: ParsedLedgerInputs['payslipSave'],
  now: Date,
): PayslipDetail {
  const contract = changes.get('contract', { id: input.contractId })
  if (!contract) fail('not-found')
  if (input.transactionId) {
    const tx = changes.get('transactions', { id: input.transactionId })
    if (!tx) fail('not-found')
    const duplicate = changes.db
      .prepare('SELECT id FROM payslip WHERE transaction_id = ? AND id <> ?')
      .get(input.transactionId, input.id ?? '') as { id: string } | undefined
    if (duplicate) fail('conflict')
  }

  const stamp = now.toISOString()
  const payslipId = input.id ?? uuidv7()
  const existing = input.id ? changes.get('payslip', { id: payslipId }) : undefined
  if (input.id && !existing) fail('not-found')

  const rowValues = {
    contract_id: input.contractId,
    period: input.period,
    payment_date: input.paymentDate,
    country_pack: input.countryPack,
    currency: input.currency,
    totals_only: input.totalsOnly ? 1 : 0,
    base_hours_hundredths: input.baseHoursHundredths,
    hourly_rate: input.hourlyRate,
    base_salary: input.baseSalary,
    gross: input.gross,
    employee_contributions: input.employeeContributions,
    employer_contributions: input.employerContributions,
    net_before_tax: input.netBeforeTax,
    taxable_net: input.taxableNet,
    social_net: input.socialNet,
    withholding_rate_micros: input.withholdingRateMicros,
    withholding_personalized: input.withholdingPersonalized ? 1 : 0,
    withholding_base: input.withholdingBase,
    withholding_tax: input.withholdingTax,
    other_adjustments: input.otherAdjustments,
    net_paid: input.netPaid,
    ytd_gross: input.ytdGross,
    ytd_taxable_net: input.ytdTaxableNet,
    ytd_withholding: input.ytdWithholding,
    ytd_hours_hundredths: input.ytdHoursHundredths,
    employee_nir: input.employeeNir,
    employee_address: input.employeeAddress,
    transaction_id:
      input.transactionId !== undefined
        ? input.transactionId
        : ((existing?.transaction_id as string | null | undefined) ?? null),
    source_origin: input.sourceOrigin ?? 'user',
    notes: input.notes,
    updated_at: stamp,
  }

  if (existing) {
    changes.update('payslip', { id: payslipId }, rowValues)
    const oldLines = changes.db
      .prepare('SELECT id FROM payslip_line WHERE payslip_id = ? ORDER BY position DESC')
      .all(payslipId) as { id: string }[]
    for (const line of oldLines) changes.delete('payslip_line', { id: line.id })
  } else {
    changes.insert('payslip', { id: payslipId, ...rowValues, created_at: stamp })
  }

  input.lines.forEach((line, position) => {
    changes.insert('payslip_line', {
      id: uuidv7(),
      payslip_id: payslipId,
      section: line.section,
      item_kind: line.itemKind,
      label: line.label,
      quantity_hundredths: line.quantityHundredths,
      base_amount: line.baseAmount,
      employee_rate_micros: line.employeeRateMicros,
      employee_amount: line.employeeAmount,
      employer_rate_micros: line.employerRateMicros,
      employer_amount: line.employerAmount,
      taxable: line.taxable ? 1 : 0,
      position,
    })
  })

  return getPayslipDetail(changes.db, payslipId)
}

export function deletePayslip(changes: ChangeSet, id: string): null {
  if (!changes.get('payslip', { id })) fail('not-found')
  const lineIds = changes.db
    .prepare('SELECT id FROM payslip_line WHERE payslip_id = ? ORDER BY position DESC')
    .all(id) as { id: string }[]
  for (const line of lineIds) changes.delete('payslip_line', { id: line.id })
  changes.delete('payslip', { id })
  return null
}

/** Primes ponctuelles non reconduites par défaut lors de la duplication du mois précédent. */
const NON_RECURRING_VARIABLE_KINDS = new Set([
  'thirteenth-month',
  'holiday-bonus',
  'performance-bonus',
])

function shiftDateToPeriod(paymentDate: string | null, targetPeriod: string): string | null {
  if (!paymentDate) return null
  const { year, month } = parseMonth(targetPeriod)
  const day = Number(paymentDate.slice(8, 10))
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${targetPeriod}-${String(Math.min(day, maxDay)).padStart(2, '0')}`
}

export function duplicatePreviousPayslip(
  db: Db,
  { sourcePayslipId, contractId, targetPeriod }: ParsedLedgerInputs['payslipDuplicatePrevious'],
): PayslipDuplicateDraft {
  let row: PayslipRow | undefined
  if (sourcePayslipId) {
    row = db.prepare(`${PAYSLIP_SELECT} WHERE p.id = ?`).get(sourcePayslipId) as
      PayslipRow | undefined
  } else if (contractId) {
    row = db
      .prepare(
        `${PAYSLIP_SELECT} WHERE p.contract_id = ? AND p.period < ? ORDER BY p.period DESC LIMIT 1`,
      )
      .get(contractId, targetPeriod) as PayslipRow | undefined
    if (!row) {
      row = db
        .prepare(`${PAYSLIP_SELECT} WHERE p.contract_id = ? ORDER BY p.period DESC LIMIT 1`)
        .get(contractId) as PayslipRow | undefined
    }
  }
  if (!row) fail('not-found')

  const detail = getPayslipDetail(db, row.id)
  const keptLines = detail.lines
    .filter(
      (line) =>
        line.section !== 'absence' &&
        !(line.section === 'variable' && NON_RECURRING_VARIABLE_KINDS.has(line.itemKind)),
    )
    .map((line) => ({
      section: line.section,
      itemKind: line.itemKind,
      label: line.label,
      quantityHundredths: line.quantityHundredths,
      baseAmount: line.baseAmount,
      employeeRateMicros: line.employeeRateMicros,
      employeeAmount: line.employeeAmount,
      employerRateMicros: line.employerRateMicros,
      employerAmount: line.employerAmount,
      taxable: line.taxable,
    }))

  const variableTotal = keptLines
    .filter((l) => l.section === 'variable')
    .reduce((acc, l) => acc + l.employeeAmount, 0)
  const gross = detail.baseSalary + variableTotal
  const empContribRatio =
    detail.gross > 0
      ? Math.round((detail.employeeContributions * 1_000_000) / detail.gross)
      : 222_000
  const erContribRatio =
    detail.gross > 0 ? Math.round((detail.employerContributions * 1_000_000) / detail.gross) : 0

  const employeeContributions =
    gross === detail.gross
      ? detail.employeeContributions
      : Math.round((gross * empContribRatio) / 1_000_000)
  const employerContributions =
    gross === detail.gross
      ? detail.employerContributions
      : Math.round((gross * erContribRatio) / 1_000_000)
  const netBeforeTax = gross - employeeContributions
  const taxableRatio =
    detail.netBeforeTax > 0
      ? Math.round((detail.taxableNet * 1_000_000) / detail.netBeforeTax)
      : 1_037_000
  const taxableNet =
    gross === detail.gross
      ? detail.taxableNet
      : Math.round((netBeforeTax * taxableRatio) / 1_000_000)
  const socialNet =
    detail.socialNet === null ? null : gross === detail.gross ? detail.socialNet : netBeforeTax
  const withholdingTax = Math.round((taxableNet * detail.withholdingRateMicros) / 1_000_000)
  const otherAdjustments = keptLines
    .filter((l) => l.section === 'after_tax')
    .reduce((acc, l) => acc + l.employeeAmount, 0)
  const netPaid = netBeforeTax - withholdingTax + otherAdjustments

  const sameYearPrevious = readYearMonthsForContract(
    db,
    detail.contractId,
    targetPeriod.slice(0, 4),
  ).filter((p) => p.period < targetPeriod)
  const priorGross = sameYearPrevious.reduce((s, p) => s + p.gross, 0)
  const priorTaxable = sameYearPrevious.reduce((s, p) => s + p.taxableNet, 0)
  const priorTax = sameYearPrevious.reduce((s, p) => s + p.withholdingTax, 0)
  const priorHours = sameYearPrevious.reduce((s, p) => s + (p.baseHoursHundredths ?? 0), 0)

  return {
    contractId: detail.contractId,
    period: targetPeriod,
    paymentDate: shiftDateToPeriod(detail.paymentDate, targetPeriod),
    countryPack: detail.countryPack,
    currency: detail.currency,
    totalsOnly: detail.totalsOnly,
    baseHoursHundredths: detail.baseHoursHundredths,
    hourlyRate: detail.hourlyRate,
    baseSalary: detail.baseSalary,
    gross,
    employeeContributions,
    employerContributions,
    netBeforeTax,
    taxableNet,
    socialNet,
    withholdingRateMicros: detail.withholdingRateMicros,
    withholdingPersonalized: detail.withholdingPersonalized,
    withholdingBase: detail.withholdingBase,
    withholdingTax,
    otherAdjustments,
    netPaid,
    ytdGross: detail.ytdGross !== null || sameYearPrevious.length > 0 ? priorGross + gross : null,
    ytdTaxableNet:
      detail.ytdTaxableNet !== null || sameYearPrevious.length > 0
        ? priorTaxable + taxableNet
        : null,
    ytdWithholding:
      detail.ytdWithholding !== null || sameYearPrevious.length > 0
        ? priorTax + withholdingTax
        : null,
    ytdHoursHundredths:
      detail.baseHoursHundredths !== null &&
      (detail.ytdHoursHundredths !== null || sameYearPrevious.length > 0)
        ? priorHours + detail.baseHoursHundredths
        : null,
    employeeNir: row.employee_nir,
    employeeAddress: row.employee_address,
    sourceOrigin: 'user',
    notes: detail.notes,
    lines: keptLines,
  }
}

export function revealPayslipSensitive(
  db: Db,
  id: string,
): { nir: string | null; address: string | null } {
  const row = db
    .prepare('SELECT employee_nir, employee_address FROM payslip WHERE id = ?')
    .get(id) as { employee_nir: string | null; employee_address: string | null } | undefined
  if (!row) fail('not-found')
  return { nir: row.employee_nir, address: row.employee_address }
}

// ——— Rapprochement bulletin ↔ virement ——————————————————————————————————

function periodDefaultPaymentDate(period: string): string {
  const { year, month } = parseMonth(period)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${period}-${String(Math.min(28, lastDay)).padStart(2, '0')}`
}

function addDaysIso(isoDate: string, days: number): string {
  const ms = Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

function diffDaysIso(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

export function listPayslipTransferCandidates(db: Db, id: string): PayslipTransferCandidate[] {
  const p = db
    .prepare('SELECT id, period, payment_date, net_paid, currency FROM payslip WHERE id = ?')
    .get(id) as
    | {
        id: string
        period: string
        payment_date: string | null
        net_paid: MinorUnits
        currency: string
      }
    | undefined
  if (!p) fail('not-found')

  const anchor = p.payment_date ?? periodDefaultPaymentDate(p.period)
  const fromDate = addDaysIso(anchor, -7)
  const toDate = addDaysIso(anchor, 7)

  const rows = db
    .prepare(
      `SELECT t.id AS tx_id, t.account_id, a.name AS account_name, t.booking_date, t.amount,
         coalesce(t.label, t.label_raw) AS label, linked.id AS linked_payslip_id
       FROM transactions t
       JOIN account a ON a.id = t.account_id
       LEFT JOIN payslip linked ON linked.transaction_id = t.id
       WHERE t.nature = 'operation'
         AND t.currency = @currency
         AND t.amount > 0
         AND t.booking_date BETWEEN @fromDate AND @toDate
       ORDER BY abs(t.amount - @netPaid) ASC, abs(julianday(t.booking_date) - julianday(@anchor)) ASC
       LIMIT 20`,
    )
    .all({ currency: p.currency, fromDate, toDate, netPaid: p.net_paid, anchor }) as {
    tx_id: string
    account_id: string
    account_name: string
    booking_date: string
    amount: MinorUnits
    label: string
    linked_payslip_id: string | null
  }[]

  return rows.map((row) => ({
    transactionId: row.tx_id,
    accountId: row.account_id,
    accountName: row.account_name,
    bookingDate: row.booking_date,
    amount: row.amount,
    label: row.label,
    diffCents: row.amount - p.net_paid,
    daysDiff: diffDaysIso(anchor, row.booking_date),
    alreadyLinkedPayslipId: row.linked_payslip_id,
  }))
}

export function linkPayslipTransaction(
  changes: ChangeSet,
  { id, transactionId }: ParsedLedgerInputs['payslipLinkTransaction'],
  now: Date,
): PayslipDetail {
  const existing = changes.get('payslip', { id })
  if (!existing) fail('not-found')
  if (transactionId !== null) {
    if (!changes.get('transactions', { id: transactionId })) fail('not-found')
    const conflict = changes.db
      .prepare('SELECT id FROM payslip WHERE transaction_id = ? AND id <> ?')
      .get(transactionId, id) as { id: string } | undefined
    if (conflict) fail('conflict')
  }
  changes.update(
    'payslip',
    { id },
    { transaction_id: transactionId, updated_at: now.toISOString() },
  )
  return getPayslipDetail(changes.db, id)
}

// ——— Tableau de bord salaire & récapitulatif annuel ——————————————————————

export function getSalaryDashboardOverview(
  db: Db,
  { contractId, currency = 'EUR' }: ParsedLedgerInputs['salaryDashboard'],
): SalaryDashboardOverview {
  const contracts = listContracts(db, { includeArchived: true })
  const rows = db
    .prepare(
      `${PAYSLIP_SELECT}
       WHERE p.currency = @currency
         AND (@contractId IS NULL OR p.contract_id = @contractId)
       ORDER BY p.period ASC, p.created_at ASC`,
    )
    .all({ currency, contractId: contractId ?? null }) as PayslipRow[]

  const linesById = readLinesByPayslipIds(
    db,
    rows.map((r) => r.id),
  )

  const months: SalaryMonthlyPoint[] = []
  const byYear = new Map<
    number,
    {
      rows: PayslipRow[]
      variableTotal: number
      onCallTotal: number
      overtimeTotal: number
      thirteenthMonthTotal: number
      bonusesTotal: number
      hoursHundredths: number
    }
  >()

  for (const row of rows) {
    const lines = linesById.get(row.id) ?? []
    let variableTotal = 0
    let onCallTotal = 0
    let overtimeTotal = 0
    let thirteenthMonthTotal = 0
    let bonusesTotal = 0
    for (const line of lines) {
      if (line.section !== 'variable') continue
      variableTotal += line.employeeAmount
      if (line.itemKind === 'on-call') onCallTotal += line.employeeAmount
      else if (line.itemKind.startsWith('overtime')) overtimeTotal += line.employeeAmount
      else if (line.itemKind === 'thirteenth-month') thirteenthMonthTotal += line.employeeAmount
      else bonusesTotal += line.employeeAmount
    }
    const effectiveContributionRateMicros =
      row.gross > 0 ? Math.round((row.employee_contributions * 1_000_000) / row.gross) : 0

    months.push({
      payslipId: row.id,
      contractId: row.contract_id,
      contractTitle: row.contract_title,
      period: row.period,
      gross: row.gross,
      employeeContributions: row.employee_contributions,
      employerContributions: row.employer_contributions,
      employerCost: row.gross + row.employer_contributions,
      netBeforeTax: row.net_before_tax,
      taxableNet: row.taxable_net,
      socialNet: row.social_net,
      withholdingRateMicros: row.withholding_rate_micros,
      withholdingTax: row.withholding_tax,
      netPaid: row.net_paid,
      variableTotal,
      onCallTotal,
      overtimeTotal,
      thirteenthMonthTotal,
      bonusesTotal,
      effectiveContributionRateMicros,
    })

    const year = Number(row.period.slice(0, 4))
    const yr = byYear.get(year) ?? {
      rows: [],
      variableTotal: 0,
      onCallTotal: 0,
      overtimeTotal: 0,
      thirteenthMonthTotal: 0,
      bonusesTotal: 0,
      hoursHundredths: 0,
    }
    yr.rows.push(row)
    yr.variableTotal += variableTotal
    yr.onCallTotal += onCallTotal
    yr.overtimeTotal += overtimeTotal
    yr.thirteenthMonthTotal += thirteenthMonthTotal
    yr.bonusesTotal += bonusesTotal
    yr.hoursHundredths += row.base_hours_hundredths ?? 0
    byYear.set(year, yr)
  }

  const annualRecaps: SalaryAnnualRecap[] = [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, yr]) => {
      const gross = yr.rows.reduce((s, r) => s + r.gross, 0)
      const employeeContributions = yr.rows.reduce((s, r) => s + r.employee_contributions, 0)
      const employerContributions = yr.rows.reduce((s, r) => s + r.employer_contributions, 0)
      const netBeforeTax = yr.rows.reduce((s, r) => s + r.net_before_tax, 0)
      const taxableNet = yr.rows.reduce((s, r) => s + r.taxable_net, 0)
      const socialNet = yr.rows.reduce((s, r) => s + (r.social_net ?? r.net_before_tax), 0)
      const withholdingTax = yr.rows.reduce((s, r) => s + r.withholding_tax, 0)
      const otherAdjustments = yr.rows.reduce((s, r) => s + r.other_adjustments, 0)
      const netPaid = yr.rows.reduce((s, r) => s + r.net_paid, 0)
      const dec = yr.rows.find((r) => r.period === `${year}-12`) ?? yr.rows[yr.rows.length - 1]
      const decYtdGross = dec?.ytd_gross ?? null
      const decYtdTaxableNet = dec?.ytd_taxable_net ?? null
      const decYtdWithholding = dec?.ytd_withholding ?? null
      const decYtdHoursHundredths = dec?.ytd_hours_hundredths ?? null
      const tol = Math.max(2, yr.rows.length * 2)
      const hasDecemberYtdMismatch =
        (decYtdGross !== null && Math.abs(decYtdGross - gross) > tol) ||
        (decYtdTaxableNet !== null && Math.abs(decYtdTaxableNet - taxableNet) > tol) ||
        (decYtdWithholding !== null && Math.abs(decYtdWithholding - withholdingTax) > tol)

      return {
        year,
        monthCount: yr.rows.length,
        gross,
        employeeContributions,
        employerContributions,
        employerCost: gross + employerContributions,
        netBeforeTax,
        taxableNet,
        socialNet,
        withholdingTax,
        otherAdjustments,
        netPaid,
        variableTotal: yr.variableTotal,
        onCallTotal: yr.onCallTotal,
        overtimeTotal: yr.overtimeTotal,
        thirteenthMonthTotal: yr.thirteenthMonthTotal,
        bonusesTotal: yr.bonusesTotal,
        hoursHundredths: yr.hoursHundredths,
        effectiveContributionRateMicros:
          gross > 0 ? Math.round((employeeContributions * 1_000_000) / gross) : 0,
        effectiveWithholdingRateMicros:
          taxableNet > 0 ? Math.round((withholdingTax * 1_000_000) / taxableNet) : 0,
        decemberYtdGross: dec?.period.endsWith('-12') ? decYtdGross : null,
        decemberYtdTaxableNet: dec?.period.endsWith('-12') ? decYtdTaxableNet : null,
        decemberYtdWithholding: dec?.period.endsWith('-12') ? decYtdWithholding : null,
        decemberYtdHoursHundredths: dec?.period.endsWith('-12') ? decYtdHoursHundredths : null,
        hasDecemberYtdMismatch,
      }
    })

  const latestRow = rows[rows.length - 1]
  const latestPayslip = latestRow
    ? buildDetailFromRow(
        db,
        latestRow,
        linesById.get(latestRow.id) ?? [],
        readYearMonthsForContract(db, latestRow.contract_id, latestRow.period.slice(0, 4)),
      )
    : null

  void addMonths
  return {
    currency,
    contracts,
    months,
    annualRecaps,
    latestPayslip,
  }
}
