// Routes d'envoi de courriers — v1 : canal email uniquement (Resend). Factory à dépendances
// injectées (comme server/routes/questionnaire.js) : testable avec supertest sans Supabase ni
// appel réseau réel (emailSender toujours faké en test). Contrat : docs/plan-envoi-courriers.md,
// Task 3 ; table letter_sends : supabase/migrations/20260716120000_letter_sends.sql.
import express, { Router } from 'express'
import crypto from 'crypto'
import * as Sentry from '@sentry/node'
import { renderLetterPdf } from '../lib/letter-pdf.js'
import { createUserRateLimiter } from '../lib/rate-limit.js'
import { msg } from '../lib/messages.js'
import { verifySvixSignature } from '../lib/svix-verify.js'

// Regex RFC basique — suffisante pour rejeter les fautes de frappe grossières côté serveur ;
// la vraie validation de délivrabilité vient de la réponse du provider (Resend).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Événements Resend gérés par le webhook → statut letter_sends. Les autres types (opened,
// clicked, complained, etc.) sont ignorés (200 silencieux, voir POST /webhook).
const RESEND_EVENT_STATUS = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.bounced': 'failed',
}

/** Langue de la requête : la route n'a pas de session (contrairement au questionnaire v2), le
 * corps est donc la seule source. Repli 'fr' — comportement identique à bodyLang() dans
 * server/routes/questionnaire.js. */
function bodyLang(req) {
  return req.body?.lang === 'en' ? 'en' : 'fr'
}

// Gate du forfait par défaut : passe-plat. Un router construit sans `requirePurchase` (tests
// antérieurs au chantier 1, usage isolé) se comporte donc exactement comme avant.
const NO_GATE = (req, res, next) => next()

export function createLettersRouter({ requireAuth, store, emailSender, channels, publicClient, requirePurchase = NO_GATE }) {
  const router = Router()

  // 20/h par utilisateur : un envoi correspond à une action volontaire après relecture,
  // jamais à un flux automatisé — large marge pour un usage légitime (plusieurs organismes
  // dans la même session) tout en coupant l'abus (fenêtre glissante, comme /start).
  const sendLimiter = createUserRateLimiter({
    max: 20,
    windowMs: 60 * 60 * 1000,
    message: (req) => msg(bodyLang(req), 'too_many_requests'),
  })

  // Ordre voulu : le gate AVANT le limiteur — une requête qui sera refusée en 402 ne doit pas
  // consommer le quota horaire d'envois de l'utilisateur.
  router.post('/send', requireAuth, requirePurchase, sendLimiter, async (req, res) => {
    const lang = bodyLang(req)
    try {
      const { template_id, step_id, subject, resolved_body, recipient_email } = req.body ?? {}

      if (!template_id || !subject || !resolved_body || !recipient_email) {
        return res.status(400).json({ success: false, error: msg(lang, 'letters_missing_fields') })
      }
      const channel = channels[template_id]
      if (!channel) {
        return res.status(404).json({ success: false, error: msg(lang, 'unknown_template') })
      }
      if (channel !== 'email') {
        return res.status(400).json({ success: false, error: msg(lang, 'channel_not_available') })
      }
      if (!EMAIL_RE.test(recipient_email)) {
        return res.status(400).json({ success: false, error: msg(lang, 'invalid_recipient_email') })
      }
      if (resolved_body.includes('{{')) {
        return res.status(400).json({ success: false, error: msg(lang, 'letter_incomplete') })
      }

      // Idempotence par contenu : un même courrier (même utilisateur, même modèle, même corps
      // résolu, même destinataire) ne part jamais deux fois — voir letter_sends.dedup_key.
      const dedupKey = crypto
        .createHash('sha256')
        .update(`${req.user.id}|${template_id}|${resolved_body}|${recipient_email}`)
        .digest('hex')

      const created = await store.createSend(req.supabaseClient, {
        user_id: req.user.id,
        step_id: step_id ?? null,
        template_id,
        channel,
        status: 'sending',
        provider: 'resend',
        recipient: { email: recipient_email },
        dedup_key: dedupKey,
      })

      let send = created.send
      if (created.duplicate) {
        // L'idempotence ne protège que les envois RÉUSSIS ('sent', ou 'delivered' via le
        // webhook) : eux seuls ne doivent jamais repartir. Une ligne 'failed' (échec provider)
        // ou restée 'sending' est RETENTABLE — sans retry, le dedup_key bloquerait
        // définitivement le courrier.
        const st = created.send.status
        if (st === 'sent' || st === 'delivered') {
          return res.json({ success: true, already_sent: true, send: created.send })
        }
        // Mais le retry doit être GAGNÉ atomiquement (claimRetry, correctif TOCTOU) : deux
        // POST identiques concurrents rechargent la même ligne encore 'sending' — sans verrou,
        // le second « retenterait » pendant que le premier envoie et le destinataire recevrait
        // le courrier deux fois. Ligne 'failed' → claim immédiat ; ligne 'sending' → claim
        // seulement si elle est STALE (updated_at vieux de plus de 60 s : crash serveur en
        // plein vol, ou 503 d'avant la configuration de la clé Resend), sinon un envoi est
        // vraisemblablement en cours dans une autre requête → 409, on ne renvoie rien.
        const claimed = await store.claimRetry(req.supabaseClient, created.send.id, {
          allowStaleSending: st === 'sending',
        })
        if (!claimed) {
          return res.status(409).json({ success: false, error: msg(lang, 'send_in_progress') })
        }
        send = claimed
      }

      try {
        const pdf = renderLetterPdf({ subject, body: resolved_body })
        const result = await emailSender.send({
          pdf,
          subject,
          recipientEmail: recipient_email,
          filename: `${template_id}.pdf`,
        })
        const updated = await store.markSendResult(req.supabaseClient, send.id, {
          status: 'sent',
          provider_ref: result.providerRef,
          sent_at: new Date().toISOString(),
          error: null, // purge l'erreur d'une éventuelle tentative précédente (retry réussi)
        })
        return res.json({ success: true, already_sent: false, send: updated })
      } catch (sendError) {
        // Service non configuré (pas de clé Resend) : ce n'est pas un échec d'envoi mais une
        // config manquante — la ligne reste 'sending', pas de statut 'failed' définitif tant
        // que l'envoi n'a jamais été réellement tenté.
        if (sendError?.message === 'email_not_configured') {
          return res.status(503).json({ success: false, error: msg(lang, 'email_not_configured') })
        }
        await store
          .markSendResult(req.supabaseClient, send.id, { status: 'failed', error: sendError?.message ?? 'send_failed' })
          .catch(() => {}) // ne doit pas masquer l'erreur d'envoi initiale (502 déjà décidé)
        return res.status(502).json({ success: false, error: msg(lang, 'send_failed') })
      }
    } catch (error) {
      console.error('❌ letters/send :', error)
      // Remonte aussi les 500 gérés à Sentry (no-op sans DSN) — les catch avalent l'erreur sinon.
      Sentry.captureException(error)
      res.status(500).json({ success: false, error: msg(lang, 'send_error') })
    }
  })

  router.get('/', requireAuth, async (req, res) => {
    try {
      const sends = await store.listSends(req.supabaseClient, req.user.id)
      res.json({ success: true, sends })
    } catch (error) {
      console.error('❌ letters/list :', error)
      Sentry.captureException(error)
      res.status(500).json({ success: false, error: msg(bodyLang(req), 'letters_list_error') })
    }
  })

  // Webhook Resend — statuts delivered/bounced. PUBLIC (pas de requireAuth : Resend n'a pas de
  // session utilisateur) ; la véracité vient UNIQUEMENT de la signature Svix vérifiée
  // ci-dessous. express.raw() en middleware DE ROUTE : la vérification exige le corps BRUT
  // (octet pour octet), pas le JSON reparsé. Suffisant quand le router est utilisé seul (tests) ;
  // en production, server.js monte le même express.raw() sur ce chemin AVANT le express.json()
  // global, sinon body-parser aurait déjà consommé le flux avant d'atteindre cette route (le
  // second parseur voit req._body déjà à true et laisse req.body inchangé — un objet JS, plus
  // le Buffer attendu ici).
  // Pas de rate limiter sur cette route — délibéré : la vérification svix échoue à coût
  // quasi nul (un HMAC), et un plafond global pénaliserait les retries légitimes de Resend.
  router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET
    if (!secret) {
      return res.status(503).json({ success: false, error: 'webhook_not_configured' })
    }

    const valid = verifySvixSignature({
      secret,
      svixId: req.headers['svix-id'],
      svixTimestamp: req.headers['svix-timestamp'],
      svixSignature: req.headers['svix-signature'],
      rawBody: req.body,
    })
    if (!valid) {
      return res.status(401).json({ success: false, error: 'invalid_signature' })
    }

    let payload
    try {
      payload = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body)
    } catch {
      // Signature valide mais JSON malformé : ne devrait jamais arriver côté Resend — jamais de
      // 500 sur un webhook signé (Resend réessaierait indéfiniment).
      console.warn('⚠️ letters/webhook : payload JSON invalide malgré signature valide')
      return res.status(200).json({ success: true })
    }

    const status = RESEND_EVENT_STATUS[payload?.type]
    const providerRef = payload?.data?.email_id
    if (!status || !providerRef) {
      // Jamais le corps du payload dans les logs (PII potentielles côté destinataire) — juste
      // le type d'événement.
      console.warn(`⚠️ letters/webhook : événement ignoré (${payload?.type ?? 'type inconnu'})`)
      return res.status(200).json({ success: true })
    }

    try {
      await store.updateSendByProviderRef(publicClient, providerRef, {
        status,
        delivered_at: status === 'delivered' ? new Date().toISOString() : null,
        error: status === 'failed' ? (payload?.data?.reason ?? payload?.data?.error ?? 'bounced') : null,
      })
    } catch (error) {
      // Idem : jamais de 500 sur un webhook signé valide, même si la mise à jour échoue
      // (BDD indisponible…) — on logue côté serveur et on acquitte quand même.
      console.error('❌ letters/webhook — mise à jour du statut :', error)
      Sentry.captureException(error)
    }

    return res.status(200).json({ success: true })
  })

  return router
}
