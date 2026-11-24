import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '../lib/error-reporting'
import { ErrorScreen } from './ErrorScreen'

interface ErrorBoundaryProps {
  children: ReactNode
  /** `page` : seule la zone de contenu est remplacée, la navigation reste utilisable. */
  scope?: 'app' | 'page'
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Intercepte les erreurs de rendu : écran d'erreur au lieu d'une fenêtre blanche, et
 * rapport (expurgé) dans le journal local. Pour réinitialiser au changement de page,
 * donner une `key` différente par route.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    reportError('render', error, info.componentStack)
  }

  override render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <ErrorScreen
        scope={this.props.scope ?? 'app'}
        error={error}
        onRetry={() => this.setState({ error: null })}
      />
    )
  }
}
