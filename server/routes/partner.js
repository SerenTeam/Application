// Espace partenaire PF (contrat §4.4). La sécurité est ENTIÈREMENT dans les RPC SQL (partner_id tiré
// de auth.uid(), aucune jointure vers le contenu famille) ; Express ne fait que : générer le jeton,
// n'envoyer QUE son hash à la base, envoyer l'invitation, traduire les codes SQL en HTTP.
// PARTNER_ACTIVATIONS_ENABLED est un interrupteur d'exploitation (création et renvoi), pas une barrière.
// Règle absolue : le jeton, son hash et l'URL d'activation ne sont JAMAIS journalisés ni envoyés à Sentry.
import { Router } from 'express'
import * as Sentry from '@sentry/node'
import { msg } from '../lib/messages.js'
import { flagOn, killSwitch } from '../lib/flags.js'
import { createUserRateLimiter } from '../lib/rate-limit.js'
import {
  generateInviteToken as defaultGenerateInviteToken,
  hashInviteToken as defaultHashInviteToken,
} from '../lib/invite-token.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function reqLang(req) {
  return req.body?.lang === 'en' || req.query?.lang === 'en' ? 'en' : 'fr'
}

// Codes d'exception SQL (contrat §3.5) → réponse HTTP. Égalité stricte sur error.message.
const RPC_ERRORS = {
  not_a_partner: { status: 403, code: 'NOT_A_PARTNER', key: 'not_a_partner' },
  partner_inactive: { status: 403, code: 'PARTNER_INACTIVE', key: 'partner_inactive' },
  invalid_family_name: { status: 400, code: 'INVALID_INPUT', key: 'invalid_input', field: 'family_name' },
  invalid_email: { status: 400, code: 'INVALID_INPUT', key: 'invalid_input', field: 'email' },
  invalid_phone: { status: 400, code: 'INVALID_INPUT', key: 'invalid_input', field: 'phone' },
  invalid_deceased_name: { status: 400, code: 'INVALID_INPUT', key: 'invalid_input', field: 'deceased_name' },
  invalid_death_date: { status: 400, code: 'INVALID_INPUT', key: 'invalid_input', field: 'death_date' },
  partner_daily_limit: { status: 429, code: 'PARTNER_DAILY_LIMIT', key: 'partner_daily_limit' },
  email_unavailable: { status: 409, code: 'EMAIL_UNAVAILABLE', key: 'email_unavailable' },
  dossier_not_found: { status: 404, code: 'DOSSIER_NOT_FOUND', key: 'dossier_not_found' },
  dossier_not_invitable: { status: 409, code: 'DOSSIER_NOT_INVITABLE', key: 'dossier_not_invitable' },
  rotation_too_soon: { status: 429, code: 'ROTATION_TOO_SOON', key: 'rotation_too_soon' },
  rotation_limit: { status: 429, code: 'ROTATION_LIMIT', key: 'rotation_limit' },
  dossier_already_active: { status: 409, code: 'DOSSIER_ALREADY_ACTIVE', key: 'dossier_already_active' },
  cancel_window_elapsed: { status: 409, code: 'CANCEL_WINDOW_ELAPSED', key: 'cancel_window_elapsed' },
}

function partnerError(res, lang, reason, pgCode) {
  // Jamais error.message brut : un message Postgres imprévu peut contenir des valeurs saisies.
  console.error(`❌ partner : ${reason} (${pgCode ?? 'sans code'})`)
  Sentry.captureException(new Error(`partner_${reason}`), { tags: { pg_code: pgCode ?? 'unknown' } })
  return res.status(500).json({ success: false, code: 'PARTNER_ERROR', error: msg(lang, 'partner_error') })
}

function sendRpcError(res, lang, error, context) {
  const mapped = RPC_ERRORS[error?.message]
  if (!mapped) return partnerError(res, lang, `${context}_rpc_failed`, error?.code)
  const body = { success: false, code: mapped.code, error: msg(lang, mapped.key) }
  if (mapped.field) body.field = mapped.field
  return res.status(mapped.status).json(body)
}

function notFound(res, lang) {
  return res.status(404).json({ success: false, code: 'DOSSIER_NOT_FOUND', error: msg(lang, 'dossier_not_found') })
}

export function createPartnerRouter({
  requireAuth,
  invitationSender,
  appUrl,
  supportEmail,
  rpcSecret,
  generateInviteToken = defaultGenerateInviteToken,
  hashInviteToken = defaultHashInviteToken,
}) {
  const router = Router()
  const baseUrl = String(appUrl ?? '').replace(/\/+$/, '')
  const activationUrlFor = (token) => `${baseUrl}/activation#t=${token}`

  const activationsSwitch = killSwitch('PARTNER_ACTIVATIONS_ENABLED', {
    code: 'PARTNER_ACTIVATIONS_DISABLED',
    messageKey: 'partner_activations_disabled',
  })

  // Contrat §3.4 / §4.4 : création et renvoi sont les 2 seules RPC où l'APPELANT choisit le hash du
  // jeton d'activation. Elles exigent le secret partagé webhook_config, que seul ce serveur détient —
  // sans quoi une PF les appellerait en direct via PostgREST, choisirait un jeton qu'elle connaît et
  // prendrait le compte de la famille. Absent → fail-closed 500, AVANT tout appel base et tout e-mail.
  function requireRpcSecret(req, res, next) {
    if (typeof rpcSecret === 'string' && rpcSecret.length > 0) return next()
    return partnerError(res, reqLang(req), 'rpc_secret_missing', null)
  }
  const createLimiter = createUserRateLimiter({ max: 30, windowMs: 60 * 60 * 1000, message: (req) => msg(reqLang(req), 'too_many_requests') })
  const resendLimiter = createUserRateLimiter({ max: 20, windowMs: 60 * 60 * 1000, message: (req) => msg(reqLang(req), 'too_many_requests') })

  /** Envoi best effort : le dossier existe déjà, un échec d'e-mail ne l'annule pas (email_sent:false). */
  async function deliverInvitation({ dossier, partnerName, token, lang }) {
    try {
      await invitationSender.send({
        to: dossier.family_email,
        lang,
        partnerName,
        familyFirstName: dossier.family_first_name,
        activationUrl: activationUrlFor(token),
        expiresAt: dossier.invite_expires_at,
        supportEmail,
      })
      return true
    } catch (error) {
      const reason = error?.message === 'email_not_configured' ? 'email_not_configured' : 'invitation_send_failed'
      console.error(`❌ partner/invitation : ${reason}`)
      // Erreur NEUVE : l'originale peut porter l'adresse ou l'URL (message du fournisseur).
      Sentry.captureException(new Error(reason))
      return false
    }
  }

  function successPayload({ dossier, partnerName, emailSent, token }) {
    const payload = { success: true, dossier, partner_name: partnerName, email_sent: emailSent }
    if (flagOn('SHOW_ACTIVATION_LINK')) payload.activation_url = activationUrlFor(token)
    return payload
  }

  router.get('/dossiers', requireAuth, async (req, res) => {
    const lang = reqLang(req)
    try {
      const { data, error } = await req.supabaseClient.rpc('partner_list_dossiers')
      if (error) return sendRpcError(res, lang, error, 'list')
      if (!data) return res.status(403).json({ success: false, code: 'NOT_A_PARTNER', error: msg(lang, 'not_a_partner') })
      return res.json({ success: true, partner: data.partner, dossiers: data.dossiers ?? [] })
    } catch (error) {
      return partnerError(res, lang, 'list_exception', error?.code)
    }
  })

  router.post('/dossiers', requireAuth, activationsSwitch, requireRpcSecret, createLimiter, async (req, res) => {
    const lang = reqLang(req)
    const body = req.body ?? {}
    const text = (value) => (typeof value === 'string' ? value : null)
    if (typeof body.deceased_death_date !== 'string' || !DATE_RE.test(body.deceased_death_date)) {
      return res.status(400).json({ success: false, code: 'INVALID_INPUT', field: 'death_date', error: msg(lang, 'invalid_input') })
    }

    const token = generateInviteToken()
    let result
    try {
      const { data, error } = await req.supabaseClient.rpc('partner_create_dossier', {
        p_secret: rpcSecret,
        p_family_first_name: text(body.family_first_name),
        p_family_last_name: text(body.family_last_name),
        p_family_email: text(body.family_email),
        p_family_phone: text(body.family_phone),
        p_deceased_first_name: text(body.deceased_first_name),
        p_deceased_last_name: text(body.deceased_last_name),
        p_deceased_death_date: body.deceased_death_date,
        p_token_hash: hashInviteToken(token),
        p_confirm_duplicate: body.confirm_duplicate === true,
      })
      if (error) return sendRpcError(res, lang, error, 'create')
      result = data
    } catch (error) {
      return partnerError(res, lang, 'create_exception', error?.code)
    }

    if (result?.duplicate_warning) {
      return res.status(409).json({
        success: false, code: 'DUPLICATE_DECEASED', error: msg(lang, 'duplicate_deceased'),
        duplicate_count: result.duplicate_count ?? 1,
      })
    }
    if (!result?.created || !result.dossier) return partnerError(res, lang, 'create_unexpected_result', null)

    const emailSent = await deliverInvitation({ dossier: result.dossier, partnerName: result.partner_name, token, lang })
    return res.status(201).json(successPayload({ dossier: result.dossier, partnerName: result.partner_name, emailSent, token }))
  })

  router.post('/dossiers/:id/resend', requireAuth, activationsSwitch, requireRpcSecret, resendLimiter, async (req, res) => {
    const lang = reqLang(req)
    if (!UUID_RE.test(req.params.id)) return notFound(res, lang)
    const token = generateInviteToken()
    let result
    try {
      const { data, error } = await req.supabaseClient.rpc('partner_rotate_invitation', {
        p_secret: rpcSecret,
        p_dossier_id: req.params.id,
        p_token_hash: hashInviteToken(token),
      })
      if (error) return sendRpcError(res, lang, error, 'resend')
      result = data
    } catch (error) {
      return partnerError(res, lang, 'resend_exception', error?.code)
    }
    if (!result?.rotated || !result.dossier) return partnerError(res, lang, 'resend_unexpected_result', null)

    const emailSent = await deliverInvitation({ dossier: result.dossier, partnerName: result.partner_name, token, lang })
    return res.json(successPayload({ dossier: result.dossier, partnerName: result.partner_name, emailSent, token }))
  })

  router.post('/dossiers/:id/cancel', requireAuth, async (req, res) => {
    const lang = reqLang(req)
    if (!UUID_RE.test(req.params.id)) return notFound(res, lang)
    try {
      const { data, error } = await req.supabaseClient.rpc('partner_cancel_dossier', { p_dossier_id: req.params.id })
      if (error) return sendRpcError(res, lang, error, 'cancel')
      if (!data?.dossier) return partnerError(res, lang, 'cancel_unexpected_result', null)
      return res.json({ success: true, dossier: data.dossier, already_cancelled: Boolean(data.already_cancelled) })
    } catch (error) {
      return partnerError(res, lang, 'cancel_exception', error?.code)
    }
  })

  router.get('/counters', requireAuth, async (req, res) => {
    const lang = reqLang(req)
    try {
      const { data, error } = await req.supabaseClient.rpc('partner_month_counters')
      if (error) return sendRpcError(res, lang, error, 'counters')
      if (!data) return res.status(403).json({ success: false, code: 'NOT_A_PARTNER', error: msg(lang, 'not_a_partner') })
      const counters = flagOn('PARTNER_BILLING_PREVIEW') ? data : { ...data, billing_preview: null }
      return res.json({ success: true, counters })
    } catch (error) {
      return partnerError(res, lang, 'counters_exception', error?.code)
    }
  })

  return router
}
