import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { z } from 'zod'
import type { IpcErrorCode } from '@shared/ipc'
import { logger } from '../logger'

/** Erreur renvoyée au renderer : un code, jamais de détail interne. */
export class IpcError extends Error {
  constructor(readonly code: IpcErrorCode) {
    super(code)
    this.name = 'IpcError'
  }
}

export type TrustedSenderCheck = (frameUrl: string) => boolean

/**
 * Fabrique de handlers IPC sûrs. Chaque appel :
 *  1. vérifie que l'émetteur est une page de l'application (origine) ;
 *  2. valide l'entrée avec un schéma zod (le renderer est considéré comme non fiable) ;
 *  3. masque les erreurs internes derrière un code.
 */
export function createHandleFactory(isTrustedSender: TrustedSenderCheck) {
  return function handle<TSchema extends z.ZodType, TResult>(
    channel: string,
    schema: TSchema,
    handler: (input: z.output<TSchema>, event: IpcMainInvokeEvent) => TResult | Promise<TResult>,
  ): void {
    ipcMain.handle(channel, async (event, payload: unknown) => {
      const frame = event.senderFrame
      if (!frame || !isTrustedSender(frame.url)) {
        logger.warn(`IPC « ${channel} » refusé : émetteur non autorisé.`)
        throw new IpcError('FORBIDDEN')
      }
      const parsed = schema.safeParse(payload)
      if (!parsed.success) {
        logger.warn(`IPC « ${channel} » rejeté : entrée invalide.`)
        throw new IpcError('INVALID_INPUT')
      }
      try {
        return await handler(parsed.data, event)
      } catch (error) {
        logger.error(`IPC « ${channel} » en échec`, error)
        throw new IpcError('INTERNAL_ERROR')
      }
    })
  }
}
