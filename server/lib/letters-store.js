// Persistance des envois de courriers (table letter_sends).
// createSend/listSends/markSendResult prennent le client Supabase AUTHENTIFIÉ de la requête
// (req.supabaseClient) : la RLS garantit l'isolation par utilisateur — le filtre
// eq(user_id) explicite dans listSends n'est pas strictement nécessaire mais suit la
// même convention que sessions-store.js (défense en profondeur, lisibilité).
// updateSendByProviderRef est appelée depuis le webhook Resend (Task 4), qui n'a PAS de
// token utilisateur : elle passe donc par la fonction SQL security definer
// `update_letter_send_status` (migration 20260716120000_letter_sends.sql) plutôt que par
// une mise à jour directe de la table, que la RLS bloquerait.

const TABLE = 'letter_sends'

// Idempotence : dedup_key est UNIQUE en base (un même courrier ne part jamais deux fois).
// Un conflit (code PostgREST 23505) n'est pas une erreur pour l'appelant : on recharge
// l'envoi existant et on le signale comme duplicata plutôt que de propager l'exception.
export async function createSend(client, fields) {
  const { data, error } = await client.from(TABLE).insert(fields).select().single()
  if (error?.code === '23505') {
    const { data: existing, error: reloadError } = await client
      .from(TABLE)
      .select('*')
      .eq('dedup_key', fields.dedup_key)
      .single()
    if (reloadError || !existing) {
      throw new Error(`Recharge de l'envoi existant impossible : ${reloadError?.message ?? 'réponse vide'}`)
    }
    return { duplicate: true, send: existing }
  }
  if (error || !data) throw new Error(`Création de l'envoi impossible : ${error?.message ?? 'réponse vide'}`)
  return { send: data }
}

// Fenêtre de fraîcheur du claim : une ligne 'sending' plus récente que 60 s est considérée
// comme un envoi réellement en cours dans une autre requête (un appel Resend se compte en
// secondes) ; plus ancienne, c'est un vestige — crash serveur en plein vol, ou tentative
// d'avant la configuration de la clé Resend (503) — donc retentable sans risque.
const STALE_SENDING_MS = 60 * 1000

// Claim atomique d'un retry (route POST /send, branche duplicata) — correctif TOCTOU :
// deux POST identiques concurrents calculent le même dedup_key ; le second recharge une
// ligne encore 'sending' pendant que le premier envoie, et sans verrou il « retenterait »
// → courrier reçu deux fois. L'UPDATE conditionnel (WHERE status = …) est atomique côté
// Postgres : PostgREST ne renvoie que les lignes réellement modifiées, donc une seule
// requête peut gagner. 1 ligne = claim gagné (renvoyée, repassée en 'sending') ;
// 0 ligne = une requête concurrente possède l'envoi → null (l'appelant répond 409).
// Ligne 'failed' → retentable immédiatement ; ligne 'sending' → seulement si STALE.
export async function claimRetry(client, id, { allowStaleSending = false } = {}) {
  let query = client
    .from(TABLE)
    .update({ status: 'sending', updated_at: new Date().toISOString() })
    .eq('id', id)
  query = allowStaleSending
    ? query.eq('status', 'sending').lt('updated_at', new Date(Date.now() - STALE_SENDING_MS).toISOString())
    : query.eq('status', 'failed')
  const { data, error } = await query.select()
  if (error) throw new Error(`Claim du retry impossible : ${error.message}`)
  return data?.[0] ?? null
}

// Met à jour une ligne par id juste après le résultat immédiat de l'envoi (sent+provider_ref,
// ou failed+error) — route POST /send (Task 3), avec le client utilisateur authentifié
// (RLS via auth.uid() = user_id, comme createSend/listSends). Distinct de
// updateSendByProviderRef : ce dernier sert au webhook (Task 4), qui n'a pas de session
// utilisateur et passe par la RPC security definer.
export async function markSendResult(client, id, patch) {
  const { data, error } = await client.from(TABLE).update(patch).eq('id', id).select().single()
  if (error || !data) throw new Error(`Mise à jour du résultat d'envoi impossible : ${error?.message ?? 'réponse vide'}`)
  return data
}

export async function listSends(client, userId) {
  const { data, error } = await client
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Lecture des envois impossible : ${error.message}`)
  return data ?? []
}

// Appelée par la route webhook (Task 4), sans session utilisateur : la RPC security
// definer ne touche que les colonnes de statut et ne renvoie aucune lecture.
export async function updateSendByProviderRef(client, providerRef, { status, delivered_at = null, error: sendError = null }) {
  const { error } = await client.rpc('update_letter_send_status', {
    p_provider_ref: providerRef,
    p_status: status,
    p_delivered_at: delivered_at,
    p_error: sendError,
  })
  if (error) throw new Error(`Mise à jour du statut d'envoi impossible : ${error.message}`)
}
