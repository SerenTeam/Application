// Persistance des envois de courriers (table letter_sends).
// createSend/listSends prennent le client Supabase AUTHENTIFIÉ de la requête
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
