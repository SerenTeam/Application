// GET /api/me (contrat §4.3) : unique source de vérité de l'accès côté front — rôle, dossier,
// consentement, quota, flags publics. requireAuth SEUL : pas de gate (sinon /bienvenue et l'écran
// « accès non activé » seraient inatteignables). Aucune donnée d'autrui : my_account() lit auth.uid().
import { Router } from 'express'
import * as Sentry from '@sentry/node'
import { msg } from '../lib/messages.js'
import { publicFlags } from '../lib/flags.js'
import { readQuota } from './letters.js'

const DEFAULT_SUPPORT_EMAIL = 'support@seren-app.fr'

export function createMeRouter({ requireAuth }) {
  const router = Router()

  router.get('/', requireAuth, async (req, res) => {
    const lang = req.query?.lang === 'en' ? 'en' : 'fr'
    try {
      const { data, error } = await req.supabaseClient.rpc('my_account')
      if (error) throw new Error(`my_account_failed:${error.code ?? 'unknown'}`)
      const account = data ?? null

      let quota = null
      if (account?.role === 'family' && account?.dossier?.status === 'active') {
        const { balance, included_total } = await readQuota(req.supabaseClient, req.user.id)
        quota = { balance, included_total }
      }

      return res.json({
        success: true,
        account,
        quota,
        flags: publicFlags(),
        support_email: process.env.SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL,
      })
    } catch (error) {
      console.error('❌ me :', error?.message ?? 'erreur inconnue')
      Sentry.captureException(error)
      return res.status(500).json({ success: false, code: 'ACCOUNT_ERROR', error: msg(lang, 'account_error') })
    }
  })

  return router
}
