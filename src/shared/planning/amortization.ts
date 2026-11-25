import type { MinorUnits } from '../money'
import type { EarlyRepaymentSimulation, LoanPeriodicity } from './model'

export interface GeneratedInstallment {
  installmentNumber: number
  dueDate: string
  principalCents: MinorUnits
  interestCents: MinorUnits
  insuranceCents: MinorUnits
  totalCents: MinorUnits
  remainingPrincipalCents: MinorUnits
}

export interface LoanScheduleResult {
  installments: GeneratedInstallment[]
  monthlyPaymentCents: MinorUnits
  totalInterestCents: MinorUnits
  totalInsuranceCents: MinorUnits
  endDate: string
}

const STEP_MONTHS: Readonly<Record<LoanPeriodicity, number>> = {
  monthly: 1,
  quarterly: 3,
  annual: 12,
}

/** Ajoute N mois calendaires à une date ISO `AAAA-MM-JJ` en conservant le quantième (borné fin de mois). */
export function addCalendarMonths(isoDate: string, months: number): string {
  const [yStr, mStr, dStr] = isoDate.split('-')
  const year = Number(yStr)
  const month = Number(mStr) - 1
  const day = Number(dStr)
  const targetFirst = new Date(Date.UTC(year, month + months, 1))
  const lastDay = new Date(
    Date.UTC(targetFirst.getUTCFullYear(), targetFirst.getUTCMonth() + 1, 0),
  ).getUTCDate()
  const clampedDay = Math.min(day, lastDay)
  return new Date(Date.UTC(targetFirst.getUTCFullYear(), targetFirst.getUTCMonth(), clampedDay))
    .toISOString()
    .slice(0, 10)
}

/**
 * Calcule l'échéancier d'amortissement d'un crédit à mensualités constantes en centimes entiers.
 * Invariant garanti : `Σ principalCents === initialCapital` et la dernière échéance ramène
 * `remainingPrincipalCents` à `0`.
 */
export function computeLoanSchedule(params: {
  initialCapital: MinorUnits
  nominalRateMicros: number
  insuranceMonthlyCents: MinorUnits
  durationMonths: number
  periodicity: LoanPeriodicity
  startDate: string
}): LoanScheduleResult {
  const step = STEP_MONTHS[params.periodicity]
  const totalPeriods = Math.max(1, Math.ceil(params.durationMonths / step))
  const annualRate = Math.max(0, params.nominalRateMicros) / 1_000_000
  const periodRate = (annualRate * step) / 12
  const periodInsurance = Math.max(0, params.insuranceMonthlyCents) * step

  let baseAnnuityCents: number
  if (periodRate === 0) {
    baseAnnuityCents = Math.round(params.initialCapital / totalPeriods)
  } else {
    const factor = Math.pow(1 + periodRate, totalPeriods)
    const raw = (params.initialCapital * periodRate * factor) / (factor - 1)
    baseAnnuityCents = Math.round(raw)
  }

  const installments: GeneratedInstallment[] = []
  let remaining = params.initialCapital
  let totalInterestCents = 0
  let totalInsuranceCents = 0

  for (let i = 1; i <= totalPeriods; i++) {
    const dueDate = addCalendarMonths(params.startDate, (i - 1) * step)
    const interestCents = periodRate === 0 ? 0 : Math.round(remaining * periodRate)
    let principalCents: number

    if (i === totalPeriods) {
      principalCents = remaining
    } else {
      principalCents = Math.max(0, baseAnnuityCents - interestCents)
      if (principalCents > remaining) principalCents = remaining
    }

    remaining = Math.max(0, remaining - principalCents)
    const totalCents = principalCents + interestCents + periodInsurance
    totalInterestCents += interestCents
    totalInsuranceCents += periodInsurance

    installments.push({
      installmentNumber: i,
      dueDate,
      principalCents,
      interestCents,
      insuranceCents: periodInsurance,
      totalCents,
      remainingPrincipalCents: remaining,
    })
  }

  const first = installments[0]
  const last = installments[installments.length - 1]
  const monthlyPaymentCents = first ? Math.round(first.totalCents / step) : 0

  return {
    installments,
    monthlyPaymentCents,
    totalInterestCents,
    totalInsuranceCents,
    endDate: last?.dueDate ?? params.startDate,
  }
}

/**
 * Simule un remboursement anticipé partiel à partir d'une échéance donnée :
 * - `reduce_duration` : garde la même échéance hors assurance et réduit le nombre de mois ;
 * - `reduce_payment` : conserve la date de fin et recalcule une mensualité plus faible.
 */
export function simulateEarlyRepayment(params: {
  initialCapital: MinorUnits
  nominalRateMicros: number
  insuranceMonthlyCents: MinorUnits
  durationMonths: number
  periodicity: LoanPeriodicity
  startDate: string
  extraPrincipalCents: MinorUnits
  atInstallmentNumber: number
  mode: 'reduce_duration' | 'reduce_payment'
}): EarlyRepaymentSimulation {
  const step = STEP_MONTHS[params.periodicity]
  const baseline = computeLoanSchedule({
    initialCapital: params.initialCapital,
    nominalRateMicros: params.nominalRateMicros,
    insuranceMonthlyCents: params.insuranceMonthlyCents,
    durationMonths: params.durationMonths,
    periodicity: params.periodicity,
    startDate: params.startDate,
  })

  const idx = Math.max(1, Math.min(params.atInstallmentNumber, baseline.installments.length))
  const pivot = baseline.installments[idx - 1]!
  const remainingFuture = baseline.installments.slice(idx)
  const currentRemainingInterestCents = remainingFuture.reduce((s, r) => s + r.interestCents, 0)
  const remainingAfterExtra = Math.max(
    0,
    pivot.remainingPrincipalCents - Math.max(0, params.extraPrincipalCents),
  )

  if (remainingAfterExtra === 0 || remainingFuture.length === 0) {
    return {
      extraPrincipalCents: params.extraPrincipalCents,
      atInstallmentNumber: idx,
      mode: params.mode,
      currentRemainingInterestCents,
      newRemainingInterestCents: 0,
      interestSavedCents: currentRemainingInterestCents,
      monthsSaved: remainingFuture.length * step,
      newMonthlyPaymentCents: 0,
      newEndDate: pivot.dueDate,
    }
  }

  const nextStart = addCalendarMonths(pivot.dueDate, step)
  const annualRate = Math.max(0, params.nominalRateMicros) / 1_000_000
  const periodRate = (annualRate * step) / 12
  const periodInsurance = Math.max(0, params.insuranceMonthlyCents) * step

  if (params.mode === 'reduce_payment') {
    const newSched = computeLoanSchedule({
      initialCapital: remainingAfterExtra,
      nominalRateMicros: params.nominalRateMicros,
      insuranceMonthlyCents: params.insuranceMonthlyCents,
      durationMonths: remainingFuture.length * step,
      periodicity: params.periodicity,
      startDate: nextStart,
    })
    const interestSavedCents = Math.max(
      0,
      currentRemainingInterestCents - newSched.totalInterestCents,
    )
    return {
      extraPrincipalCents: params.extraPrincipalCents,
      atInstallmentNumber: idx,
      mode: 'reduce_payment',
      currentRemainingInterestCents,
      newRemainingInterestCents: newSched.totalInterestCents,
      interestSavedCents,
      monthsSaved: 0,
      newMonthlyPaymentCents: newSched.monthlyPaymentCents,
      newEndDate: newSched.endDate,
    }
  }

  // reduce_duration : conserver le montant hors assurance de l'échéance initiale.
  const targetExclInsurance = Math.max(
    1,
    (baseline.installments[0]?.totalCents ?? 1) - periodInsurance,
  )
  let rem = remainingAfterExtra
  let newInterest = 0
  let count = 0
  const maxGuard = remainingFuture.length + 12

  while (rem > 0 && count < maxGuard) {
    count += 1
    const interest = periodRate === 0 ? 0 : Math.round(rem * periodRate)
    let principal = Math.max(1, targetExclInsurance - interest)
    if (principal > rem) principal = rem
    rem -= principal
    newInterest += interest
  }

  const monthsSaved = Math.max(0, (remainingFuture.length - count) * step)
  const newEndDate = count > 0 ? addCalendarMonths(pivot.dueDate, count * step) : pivot.dueDate
  return {
    extraPrincipalCents: params.extraPrincipalCents,
    atInstallmentNumber: idx,
    mode: 'reduce_duration',
    currentRemainingInterestCents,
    newRemainingInterestCents: newInterest,
    interestSavedCents: Math.max(0, currentRemainingInterestCents - newInterest),
    monthsSaved,
    newMonthlyPaymentCents: baseline.monthlyPaymentCents,
    newEndDate,
  }
}
