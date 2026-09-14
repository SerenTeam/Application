import { supabase } from './supabase'

export async function apiFetch(url: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new Error('No auth token available')
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
      'Authorization': `Bearer ${session.access_token}`,
    },
  })

  if (response.status === 401) {
    // signOut triggers onAuthStateChange which handles toast + redirect
    await supabase.auth.signOut()
    throw new Error('Session expired')
  }

  return response
}

// Upload multipart (coffre minimal, chantier 2a — POST /api/attachments) : PAS `apiFetch`, dont
// le Content-Type fixe 'application/json' casserait le boundary multipart. Même contrat sinon
// (token Bearer automatique, même traitement du 401) — un seul endroit gère l'authentification
// des requêtes vers notre API.
export async function apiUpload(url: string, formData: FormData) {
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new Error('No auth token available')
  }

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
    },
  })

  if (response.status === 401) {
    await supabase.auth.signOut()
    throw new Error('Session expired')
  }

  return response
}
