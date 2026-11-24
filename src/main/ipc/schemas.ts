import { z } from 'zod'
import { ERROR_REPORT_LIMITS, ERROR_SOURCES, type RendererErrorReport } from '@shared/ipc'
import {
  PASSWORD_MAX_LENGTH,
  type ChangePasswordInput,
  type CreateVaultInput,
  type CurrentPasswordInput,
  type UnlockInput,
} from '@shared/vault'

/** Rapport d'erreur du renderer : strict et borné (le renderer tronque avant d'envoyer). */
export const errorReportSchema = z.strictObject({
  source: z.enum(ERROR_SOURCES),
  message: z.string().max(ERROR_REPORT_LIMITS.message),
  stack: z.string().max(ERROR_REPORT_LIMITS.stack).optional(),
  componentStack: z.string().max(ERROR_REPORT_LIMITS.stack).optional(),
}) satisfies z.ZodType<RendererErrorReport>

/** Borne large (unités UTF-16) : la règle de longueur exacte est appliquée par le service. */
const password = z
  .string()
  .min(1)
  .max(PASSWORD_MAX_LENGTH * 2)

export const createVaultSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('session') }),
  z.strictObject({ mode: z.literal('password'), password }),
]) satisfies z.ZodType<CreateVaultInput>

export const unlockSchema = z.discriminatedUnion('method', [
  z.strictObject({ method: z.literal('session') }),
  z.strictObject({ method: z.literal('password'), password }),
  z.strictObject({ method: z.literal('recovery'), code: z.string().min(1).max(200) }),
]) satisfies z.ZodType<UnlockInput>

export const currentPasswordSchema = z.strictObject({
  currentPassword: password.optional(),
}) satisfies z.ZodType<CurrentPasswordInput>

export const changePasswordSchema = z.strictObject({
  currentPassword: password.optional(),
  newPassword: password,
}) satisfies z.ZodType<ChangePasswordInput>

/** Jeton de restauration émis par le service (le renderer ne voit jamais le chemin du fichier). */
export const restoreTokenSchema = z.string().regex(/^[0-9a-f]{32}$/)

export const previewRestoreSchema = z.strictObject({
  token: restoreTokenSchema,
  secret: z.strictObject({ method: z.enum(['password', 'recovery']), value: password }).optional(),
})
