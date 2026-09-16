import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { useLang } from '@/i18n/LanguageContext'

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
  const { lang } = useLang()
  const [state, setState] = useState<State>({ loading: true, forbidden: false, error: false, overview: null })
  // Numéro du dernier refresh lancé (voir la garde de séquence ci-dessous).
  const sequence = useRef(0)

  const refresh = useCallback(async () => {
    // Garde de séquence, même motif que `usePartnerDashboard` : le bouton « Actualiser » et un
    // changement de langue lancent chacun un appel, et deux appels concurrents peuvent revenir dans
    // le désordre — la réponse la plus ANCIENNE écraserait alors la plus récente. Seule la réponse
    // du dernier refresh lancé écrit dans l'état.
    const ticket = ++sequence.current
    const commit = (next: State) => {
      if (ticket === sequence.current) setState(next)
    }
    // `loading` seul : les compteurs déjà affichés sont conservés pendant le rechargement (la page
    // grise le tableau au lieu de le remplacer par un spinner).
    setState((prev) => ({ ...prev, loading: true }))
    try {
      // `lang` est transmis comme dans `usePartnerDashboard` : les messages d'erreur du serveur
      // (`not_admin`, `admin_error`) sont bilingues et doivent suivre la langue de la session.
      const res = await apiFetch(`/api/admin/overview?lang=${lang}`)
      const data = await res.json().catch(() => null)
      if (res.status === 403) return commit({ loading: false, forbidden: true, error: false, overview: null })
      if (!res.ok || !data?.success) return commit({ loading: false, forbidden: false, error: true, overview: null })
      commit({ loading: false, forbidden: false, error: false, overview: data.overview as AdminOverview })
    } catch {
      commit({ loading: false, forbidden: false, error: true, overview: null })
    }
  }, [lang])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { ...state, refresh }
}
