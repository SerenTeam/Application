import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import type { MeResponse } from '@/types/account'

// Compte v2 côté client (contrat docs/design-v2-demonstrateur.md §7.2). Stub contractuel L0bis,
// propriété L3 ensuite. Source de vérité unique de l'accès : GET /api/me. Aucun état local ne
// débloque une route : le serveur reste seul juge (gate requireActiveDossier).
// Cache de module (patron usePayments) : plusieurs composants lisent le compte sur une même page
// sans multiplier les requêtes.

interface AccountState {
  loading: boolean
  error: boolean
  me: MeResponse | null
}

const INITIAL: AccountState = { loading: true, error: false, me: null }

let cache: AccountState | null = null
let inflight: Promise<AccountState> | null = null
// Incrémenté à chaque purge : une requête lancée avant la purge ne réécrit jamais le cache
// (sinon le compte d'une session précédente pourrait réapparaître après SIGNED_OUT).
let generation = 0

/** Vide le cache. Appelé par useAuth sur SIGNED_IN et SIGNED_OUT (branchement L3). */
export function resetAccountCache() {
  cache = null
  inflight = null
  generation += 1
}

async function fetchMe(): Promise<AccountState> {
  try {
    const res = await apiFetch('/api/me')
    const data = (await res.json().catch(() => null)) as MeResponse | null
    if (!res.ok || !data?.success) return { loading: false, error: true, me: null }
    return { loading: false, error: false, me: data }
  } catch {
    // Réseau, session absente ou route inexistante (palier plancher) : erreur explicite. La garde
    // affiche alors l'écran d'erreur générique, JAMAIS les routes protégées.
    return { loading: false, error: true, me: null }
  }
}

function load(): Promise<AccountState> {
  if (!inflight) {
    const startedAt = generation
    inflight = fetchMe().then((next) => {
      if (startedAt === generation) {
        cache = next
        inflight = null
      }
      return next
    })
  }
  return inflight
}

export function useAccount(): { loading: boolean; error: boolean; me: MeResponse | null; refresh: () => Promise<void> } {
  const [state, setState] = useState<AccountState>(() => cache ?? INITIAL)

  const refresh = useCallback(async () => {
    resetAccountCache()
    setState(await load())
  }, [])

  useEffect(() => {
    let cancelled = false
    void load().then((next) => {
      if (!cancelled) setState(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { ...state, refresh }
}
