import { useState, useCallback, useEffect } from 'react'
import { initPosthog, posthogOptIn, posthogOptOut } from '@/lib/posthog'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CookieConsent {
  /** Cookies techniques indispensables (toujours actifs) */
  necessary: true
  /** Cookies analytics : PostHog */
  analytics: boolean
  /** Cookies fonctionnels (preferences, theme, etc.) */
  functional: boolean
}

interface StoredConsent {
  consent: CookieConsent
  /** Timestamp ISO de l'enregistrement */
  savedAt: string
}

// ─── Constantes ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'seren_cookie_consent'
/** 13 mois en ms (RGPD recommande max 13 mois) */
const MAX_AGE_MS = 13 * 30 * 24 * 60 * 60 * 1000

const DEFAULT_CONSENT: CookieConsent = {
  necessary: true,
  analytics: false,
  functional: false,
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadConsent(): CookieConsent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const stored: StoredConsent = JSON.parse(raw)
    const age = Date.now() - new Date(stored.savedAt).getTime()

    // Consent expire apres 13 mois
    if (age > MAX_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }

    return stored.consent
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

function saveConsent(consent: CookieConsent) {
  const stored: StoredConsent = {
    consent,
    savedAt: new Date().toISOString(),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
}

function applyPosthog(analytics: boolean) {
  initPosthog()
  if (analytics) {
    posthogOptIn()
  } else {
    posthogOptOut()
  }
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * SER-63 -- Gestion du consentement cookies RGPD.
 *
 * - `consent` : null si pas encore de choix, sinon l'objet CookieConsent
 * - `update(consent)` : enregistre le choix et applique PostHog opt-in/out
 * - `reset()` : supprime le consentement (re-affiche la banniere)
 */
export function useCookieConsent() {
  const [consent, setConsent] = useState<CookieConsent | null>(() =>
    loadConsent(),
  )

  // Appliquer PostHog au chargement si consentement deja donne
  useEffect(() => {
    if (consent) {
      applyPosthog(consent.analytics)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback((newConsent: CookieConsent) => {
    // Necessaire toujours true
    const final: CookieConsent = { ...newConsent, necessary: true }
    saveConsent(final)
    setConsent(final)
    applyPosthog(final.analytics)
  }, [])

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setConsent(null)
    posthogOptOut()
  }, [])

  return { consent, update, reset }
}

export { DEFAULT_CONSENT }
