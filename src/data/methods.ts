import { z } from 'zod'
import { CSV_DELIMITERS, STATEMENT_FORMATS } from '@shared/imports/model'
import {
  csvProfileConfigSchema,
  csvProfileDeleteSchema,
  csvProfileSaveSchema,
  importBatchesListSchema,
  importCommitSchema,
  importRevertSchema,
} from '@shared/imports/schemas'
import { LEDGER_METHODS } from '@shared/ledger/api'
import { LOCALES } from '@shared/settings'
import { PASSWORD_MAX_LENGTH } from '@shared/vault'
import type { DataServiceApi, DataServiceMethod } from './api'
import { DATABASE_KEY_BYTES } from './db/connection'
import { defineMethod, type MethodDefinition } from './server'
import type { VaultHost } from './host'

const noParams = z.undefined()
/** Borne large (en unités UTF-16) : la règle de longueur exacte est vérifiée par le coffre. */
const secret = z
  .string()
  .min(1)
  .max(PASSWORD_MAX_LENGTH * 2)
const key = z.instanceof(Uint8Array).refine((value) => value.length === DATABASE_KEY_BYTES)
const sessionBlob = z
  .string()
  .regex(/^[A-Za-z0-9+/]+={0,2}$/)
  .max(4096)
const currentPassword = z.strictObject({ currentPassword: secret.optional() })
/** Chemin absolu fourni par une boîte de dialogue du main (vérifié aussi par le coffre). */
const path = z.string().min(1).max(4096)
const token = z.string().regex(/^[0-9a-f]{32}$/)
const locale = z.enum(LOCALES)

/** Table des méthodes exposées au process main, chacune avec son schéma d'entrée. */
export function createMethods(
  host: VaultHost,
): Readonly<Record<DataServiceMethod, MethodDefinition>> {
  // Vérifie à la compilation que chaque méthode respecte le contrat `DataServiceApi`.
  const real = () => host.realOnly()
  const api: DataServiceApi = {
    status: () => host.status(),
    sessionBlob: () => (host.isDemo() ? Promise.resolve(null) : real().sessionBlob()),
    create: async (params) => {
      await real().create(params)
      return host.status()
    },
    unlock: (params) => real().unlock(params),
    // Verrouiller pendant la démonstration la referme (le coffre réel est déjà verrouillé).
    lock: () => (host.isDemo() ? host.exitDemo() : { ...real().lock(), demo: false }),
    changePassword: (params) => real().changePassword(params),
    exportKeyForSession: (params) => real().exportKeyForSession(params),
    setSessionMode: (params) => real().setSessionMode(params),
    createRecoveryCode: (params) => real().createRecoveryCode(params),
    removeRecoveryCode: (params) => real().removeRecoveryCode(params),
    backupNow: () => real().backupNow(),
    autoBackupIfDue: () => (host.isDemo() ? Promise.resolve(false) : real().autoBackupIfDue()),
    backupInfo: () => real().backupInfo(),
    setBackupDirectory: (params) => real().setBackupDirectory(params),
    setAutoBackup: (params) => real().setAutoBackup(params),
    inspectBackup: (params) => real().inspectBackup(params),
    previewRestore: (params) => real().previewRestore(params),
    confirmRestore: (params) => real().confirmRestore(params),
    cancelRestore: () => real().cancelRestore(),
    exportData: (params) => real().exportData(params),
    eraseAll: (params) => real().eraseAll(params),
    enterDemo: (params) => host.enterDemo(params),
    exitDemo: () => host.exitDemo(),
    ledger: ({ method, input }) => host.active().ledger().run(method, input),
    importPreview: (params) => host.active().importPreview(params),
    importCommit: (params) => host.active().importCommit(params),
    importBatchesList: (params) => host.active().importBatchesList(params),
    importRevert: (params) => host.active().importRevert(params),
    csvProfilesList: () => host.active().csvProfilesList(),
    csvProfileSave: (params) => host.active().csvProfileSave(params),
    csvProfileDelete: (params) => host.active().csvProfileDelete(params),
  }
  return {
    status: defineMethod(noParams, () => api.status()),
    sessionBlob: defineMethod(noParams, () => api.sessionBlob()),
    create: defineMethod(
      z.discriminatedUnion('mode', [
        z.strictObject({ mode: z.literal('session'), key, sessionBlob, locale: locale.optional() }),
        z.strictObject({
          mode: z.literal('password'),
          password: secret,
          locale: locale.optional(),
        }),
      ]),
      (params) => api.create(params),
    ),
    unlock: defineMethod(
      z.discriminatedUnion('method', [
        z.strictObject({ method: z.literal('key'), key }),
        z.strictObject({ method: z.literal('password'), password: secret }),
        z.strictObject({ method: z.literal('recovery'), code: z.string().min(1).max(200) }),
      ]),
      (params) => api.unlock(params),
    ),
    lock: defineMethod(noParams, () => api.lock()),
    changePassword: defineMethod(
      z.strictObject({ currentPassword: secret.optional(), newPassword: secret }),
      (params) => api.changePassword(params),
    ),
    exportKeyForSession: defineMethod(currentPassword, (params) => api.exportKeyForSession(params)),
    setSessionMode: defineMethod(z.strictObject({ sessionBlob }), (params) =>
      api.setSessionMode(params),
    ),
    createRecoveryCode: defineMethod(currentPassword, (params) => api.createRecoveryCode(params)),
    removeRecoveryCode: defineMethod(currentPassword, (params) => api.removeRecoveryCode(params)),
    backupNow: defineMethod(noParams, () => api.backupNow()),
    autoBackupIfDue: defineMethod(noParams, () => api.autoBackupIfDue()),
    backupInfo: defineMethod(noParams, () => api.backupInfo()),
    setBackupDirectory: defineMethod(z.strictObject({ directory: path.nullable() }), (params) =>
      api.setBackupDirectory(params),
    ),
    setAutoBackup: defineMethod(z.strictObject({ enabled: z.boolean() }), (params) =>
      api.setAutoBackup(params),
    ),
    inspectBackup: defineMethod(z.strictObject({ file: path }), (params) =>
      api.inspectBackup(params),
    ),
    previewRestore: defineMethod(
      z.strictObject({
        token,
        secret: z
          .strictObject({ method: z.enum(['password', 'recovery']), value: secret })
          .optional(),
      }),
      (params) => api.previewRestore(params),
    ),
    confirmRestore: defineMethod(z.strictObject({ token }), (params) => api.confirmRestore(params)),
    cancelRestore: defineMethod(noParams, () => api.cancelRestore()),
    exportData: defineMethod(z.strictObject({ directory: path }), (params) =>
      api.exportData(params),
    ),
    eraseAll: defineMethod(currentPassword, (params) => api.eraseAll(params)),
    enterDemo: defineMethod(z.strictObject({ locale }), (params) => api.enterDemo(params)),
    exitDemo: defineMethod(noParams, () => api.exitDemo()),
    // L'entrée est revalidée par le registre avec le schéma de la méthode.
    ledger: defineMethod(
      z.strictObject({ method: z.enum(LEDGER_METHODS), input: z.unknown() }),
      (params) => api.ledger(params),
    ),
    importPreview: defineMethod(
      z.strictObject({
        accountId: z.string().regex(/^[0-9a-f-]{36}$/),
        fileName: z.string().min(1).max(260),
        fileHash: z.string().regex(/^[0-9a-f]{64}$/),
        profile: z.string().max(80).nullable(),
        statement: z.strictObject({
          format: z.enum(STATEMENT_FORMATS),
          encoding: z.enum(['utf-8', 'windows-1252', 'iso-8859-1']),
          currency: z.string().nullable(),
          accountHint: z.string().nullable(),
          accountTypeHint: z.enum(['checking', 'savings', 'deferred_card']).nullable(),
          periodStart: z.string().nullable(),
          periodEnd: z.string().nullable(),
          openingBalance: z.number().int().nullable(),
          closingBalance: z.number().int().nullable(),
          rows: z
            .array(
              z.strictObject({
                index: z.number().int().min(0),
                bookingDate: z.string(),
                valueDate: z.string().nullable(),
                amount: z.number().int(),
                currency: z.string().nullable(),
                labelRaw: z.string(),
                payee: z.string().nullable(),
                note: z.string().nullable(),
                status: z.enum(['pending', 'cleared', 'reconciled']),
                externalId: z.string().nullable(),
                runningBalance: z.number().int().nullable(),
              }),
            )
            .max(200_000),
          skippedLines: z.number().int().min(0),
          warnings: z.array(
            z.strictObject({
              line: z.number().int().optional(),
              code: z.enum([
                'skipped-line',
                'currency-mismatch',
                'encoding-fallback',
                'date-ambiguous',
                'unsettled-card-notice',
              ]),
              detail: z.string().optional(),
            }),
          ),
          csvInspection: z
            .strictObject({
              delimiter: z.enum(CSV_DELIMITERS),
              skipRows: z.number().int().min(0),
              hasHeader: z.boolean(),
              headers: z.array(z.string()),
              sampleRows: z.array(z.array(z.string())),
              suggestedProfileId: z.string().nullable(),
              suggestedConfig: csvProfileConfigSchema,
            })
            .optional(),
        }),
      }),
      (params) => api.importPreview(params),
    ),
    importCommit: defineMethod(importCommitSchema, (params) => host.active().importCommit(params)),
    importBatchesList: defineMethod(importBatchesListSchema, (params) =>
      host.active().importBatchesList(params),
    ),
    importRevert: defineMethod(importRevertSchema, (params) => host.active().importRevert(params)),
    csvProfilesList: defineMethod(noParams, () => host.active().csvProfilesList()),
    csvProfileSave: defineMethod(csvProfileSaveSchema, (params) =>
      host.active().csvProfileSave(params),
    ),
    csvProfileDelete: defineMethod(csvProfileDeleteSchema, (params) =>
      host.active().csvProfileDelete(params),
    ),
  }
}
