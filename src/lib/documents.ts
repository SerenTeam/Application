import type { SupabaseClient } from '@supabase/supabase-js'

// Point d'accès unique aux tables `documents` et `step_actions`.
// Les noms de colonnes doivent correspondre à supabase/migrations/20260701000000_baseline_v1.sql —
// conformité verrouillée par tests/documents-lib.test.ts (invariant anti-drift).
// Le client est injecté pour rester testable sans variables d'environnement.

export interface UserDocumentRow {
  id: string
  title: string
  content: string
  step_id: string | null
  created_at: string
  steps: { title?: string; theme?: string } | null
}

export interface LetterDocumentInput {
  userId: string
  stepId: string
  letterTemplateId: string
  title: string
  content: string
}

/** Journalise une action non bloquante (copie / téléchargement) sur une étape. */
export async function logStepAction(
  client: SupabaseClient,
  stepId: string,
  userId: string,
  type: 'copied' | 'downloaded'
): Promise<void> {
  await client.from('step_actions').insert({ step_id: stepId, user_id: userId, type })
}

/** Enregistre l'envoi d'un courrier ; l'erreur est remontée au composant. */
export async function markStepSent(
  client: SupabaseClient,
  opts: { stepId: string; userId: string; sentDate: string; note: string | null }
): Promise<{ error: unknown }> {
  const { error } = await client.from('step_actions').insert({
    step_id: opts.stepId,
    user_id: opts.userId,
    type: 'sent',
    sent_date: opts.sentDate,
    note: opts.note,
  })
  return { error }
}

/** Renvoie les step_id (parmi ceux fournis) marqués comme envoyés par l'utilisateur. */
export async function fetchSentStepIds(
  client: SupabaseClient,
  userId: string,
  stepIds: string[]
): Promise<Set<string>> {
  if (stepIds.length === 0) return new Set()
  const { data } = await client
    .from('step_actions')
    .select('step_id')
    .eq('user_id', userId)
    .eq('type', 'sent')
    .in('step_id', stepIds)
  return new Set((data ?? []).map((a: { step_id: string }) => a.step_id))
}

/** Liste les courriers sauvegardés de l'utilisateur, plus récents d'abord. */
export async function fetchUserDocuments(client: SupabaseClient, userId: string): Promise<UserDocumentRow[]> {
  const { data, error } = await client
    .from('documents')
    .select('*, steps(title, theme)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as UserDocumentRow[]
}

export async function deleteDocument(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from('documents').delete().eq('id', id)
  if (error) throw error
}

/**
 * Sauvegarde un courrier généré. Un seul document par (étape, modèle) :
 * s'il existe déjà, son contenu est mis à jour au lieu de créer un doublon.
 */
export async function saveLetterDocument(client: SupabaseClient, doc: LetterDocumentInput): Promise<void> {
  const { data: existing } = await client
    .from('documents')
    .select('id')
    .eq('user_id', doc.userId)
    .eq('step_id', doc.stepId)
    .eq('letter_template_id', doc.letterTemplateId)
    .maybeSingle()

  if (existing?.id) {
    await client
      .from('documents')
      .update({ title: doc.title, content: doc.content, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
  } else {
    await client.from('documents').insert({
      user_id: doc.userId,
      step_id: doc.stepId,
      letter_template_id: doc.letterTemplateId,
      title: doc.title,
      content: doc.content,
    })
  }
}
