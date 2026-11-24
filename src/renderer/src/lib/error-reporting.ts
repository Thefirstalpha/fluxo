import { ERROR_REPORT_LIMITS, type ErrorSource, type RendererErrorReport } from '@shared/ipc'

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

/** Construit un rapport borné à partir de n'importe quelle valeur levée (fonction pure). */
export function toErrorReport(
  source: ErrorSource,
  error: unknown,
  componentStack?: string | null,
): RendererErrorReport {
  const message =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === 'string'
        ? error
        : 'Valeur non-Error levée'
  const report: RendererErrorReport = {
    source,
    message: truncate(message, ERROR_REPORT_LIMITS.message),
  }
  if (error instanceof Error && error.stack) {
    report.stack = truncate(error.stack, ERROR_REPORT_LIMITS.stack)
  }
  if (componentStack) report.componentStack = truncate(componentStack, ERROR_REPORT_LIMITS.stack)
  return report
}

/** Consigne l'erreur dans le journal local du process main ; ne lève jamais. */
export function reportError(
  source: ErrorSource,
  error: unknown,
  componentStack?: string | null,
): void {
  console.error(error)
  try {
    if (!('fluxo' in window)) return
    window.fluxo.app.reportError(toErrorReport(source, error, componentStack)).catch(() => {
      // Journal indisponible : l'erreur reste visible dans la console de développement.
    })
  } catch {
    // Idem : le rapport d'erreur ne doit jamais provoquer une autre erreur.
  }
}

/** Erreurs hors React : exceptions non interceptées et promesses rejetées sans gestionnaire. */
export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (event) => {
    reportError('window', event.error ?? event.message)
  })
  window.addEventListener('unhandledrejection', (event) => {
    reportError('promise', event.reason)
  })
}
