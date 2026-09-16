import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'

// Vue admin Seren (contrat §3.3.14, §4.6) : compteurs par partenaire renvoyés par
// `GET /api/admin/overview`, lui-même adossé à la RPC `admin_partner_overview()`. AUCUNE donnée
// de famille ne transite ici — ni e-mail, ni nom, ni défunt : uniquement des compteurs.
// `forbidden` (403 NOT_ADMIN) est un résultat valide — le compte n'est pas dans `seren_admins` —
// distinct d'une erreur réseau/serveur signalée par `error`.
export interface AdminPartnerRow {
  partner_id: string
  name: string
  status: 'prospect' | 'active' | 'suspended' | 'terminated'
  dossiers_total: number
  dossiers_this_month: number
  invited_pending: number
  activated: number
  cancelled: number
  last_dossier_at: string | null
}
export interface AdminOverview { generated_at: string; month: string; partners: AdminPartnerRow[] }

type State = { loading: boolean; forbidden: boolean; error: boolean; overview: AdminOverview | null }

export function useAdminOverview() {
  const [state, setState] = useState<State>({ loading: true, forbidden: false, error: false, overview: null })

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }))
    try {
      const res = await apiFetch('/api/admin/overview')
      const data = await res.json().catch(() => null)
      if (res.status === 403) return setState({ loading: false, forbidden: true, error: false, overview: null })
      if (!res.ok || !data?.success) return setState({ loading: false, forbidden: false, error: true, overview: null })
      setState({ loading: false, forbidden: false, error: false, overview: data.overview as AdminOverview })
    } catch {
      setState({ loading: false, forbidden: false, error: true, overview: null })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { ...state, refresh }
}
