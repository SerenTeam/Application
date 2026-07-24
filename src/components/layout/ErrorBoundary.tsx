import { Component, type ReactNode, type ErrorInfo } from 'react'
import * as Sentry from '@sentry/react'
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
 * Reporte vers Sentry quand `VITE_SENTRY_DSN` est configurée.
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
    // No-op si Sentry non initialisé (VITE_SENTRY_DSN absente)
    Sentry.captureException(error)
  }

  render() {
    if (this.state.hasError) {
      return <ErrorPage />
    }

    return this.props.children
  }
}
