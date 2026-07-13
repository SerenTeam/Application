import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
// Accepte l'ancien nom (VITE_SUPABASE_ANON_KEY, clés JWT legacy) et le nouveau
// (VITE_SUPABASE_PUBLISHABLE_KEY, clés sb_publishable_…) selon l'environnement.
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY ou VITE_SUPABASE_PUBLISHABLE_KEY)')
}

export const supabase = createClient(supabaseUrl, supabaseKey)
