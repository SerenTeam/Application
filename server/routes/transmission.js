// Produit transmission (GELÉ, lecture seule — chantier 0). Extrait de server.js au lot L2A.
// Correctif F1 : la lecture par code ne passe plus par un SELECT sous policy « authentifié » (qui
// exposait toute la table) mais par la RPC security definer get_transmission_by_code.
import { Router } from 'express'
import * as Sentry from '@sentry/node'

export function createTransmissionRouter({ requireAuth }) {
  const router = Router()

  // Transmission du compte connecté (policy owner inchangée).
  router.get('/user/transmission', requireAuth, async (req, res) => {
    try {
      const { data, error } = await req.supabaseClient
        .from('transmissions')
        .select('*')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return res.json({ success: true, transmission: data, has_transmission: !!data })
    } catch (error) {
      console.error('❌ Get user transmission error:', error?.code ?? 'inconnue')
      Sentry.captureException(error)
      return res.status(500).json({ success: false, error: error.message })
    }
  })

  // Lecture par code d'accès (AccessPage).
  router.get('/transmission/:code', requireAuth, async (req, res) => {
    try {
      const { data, error } = await req.supabaseClient.rpc('get_transmission_by_code', { p_code: String(req.params.code) })
      if (error) throw new Error(`get_transmission_by_code_failed:${error.code ?? 'unknown'}`)
      const row = Array.isArray(data) ? data[0] : null
      if (!row) {
        return res.status(404).json({ success: false, error: 'Code invalide ou données non trouvées' })
      }
      return res.json({ success: true, data: JSON.parse(row.data), created_at: row.created_at })
    } catch (error) {
      console.error('❌ transmission/:code :', error?.message ?? 'erreur inconnue')
      Sentry.captureException(error)
      return res.status(500).json({ success: false, error: error.message })
    }
  })

  return router
}
