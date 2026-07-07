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
