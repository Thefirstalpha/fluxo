import type { MinorUnits } from '../money'
import type {
  ContractType,
  ExecutiveStatus,
  PayslipCountryPackId,
  PayslipDetailedIssue,
  PayslipLine,
  PayslipLineInput,
  PayslipSourceOrigin,
  PayslipSummary,
  WorkTime,
} from '../payslip'

export interface EmployerDraft {
  name: string
  siret: string | null
  address: string | null
}

export interface EmployerSummary {
  id: string
  name: string
  siret: string | null
  addressMasked: string | null
  hasAddress: boolean
  archived: boolean
  contractCount: number
}

export interface ContractDraft {
  employerId: string
  title: string
  contractType: ContractType
  executiveStatus: ExecutiveStatus
  workTime: WorkTime
  workTimeRatioMicros: number
  monthlyHoursHundredths: number | null
  collectiveAgreement: string | null
  classification: string | null
  startDate: string
  endDate: string | null
  defaultBaseSalary: MinorUnits | null
  currency: string
  countryPack: PayslipCountryPackId
  employeeNir: string | null
}

export interface ContractSummary {
  id: string
  employerId: string
  employerName: string
  title: string
  contractType: ContractType
  executiveStatus: ExecutiveStatus
  workTime: WorkTime
  workTimeRatioMicros: number
  monthlyHoursHundredths: number | null
  collectiveAgreement: string | null
  classification: string | null
  startDate: string
  endDate: string | null
  defaultBaseSalary: MinorUnits | null
  currency: string
  countryPack: PayslipCountryPackId
  nirMasked: string | null
  hasNir: boolean
  archived: boolean
  payslipCount: number
}

export interface PayslipSaveInput {
  id?: string
  contractId: string
  period: string
  paymentDate: string | null
  countryPack: PayslipCountryPackId
  currency: string
  totalsOnly: boolean
  baseHoursHundredths: number | null
  hourlyRate: MinorUnits | null
  baseSalary: MinorUnits
  gross: MinorUnits
  employeeContributions: MinorUnits
  employerContributions: MinorUnits
  netBeforeTax: MinorUnits
  taxableNet: MinorUnits
  socialNet: MinorUnits | null
  withholdingRateMicros: number
  withholdingPersonalized: boolean
  withholdingBase: MinorUnits | null
  withholdingTax: MinorUnits
  otherAdjustments: MinorUnits
  netPaid: MinorUnits
  ytdGross: MinorUnits | null
  ytdTaxableNet: MinorUnits | null
  ytdWithholding: MinorUnits | null
  ytdHoursHundredths: number | null
  employeeNir: string | null
  employeeAddress: string | null
  transactionId?: string | null
  sourceOrigin?: PayslipSourceOrigin
  notes: string | null
  lines: PayslipLineInput[]
}

export interface PayslipListItem {
  id: string
  contractId: string
  contractTitle: string
  employerId: string
  employerName: string
  period: string
  paymentDate: string | null
  countryPack: PayslipCountryPackId
  currency: string
  totalsOnly: boolean
  baseSalary: MinorUnits
  gross: MinorUnits
  employeeContributions: MinorUnits
  employerContributions: MinorUnits
  employerCost: MinorUnits
  netBeforeTax: MinorUnits
  taxableNet: MinorUnits
  socialNet: MinorUnits | null
  withholdingRateMicros: number
  withholdingPersonalized: boolean
  withholdingTax: MinorUnits
  otherAdjustments: MinorUnits
  netPaid: MinorUnits
  transactionId: string | null
  matchedTransactionLabel: string | null
  matchedTransactionDate: string | null
  matchedTransactionAmount: MinorUnits | null
  sourceOrigin: PayslipSourceOrigin
  issueCount: number
  errorCount: number
}

export interface PayslipDetail extends PayslipListItem {
  baseHoursHundredths: number | null
  hourlyRate: MinorUnits | null
  withholdingBase: MinorUnits | null
  ytdGross: MinorUnits | null
  ytdTaxableNet: MinorUnits | null
  ytdWithholding: MinorUnits | null
  ytdHoursHundredths: number | null
  nirMasked: string | null
  hasNir: boolean
  addressMasked: string | null
  hasAddress: boolean
  notes: string | null
  lines: PayslipLine[]
  issues: PayslipDetailedIssue[]
  summary: PayslipSummary
}

export type PayslipDuplicateDraft = Omit<PayslipSaveInput, 'id'>

export interface PayslipTransferCandidate {
  transactionId: string
  accountId: string
  accountName: string
  bookingDate: string
  amount: MinorUnits
  label: string
  diffCents: MinorUnits
  daysDiff: number
  alreadyLinkedPayslipId: string | null
}

export interface SalaryMonthlyPoint {
  payslipId: string
  contractId: string
  contractTitle: string
  period: string
  gross: MinorUnits
  employeeContributions: MinorUnits
  employerContributions: MinorUnits
  employerCost: MinorUnits
  netBeforeTax: MinorUnits
  taxableNet: MinorUnits
  socialNet: MinorUnits | null
  withholdingRateMicros: number
  withholdingTax: MinorUnits
  netPaid: MinorUnits
  variableTotal: MinorUnits
  onCallTotal: MinorUnits
  overtimeTotal: MinorUnits
  thirteenthMonthTotal: MinorUnits
  bonusesTotal: MinorUnits
  effectiveContributionRateMicros: number
}

export interface SalaryAnnualRecap {
  year: number
  monthCount: number
  gross: MinorUnits
  employeeContributions: MinorUnits
  employerContributions: MinorUnits
  employerCost: MinorUnits
  netBeforeTax: MinorUnits
  taxableNet: MinorUnits
  socialNet: MinorUnits
  withholdingTax: MinorUnits
  otherAdjustments: MinorUnits
  netPaid: MinorUnits
  variableTotal: MinorUnits
  onCallTotal: MinorUnits
  overtimeTotal: MinorUnits
  thirteenthMonthTotal: MinorUnits
  bonusesTotal: MinorUnits
  hoursHundredths: number
  effectiveContributionRateMicros: number
  effectiveWithholdingRateMicros: number
  decemberYtdGross: MinorUnits | null
  decemberYtdTaxableNet: MinorUnits | null
  decemberYtdWithholding: MinorUnits | null
  decemberYtdHoursHundredths: number | null
  hasDecemberYtdMismatch: boolean
}

export interface SalaryDashboardOverview {
  currency: string
  contracts: ContractSummary[]
  months: SalaryMonthlyPoint[]
  annualRecaps: SalaryAnnualRecap[]
  latestPayslip: PayslipDetail | null
}
