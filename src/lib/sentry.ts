import * as Sentry from '@sentry/react'
import { scrubActivationFragment } from '@/lib/activation-fragment'

// Sentry front : erreurs uniquement, inerte sans VITE_SENTRY_DSN (pattern Resend).
// RGPD : pas de tracing, pas de replay, pas de user context, pas de PII par défaut. Le fragment
// d'activation (#t=…) est masqué dans les URL, messages et breadcrumbs de navigation (§6).
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request?.url) event.request.url = scrubActivationFragment(event.request.url)
      if (typeof event.message === 'string') event.message = scrubActivationFragment(event.message)
      for (const exception of event.exception?.values ?? []) {
        if (typeof exception.value === 'string') exception.value = scrubActivationFragment(exception.value)
      }
      return event
    },
    beforeBreadcrumb(breadcrumb) {
      const data = breadcrumb.data
      if (data) {
        for (const key of ['url', 'to', 'from']) {
          if (typeof data[key] === 'string') data[key] = scrubActivationFragment(data[key])
        }
      }
      if (typeof breadcrumb.message === 'string') breadcrumb.message = scrubActivationFragment(breadcrumb.message)
      return breadcrumb
    },
  })
}
