// Activation famille (contrat §4.5, §7.3). Le navigateur n'envoie JAMAIS le jeton : seulement son
// sha256 hex (le fragment #t= ne quitte pas le poste). `check` est PUBLIC (client publishable, rôle
// anon → RPC invitation_preview, limite par IP) ; `claim` exige la session créée par signUp (client
// au token → RPC claim_dossier, qui écrit le pont purchases). Corps jamais journalisé.
import { Router } from 'express'
import * as Sentry from '@sentry/node'
import { msg } from '../lib/messages.js'
import { killSwitch } from '../lib/flags.js'
import { createIpRateLimiter } from '../lib/rate-limit.js'
import { isTokenHash } from '../lib/invite-token.js'

function reqLang(req) {
  return req.body?.lang === 'en' || req.query?.lang === 'en' ? 'en' : 'fr'
}

const CLAIM_ERRORS = {
  invalid_token: { status: 404, code: 'INVITATION_INVALID', key: 'invitation_invalid' },
  invitation_expired: { status: 410, code: 'INVITATION_EXPIRED', key: 'invitation_expired' },
  email_mismatch: { status: 403, code: 'EMAIL_MISMATCH', key: 'email_mismatch' },
  account_role_forbidden: { status: 403, code: 'ACCOUNT_ROLE_FORBIDDEN', key: 'account_role_forbidden' },
  account_already_linked: { status: 409, code: 'ACCOUNT_ALREADY_LINKED', key: 'account_already_linked' },
}

function activationError(res, lang, reason, pgCode) {
  console.error(`❌ activation : ${reason} (${pgCode ?? 'sans code'})`)
  Sentry.captureException(new Error(`activation_${reason}`), { tags: { pg_code: pgCode ?? 'unknown' } })
  return res.status(500).json({ success: false, code: 'ACTIVATION_ERROR', error: msg(lang, 'activation_error') })
}

function invalidToken(res, lang) {
  return res.status(400).json({ success: false, code: 'INVALID_TOKEN', error: msg(lang, 'invalid_token') })
}

export function createActivationRouter({ requireAuth, publicClient, supportEmail }) {
  const router = Router()
  const activationsSwitch = killSwitch('PARTNER_ACTIVATIONS_ENABLED', {
    code: 'PARTNER_ACTIVATIONS_DISABLED',
    messageKey: 'partner_activations_disabled',
  })
  const ipLimiter = createIpRateLimiter({ max: 30, windowMs: 10 * 60 * 1000, message: (req) => msg(reqLang(req), 'too_many_requests') })

  router.post('/check', activationsSwitch, ipLimiter, async (req, res) => {
    const lang = reqLang(req)
    const tokenHash = req.body?.token_hash
    if (!isTokenHash(tokenHash)) return invalidToken(res, lang)
    try {
      const { data, error } = await publicClient.rpc('invitation_preview', { p_token_hash: tokenHash })
      if (error) return activationError(res, lang, 'check_rpc_failed', error.code)
      if (data?.valid === true) {
        return res.json({
          success: true,
          invitation: {
            email: data.email,
            partner_name: data.partner_name ?? null,
            family_first_name: data.family_first_name ?? null,
            deceased_first_name: data.deceased_first_name ?? null,
            expires_at: data.expires_at,
          },
          support_email: supportEmail,
        })
      }
      if (data?.reason === 'expired') {
        return res.status(410).json({
          success: false, code: 'INVITATION_EXPIRED', error: msg(lang, 'invitation_expired'),
          partner_name: data.partner_name ?? null, support_email: supportEmail,
        })
      }
      return res.status(404).json({ success: false, code: 'INVITATION_INVALID', error: msg(lang, 'invitation_invalid') })
    } catch (error) {
      return activationError(res, lang, 'check_exception', error?.code)
    }
  })

  router.post('/claim', requireAuth, activationsSwitch, async (req, res) => {
    const lang = reqLang(req)
    const tokenHash = req.body?.token_hash
    if (!isTokenHash(tokenHash)) return invalidToken(res, lang)
    try {
      const { data, error } = await req.supabaseClient.rpc('claim_dossier', { p_token_hash: tokenHash })
      if (error) {
        const mapped = CLAIM_ERRORS[error.message]
        if (!mapped) return activationError(res, lang, 'claim_rpc_failed', error.code)
        return res.status(mapped.status).json({ success: false, code: mapped.code, error: msg(lang, mapped.key) })
      }
      const payload = {
        success: true,
        claimed: Boolean(data?.claimed),
        already_active: Boolean(data?.already_active),
        dossier_id: data?.dossier_id ?? null,
      }
      if (data && Object.prototype.hasOwnProperty.call(data, 'partner_name')) payload.partner_name = data.partner_name
      return res.json(payload)
    } catch (error) {
      return activationError(res, lang, 'claim_exception', error?.code)
    }
  })

  return router
}
