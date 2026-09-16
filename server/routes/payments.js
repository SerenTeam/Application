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
import { flagOn } from '../lib/flags.js'
import { FAIL_CLOSED_GATE } from '../lib/require-active-dossier.js'

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
  // Gate v2 : seul checkout-extra-send est gaté (contrat §4.2) ; défaut fail-closed (A5).
  requireActiveDossier = FAIL_CLOSED_GATE,
  store,
  stripe,
  publicClient,
  // Lecteur de prix optionnel (plus passé par server.js en v2, note N12) : absent → price null.
  getPrice,
  // Tarif « envoi supplémentaire » (chantier 2a, facturation à l'acte) : tarif Stripe DISTINCT
  // du forfait, absent → la route /checkout-extra-send est inerte en 503 (pattern maison).
  extraPriceId,
  // Lecteur du MONTANT de ce même tarif (chantier 2a, Task 11) : le panneau d'envoi papier
  // affiche le prix AVANT le clic d'achat (spec §8 — pas de dark pattern), exactement comme le
  // forfait. Optionnel : absent → `extra_price` reste `null`, le front affiche le bouton sans
  // montant plutôt que de deviner un chiffre (patron de `getPrice`).
  getExtraPrice,
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

  // Mini-paiement « envoi supplémentaire » : ouvert seulement si EXTRA_SENDS_ENABLED === 'true'
  // (relu à chaque requête) ET SDK ET tarif. Absent en préprod ET en prod pendant la bêta.
  const extraSaleOpen = () => Boolean(flagOn('EXTRA_SENDS_ENABLED') && stripe && extraPriceId)
  const paymentsDisabled = (req, res) =>
    res.status(503).json({ success: false, code: 'PAYMENTS_DISABLED', error: msg(reqLang(req), 'payments_disabled') })

  // Forfait famille ABANDONNÉ (v2 : la PF paie Seren, la famille ne paie rien). Route gardée pour
  // qu'un client ancien reçoive une réponse franche ; code Stripe du forfait retiré.
  router.post('/checkout', requireAuth, paymentsDisabled)

  // Achat d'un envoi supplémentaire (chantier 2a, spec §4 — facturation à l'acte au-delà des
  // envois inclus). Trois propriétés assumées :
  //  • il n'exige AUCUN forfait (v2 : le forfait famille n'existe plus) — c'est le gate dossier
  //    actif qui garde la route, exactement comme les autres routes métier famille ;
  //  • il est répétable (pas de no-op `already_purchased`) : on achète autant d'envois qu'on veut ;
  //  • les metadata portent `kind: 'envoi_sup'` et `included_sends: '1'` — le webhook n'a rien à
  //    deviner, et la RPC (migration 20260914150000) inscrit la bonne nature d'achat.
  router.post('/checkout-extra-send', requireAuth, requireActiveDossier, checkoutLimiter, async (req, res) => {
    const lang = reqLang(req)
    if (!extraSaleOpen()) return paymentsDisabled(req, res)

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ price: extraPriceId, quantity: 1 }],
        success_url: `${appUrl}/dashboard?checkout=extra_success`,
        cancel_url: `${appUrl}/dashboard?checkout=cancel`,
        client_reference_id: req.user.id,
        customer_email: req.user.email,
        metadata: { user_id: req.user.id, included_sends: '1', kind: 'envoi_sup' },
      })

      await store.createPending(publicClient, {
        userId: req.user.id,
        sessionId: session.id,
        includedSends: 1,
        kind: 'envoi_sup',
      })

      return res.json({ success: true, url: session.url })
    } catch (error) {
      console.error('❌ payments/checkout-extra-send :', error?.message ?? error)
      Sentry.captureException(error)
      return res.status(502).json({ success: false, error: msg(lang, 'checkout_failed') })
    }
  })

  router.get('/status', requireAuth, async (req, res) => {
    const lang = reqLang(req)
    try {
      // DEUX lectures volontairement distinctes (vigilance I4 de la revue Tasks 5+6) :
      //  • `has_paid` vient de getPaidPurchase — filtré `kind='forfait'`, c'est EXACTEMENT ce que
      //    vérifie le gate serveur. Le dériver du dernier achat ferait afficher « forfait payé »
      //    à quelqu'un qui n'a acheté qu'un envoi supplémentaire (1 timbre), avec un paywall levé
      //    côté UI et un 402 côté serveur à la première action.
      //  • `purchase` reste le DERNIER achat, quel qu'il soit : c'est lui qu'affiche l'écran de
      //    confirmation après un retour de Checkout (y compris pour un envoi supplémentaire).
      const [purchase, forfait, price, extraPrice] = await Promise.all([
        store.getLatestPurchase(req.supabaseClient, req.user.id),
        store.getPaidPurchase(req.supabaseClient, req.user.id),
        getPrice ? getPrice() : Promise.resolve(null),
        getExtraPrice ? getExtraPrice() : Promise.resolve(null),
      ])

      // Détection d'anomalie (correctif M1 de la revue Task 9) : un envoi supplémentaire encaissé
      // alors que l'utilisateur n'a PAS (ou n'a plus) de forfait payé. Le Checkout à l'acte exige
      // pourtant un forfait (403), mais la fenêtre existe : paiement différé encaissé après un
      // remboursement du forfait, ou achat manuel depuis le Dashboard Stripe. L'utilisateur a payé
      // quelque chose qu'il ne peut pas consommer (le gate le refuse) → réconciliation manuelle.
      //
      // ⚠️ POURQUOI ICI ET PAS DANS LE WEBHOOK (écart documenté) : le webhook n'a pas de token
      // utilisateur, il écrit avec le client `anon` + les RPC à secret. La policy `own purchases
      // read` étant `auth.uid() = user_id`, une lecture des achats depuis ce client ne renvoie
      // JAMAIS de ligne — le test « a-t-il un forfait ? » y serait faux pour TOUS les achats à
      // l'acte, soit 100 % de faux positifs. Cette route-ci lit avec le token de l'utilisateur :
      // c'est le premier endroit du flux où la question a une réponse fiable (et elle est appelée
      // au retour de Checkout, exactement quand l'anomalie apparaîtrait).
      if (!forfait && purchase?.status === 'paid' && purchase?.kind === 'envoi_sup') {
        console.warn('⚠️ payments/status : envoi supplémentaire encaissé sans forfait payé')
        Sentry.captureException(new Error('extra_send_paid_without_forfait'), {
          tags: { anomaly: 'extra_send_without_forfait', purchase_id: purchase.id },
        })
      }

      return res.json({
        success: true,
        // Forfait famille abandonné en v2 : la vente ne rouvre jamais côté famille.
        payments_enabled: false,
        has_paid: Boolean(forfait),
        purchase: purchase
          ? { status: purchase.status, paid_at: purchase.paid_at, included_sends: purchase.included_sends }
          : null,
        price: price ?? null,
        // Prix de l'envoi supplémentaire (chantier 2a) — même forme que `price`, `null` si le
        // tarif n'est pas configuré (l'offre d'achat à l'acte s'affiche alors sans montant).
        extra_price: extraPrice ?? null,
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
      // Nature de l'achat (chantier 2a) : posée par NOTRE serveur à la création de la session et
      // revenue sous signature vérifiée. Elle ne sert qu'au chemin INSERT de la RPC (webhook plus
      // rapide que la ligne d'attente) ; sur une ligne `pending` existante, le `kind` déjà écrit
      // fait foi et n'est jamais réécrit. Toute valeur autre que 'envoi_sup' est ramenée à
      // 'forfait' par le store — une valeur inattendue, elle, LÈVE (correctif I2) : le webhook
      // acquitte quand même en 200 et capture dans Sentry, l'anomalie devient visible au lieu de
      // s'écrire en base sous la valeur privilégiée.
      // La vérification « cet achat à l'acte a-t-il un forfait derrière lui ? » (anomalie M1) ne
      // peut PAS se faire ici : ce client n'a pas de token utilisateur et la RLS de purchases ne
      // lui montre aucune ligne — elle vit dans GET /status, qui lit avec le token du porteur.
      kind: session.metadata?.kind,
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
