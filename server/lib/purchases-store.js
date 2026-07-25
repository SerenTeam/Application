// Persistance des achats du forfait (table purchases — chantier 1).
// Deux régimes d'accès, comme letters-store.js :
//   • LECTURES avec le client Supabase AUTHENTIFIÉ de la requête (req.supabaseClient) : la
//     policy `own purchases read` isole par utilisateur. Le filtre eq(user_id) explicite est
//     redondant avec la RLS mais suit la convention du repo (défense en profondeur, lisibilité).
//   • ÉCRITURES par RPC security definer : la table n'a AUCUNE policy d'insertion ni de mise à
//     jour (migration 20260725120000_purchases.sql) — c'est délibéré et c'est ce qui rend T1
//     irreproductible. Un utilisateur ne peut donc pas écrire `status = 'paid'` lui-même, et le
//     serveur non plus par le chemin direct : tout passe par les fonctions SQL gardées.
// p_secret (env WEBHOOK_RPC_SECRET ↔ ligne webhook_config) : PostgREST expose toute fonction du
// schéma public en POST /rest/v1/rpc/<name> à quiconque détient la clé publishable — la base
// vérifie donc ELLE-MÊME un secret partagé, sinon la vérification de signature Stripe côté
// Express serait contournable en appelant la RPC en direct.

const TABLE = 'purchases'

// Colonnes lues par le gate et l'UI. Les identifiants Stripe (session, payment intent) sont
// volontairement exclus : ils ne servent à rien côté client, autant ne pas les exposer.
const PUBLIC_COLUMNS = 'id, status, amount_total, currency, included_sends, paid_at, refunded_at, created_at'

// Appel RPC commun aux quatre écritures. Le secret manquant lève AVANT tout appel réseau (même
// comportement que letters-store.updateSendByProviderRef) ; l'appelant décide quoi en faire —
// la route webhook, elle, acquitte quand même en 200.
async function callRpc(client, name, params) {
  const rpcSecret = process.env.WEBHOOK_RPC_SECRET
  if (!rpcSecret) {
    console.error(`❌ purchases-store : WEBHOOK_RPC_SECRET manquant — ${name} impossible (configurer la variable d'environnement et la ligne webhook_config)`)
    throw new Error('WEBHOOK_RPC_SECRET manquant')
  }
  const { error } = await client.rpc(name, { p_secret: rpcSecret, ...params })
  // Le message d'erreur ne reprend jamais les paramètres (données de paiement).
  if (error) throw new Error(`RPC ${name} impossible : ${error.message}`)
}

/** Achat encaissé et non remboursé — la seule chose dont le gate a besoin. `null` si aucun. */
export async function getPaidPurchase(client, userId) {
  const { data, error } = await client
    .from(TABLE)
    .select(PUBLIC_COLUMNS)
    .eq('user_id', userId)
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Lecture de l'achat impossible : ${error.message}`)
  return data ?? null
}

/** Dernier achat quel que soit son statut — alimente l'écran « confirmation en cours ». */
export async function getLatestPurchase(client, userId) {
  const { data, error } = await client
    .from(TABLE)
    .select(PUBLIC_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Lecture de l'achat impossible : ${error.message}`)
  return data ?? null
}

export async function createPending(client, { userId, sessionId, includedSends }) {
  await callRpc(client, 'create_pending_purchase', {
    p_user_id: userId,
    p_session_id: sessionId,
    p_included_sends: includedSends ?? 0,
  })
}

export async function markPaid(client, { sessionId, userId, paymentIntent, amountTotal, currency, includedSends }) {
  await callRpc(client, 'mark_purchase_paid', {
    p_session_id: sessionId,
    p_user_id: userId,
    p_payment_intent: paymentIntent ?? null,
    p_amount_total: amountTotal ?? null,
    p_currency: currency ?? null,
    p_included_sends: includedSends ?? 0,
  })
}

export async function markRefunded(client, paymentIntent) {
  await callRpc(client, 'mark_purchase_refunded', { p_payment_intent: paymentIntent })
}

export async function expire(client, sessionId) {
  await callRpc(client, 'expire_purchase', { p_session_id: sessionId })
}
