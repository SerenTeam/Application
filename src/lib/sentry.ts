import * as Sentry from '@sentry/react'

// Sentry front : erreurs uniquement, inerte sans VITE_SENTRY_DSN (pattern Resend).
// RGPD : pas de tracing, pas de replay, pas de user context, pas de PII par défaut.
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return
  Sentry.init({ dsn, sendDefaultPii: false })
}
