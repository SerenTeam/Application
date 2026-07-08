// Persistance des sessions du questionnaire v2 (table questionnaire_sessions).
// Toutes les fonctions prennent le client Supabase AUTHENTIFIÉ de la requête
// (req.supabaseClient) : la RLS garantit l'isolation par utilisateur.
// Une session expirée est invisible (filtre expires_at) ; cleanup paresseux côté BDD.

const TABLE = 'questionnaire_sessions'

export async function createSession(client, userId) {
  const { data, error } = await client.from(TABLE).insert({ user_id: userId }).select().single()
  if (error || !data) throw new Error(`Création de session impossible : ${error?.message ?? 'réponse vide'}`)
  return data
}

export async function loadSession(client, sessionId) {
  const { data, error } = await client
    .from(TABLE)
    .select('*')
    .eq('id', sessionId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (error) throw new Error(`Lecture de session impossible : ${error.message}`)
  return data // null si absente, expirée, ou pas à cet utilisateur (RLS)
}

export async function saveAnswers(client, sessionId, answers) {
  const { error } = await client
    .from(TABLE)
    .update({ answers, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
  if (error) throw new Error(`Sauvegarde de session impossible : ${error.message}`)
}

export async function deleteSession(client, sessionId) {
  const { error } = await client.from(TABLE).delete().eq('id', sessionId)
  if (error) throw new Error(`Suppression de session impossible : ${error.message}`)
}
