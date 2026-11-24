import type { CsvProfile } from '@shared/imports/model'
import { BUILTIN_CSV_PROFILES } from '@shared/imports/profiles'
import { csvProfileConfigSchema, csvProfileSaveSchema } from '@shared/imports/schemas'
import { uuidv7 } from '@shared/uuid'
import { recordAudit } from '../db/audit'
import type { Db } from '../db/connection'
import { fail } from '../ledger/failure'

interface CsvProfileRow {
  id: string
  name: string
  bank: string | null
  config: string
  created_at: string
  updated_at: string
}

function rowToProfile(row: CsvProfileRow): CsvProfile {
  return {
    id: row.id,
    name: row.name,
    bank: row.bank,
    builtin: false,
    config: csvProfileConfigSchema.parse(JSON.parse(row.config)),
  }
}

export function listCsvProfiles(db: Db): CsvProfile[] {
  const customRows = db
    .prepare(
      'SELECT id, name, bank, config, created_at, updated_at FROM csv_profile ORDER BY name COLLATE NOCASE',
    )
    .all() as CsvProfileRow[]
  return [...BUILTIN_CSV_PROFILES, ...customRows.map(rowToProfile)]
}

export function saveCsvProfile(
  db: Db,
  rawInput: { id?: string; name: string; bank: string | null; config: CsvProfile['config'] },
): CsvProfile {
  const input = csvProfileSaveSchema.parse(rawInput)
  const now = new Date().toISOString()
  const configJson = JSON.stringify(input.config)

  if (input.id) {
    if (input.id.startsWith('builtin:')) fail('invalid')
    const existing = db.prepare('SELECT id FROM csv_profile WHERE id = ?').get(input.id)
    if (!existing) fail('not-found')
    db.prepare(
      'UPDATE csv_profile SET name = ?, bank = ?, config = ?, updated_at = ? WHERE id = ?',
    ).run(input.name, input.bank, configJson, now, input.id)
    recordAudit(db, {
      entity: 'import_batch',
      entityId: input.id,
      action: 'update',
      origin: 'user',
      after: { type: 'csv_profile', name: input.name, bank: input.bank },
    })
    return {
      id: input.id,
      name: input.name,
      bank: input.bank,
      builtin: false,
      config: input.config,
    }
  }

  const id = uuidv7()
  db.prepare(
    'INSERT INTO csv_profile (id, name, bank, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, input.name, input.bank, configJson, now, now)
  recordAudit(db, {
    entity: 'import_batch',
    entityId: id,
    action: 'create',
    origin: 'user',
    after: { type: 'csv_profile', name: input.name, bank: input.bank },
  })
  return { id, name: input.name, bank: input.bank, builtin: false, config: input.config }
}

export function deleteCsvProfile(db: Db, id: string): { deleted: true } {
  if (id.startsWith('builtin:')) fail('invalid')
  const existing = db.prepare('SELECT name FROM csv_profile WHERE id = ?').get(id) as
    { name: string } | undefined
  if (!existing) fail('not-found')
  db.prepare('DELETE FROM csv_profile WHERE id = ?').run(id)
  recordAudit(db, {
    entity: 'import_batch',
    entityId: id,
    action: 'delete',
    origin: 'user',
    before: { type: 'csv_profile', name: existing.name },
  })
  return { deleted: true }
}
