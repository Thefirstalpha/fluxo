import { z } from 'zod'
import {
  AI_PROVIDERS,
  AI_PURPOSES,
  AI_SEND_STATUSES,
  DOCUMENT_EXTRACTION_METHODS,
  DOCUMENT_KINDS,
  DOCUMENT_LINKED_TYPES,
  DOCUMENT_MIME_TYPES,
  DOCUMENT_STATUSES,
} from '@shared/documents/model'
import { extractedDocumentDraftSchema } from '@shared/documents/schemas'
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
    documentsList: (params) => host.active().documentsList(params),
    documentGet: (params) => host.active().documentGet(params),
    documentFindByHash: (params) => host.active().documentFindByHash(params),
    documentUpsert: (params) => host.active().documentUpsert(params),
    documentUpdateDraft: (params) => host.active().documentUpdateDraft(params),
    documentMarkCommitted: (params) => host.active().documentMarkCommitted(params),
    documentReject: (params) => host.active().documentReject(params),
    documentDelete: (params) => host.active().documentDelete(params),
    documentKnownNames: () => host.active().documentKnownNames(),
    aiSendLogList: (params) => host.active().aiSendLogList(params),
    aiMonthlySpend: () => host.active().aiMonthlySpend(),
    aiSendLogRecord: (params) => host.active().aiSendLogRecord(params),
    aiApplyCategorization: (params) => host.active().aiApplyCategorization(params),
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
          format: z.enum([...STATEMENT_FORMATS, 'pdf'] as const),
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
    documentsList: defineMethod(
      z.strictObject({
        status: z.enum(DOCUMENT_STATUSES).optional(),
        limit: z.int().min(1).max(200).optional(),
      }),
      (params) => api.documentsList(params),
    ),
    documentGet: defineMethod(
      z.strictObject({ id: z.string().regex(/^[0-9a-f-]{36}$/) }),
      (params) => api.documentGet(params),
    ),
    documentFindByHash: defineMethod(
      z.strictObject({ sha256: z.string().regex(/^[0-9a-f]{64}$/) }),
      (params) => api.documentFindByHash(params),
    ),
    documentUpsert: defineMethod(
      z.strictObject({
        id: z
          .string()
          .regex(/^[0-9a-f-]{36}$/)
          .optional(),
        kind: z.enum(DOCUMENT_KINDS),
        fileName: z.string().min(1).max(260),
        mimeType: z.enum(DOCUMENT_MIME_TYPES),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
        pageCount: z.int().min(1).max(600),
        status: z.enum(DOCUMENT_STATUSES),
        extractionMethod: z.enum(DOCUMENT_EXTRACTION_METHODS),
        confidence: z.number().min(0).max(1),
        draft: extractedDocumentDraftSchema.nullable(),
        linkedEntityType: z.enum(DOCUMENT_LINKED_TYPES).nullable().optional(),
        linkedEntityId: z.string().max(36).nullable().optional(),
      }),
      (params) => api.documentUpsert(params),
    ),
    documentUpdateDraft: defineMethod(
      z.strictObject({
        id: z.string().regex(/^[0-9a-f-]{36}$/),
        draft: extractedDocumentDraftSchema,
      }),
      (params) => api.documentUpdateDraft(params),
    ),
    documentMarkCommitted: defineMethod(
      z.strictObject({
        id: z.string().regex(/^[0-9a-f-]{36}$/),
        linkedEntityType: z.enum(DOCUMENT_LINKED_TYPES),
        linkedEntityId: z.string().min(1).max(36),
        draft: extractedDocumentDraftSchema.nullable().optional(),
      }),
      (params) => api.documentMarkCommitted(params),
    ),
    documentReject: defineMethod(
      z.strictObject({ id: z.string().regex(/^[0-9a-f-]{36}$/) }),
      (params) => api.documentReject(params),
    ),
    documentDelete: defineMethod(
      z.strictObject({ id: z.string().regex(/^[0-9a-f-]{36}$/) }),
      (params) => api.documentDelete(params),
    ),
    documentKnownNames: defineMethod(noParams, () => api.documentKnownNames()),
    aiSendLogList: defineMethod(
      z.strictObject({ limit: z.int().min(1).max(200).optional() }),
      (params) => api.aiSendLogList(params),
    ),
    aiMonthlySpend: defineMethod(noParams, () => api.aiMonthlySpend()),
    aiSendLogRecord: defineMethod(
      z.strictObject({
        provider: z.enum(AI_PROVIDERS),
        model: z.string().min(1).max(120),
        purpose: z.enum(AI_PURPOSES),
        documentId: z
          .string()
          .regex(/^[0-9a-f-]{36}$/)
          .nullable(),
        inputTokens: z.int().min(0),
        outputTokens: z.int().min(0),
        costMicroUsd: z.int().min(0),
        payloadSha256: z.string().regex(/^[0-9a-f]{64}$/),
        redactions: z.array(
          z.strictObject({
            category: z.enum(['nir', 'iban', 'card', 'email', 'siret', 'name', 'address', 'phone']),
            count: z.int().min(0),
          }),
        ),
        status: z.enum(AI_SEND_STATUSES),
      }),
      (params) => api.aiSendLogRecord(params),
    ),
    aiApplyCategorization: defineMethod(
      z.strictObject({
        items: z
          .array(
            z.strictObject({
              transactionId: z.string().regex(/^[0-9a-f-]{36}$/),
              categoryId: z
                .string()
                .regex(/^[0-9a-f-]{36}$/)
                .nullable(),
              suggestedLabel: z.string().max(120).nullable(),
              confidence: z.number().min(0).max(1),
              reason: z.string().max(240),
            }),
          )
          .max(100),
      }),
      (params) => api.aiApplyCategorization(params),
    ),
  }
}
