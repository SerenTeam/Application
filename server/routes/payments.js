// Routes de paiement — Stripe Checkout one-shot (chantier 1). Factory à dépendances injectées
// (comme server/routes/letters.js) : testable avec supertest sans compte Stripe, sans Supabase
// et sans le moindre appel réseau. Contrat : docs/plan-chantier-1-paiement.md, Task 3 ;
// table purchases : supabase/migrations/20260725120000_purchases.sql.
//
// Principe directeur, hérité de la faille T1 qu'on ferme ici : AUCUN paramètre d'URL ne
// débloque quoi que ce soit. Le retour de Checkout (`?checkout=success`) ne fait qu'afficher un
// écran d'attente ; la seule preuve d'un paiement est un événement de webhook dont la signature
// Stripe a été vérifiée.
import express, { Router } from 'express'
import * as Sentry from '@sentry/node'
import { createUserRateLimiter } from '../lib/rate-limit.js'
import { msg } from '../lib/messages.js'

// Événements Stripe traités → effet sur purchases. Tous les autres types sont ignorés
// (200 silencieux, voir POST /webhook).
const PAID_EVENTS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded'])
const EXPIRED_EVENTS = new Set(['checkout.session.expired', 'checkout.session.async_payment_failed'])

/** Langue de la requête : ces routes n'ont pas de session questionnaire, le corps (POST) ou la
 * query (GET) sont donc les seules sources. Repli 'fr' — même convention que letters.js. */
function reqLang(req) {
  return req.body?.lang === 'en' || req.query?.lang === 'en' ? 'en' : 'fr'
}

export function createPaymentsRouter({
  requireAuth,
  store,
  stripe,
  publicClient,
  getPrice,
  paymentsEnabled,
  priceId,
  includedSends,
  appUrl,
}) {
  const router = Router()

  // 10/h par utilisateur : ouvrir une session Checkout est un geste volontaire et rare (on
  // achète le forfait une fois). Large pour les hésitations et les retours en arrière, assez
  // serré pour qu'aucune boucle ne puisse marteler l'API Stripe.
  const checkoutLimiter = createUserRateLimiter({
    max: 10,
    windowMs: 60 * 60 * 1000,
    message: (req) => msg(reqLang(req), 'too_many_requests'),
  })

  // La vente est ouverte seulement si le flag l'autorise ET que tout est configuré. Les trois
  // conditions sont indissociables : un flag à true sans clé Stripe ne doit pas produire un
  // demi-état où le gate se ferme alors que personne ne peut acheter.
  const saleOpen = () => Boolean(paymentsEnabled && stripe && priceId)

  router.post('/checkout', requireAuth, checkoutLimiter, async (req, res) => {
    const lang = reqLang(req)
    if (!saleOpen()) {
      return res.status(503).json({ success: false, error: msg(lang, 'payments_disabled') })
    }

    try {
      // On ne fait jamais repayer quelqu'un : si l'achat existe déjà, la route est un no-op.
      const existing = await store.getPaidPurchase(req.supabaseClient, req.user.id)
      if (existing) {
        return res.json({ success: true, already_purchased: true })
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${appUrl}/dashboard?checkout=success`,
        cancel_url: `${appUrl}/dashboard?checkout=cancel`,
        client_reference_id: req.user.id,
        customer_email: req.user.email,
        // included_sends voyage DANS les metadata plutôt qu'être relu depuis l'env au moment du
        // webhook : le quota est ainsi figé à l'instant de l'achat, même si l'offre change entre
        // le clic et l'encaissement (paiements différés type SEPA : plusieurs jours d'écart).
        metadata: { user_id: req.user.id, included_sends: String(includedSends ?? 0) },
      })

      // Ligne d'attente : donne un état affichable pendant la confirmation. Si le webhook arrive
      // d'abord, mark_purchase_paid crée la ligne directement en 'paid' (upsert) — l'ordre
      // d'arrivée n'a aucune importance.
      await store.createPending(publicClient, {
        userId: req.user.id,
        sessionId: session.id,
        includedSends: includedSends ?? 0,
      })

      return res.json({ success: true, url: session.url })
    } catch (error) {
      console.error('❌ payments/checkout :', error?.message ?? error)
      Sentry.captureException(error)
      return res.status(502).json({ success: false, error: msg(lang, 'checkout_failed') })
    }
  })

  router.get('/status', requireAuth, async (req, res) => {
    const lang = reqLang(req)
    try {
      const [purchase, price] = await Promise.all([
        store.getLatestPurchase(req.supabaseClient, req.user.id),
        getPrice ? getPrice() : Promise.resolve(null),
      ])
      return res.json({
        success: true,
        payments_enabled: saleOpen(),
        purchase: purchase
          ? { status: purchase.status, paid_at: purchase.paid_at, included_sends: purchase.included_sends }
          : null,
        price: price ?? null,
      })
    } catch (error) {
      console.error('❌ payments/status :', error?.message ?? error)
      Sentry.captureException(error)
      return res.status(500).json({ success: false, error: msg(lang, 'payments_status_error') })
    }
  })

  // Webhook Stripe. PUBLIC (pas de requireAuth : Stripe n'a pas de session utilisateur) ; la
  // véracité vient UNIQUEMENT de la signature vérifiée ci-dessous. express.raw() en middleware
  // DE ROUTE : la vérification exige le corps BRUT, pas le JSON reparsé. Suffisant quand le
  // router est utilisé seul (tests) ; en production, server.js monte le même express.raw() sur
  // ce chemin AVANT le express.json() global — sans quoi body-parser aurait déjà consommé le
  // flux (req._body à true) et req.body serait un objet JS, inutilisable pour un HMAC.
  // Pas de rate limiter : la vérification échoue à coût quasi nul et un plafond pénaliserait les
  // retries légitimes de Stripe (même raisonnement que le webhook Resend).
  router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET
    if (!secret || !stripe) {
      return res.status(503).json({ success: false, error: 'webhook_not_configured' })
    }

    let event
    try {
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret)
    } catch {
      // Message volontairement muet : ne rien révéler sur la raison de l'échec.
      return res.status(401).json({ success: false, error: 'invalid_signature' })
    }

    try {
      await handleEvent({ event, store, publicClient })
    } catch (error) {
      // Jamais de 500 sur un webhook à signature valide, même si la mise à jour échoue (BDD
      // indisponible, secret RPC absent…) : Stripe réessaierait en boucle. On logue, on capture,
      // on acquitte. Jamais de contenu de payload dans les logs (PII payeur).
      console.error('❌ payments/webhook — traitement :', error?.message ?? error)
      Sentry.captureException(error)
    }

    return res.status(200).json({ success: true })
  })

  return router
}

/** Aiguillage des événements. Séparé de la route pour rester lisible et testable isolément. */
async function handleEvent({ event, store, publicClient }) {
  if (PAID_EVENTS.has(event.type)) {
    const session = event.data?.object ?? {}
    // Un `completed` peut arriver sur une session encore impayée (moyen de paiement différé) :
    // c'est `async_payment_succeeded` qui confirmera. On n'encaisse que sur preuve explicite.
    if (event.type === 'checkout.session.completed' && session.payment_status !== 'paid') {
      return
    }
    // user_id vient des metadata que NOTRE serveur a posées à la création de la session, et
    // nous revient sous signature vérifiée : digne de confiance. Repli sur client_reference_id.
    const userId = session.metadata?.user_id ?? session.client_reference_id
    if (!userId || !session.id) {
      console.warn(`⚠️ payments/webhook : ${event.type} sans user_id exploitable — ignoré`)
      return
    }
    await store.markPaid(publicClient, {
      sessionId: session.id,
      userId,
      paymentIntent: typeof session.payment_intent === 'string' ? session.payment_intent : null,
      amountTotal: session.amount_total ?? null,
      currency: session.currency ?? null,
      includedSends: Number(session.metadata?.included_sends ?? 0) || 0,
    })
    return
  }

  if (EXPIRED_EVENTS.has(event.type)) {
    const session = event.data?.object ?? {}
    if (session.id) await store.expire(publicClient, session.id)
    return
  }

  if (event.type === 'charge.refunded') {
    // D4 : le remboursement se fait depuis le Dashboard Stripe, l'accès se referme tout seul.
    const charge = event.data?.object ?? {}
    const paymentIntent = typeof charge.payment_intent === 'string' ? charge.payment_intent : null
    if (paymentIntent) await store.markRefunded(publicClient, paymentIntent)
    return
  }

  // Jamais le corps du payload dans les logs — juste le type d'événement.
  console.warn(`⚠️ payments/webhook : événement ignoré (${event.type ?? 'type inconnu'})`)
}
