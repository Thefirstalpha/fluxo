import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { matchFrenchMerchant } from '@shared/categorization/merchants'
import {
  predictWithNaiveBayes,
  trainNaiveBayesModel,
  type TrainingSample,
} from '@shared/categorization/naive-bayes'
import { cleanTransactionLabel } from '@shared/categorization/normalize'
import { validateSafeRegex } from '@shared/categorization/regex'
import { ruleConditionsSchema } from '@shared/categorization/schemas'
import { ACCOUNT_DEFAULTS, insertImported, openTestLedger, type TestLedger } from './testing'

let t: TestLedger

beforeEach(() => {
  t = openTestLedger()
})

afterEach(() => t.close())

const cat = (key: string) => {
  const id = t.categories.get(key)
  if (!id) throw new Error(`Missing category ${key}`)
  return id
}

function checkingAccount(name = 'Compte Courant') {
  return t.ok('accountCreate', {
    ...ACCOUNT_DEFAULTS,
    name,
    type: 'checking',
    trackingMode: 'statement',
    openingBalance: 1000_00,
  }).id
}

describe('normalisation, marchands et sécurité regex (M4)', () => {
  it('nettoie les préfixes, dates, références carte et villes françaises', () => {
    expect(cleanTransactionLabel('CB CARREFOUR 12/11 PARIS 15')).toEqual({
      canonical: 'carrefour',
      display: 'Carrefour',
    })
    expect(cleanTransactionLabel('PRLV SEPA FREE MOBILE REF9948210')).toEqual({
      canonical: 'free mobile',
      display: 'Free Mobile',
    })

    const match = matchFrenchMerchant('CB CARREFOUR 12/11 PARIS 15')
    expect(match).toMatchObject({
      categoryKey: 'groceries.shopping',
    })
  })

  it('refuse les expressions régulières dangereuses (ReDoS)', () => {
    expect(validateSafeRegex('(a+)+').ok).toBe(false)
    expect(validateSafeRegex('(.*)*foo').ok).toBe(false)
    expect(validateSafeRegex('([a-z]+)\\1').ok).toBe(false)
    expect(
      ruleConditionsSchema.safeParse({
        labelOp: 'regex',
        labelValue: '(a+)+',
        direction: 'expense',
        amountOp: 'any',
      }).success,
    ).toBe(false)
    expect(validateSafeRegex('^PRLV\\s+TELECOM$').ok).toBe(true)
  })
})

describe('règles, étiquettes et file à valider (M4)', () => {
  it('applique une règle multi-étiquettes avec priorité et aperçu, puis met à jour le compteur', () => {
    const bank = checkingAccount()
    const tagTelecom = t.ok('tagCreate', { name: 'Télécom', color: null }).id
    const tagPro = t.ok('tagCreate', { name: 'Pro', color: null }).id

    const tx1 = insertImported(t.db, bank, {
      date: '2026-11-05',
      amount: -29_99,
      label: 'PRLV SEPA OPERATEUR FIBRE',
    })
    const tx2 = insertImported(t.db, bank, {
      date: '2026-11-10',
      amount: -8_50,
      label: 'CB BOULANGERIE QUARTIER',
    })

    const preview = t.ok('rulePreview', {
      labelOp: 'contains',
      labelValue: 'OPERATEUR FIBRE',
      direction: 'expense',
      amountOp: 'any',
    })
    expect(preview.matchCount).toBe(1)

    const rule = t.ok('ruleSave', {
      name: 'Fibre Pro',
      conditions: {
        labelOp: 'contains',
        labelValue: 'OPERATEUR FIBRE',
        direction: 'expense',
        amountOp: 'any',
      },
      actions: {
        categoryId: cat('subscriptions.telecom'),
        tagIds: [tagTelecom, tagPro],
        customLabel: 'Fibre bureau',
      },
    })

    const applied = t.ok('ruleApply', { ruleId: rule.id })
    expect(applied.appliedCount).toBe(1)

    const detail = t.ok('transactionGet', { id: tx1 })
    expect(detail.label).toBe('Fibre bureau')
    expect(detail.categoryIds).toEqual([cat('subscriptions.telecom')])
    expect(detail.tagIds.sort()).toEqual([tagPro, tagTelecom].sort())

    // L'opération non couverte par règle passe par auto-catégorisation et file à valider si incertaine.
    t.ok('categorizeAutoRun', { transactionIds: [tx2] })
    const tx2Detail = t.ok('transactionGet', { id: tx2 })
    expect(tx2Detail.categoryIds).toEqual([cat('groceries.shopping')])
  })

  it('gère la file à valider, l’acceptation manuelle et le ré-entraînement local', () => {
    const bank = checkingAccount()
    const txUnknown = insertImported(t.db, bank, {
      date: '2026-11-08',
      amount: -35_00,
      label: 'ATELIER POTERIE BLEUE',
    })

    t.ok('categorizeAutoRun', {})
    const queue = t.ok('categorizationQueueList', {})
    expect(queue.some((q) => q.transactionId === txUnknown)).toBe(true)

    t.ok('categorizationAccept', {
      transactionId: txUnknown,
      categoryId: cat('leisure.culture'),
    })
    expect(t.ok('transactionGet', { id: txUnknown }).categoryIds).toEqual([cat('leisure.culture')])
    expect(t.ok('classifierStatus', {}).sampleCount).toBeGreaterThanOrEqual(1)

    const created = t.ok('ruleCreateFromTransaction', {
      transactionId: txUnknown,
      name: 'Poterie bleue',
      pattern: 'poterie bleue',
      categoryId: cat('leisure.culture'),
      customLabel: 'Atelier poterie',
      applyRetroactively: true,
    })
    expect(created.name).toBe('Poterie bleue')
    expect(t.ok('transactionGet', { id: txUnknown }).label).toBe('Atelier poterie')
  })
})

describe('classifieur Bayes naïf et critères d’acceptation (M4)', () => {
  it('atteint ≥ 85 % de précision globale (et ≥ 95 % au-dessus du seuil) après 200 exemples, et classe 10 000 lignes en < 1 s', () => {
    const corpusTemplates: { labels: string[]; amount: number; category: string }[] = [
      {
        labels: ['CB MARCHE FRAIS', 'CB BIO PRIMEUR', 'CB SUPERETTE ALIMENTAIRE', 'CB FROMAGERIE'],
        amount: -32_00,
        category: 'groceries.shopping',
      },
      {
        labels: ['CB BISTRO DU COIN', 'CB BRASSERIE GARE', 'CB PIZZA QUARTIER', 'CB SUSHI HOUSE'],
        amount: -24_50,
        category: 'groceries.restaurants',
      },
      {
        labels: ['CB CARBURANT RELAI', 'CB STATION AUTOROUTE', 'CB ESSENCE NORD'],
        amount: -65_00,
        category: 'transport.fuel',
      },
      {
        labels: ['PRLV SALLE ESCALADE', 'CB CLUB NATATION', 'CB STADE TENNIS'],
        amount: -45_00,
        category: 'leisure.sport',
      },
      {
        labels: ['VIR SALAIRE MENSUEL', 'VIR PAIE ENTREPRISE'],
        amount: 2600_00,
        category: 'salary.net',
      },
    ]

    const trainSamples: TrainingSample[] = []
    for (let i = 0; i < 240; i++) {
      const tpl = corpusTemplates[i % corpusTemplates.length]!
      const label = `${tpl.labels[i % tpl.labels.length]} ${10 + (i % 19)}/11 REF${10000 + i}`
      trainSamples.push({
        labelRaw: label,
        payee: null,
        amount: tpl.amount - (i % 7) * 100,
        categoryId: tpl.category,
      })
    }

    const model = trainNaiveBayesModel(trainSamples)
    let correct = 0
    let total = 0
    let highConfTotal = 0
    let highConfCorrect = 0

    for (let i = 0; i < 100; i++) {
      const tpl = corpusTemplates[i % corpusTemplates.length]!
      const pred = predictWithNaiveBayes(model, {
        labelRaw: `${tpl.labels[(i + 1) % tpl.labels.length]} 24/11 REF99${i}`,
        payee: null,
        amount: tpl.amount,
      })
      total++
      if (pred?.categoryId === tpl.category) correct++
      if (pred && pred.confidence >= 0.85) {
        highConfTotal++
        if (pred.categoryId === tpl.category) highConfCorrect++
      }
    }

    expect(correct / total).toBeGreaterThanOrEqual(0.85)
    expect(highConfTotal).toBeGreaterThan(0)
    expect(highConfCorrect / highConfTotal).toBeGreaterThanOrEqual(0.95)

    // Benchmark 10 000 opérations en base SQLCipher réelle (< 1 000 ms).
    const bank = checkingAccount('Banque 10k')
    const cashBatch = t.db.transaction(() => {
      const batchId = 'batch-10k'
      t.db
        .prepare(
          `INSERT INTO import_batch (id, account_id, file_name, file_hash, format, state, created_at)
           VALUES (?, ?, '10k.csv', ?, 'csv', 'committed', ?)`,
        )
        .run(batchId, bank, 'c'.repeat(64), '2026-11-24T00:00:00.000Z')
      const stmt = t.db.prepare(
        `INSERT INTO transactions (id, account_id, booking_date, amount, currency, label_raw, nature, import_batch_id, created_at, updated_at)
         VALUES (?, ?, '2026-11-20', -1850, 'EUR', ?, 'operation', ?, '2026-11-24T00:00:00.000Z', '2026-11-24T00:00:00.000Z')`,
      )
      for (let i = 0; i < 10_000; i++) {
        stmt.run(
          `0192f0c8-9999-7000-8000-${String(i).padStart(12, '0')}`,
          bank,
          `CB CARREFOUR ${i}`,
          batchId,
        )
      }
    })
    cashBatch()

    const autoRes = t.ok('categorizeAutoRun', {})
    expect(autoRes.evaluatedCount).toBe(10_000)
    expect(autoRes.autoAppliedCount).toBe(10_000)
    expect(autoRes.durationMs).toBeLessThan(1000)
  })
})

describe('détection des abonnements, hausses de prix et virements internes (M4)', () => {
  it('repère un abonnement mensuel avec hausse de prix, puis masque l’alerte si demandé', () => {
    const bank = checkingAccount()
    const dates = ['2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05', '2026-11-05']
    const amounts = [-14_99, -14_99, -14_99, -14_99, -17_99]
    dates.forEach((date, i) => {
      insertImported(t.db, bank, {
        date,
        amount: amounts[i]!,
        label: 'PRLV STREAMING MUSIQUE',
      })
    })

    const overview = t.ok('subscriptionsOverview', { currency: 'EUR' })
    expect(overview.subscriptions).toHaveLength(1)
    expect(overview.priceIncreaseCount).toBe(1)
    expect(overview.subscriptions[0]).toMatchObject({
      frequency: 'monthly',
      latestAmount: 17_99,
      priceIncrease: {
        previousAmount: 14_99,
        currentAmount: 17_99,
        delta: 3_00,
      },
    })

    t.ok('subscriptionDismissAlert', {
      signature: overview.subscriptions[0]!.signature,
      lastKnownAmount: 17_99,
    })
    expect(t.ok('subscriptionsOverview', { currency: 'EUR' }).priceIncreaseCount).toBe(0)
  })

  it('propose un virement interne épargne candidat entre compte courant et livret à ± 3 jours', () => {
    const checking = checkingAccount('Courant')
    const livret = t.ok('accountCreate', {
      ...ACCOUNT_DEFAULTS,
      name: 'Livret A',
      type: 'savings',
      trackingMode: 'statement',
      openingBalance: 1000_00,
    }).id

    const outId = insertImported(t.db, checking, {
      date: '2026-11-10',
      amount: -300_00,
      label: 'VIR SEPA VERS LIVRET',
    })
    const inId = insertImported(t.db, livret, {
      date: '2026-11-11',
      amount: 300_00,
      label: 'VIR RECU COURANT',
    })

    const candidates = t.ok('transferCandidatesList', {})
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      isSavingsTransfer: true,
      dayDiff: 1,
      fromTransaction: { id: outId },
      toTransaction: { id: inId },
    })
  })

  it('valide et applique une règle vers une catégorie liée d’épargne avec comptabilisation miroir', () => {
    const checking = checkingAccount('Courant')
    const livret = t.ok('accountCreate', {
      ...ACCOUNT_DEFAULTS,
      name: 'Livret A',
      type: 'savings',
      trackingMode: 'manual',
      openingBalance: 1_000_00,
    }).id
    const livretCat = t.ok('categoriesList', {}).find((c) => c.linkedAccountId === livret)!.id

    // 1. Passage par la file À valider : retrait du livret vers le courant (+300 €)
    const txQueue = insertImported(t.db, checking, {
      date: '2026-11-12',
      amount: 300_00,
      label: 'VIR RETRAIT LIVRET MANUEL',
    })
    t.ok('categorizeAutoRun', { transactionIds: [txQueue] })
    t.ok('categorizationAccept', {
      transactionId: txQueue,
      categoryId: livretCat,
    })
    const qDetail = t.ok('transactionGet', { id: txQueue })
    expect(qDetail.transferAccountId).toBe(livret)
    expect(t.ok('accountsList', {}).find((a) => a.id === livret)?.balance).toBe(700_00)

    // 2. Passage par une règle automatique : versement (-200 €) lors du lot suivant
    t.ok('ruleSave', {
      name: 'Vers Livret A',
      conditions: {
        labelOp: 'contains',
        labelValue: 'VERS LIVRET A',
        direction: 'expense',
        amountOp: 'any',
      },
      actions: { categoryId: livretCat },
    })
    const txRule = insertImported(t.db, checking, {
      date: '2026-11-20',
      amount: -200_00,
      label: 'VIR SEPA VERS LIVRET A',
    })
    t.ok('categorizeAutoRun', { transactionIds: [txRule] })
    const rDetail = t.ok('transactionGet', { id: txRule })
    expect(rDetail.transferAccountId).toBe(livret)
    expect(t.ok('accountsList', {}).find((a) => a.id === livret)?.balance).toBe(900_00)
  })

  it('réinitialise les catégories, la file À valider et le modèle tout en conservant notes, étiquettes et règles', () => {
    const bank = checkingAccount()
    const tagPro = t.ok('tagCreate', { name: 'Pro', color: null }).id

    // 1. Opération simple classée (sans note ni étiquette)
    const txSimple = insertImported(t.db, bank, {
      date: '2026-11-05',
      amount: -25_00,
      label: 'ATELIER CERAMIQUE SIMPLE',
    })
    t.ok('categorizationAccept', { transactionId: txSimple, categoryId: cat('leisure.culture') })

    // 2. Opération ventilée avec note + étiquette (à préserver)
    const txTagged = insertImported(t.db, bank, {
      date: '2026-11-06',
      amount: -100_00,
      label: 'ACHAT MIXTE',
    })
    t.ok('transactionSetSplits', {
      id: txTagged,
      splits: [
        {
          categoryId: cat('groceries.shopping'),
          amount: -60_00,
          note: 'Cadeau bureau',
          tagIds: [tagPro],
        },
        { categoryId: cat('shopping'), amount: -40_00, note: null, tagIds: [] },
      ],
    })

    // 3. Opération ventilée sans note ni étiquette -> redevient sans ventilation
    const txSplitPlain = insertImported(t.db, bank, {
      date: '2026-11-07',
      amount: -50_00,
      label: 'VENTILATION SIMPLE',
    })
    t.ok('transactionSetSplits', {
      id: txSplitPlain,
      splits: [
        { categoryId: cat('groceries.shopping'), amount: -30_00, note: null, tagIds: [] },
        { categoryId: cat('leisure'), amount: -20_00, note: null, tagIds: [] },
      ],
    })

    // Deuxième exemple sur une autre catégorie pour que le modèle Bayes reste prudent (< 85 %) sur un libellé inconnu.
    const txGroceries = insertImported(t.db, bank, {
      date: '2026-11-05',
      amount: -18_00,
      label: 'EPICERIE BIO QUARTIER',
    })
    t.ok('categorizationAccept', {
      transactionId: txGroceries,
      categoryId: cat('groceries.shopping'),
    })

    // 4. Opération ignorée en file + règle conservée + seuil modifié
    const txRejected = insertImported(t.db, bank, {
      date: '2026-11-08',
      amount: -12_00,
      label: 'PETIT COMMERCE INCONNU',
    })
    t.ok('categorizeAutoRun', { transactionIds: [txRejected] })
    t.ok('categorizationReject', { transactionId: txRejected })
    const rule = t.ok('ruleSave', {
      name: 'Règle conservée',
      conditions: {
        labelOp: 'contains',
        labelValue: 'CERAMIQUE SIMPLE',
        direction: 'expense',
        amountOp: 'any',
      },
      actions: { categoryId: cat('leisure.culture') },
    })
    t.ok('categorizationThresholdSet', { threshold: 0.9 })
    expect(t.ok('classifierStatus', {}).sampleCount).toBeGreaterThanOrEqual(2)

    const res = t.ok('categorizationReset', {})
    expect(res.clearedTransactions).toBe(4)
    expect(res.clearedSuggestions).toBeGreaterThanOrEqual(2)
    expect(res.clearedModelSamples).toBeGreaterThanOrEqual(2)

    // Modèle remis à zéro, seuil et règle conservés.
    expect(t.ok('classifierStatus', {})).toEqual({
      sampleCount: 0,
      categoryCount: 0,
      updatedAt: null,
      threshold: 0.9,
    })
    expect(t.ok('rulesList', {})).toHaveLength(1)
    expect(t.ok('rulesList', {})[0]?.id).toBe(rule.id)

    // Catégories effacées ; notes, étiquettes et montants ventilés préservés.
    expect(t.ok('transactionGet', { id: txSimple }).splits).toEqual([])
    expect(t.ok('transactionGet', { id: txSplitPlain }).splits).toEqual([])
    const taggedAfter = t.ok('transactionGet', { id: txTagged })
    expect(taggedAfter.categoryIds).toEqual([null, null])
    expect(taggedAfter.tagIds).toEqual([tagPro])
    expect(taggedAfter.splits[0]).toMatchObject({
      categoryId: null,
      amount: -60_00,
      note: 'Cadeau bureau',
      tagIds: [tagPro],
    })

    // La réinitialisation a effacé les refus : relancer l'auto-catégorisation réévalue tout.
    t.ok('categorizeAutoRun', {})
    expect(t.ok('transactionGet', { id: txSimple }).categoryIds).toEqual([cat('leisure.culture')])
    expect(t.ok('categorizationQueueList', {}).some((q) => q.transactionId === txRejected)).toBe(
      true,
    )
  })
})
