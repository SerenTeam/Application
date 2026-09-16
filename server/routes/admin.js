// Vue admin Seren (contrat §3.3.14, §4.6) : compteurs par partenaire, AUCUNE PII famille. La
// barrière est en SQL (auth.uid() présent dans seren_admins, sinon null) ; aucun gate dossier.
import { Router } from 'express'
import * as Sentry from '@sentry/node'
import { msg } from '../lib/messages.js'

export function createAdminRouter({ requireAuth }) {
  const router = Router()

  router.get('/overview', requireAuth, async (req, res) => {
    const lang = req.query?.lang === 'en' ? 'en' : 'fr'
    try {
      const { data, error } = await req.supabaseClient.rpc('admin_partner_overview')
      if (error) throw new Error(`admin_partner_overview_failed:${error.code ?? 'unknown'}`)
      if (!data) return res.status(403).json({ success: false, code: 'NOT_ADMIN', error: msg(lang, 'not_admin') })
      return res.json({ success: true, overview: data })
    } catch (error) {
      console.error('❌ admin/overview :', error?.message ?? 'erreur inconnue')
      Sentry.captureException(error)
      return res.status(500).json({ success: false, code: 'ADMIN_ERROR', error: msg(lang, 'admin_error') })
    }
  })

  return router
}
