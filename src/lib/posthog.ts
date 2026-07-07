import posthog from 'posthog-js'

/**
 * SER-63 -- Initialisation PostHog.
 *
 * PostHog est configure avec `opt_out_capturing_by_default: true`
 * pour respecter le RGPD : aucune donnee n'est collectee avant
 * le consentement explicite de l'utilisateur.
 *
 * L'opt-in/opt-out est gere par le hook `useCookieConsent`.
 */
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string) || 'https://eu.i.posthog.com'

let isInitialized = false

export function initPosthog() {
  if (isInitialized || !POSTHOG_KEY) return

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    opt_out_capturing_by_default: true,
    capture_pageview: false, // on gere manuellement les pageviews dans le router
    persistence: 'localStorage+cookie',
    loaded: () => {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[PostHog] Initialise (opt-out par defaut)')
      }
    },
  })

  isInitialized = true
}

export function posthogOptIn() {
  if (!isInitialized) return
  posthog.opt_in_capturing()
}

export function posthogOptOut() {
  if (!isInitialized) return
  posthog.opt_out_capturing()
}

export { posthog }
