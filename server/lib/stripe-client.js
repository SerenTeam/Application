// Client Stripe — instanciation PARESSEUSE, exactement comme le client Resend (server.js) :
// sans STRIPE_SECRET_KEY, l'export vaut `null`, la feature est inerte et les routes répondent
// 503 proprement au lieu de faire planter le serveur au démarrage (dev local, CI, préprod
// avant configuration).
import Stripe from 'stripe'

export function createStripeClient(apiKey = process.env.STRIPE_SECRET_KEY) {
  if (!apiKey) return null
  return new Stripe(apiKey)
}

// Durée de vie du prix en cache. Le tarif ne bouge qu'à la main dans le Dashboard Stripe (D3 :
// le fake-door 99/149/199 se pilote depuis Stripe) — 10 minutes évitent un aller-retour réseau
// à chaque affichage sans jamais laisser traîner un montant périmé plus d'un instant.
const PRICE_TTL_MS = 10 * 60 * 1000

/** Lecteur de prix : source de vérité UNIQUE du montant affiché (D3 — aucun montant en dur
 * nulle part dans le code, l'UI ne peut donc pas diverger de ce que Stripe débite réellement).
 * Stripe injoignable ou tarif non configuré → `null`, jamais d'exception : l'UI affiche alors
 * l'appel à l'action sans montant plutôt que de casser la page ou d'inventer un chiffre. */
export function createPriceReader({ stripe, priceId, ttlMs = PRICE_TTL_MS }) {
  let cached = null
  let cachedAt = 0

  return async function getPrice() {
    if (!stripe || !priceId) return null
    if (cached && Date.now() - cachedAt < ttlMs) return cached
    try {
      const price = await stripe.prices.retrieve(priceId)
      cached = { amount_total: price.unit_amount, currency: price.currency }
      cachedAt = Date.now()
      return cached
    } catch (error) {
      // Jamais bloquant : on garde la dernière valeur connue si on en a une, sinon null.
      console.error('❌ stripe-client : lecture du tarif impossible —', error?.message ?? 'erreur inconnue')
      return cached
    }
  }
}
