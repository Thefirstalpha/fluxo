import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_IMPORT_BYTES, MAX_IMPORT_LINES } from '@shared/imports/model'
import { BUILTIN_CSV_PROFILES } from '@shared/imports/profiles'
import { csvProfileConfigSchema } from '@shared/imports/schemas'
import { inspectStatementBytes, parseStatementBytes } from './parse'

const FIXTURES_DIR = join(__dirname, 'fixtures')
const loadFixture = (name: string) => new Uint8Array(readFileSync(join(FIXTURES_DIR, name)))

describe('profils CSV intégrés', () => {
  it('valident tous le schéma strict csvProfileConfigSchema', () => {
    for (const profile of BUILTIN_CSV_PROFILES) {
      expect(() => csvProfileConfigSchema.parse(profile.config)).not.toThrow()
    }
  })
})

describe('tests golden — formats de relevés', () => {
  it('importe un CSV BoursoBank (détection auto du profil, montants signés et soldes)', () => {
    const outcome = parseStatementBytes({
      bytes: loadFixture('boursobank.csv'),
      fileName: 'boursobank.csv',
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.statement).toMatchObject({
      format: 'csv',
      encoding: 'utf-8',
      periodStart: '2026-11-15',
      periodEnd: '2026-11-18',
      openingBalance: 1284_20,
      closingBalance: 3650_50,
      csvInspection: { suggestedProfileId: 'builtin:boursobank', skipRows: 0 },
    })
    expect(outcome.statement.rows).toHaveLength(3)
    expect(outcome.statement.rows[0]).toMatchObject({
      bookingDate: '2026-11-18',
      amount: 2450_00,
      labelRaw: 'VIR SEPA EMPLOYEUR',
      payee: 'ACME SAS',
    })
  })

  it('importe un CSV Crédit Agricole en Windows-1252 avec préambule multi-lignes', () => {
    // Construit un vrai buffer Windows-1252 contenant 0x80 (€) et caractères accentués mono-octet.
    const caWin1252 = [
      'T\xe9l\xe9chargement du 24/11/2026',
      'Compte de D\xe9p\xf4t n\xb0 85100000000;Titulaire ANONYME;',
      '',
      'Date;Libell\xe9;D\xe9bit euros;Cr\xe9dit euros;',
      '10/11/2026;"CARTE 09/11 SUPERETTE\nCB*1234";42,35 \x80;;',
      '12/11/2026;REMBOURSEMENT MUTUELLE;;35,00 \x80;',
    ].join('\n')
    const win1252Bytes = Buffer.from(caWin1252, 'latin1')

    const inspect = inspectStatementBytes({ bytes: win1252Bytes, fileName: 'export-ca.csv' })
    expect(inspect.ok).toBe(true)
    if (!inspect.ok) return
    expect(inspect.encoding).toBe('windows-1252')
    expect(inspect.csvInspection?.skipRows).toBe(2)
    expect(inspect.csvInspection?.suggestedProfileId).toBe('builtin:credit-agricole')

    const outcome = parseStatementBytes({ bytes: win1252Bytes, fileName: 'export-ca.csv' })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.statement.rows).toEqual([
      expect.objectContaining({
        bookingDate: '2026-11-10',
        amount: -42_35,
        labelRaw: 'CARTE 09/11 SUPERETTE\nCB*1234',
      }),
      expect.objectContaining({
        bookingDate: '2026-11-12',
        amount: 35_00,
        labelRaw: 'REMBOURSEMENT MUTUELLE',
      }),
    ])
  })

  it('importe un CSV Revolut en préservant les opérations en attente (PENDING)', () => {
    const csv = [
      'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
      'CARD_PAYMENT,Current,2026-11-20 10:00:00,2026-11-21 09:00:00,Boulangerie,-6.40,0.00,EUR,COMPLETED,493.60',
      'CARD_PAYMENT,Current,2026-11-24 14:15:00,2026-11-24 14:15:00,Station Essence,-65.00,0.00,EUR,PENDING,428.60',
    ].join('\n')
    const outcome = parseStatementBytes({
      bytes: new TextEncoder().encode(csv),
      fileName: 'revolut.csv',
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.statement.csvInspection?.suggestedProfileId).toBe('builtin:revolut')
    expect(outcome.statement.rows[1]).toMatchObject({
      status: 'pending',
      amount: -65_00,
      currency: 'EUR',
    })
  })

  it('importe OFX SGML 1.x avec encodage déclaré, FITID et solde de clôture', () => {
    const outcome = parseStatementBytes({
      bytes: loadFixture('sample-sgml.ofx'),
      fileName: 'releve.ofx',
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.statement).toMatchObject({
      format: 'ofx',
      currency: 'EUR',
      accountHint: '•••• 3045',
      periodStart: '2026-11-01',
      periodEnd: '2026-11-20',
      closingBalance: 1287_60,
    })
    expect(outcome.statement.rows).toEqual([
      expect.objectContaining({
        bookingDate: '2026-11-10',
        amount: -62_40,
        externalId: 'OFX-20261110-001',
        labelRaw: 'BIOCOOP CENTRE · CB PARIS',
        payee: 'BIOCOOP CENTRE',
      }),
      expect.objectContaining({
        bookingDate: '2026-11-15',
        amount: 150_00,
        externalId: 'OFX-20261115-002',
        labelRaw: 'VIREMENT RECU',
      }),
    ])
  })

  it('importe QFX XML 2.x carte à débit différé', () => {
    const qfx = `<?xml version="1.0" encoding="UTF-8"?>
<OFX>
  <CREDITCARDMSGSRSV1>
    <CCSTMTTRNRS>
      <TRNUID>1</TRNUID>
      <CCSTMTRS>
        <CURDEF>EUR</CURDEF>
        <CCACCTFROM><ACCTID>4970123456780999</ACCTID></CCACCTFROM>
        <BANKTRANLIST>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20261112</DTPOSTED>
            <TRNAMT>-89.90</TRNAMT>
            <FITID>CC-1</FITID>
            <NAME>PHARMACIE CENTRALE</NAME>
          </STMTTRN>
        </BANKTRANLIST>
        <LEDGERBAL><BALAMT>-89.90</BALAMT><DTASOF>20261130</DTASOF></LEDGERBAL>
      </CCSTMTRS>
    </CCSTMTTRNRS>
  </CREDITCARDMSGSRSV1>
</OFX>`
    const outcome = parseStatementBytes({
      bytes: new TextEncoder().encode(qfx),
      fileName: 'carte.qfx',
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.statement).toMatchObject({
      format: 'qfx',
      accountTypeHint: 'deferred_card',
      accountHint: '•••• 0999',
      closingBalance: -89_90,
    })
    expect(outcome.statement.rows).toHaveLength(1)
  })

  it('importe QIF avec statuts pointé/rapproché et montants européens', () => {
    const outcome = parseStatementBytes({
      bytes: loadFixture('sample.qif'),
      fileName: 'historique.qif',
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.statement).toMatchObject({
      format: 'qif',
      periodStart: '2026-11-05',
      periodEnd: '2026-11-14',
    })
    expect(outcome.statement.rows).toEqual([
      expect.objectContaining({
        bookingDate: '2026-11-05',
        amount: -18_50,
        payee: 'Librairie du Parc',
        note: 'Achat livre',
        status: 'cleared',
      }),
      expect.objectContaining({
        bookingDate: '2026-11-14',
        amount: 120_00,
        payee: 'Remboursement ami',
        status: 'reconciled',
      }),
    ])
  })

  it('importe CAMT.053 (ISO 20022) : soldes OPBD/CLBD, références et écritures PDNG', () => {
    const outcome = parseStatementBytes({
      bytes: loadFixture('sample-camt053.xml'),
      fileName: 'camt053.xml',
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.statement).toMatchObject({
      format: 'camt053',
      currency: 'EUR',
      accountHint: 'FR76 •••• •••• 0189',
      openingBalance: 1000_00,
      closingBalance: 2910_00,
      periodStart: '2026-11-01',
      periodEnd: '2026-11-24',
    })
    expect(outcome.statement.rows).toEqual([
      expect.objectContaining({
        bookingDate: '2026-11-05',
        amount: 2000_00,
        payee: 'EMPLOYEUR EXEMPLE SAS',
        labelRaw: 'SALAIRE NOVEMBRE',
        externalId: 'CAMT-REF-1',
        status: 'cleared',
      }),
      expect.objectContaining({
        bookingDate: '2026-11-12',
        amount: -90_00,
        payee: 'SNCF CONNECT',
        labelRaw: 'BILLET TRAIN',
        status: 'cleared',
      }),
      expect.objectContaining({
        bookingDate: '2026-11-24',
        amount: -19_99,
        labelRaw: 'EMPREINTE CARTE EN ATTENTE',
        status: 'pending',
      }),
    ])
  })

  it('importe MT940 (SWIFT) : soldes :60F:/:62F:, :61: et sous-champs :86:', () => {
    const outcome = parseStatementBytes({
      bytes: loadFixture('sample.mt940'),
      fileName: 'swift.mt940',
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.statement).toMatchObject({
      format: 'mt940',
      currency: 'EUR',
      openingBalance: 1500_00,
      closingBalance: 1419_60,
    })
    expect(outcome.statement.rows).toEqual([
      expect.objectContaining({
        bookingDate: '2026-11-08',
        amount: -125_40,
        payee: 'SCI EXEMPLE',
        labelRaw: 'LOYER GARAGE NOVEMBRE',
        externalId: 'MTREF01',
      }),
      expect.objectContaining({
        bookingDate: '2026-11-19',
        amount: 45_00,
        labelRaw: 'REMBOURSEMENT FRAIS',
        externalId: 'MTREF02',
      }),
    ])
  })
})

describe('sécurité et limites des analyseurs', () => {
  it('refuse XXE et Billion Laughs dans le XML', () => {
    const xxe = `<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><Document>&xxe;</Document>`
    expect(
      parseStatementBytes({ bytes: new TextEncoder().encode(xxe), fileName: 'xxe.xml' }),
    ).toMatchObject({ ok: false, reason: 'unsafe-xml' })

    const laughs = `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;">]><Document>&lol2;</Document>`
    expect(
      parseStatementBytes({ bytes: new TextEncoder().encode(laughs), fileName: 'billions.xml' }),
    ).toMatchObject({ ok: false, reason: 'unsafe-xml' })
  })

  it('applique la limite de 20 Mio et de 200 000 lignes', () => {
    const tooBig = new Uint8Array(MAX_IMPORT_BYTES + 1)
    tooBig.fill(0x61)
    expect(parseStatementBytes({ bytes: tooBig, fileName: 'big.csv' })).toMatchObject({
      ok: false,
      reason: 'file-too-large',
    })

    const tooManyLines = new Uint8Array((MAX_IMPORT_LINES + 5) * 2)
    for (let i = 0; i < tooManyLines.length; i += 2) {
      tooManyLines[i] = 0x61
      tooManyLines[i + 1] = 0x0a
    }
    expect(parseStatementBytes({ bytes: tooManyLines, fileName: 'lines.csv' })).toMatchObject({
      ok: false,
      reason: 'too-many-lines',
    })
  })

  it('traite 10 000 lignes CSV bien en deçà du budget de 3 s', () => {
    const lines = ['dateOp;label;amount']
    for (let i = 0; i < 10_000; i++) {
      const day = String((i % 28) + 1).padStart(2, '0')
      lines.push(
        `2026-11-${day};OPERATION TEST ${i};-${((i % 90) + 1).toFixed(2).replace('.', ',')}`,
      )
    }
    const bytes = new TextEncoder().encode(lines.join('\n'))
    const start = performance.now()
    const outcome = parseStatementBytes({ bytes, fileName: '10k.csv' })
    const elapsedMs = performance.now() - start
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.statement.rows).toHaveLength(10_000)
    expect(elapsedMs).toBeLessThan(3000)
  })
})

describe('robustesse (fuzzing déterministe)', () => {
  it('ne lève jamais d’exception non gérée sur des entrées corrompues ou aléatoires', () => {
    let seed = 0x9e3779b9
    const nextByte = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed & 0xff
    }

    const adversarialPayloads = [
      '""";;;\n"unclosed quote',
      '<OFX><STMTRS><STMTTRN><TRNAMT>notanumber',
      '!Type:Bank\nDinvalid\nT$$$\n^',
      '<?xml version="1.0"?><Document><BkToCstmrStmt><unclosed>',
      ':20:TEST\n:60F:INVALID\n:61:BADLINE\n:86:',
      'date;label;amount\n2026-02-30;bad;-10,00',
    ]

    for (const payload of adversarialPayloads) {
      for (const ext of ['csv', 'ofx', 'qif', 'xml', 'mt940']) {
        const res = parseStatementBytes({
          bytes: new TextEncoder().encode(payload),
          fileName: `fuzz.${ext}`,
        })
        expect(typeof res.ok).toBe('boolean')
      }
    }

    for (let iter = 0; iter < 50; iter++) {
      const len = 32 + ((iter * 17) % 512)
      const buf = new Uint8Array(len)
      for (let j = 0; j < len; j++) buf[j] = nextByte()
      const res = parseStatementBytes({ bytes: buf, fileName: `rand-${iter}.csv` })
      expect(typeof res.ok).toBe('boolean')
    }
  })
})
