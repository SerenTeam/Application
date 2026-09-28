import type { SupabaseClient } from '@supabase/supabase-js'

// Profil courrier (personnalisation v2, spec docs/design-personnalisation-v2.md §4) : identité et
// adresse de la famille, saisies une fois, lues par le pré-remplissage des courriers ET par l'envoi
// papier. Stocké dans `sender_profiles` (RLS owner : lecture/écriture directes depuis le client,
// sans route serveur, comme au chantier 2a). `full_name` reste la donnée lue par l'envoi papier
// (server/routes/letters.js) : il est recalculé « prénom nom » à chaque enregistrement.

export const LINE_MAX = 45
const POSTAL_CODE_RE = /^[0-9]{5}$/
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const DOB_MIN = '1900-01-01'

const PROFILE_COLUMNS = 'first_name, last_name, full_name, address_line1, address_line2, postal_code, city, relationship'

export interface LetterProfileRow {
  first_name: string | null
  last_name: string | null
  full_name: string
  address_line1: string
  address_line2: string | null
  postal_code: string
  city: string
  relationship: string | null
}

export interface LetterProfileInput {
  first_name: string
  last_name: string
  address_line1: string
  address_line2: string
  postal_code: string
  city: string
  relationship: string
}

/** Identité saisie par la PF, relue par my_dossier_identity() (migration 20260928121000). */
export interface DossierIdentity {
  family_first_name: string | null
  family_last_name: string | null
  deceased_first_name: string | null
  deceased_last_name: string | null
  deceased_death_date: string | null
}

export type LetterProfileError =
  | 'firstNameRequired'
  | 'lastNameRequired'
  | 'fullNameTooLong'
  | 'addressRequired'
  | 'lineTooLong'
  | 'postalCodeInvalid'
  | 'cityRequired'
  | 'relationshipRequired'
  | 'dobInvalid'
  | 'dobOutOfRange'

export type LetterProfileField = keyof LetterProfileInput | 'deceased_dob'
export type LetterProfileErrors = Partial<Record<LetterProfileField, LetterProfileError>>

/** Nom écrit sur l'enveloppe (sender_profiles.full_name). */
export function fullNameOf(input: Pick<LetterProfileInput, 'first_name' | 'last_name'>): string {
  return `${input.first_name.trim()} ${input.last_name.trim()}`.trim()
}

function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false
  const t = Date.parse(value)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === value
}

/**
 * Validation pure, mêmes bornes que les CHECK de sender_profiles (45 caractères par ligne, code
 * postal à 5 chiffres). `dob` : date de naissance du défunt, facultative (vide = pas d'erreur).
 */
export function validateLetterProfile(
  input: LetterProfileInput,
  dob?: { value: string; max: string | null }
): LetterProfileErrors {
  const errors: LetterProfileErrors = {}
  const first = input.first_name.trim()
  const last = input.last_name.trim()
  if (!first) errors.first_name = 'firstNameRequired'
  else if (first.length > LINE_MAX) errors.first_name = 'lineTooLong'
  if (!last) errors.last_name = 'lastNameRequired'
  else if (last.length > LINE_MAX) errors.last_name = 'lineTooLong'
  if (!errors.first_name && !errors.last_name && fullNameOf(input).length > LINE_MAX) {
    errors.last_name = 'fullNameTooLong'
  }
  const line1 = input.address_line1.trim()
  if (!line1) errors.address_line1 = 'addressRequired'
  else if (line1.length > LINE_MAX) errors.address_line1 = 'lineTooLong'
  if (input.address_line2.trim().length > LINE_MAX) errors.address_line2 = 'lineTooLong'
  if (!POSTAL_CODE_RE.test(input.postal_code.trim())) errors.postal_code = 'postalCodeInvalid'
  const city = input.city.trim()
  if (!city) errors.city = 'cityRequired'
  else if (city.length > LINE_MAX) errors.city = 'lineTooLong'
  if (!input.relationship.trim()) errors.relationship = 'relationshipRequired'
  if (dob && dob.value) {
    const today = new Date().toISOString().slice(0, 10)
    if (!isRealIsoDate(dob.value)) errors.deceased_dob = 'dobInvalid'
    else if (dob.value < DOB_MIN || dob.value > today || (dob.max !== null && dob.value > dob.max)) {
      errors.deceased_dob = 'dobOutOfRange'
    }
  }
  return errors
}

export async function fetchLetterProfile(client: SupabaseClient, userId: string): Promise<LetterProfileRow | null> {
  const { data, error } = await client.from('sender_profiles').select(PROFILE_COLUMNS).eq('user_id', userId).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as LetterProfileRow | null) ?? null
}

export async function saveLetterProfile(
  client: SupabaseClient,
  userId: string,
  input: LetterProfileInput
): Promise<LetterProfileRow> {
  const row: LetterProfileRow = {
    first_name: input.first_name.trim(),
    last_name: input.last_name.trim(),
    full_name: fullNameOf(input),
    address_line1: input.address_line1.trim(),
    address_line2: input.address_line2.trim() || null,
    postal_code: input.postal_code.trim(),
    city: input.city.trim(),
    relationship: input.relationship.trim() || null,
  }
  const { error } = await client.from('sender_profiles').upsert({ user_id: userId, ...row }, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
  return row
}

export async function fetchDossierIdentity(client: SupabaseClient): Promise<DossierIdentity | null> {
  const { data, error } = await client.rpc('my_dossier_identity')
  if (error) throw new Error(error.message)
  return (data as DossierIdentity | null) ?? null
}

/** Même lecture que DashboardPage : dernière roadmap de l'utilisateur, puis son questionnaire. */
export async function fetchLatestQuestionnaire(
  client: SupabaseClient,
  userId: string
): Promise<{ id: string; answers: Record<string, unknown> } | null> {
  const { data: roadmap, error: rError } = await client
    .from('roadmaps')
    .select('questionnaire_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (rError) throw new Error(rError.message)
  const questionnaireId = (roadmap as { questionnaire_id?: string } | null)?.questionnaire_id
  if (!questionnaireId) return null
  const { data, error } = await client.from('questionnaires').select('id, answers').eq('id', questionnaireId).maybeSingle()
  if (error) throw new Error(error.message)
  const row = data as { id: string; answers: Record<string, unknown> | null } | null
  return row ? { id: row.id, answers: row.answers ?? {} } : null
}

/**
 * Fusionne la date de naissance du défunt dans les réponses (même patron que deceased_department,
 * chantier 2a) ; null retire la clé. Retourne les réponses écrites.
 */
export async function saveDeceasedDob(
  client: SupabaseClient,
  questionnaireId: string,
  answers: Record<string, unknown>,
  dob: string | null
): Promise<Record<string, unknown>> {
  const next: Record<string, unknown> = { ...answers }
  if (dob) next.deceased_dob = dob
  else delete next.deceased_dob
  const { error } = await client.from('questionnaires').update({ answers: next }).eq('id', questionnaireId)
  if (error) throw new Error(error.message)
  return next
}
