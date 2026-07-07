import { Component, type ReactNode, type ErrorInfo } from 'react'
import { ErrorPage } from '@/pages/errors/ErrorPage'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

/**
 * SER-65 — ErrorBoundary global.
 * Intercepte les erreurs JS non gérées et affiche la page d'erreur.
 * En production, reporterait vers Sentry.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo)

    // TODO: Sentry.captureException(error, { extra: errorInfo })
    // Quand Sentry est intégré, décommenter la ligne ci-dessus
  }

  render() {
    if (this.state.hasError) {
      return <ErrorPage />
    }

    return this.props.children
  }
}
