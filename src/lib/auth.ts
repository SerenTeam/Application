import { supabase } from './supabase'

// Pas de `signUp` ici en v2 : la création de compte famille passe UNIQUEMENT par l'activation
// d'une invitation (src/pages/ActivationPage.tsx), qui doit joindre le hash du jeton au signUp.
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  return { data, error }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  return { error }
}

export async function updatePassword(newPassword: string) {
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  })
  return { data, error }
}

/** Envoi du lien de réinitialisation (SER-13 étape 1) */
export async function resetPasswordForEmail(email: string) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password/confirm`,
  })
  return { data, error }
}
