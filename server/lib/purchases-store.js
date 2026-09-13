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
// `kind` en fait partie depuis le chantier 2a : la route /status doit pouvoir reconnaître un
// achat d'envoi supplémentaire pour ce qu'il est (détection d'anomalie M1), et le front en aura
// besoin pour le libellé de l'écran de confirmation.
const PUBLIC_COLUMNS = 'id, status, kind, amount_total, currency, included_sends, paid_at, refunded_at, created_at'

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

/** Achat encaissé et non remboursé DU FORFAIT — la seule chose dont le gate a besoin. `null` si
 * aucun. Filtre `kind = 'forfait'` (chantier 2a, amendement AM-2) : un envoi supplémentaire
 * (`kind = 'envoi_sup'`) est une ligne `purchases` normale, encaissée et non remboursée elle
 * aussi — sans ce filtre, un utilisateur n'ayant acheté QU'un envoi à l'acte (jamais le forfait)
 * ouvrirait le gate du produit entier au prix d'un timbre. `getLatestPurchase`, elle, reste
 * volontairement sans filtre : l'écran de confirmation doit pouvoir afficher n'importe quel achat
 * récent, forfait ou envoi supplémentaire. */
export async function getPaidPurchase(client, userId) {
  const { data, error } = await client
    .from(TABLE)
    .select(PUBLIC_COLUMNS)
    .eq('user_id', userId)
    .eq('status', 'paid')
    .eq('kind', 'forfait')
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

// Nature de l'achat (chantier 2a) : 'forfait' (le produit) ou 'envoi_sup' (facturation à l'acte,
// `included_sends = 1`). SEULS l'absence de valeur (appelant d'avant le chantier 2a, metadata
// sans `kind`) est ramenée à 'forfait' — c'est la seule valeur que l'historique pouvait produire.
// Toute AUTRE valeur LÈVE (correctif I2 de la revue Task 9) : la ramener silencieusement à
// 'forfait' donnerait la valeur PRIVILÉGIÉE (celle qui ouvre le gate du produit) à une donnée
// qu'on n'a pas comprise, et masquerait durablement le bug qui l'a produite. La route webhook,
// elle, acquitte toujours en 200 et capture dans Sentry : l'exception rend l'anomalie VISIBLE
// sans faire réessayer Stripe en boucle, et le CHECK SQL `purchases_kind_check` redevient une
// vraie ceinture plutôt que le seul filet.
function normalizeKind(kind) {
  if (kind === undefined || kind === null) return 'forfait'
  if (kind !== 'forfait' && kind !== 'envoi_sup') {
    throw new Error(`purchases.kind inattendu : ${JSON.stringify(String(kind).slice(0, 32))}`)
  }
  return kind
}

export async function createPending(client, { userId, sessionId, includedSends, kind }) {
  await callRpc(client, 'create_pending_purchase', {
    p_user_id: userId,
    p_session_id: sessionId,
    p_included_sends: includedSends ?? 0,
    p_kind: normalizeKind(kind),
  })
}

// ⚠️ `kind` n'est écrit par la RPC que sur le chemin INSERT (webhook arrivé avant la ligne
// d'attente), dans le MÊME ordre SQL que `status = 'paid'` ; sur la branche `on conflict do
// update`, la valeur posée par createPending est conservée telle quelle. Voir les deux règles en
// tête de supabase/migrations/20260914150000_purchases_kind_writer.sql : réécrire `kind` ici
// rétrograderait un envoi supplémentaire en forfait et ouvrirait le gate du produit entier.
export async function markPaid(client, { sessionId, userId, paymentIntent, amountTotal, currency, includedSends, kind }) {
  await callRpc(client, 'mark_purchase_paid', {
    p_session_id: sessionId,
    p_user_id: userId,
    p_payment_intent: paymentIntent ?? null,
    p_amount_total: amountTotal ?? null,
    p_currency: currency ?? null,
    p_included_sends: includedSends ?? 0,
    p_kind: normalizeKind(kind),
  })
}

export async function markRefunded(client, paymentIntent) {
  await callRpc(client, 'mark_purchase_refunded', { p_payment_intent: paymentIntent })
}

export async function expire(client, sessionId) {
  await callRpc(client, 'expire_purchase', { p_session_id: sessionId })
}
