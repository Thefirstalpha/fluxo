import { z } from 'zod'
import { ERROR_REPORT_LIMITS, ERROR_SOURCES, type RendererErrorReport } from '@shared/ipc'

/** Rapport d'erreur du renderer : strict et borné (le renderer tronque avant d'envoyer). */
export const errorReportSchema = z.strictObject({
  source: z.enum(ERROR_SOURCES),
  message: z.string().max(ERROR_REPORT_LIMITS.message),
  stack: z.string().max(ERROR_REPORT_LIMITS.stack).optional(),
  componentStack: z.string().max(ERROR_REPORT_LIMITS.stack).optional(),
}) satisfies z.ZodType<RendererErrorReport>
