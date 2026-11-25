import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseStatementBytes } from '../../imports/parse'
import { getDashboardSummary } from '../ledger/dashboard'
import { ACCOUNT_DEFAULTS, openTestLedger, type TestLedger } from '../ledger/testing'
import {
  commitImport,
  listImportBatches,
  PendingImportStore,
  previewImport,
  revertImportBatch,
  sha256Hex,
} from './engine'
import { deleteCsvProfile, listCsvProfiles, saveCsvProfile } from './profiles'

let t: TestLedger
let store: PendingImportStore

beforeEach(() => {
  t = openTestLedger()
  store = new PendingImportStore()
})

afterEach(() => {
  store.clear()
  t.close()
})

function bankAccount(name = 'Compte Courant', openingBalance = 1000_00) {
  return t.ok('accountCreate', {
    ...ACCOUNT_DEFAULTS,
    name,
    type: 'checking',
    trackingMode: 'statement',
    openingBalance,
  }).id
}

function parse(text: string, fileName: string) {
  const bytes = new TextEncoder().encode(text)
  const res = parseStatementBytes({ bytes, fileName })
  if (!res.ok) throw new Error(`Parse failed: ${res.reason}`)
  return { statement: res.statement, fileHash: sha256Hex(bytes) }
}

describe('moteur d’import M3 — déduplication, soldes, ajustements et annulation', () => {
  it('détecte exacts/flous, respecte deux achats identiques le même jour et ne crée pas de doublon au réimport', () => {
    const accountId = bankAccount('Courant', 500_00)
    const csv1 = [
      'dateOp;label;supplierFound;amount;accountbalance',
      '2026-11-10;CAFE DE LA GARE;Cafe Gare;-3,50;496,50',
      '2026-11-10;CAFE DE LA GARE;Cafe Gare;-3,50;493,00',
      '2026-11-12;SUPERMARCHE PARIS;Supermarche;-45,00;448,00',
    ].join('\n')
    const p1 = parse(csv1, 'nov1.csv')
    const preview1 = previewImport(t.db, store, {
      accountId,
      fileName: 'nov1.csv',
      fileHash: p1.fileHash,
      profile: 'builtin:boursobank',
      statement: p1.statement,
    })
    expect(preview1.counts).toMatchObject({ total: 3, newCount: 3, exactDuplicateCount: 0 })
    expect(preview1.discrepancy).toBe(0)

    const c1 = commitImport(t.db, store, { previewId: preview1.previewId })
    expect(c1.insertedCount).toBe(3)
    expect(t.ok('accountsList', {})[0]?.balance).toBe(448_00)
    expect(t.ok('payeesList', {}).map((p) => p.name)).toContain('Cafe Gare')

    // Réimport du même fichier + 1 nouvelle ligne + 1 doublon approché à J+2
    const csv2 = [
      'dateOp;label;amount;accountbalance',
      '2026-11-10;CAFE DE LA GARE;-3,50;496,50',
      '2026-11-10;CAFE DE LA GARE;-3,50;493,00',
      '2026-11-14;SUPERMARCHE PARIS 11E;-45,00;448,00',
      '2026-11-15;BOULANGERIE;-5,20;442,80',
    ].join('\n')
    const p2 = parse(csv2, 'nov2.csv')
    const preview2 = previewImport(t.db, store, {
      accountId,
      fileName: 'nov2.csv',
      fileHash: p2.fileHash,
      profile: null,
      statement: p2.statement,
    })
    expect(preview2.counts).toMatchObject({
      total: 4,
      exactDuplicateCount: 2,
      fuzzyDuplicateCount: 1,
      newCount: 1,
    })
    expect(preview2.rows[2]?.matchKind).toBe('fuzzy-duplicate')
    expect(preview2.discrepancy).toBe(0)

    const c2 = commitImport(t.db, store, { previewId: preview2.previewId })
    expect(c2).toMatchObject({ insertedCount: 1, duplicateCount: 3 })
    expect(t.ok('accountsList', {})[0]?.balance).toBe(442_80)
  })

  it('rapproche les soldes (D08), crée un ajustement (D11) puis le remplace quand le relevé manquant arrive', () => {
    const accountId = bankAccount('Courant', 1000_00)
    // Relevé 2 arrive avant relevé 1 : il manque -120,00 € de début de mois
    const camt2 = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt><Stmt>
    <Acct><Ccy>EUR</Ccy></Acct>
    <Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt>880.00</Amt><CdtDbtInd>CRDT</CdtDbtInd></Bal>
    <Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt>830.00</Amt><CdtDbtInd>CRDT</CdtDbtInd></Bal>
    <Ntry>
      <Amt>50.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts><Cd>BOOK</Cd></Sts>
      <BookgDt><Dt>2026-11-20</Dt></BookgDt><AcctSvcrRef>R2</AcctSvcrRef>
      <RmtInf><Ustrd>COURSES 20/11</Ustrd></RmtInf>
    </Ntry>
  </Stmt></BkToCstmrStmt>
</Document>`
    const parsed2 = parse(camt2, 'semaine2.xml')
    const preview2 = previewImport(t.db, store, {
      accountId,
      fileName: 'semaine2.xml',
      fileHash: parsed2.fileHash,
      profile: null,
      statement: parsed2.statement,
    })
    // Solde attendu = 1000 - 50 = 950 €, relevé = 830 € → écart = -120 €
    expect(preview2.discrepancy).toBe(-120_00)

    const c2 = commitImport(t.db, store, {
      previewId: preview2.previewId,
      createAdjustment: { note: 'Relevé semaine 1 manquant' },
    })
    expect(c2.adjustmentTransactionId).toBeTruthy()
    expect(t.ok('accountsList', {})[0]?.balance).toBe(830_00)

    // L'écriture d'ajustement reste exclue des dépenses du tableau de bord
    const summary = getDashboardSummary(t.db, { currency: 'EUR', endMonth: '2026-11', months: 1 })
    expect(summary.months[0]?.expenses).toBe(50_00)

    // Plus tard, le relevé manquant (-120,00 €) est importé : l'ajustement est proposé à la suppression
    const camt1 = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt><Stmt>
    <Acct><Ccy>EUR</Ccy></Acct>
    <Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt>1000.00</Amt><CdtDbtInd>CRDT</CdtDbtInd></Bal>
    <Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt>880.00</Amt><CdtDbtInd>CRDT</CdtDbtInd></Bal>
    <Ntry>
      <Amt>120.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts><Cd>BOOK</Cd></Sts>
      <BookgDt><Dt>2026-11-05</Dt></BookgDt><AcctSvcrRef>R1</AcctSvcrRef>
      <RmtInf><Ustrd>LOYER BOX</Ustrd></RmtInf>
    </Ntry>
  </Stmt></BkToCstmrStmt>
</Document>`
    const parsed1 = parse(camt1, 'semaine1.xml')
    const preview1 = previewImport(t.db, store, {
      accountId,
      fileName: 'semaine1.xml',
      fileHash: parsed1.fileHash,
      profile: null,
      statement: parsed1.statement,
    })
    expect(preview1.overlappingAdjustments).toHaveLength(1)
    const adjId = preview1.overlappingAdjustments[0]!.id

    const c1 = commitImport(t.db, store, {
      previewId: preview1.previewId,
      replaceAdjustmentIds: [adjId],
    })
    expect(c1.replacedAdjustmentCount).toBe(1)
    expect(t.ok('accountsList', {})[0]?.balance).toBe(830_00)
    expect(
      getDashboardSummary(t.db, { currency: 'EUR', endMonth: '2026-11', months: 1 }).months[0]
        ?.expenses,
    ).toBe(170_00)
  })

  it('passe une opération en attente (pending) à pointée (cleared) à réception du relevé définitif sans doublon', () => {
    const accountId = bankAccount('Carte', 0)
    const pendingCsv = [
      'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
      'CARD_PAYMENT,Current,2026-11-20,2026-11-20,Hotel Gare,-95.00,0,EUR,PENDING,-95.00',
    ].join('\n')
    const p1 = parse(pendingCsv, 'rev1.csv')
    const pr1 = previewImport(t.db, store, {
      accountId,
      fileName: 'rev1.csv',
      fileHash: p1.fileHash,
      profile: null,
      statement: p1.statement,
    })
    commitImport(t.db, store, { previewId: pr1.previewId })
    const before = t.ok('transactionsList', { filter: { accountIds: [accountId] } }).rows[0]!
    expect(before.status).toBe('pending')

    const settledCsv = [
      'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
      'CARD_PAYMENT,Current,2026-11-20,2026-11-22,Hotel Gare,-95.00,0,EUR,COMPLETED,-95.00',
    ].join('\n')
    const p2 = parse(settledCsv, 'rev2.csv')
    const pr2 = previewImport(t.db, store, {
      accountId,
      fileName: 'rev2.csv',
      fileHash: p2.fileHash,
      profile: null,
      statement: p2.statement,
    })
    expect(pr2.rows[0]?.matchKind).toBe('settles-pending')
    const c2 = commitImport(t.db, store, { previewId: pr2.previewId })
    expect(c2.insertedCount).toBe(0)
    expect(t.ok('transactionsList', { filter: { accountIds: [accountId] } }).rows).toHaveLength(1)
    expect(t.ok('transactionsList', { filter: { accountIds: [accountId] } }).rows[0]?.status).toBe(
      'cleared',
    )
    expect(t.ok('accountsList', {})[0]?.balance).toBe(-95_00)
  })

  it('annule un lot complet (importRevert) et restaure le solde exact', () => {
    const accountId = bankAccount('Courant', 200_00)
    const p = parse(
      'dateOp;label;amount\n2026-11-10;ABONNEMENT;-19,99\n2026-11-12;SALAIRE;1500,00',
      'nov.csv',
    )
    const preview = previewImport(t.db, store, {
      accountId,
      fileName: 'nov.csv',
      fileHash: p.fileHash,
      profile: null,
      statement: p.statement,
    })
    const commit = commitImport(t.db, store, { previewId: preview.previewId })
    expect(t.ok('accountsList', {})[0]?.balance).toBe(1680_01)

    const batches = listImportBatches(t.db, {})
    expect(batches).toHaveLength(1)
    expect(batches[0]?.state).toBe('committed')

    const rev = revertImportBatch(t.db, commit.batchId)
    expect(rev.removedCount).toBe(2)
    expect(t.ok('accountsList', {})[0]?.balance).toBe(200_00)
    expect(t.ok('transactionsList', { filter: { accountIds: [accountId] } }).rows).toHaveLength(0)
    expect(listImportBatches(t.db, {})[0]?.state).toBe('reverted')
  })

  it('gère les profils CSV personnalisés sans permettre de supprimer les profils intégrés', () => {
    const initial = listCsvProfiles(t.db)
    expect(initial.some((p) => p.builtin)).toBe(true)

    const saved = saveCsvProfile(t.db, {
      name: 'Ma Banque Perso',
      bank: 'Coop',
      config: {
        delimiter: ';',
        encoding: 'utf-8',
        dateFormat: 'DD/MM/YYYY',
        skipRows: 1,
        hasHeader: true,
        amountMode: 'single',
        columns: { bookingDate: 'Date', label: 'Libelle', amount: 'Montant' },
      },
    })
    expect(saved.builtin).toBe(false)
    expect(listCsvProfiles(t.db).some((p) => p.id === saved.id)).toBe(true)

    expect(() => deleteCsvProfile(t.db, 'builtin:boursobank')).toThrow()
    expect(deleteCsvProfile(t.db, saved.id)).toEqual({ deleted: true })
    expect(listCsvProfiles(t.db).some((p) => p.id === saved.id)).toBe(false)
  })

  it('rapproche à l’import du livret une opération déjà classée vers lui depuis le compte courant', () => {
    const checkingId = bankAccount('Compte Courant', 1_000_00)
    const livretId = t.ok('accountCreate', {
      ...ACCOUNT_DEFAULTS,
      name: 'Livret A',
      type: 'savings',
      trackingMode: 'statement',
      openingBalance: 2_000_00,
    }).id
    const livretCat = t.ok('categoriesList', {}).find((c) => c.linkedAccountId === livretId)!.id

    // Jour 1 : import du compte courant (+500 € depuis Livret A), classé vers Livret A avant import du livret.
    const csvBank = [
      'dateOp;label;amount;accountbalance',
      '2026-11-10;VIR DEPUIS LIVRET A;500,00;1500,00',
    ].join('\n')
    const parsedBank = parse(csvBank, 'courant.csv')
    const pBank = previewImport(t.db, store, {
      accountId: checkingId,
      fileName: 'courant.csv',
      fileHash: parsedBank.fileHash,
      profile: 'builtin:boursobank',
      statement: parsedBank.statement,
    })
    commitImport(t.db, store, { previewId: pBank.previewId })

    const bankTx = t.ok('transactionsList', { filter: { accountIds: [checkingId] } }).rows[0]!
    t.ok('transactionsCategorize', { ids: [bankTx.id], categoryId: livretCat })
    expect(t.ok('transactionGet', { id: bankTx.id }).transferId).toBeNull()

    // Jour 2 : import du relevé du Livret A (-500 € à J+1) -> liaison automatique sans doublon.
    const csvLivret = [
      'dateOp;label;amount;accountbalance',
      '2026-11-11;VIR VERS COMPTE COURANT;-500,00;1500,00',
    ].join('\n')
    const parsedLivret = parse(csvLivret, 'livret.csv')
    const pLivret = previewImport(t.db, store, {
      accountId: livretId,
      fileName: 'livret.csv',
      fileHash: parsedLivret.fileHash,
      profile: 'builtin:boursobank',
      statement: parsedLivret.statement,
    })
    commitImport(t.db, store, { previewId: pLivret.previewId })

    const livretTx = t.ok('transactionsList', { filter: { accountIds: [livretId] } }).rows[0]!
    expect(t.ok('transactionGet', { id: bankTx.id }).transferId).toBe(livretTx.id)
    expect(t.ok('transactionGet', { id: livretTx.id }).transferId).toBe(bankTx.id)
    expect(t.ok('categorizationQueueList', {})).toHaveLength(0)
  })
})
