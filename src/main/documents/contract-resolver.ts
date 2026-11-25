import { normalizeCompanyName, type ExtractedPayslipDraft } from '@shared/documents/model'
import type { ContractSummary, EmployerSummary } from '@shared/payslip'
import type { VaultManager } from '../vault/vault-manager'

const GENERIC_CONTRACT_TITLE = 'Contrat principal'

export function findMatchingEmployer(
  employers: readonly EmployerSummary[],
  employerName: string | null | undefined,
  employerSiret: string | null | undefined,
): EmployerSummary | null {
  const siret = employerSiret?.replace(/\s+/g, '') || null
  if (siret) {
    const bySiret = employers.find((e) => e.siret === siret)
    if (bySiret) return bySiret
  }
  if (employerName && employerName.trim().length >= 2) {
    const target = normalizeCompanyName(employerName)
    if (!target) return null
    const byName = employers.find((e) => normalizeCompanyName(e.name) === target)
    if (byName) return byName
  }
  return null
}

export function findMatchingContract(
  contracts: readonly ContractSummary[],
  employerId: string,
  draft: Pick<ExtractedPayslipDraft, 'period' | 'contractTitle' | 'contractStartDate'>,
): ContractSummary | null {
  const candidates = contracts.filter((c) => c.employerId === employerId && !c.archived)
  if (candidates.length === 0) return null
  if (draft.contractStartDate) {
    const exactStart = candidates.find((c) => c.startDate === draft.contractStartDate)
    if (exactStart) return exactStart
  }
  const periodDate = draft.period ? `${draft.period}-15` : null
  if (draft.contractTitle) {
    const targetTitle = normalizeCompanyName(draft.contractTitle)
    const exactTitle = candidates.find(
      (c) =>
        normalizeCompanyName(c.title) === targetTitle &&
        (!c.endDate || !periodDate || periodDate <= c.endDate),
    )
    if (exactTitle) return exactTitle
  }
  if (periodDate) {
    const covering = candidates.find(
      (c) =>
        (!c.endDate || periodDate <= c.endDate) && periodDate >= c.startDate.slice(0, 7) + '-01',
    )
    if (covering) return covering
    // Si un contrat précédent est déjà clos avant la période et un autre est encore ouvert, préférer l'ouvert.
    const stillOpen = candidates.find((c) => !c.endDate && (!draft.contractStartDate || !c.endDate))
    if (stillOpen) return stillOpen
    // Si tous les contrats sont clos et antérieurs de > 1 mois, il s'agit d'un nouveau contrat.
    if (
      candidates.every((c) => c.endDate !== null && periodDate.slice(0, 7) > c.endDate.slice(0, 7))
    ) {
      return null
    }
  }
  return candidates.find((c) => !c.endDate) ?? candidates[0] ?? null
}

export interface ContractResolutionResult {
  contractId: string
  createdEmployer: boolean
  createdContract: boolean
  updatedContract: boolean
}

/**
 * Associe automatiquement un bulletin (ou solde de tout compte) à une société et un contrat :
 * - crée l'employeur s'il est inconnu (correspondance par SIRET ou raison sociale normalisée) ;
 * - complète le SIRET s'il manquait ;
 * - crée le contrat ou met à jour ses dates de début (`startDate`) et de fin (`endDate`) au fil
 *   de l'import des bulletins et du solde de tout compte.
 */
export async function resolveOrUpdateContractForPayslip(
  vault: Pick<VaultManager, 'ledger'>,
  params: {
    contractId?: string | null
    employerName?: string
    employerSiret?: string | null
    contractTitle?: string
    contractStartDate?: string | null
    contractEndDate?: string | null
    draft: ExtractedPayslipDraft
  },
): Promise<ContractResolutionResult | null> {
  const inferredMonthStart = params.draft.period ? `${params.draft.period}-01` : '2026-01-01'
  const explicitStart = params.contractStartDate ?? params.draft.contractStartDate ?? null
  const explicitEnd = params.contractEndDate ?? params.draft.contractEndDate ?? null
  const resolvedTitle = (
    params.contractTitle ||
    params.draft.contractTitle ||
    GENERIC_CONTRACT_TITLE
  )
    .trim()
    .slice(0, 200)

  let existing: ContractSummary | null
  let createdEmployer = false
  let employer: EmployerSummary | null = null

  if (params.contractId) {
    const allContracts = await vault.ledger('contractsList', { includeArchived: true })
    if (!allContracts.ok) return null
    existing = allContracts.value.find((c) => c.id === params.contractId) ?? null
    if (!existing) return null
  } else {
    const empName = (params.employerName || params.draft.employerName || 'Employeur').trim()
    const empSiret =
      (params.employerSiret ?? params.draft.employerSiret)?.replace(/\s+/g, '') || null

    const empListRes = await vault.ledger('employersList', { includeArchived: true })
    if (!empListRes.ok) return null

    employer = findMatchingEmployer(empListRes.value, empName, empSiret)

    if (!employer) {
      const created = await vault.ledger('employerCreate', {
        name: empName.slice(0, 200),
        siret: empSiret && /^\d{14}$/.test(empSiret) ? empSiret : null,
        address: null,
      })
      if (!created.ok) return null
      createdEmployer = true
      employer = {
        id: created.value.id,
        name: empName.slice(0, 200),
        siret: empSiret && /^\d{14}$/.test(empSiret) ? empSiret : null,
        addressMasked: null,
        hasAddress: false,
        archived: false,
        contractCount: 0,
      }
    } else if (empSiret && !employer.siret && /^\d{14}$/.test(empSiret)) {
      await vault.ledger('employerUpdate', {
        id: employer.id,
        patch: { siret: empSiret },
      })
    }

    const cListRes = await vault.ledger('contractsList', {
      employerId: employer.id,
      includeArchived: true,
    })
    if (!cListRes.ok) return null

    existing = findMatchingContract(cListRes.value, employer.id, {
      period: params.draft.period,
      contractTitle: params.contractTitle || params.draft.contractTitle,
      contractStartDate: explicitStart,
    })
  }

  if (!existing && employer) {
    let startDate = explicitStart ?? inferredMonthStart
    const endDate = explicitEnd
    if (endDate && startDate > endDate) {
      startDate = `${endDate.slice(0, 7)}-01`
    }
    const created = await vault.ledger('contractCreate', {
      employerId: employer.id,
      title: resolvedTitle,
      contractType: params.draft.contractType ?? 'cdi',
      executiveStatus: params.draft.executiveStatus ?? 'cadre',
      workTime: 'full_time',
      workTimeRatioMicros: 1_000_000,
      monthlyHoursHundredths: params.draft.baseHoursHundredths ?? 15_167,
      collectiveAgreement: params.draft.collectiveAgreement ?? null,
      classification: null,
      startDate,
      endDate,
      defaultBaseSalary: params.draft.baseSalary > 0 ? params.draft.baseSalary : null,
      currency: params.draft.currency,
      countryPack: 'fr',
      employeeNir: null,
    })
    if (!created.ok) return null
    return {
      contractId: created.value.id,
      createdEmployer,
      createdContract: true,
      updatedContract: false,
    }
  }

  if (!existing) return null

  // Contrat existant : affine début, fin, poste ou convention si le bulletin / STC apporte mieux.
  const patch: {
    startDate?: string
    endDate?: string
    title?: string
    collectiveAgreement?: string
  } = {}

  const candidateStart = explicitStart ?? inferredMonthStart
  const targetEnd = explicitEnd ?? existing.endDate
  if (candidateStart < existing.startDate && (!targetEnd || candidateStart <= targetEnd)) {
    patch.startDate = candidateStart
  } else if (
    explicitStart &&
    explicitStart !== existing.startDate &&
    existing.startDate.endsWith('-01') &&
    explicitStart.slice(0, 7) === existing.startDate.slice(0, 7)
  ) {
    // Remplace un jour-1 estimé (ex. 2025-01-01) par la date d'entrée exacte du mois (ex. 2025-01-06).
    patch.startDate = explicitStart
  }

  const nextStart = patch.startDate ?? existing.startDate
  if (
    explicitEnd &&
    (!existing.endDate || explicitEnd > existing.endDate) &&
    nextStart <= explicitEnd
  ) {
    patch.endDate = explicitEnd
  }

  if (resolvedTitle !== GENERIC_CONTRACT_TITLE && existing.title === GENERIC_CONTRACT_TITLE) {
    patch.title = resolvedTitle
  }

  if (params.draft.collectiveAgreement && !existing.collectiveAgreement) {
    patch.collectiveAgreement = params.draft.collectiveAgreement
  }

  let updatedContract = false
  if (Object.keys(patch).length > 0) {
    const upd = await vault.ledger('contractUpdate', { id: existing.id, patch })
    if (upd.ok) updatedContract = true
  }

  return {
    contractId: existing.id,
    createdEmployer,
    createdContract: false,
    updatedContract,
  }
}
