import { describe, expect, it } from 'vitest'
import { ERROR_REPORT_LIMITS } from '@shared/ipc'
import { errorReportSchema } from './schemas'

describe('errorReportSchema', () => {
  it('accepte un rapport complet', () => {
    const report = {
      source: 'render',
      message: 'boom',
      stack: 'Error: boom\n    at app://fluxo/assets/index.js:1:1',
      componentStack: '\n    at Dashboard',
    }
    expect(errorReportSchema.parse(report)).toEqual(report)
  })

  it('refuse une source inconnue, une clé en trop ou un message trop long', () => {
    expect(errorReportSchema.safeParse({ source: 'network', message: 'x' }).success).toBe(false)
    expect(
      errorReportSchema.safeParse({ source: 'window', message: 'x', path: 'C:\\' }).success,
    ).toBe(false)
    expect(
      errorReportSchema.safeParse({
        source: 'window',
        message: 'x'.repeat(ERROR_REPORT_LIMITS.message + 1),
      }).success,
    ).toBe(false)
  })
})
