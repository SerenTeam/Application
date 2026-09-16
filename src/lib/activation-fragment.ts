// Jeton d'activation famille (contrat §6). Transporté dans le FRAGMENT (#t=…) : jamais envoyé au
// serveur par le navigateur, jamais présent dans un Referer. Capturé et effacé de l'URL par la
// PREMIÈRE instruction de main.tsx, avant Sentry, PostHog et React Router : aucun outil tiers ne
// le voit. Gardé en mémoire de module uniquement (jamais localStorage, sessionStorage ni cookie).
const FRAGMENT_PREFIX = '#t='
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
const SCRUB_RE = /#t=[A-Za-z0-9_-]+/g

let activationToken: string | null = null

export function captureActivationFragment(): void {
  if (typeof window === 'undefined' || !window.location) return
  const { hash, pathname, search } = window.location
  if (!hash.startsWith(FRAGMENT_PREFIX)) return
  const candidate = hash.slice(FRAGMENT_PREFIX.length)
  if (TOKEN_RE.test(candidate)) activationToken = candidate
  // TOUJOURS effacer, même un fragment invalide : il ne doit atteindre aucun outil tiers.
  window.history.replaceState(window.history.state, '', pathname + search)
}

/** Lecture NON destructive (compatible double montage StrictMode). */
export function getActivationToken(): string | null {
  return activationToken
}

export function clearActivationToken(): void {
  activationToken = null
}

/** Masque tout fragment d'activation dans une chaîne (URL, message) — utilisé par Sentry. */
export function scrubActivationFragment(value: string): string {
  return value.replace(SCRUB_RE, '#t=[scrubbed]')
}
