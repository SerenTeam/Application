import type { Account } from '@/types/account'

// Garde d'accès front (contrat §7.2) — fonction PURE, testée exhaustivement. Confort d'orientation
// seulement : la sécurité reste côté serveur (gate dossier actif, RPC). Toute forme inattendue
// aboutit à l'écran « accès non activé », jamais à `allow`.
export type AccessArea = 'family' | 'consent' | 'partner' | 'admin'
export type AccessDecision = { kind: 'allow' } | { kind: 'redirect'; to: string } | { kind: 'screen'; screen: 'not_activated' }

const ALLOW: AccessDecision = { kind: 'allow' }
const NOT_ACTIVATED: AccessDecision = { kind: 'screen', screen: 'not_activated' }
const redirectTo = (to: string): AccessDecision => ({ kind: 'redirect', to })

export function resolveAccessRedirect(account: Account | null, area: AccessArea): AccessDecision {
  if (!account) return NOT_ACTIVATED
  // is_admin est orthogonal au rôle : il ouvre /admin quel que soit le rôle.
  if (area === 'admin' && account.is_admin) return ALLOW

  if (account.role === 'partner') return area === 'partner' ? ALLOW : redirectTo('/partenaire')

  if (account.role === 'family') {
    if (account.dossier?.status !== 'active') return NOT_ACTIVATED
    if (account.consent.required) return area === 'consent' ? ALLOW : redirectTo('/bienvenue')
    return area === 'family' ? ALLOW : redirectTo('/')
  }

  return account.is_admin ? redirectTo('/admin') : NOT_ACTIVATED
}
