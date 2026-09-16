import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Agrégats renvoyés par la RPC `partner_dashboard()` (migration
// supabase/migrations/20260913200000_pf_dashboard_demo.sql). AUCUN détail par dossier,
// AUCUNE PII (règle rouge T13 de docs/design-pf-dashboard-demo.md) : uniquement des agrégats.
export interface PartnerDashboardData {
  partner_name: string
  commission_rate: number // ex. 0.2 = 20 %
  attributed_count: number
  paid_count: number
  revenue_cents: number
  commission_cents: number
}

interface PartnerDashboardState {
  loading: boolean
  data: PartnerDashboardData | null
  error: boolean
}

const INITIAL: PartnerDashboardState = { loading: true, data: null, error: false }

/**
 * Espace partenaire (v0-démo) : un seul appel à la RPC `partner_dashboard()` au montage — elle
 * lit l'identité via `auth.uid()` côté serveur (security definer), aucun paramètre à passer.
 *
 * `data === null` signifie « ce compte n'est pas rattaché à une PF » (`partner_users` vide) :
 * c'est un résultat valide, distinct d'une erreur réseau/serveur signalée par `error` — c'est au
 * composant appelant de rediriger dans le premier cas et d'afficher un message dans le second.
 */
export function usePartnerDashboard(): PartnerDashboardState {
  const [state, setState] = useState<PartnerDashboardState>(INITIAL)

  useEffect(() => {
    let cancelled = false

    supabase.rpc('partner_dashboard').then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setState({ loading: false, data: null, error: true })
        return
      }
      setState({ loading: false, data: (data as PartnerDashboardData | null) ?? null, error: false })
    })

    return () => {
      cancelled = true
    }
  }, [])

  return state
}
