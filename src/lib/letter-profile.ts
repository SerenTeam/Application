import type { SupabaseClient } from '@supabase/supabase-js'
import type { Lang } from '@/i18n'
import type { RelationV2 } from '@/types/questionnaire'
import { defaultRelationLabel, normalizeRelationLabel } from '@/lib/relation-labels'

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

/** Pré-remplissage quand aucun profil n'existe encore (noms saisis par la PF). */
export interface LetterProfileDefaults {
  firstName?: string
  lastName?: string
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
  | 'dobTooEarly'
  | 'dobAfterDeath'

export type LetterProfileField = keyof LetterProfileInput | 'deceased_dob'
export type LetterProfileErrors = Partial<Record<LetterProfileField, LetterProfileError>>

/** Nom écrit sur l'enveloppe (sender_profiles.full_name). */
export function fullNameOf(input: Pick<LetterProfileInput, 'first_name' | 'last_name'>): string {
  return `${input.first_name.trim()} ${input.last_name.trim()}`.trim()
}

/**
 * Valeurs de départ du formulaire du profil courrier (au montage, puis à chaque « Modifier ») : le
 * profil enregistré prime ; à défaut (aucun profil, ou profil du 2a sans prénom ni nom séparés), les
 * noms du dossier PF. Le lien saisi librement au 2a (« Fille ») est ramené à la forme proposée
 * équivalente ; sans lien enregistré, la forme unique (PACS) est choisie d'office.
 */
export function initialLetterProfileInput(
  profile: LetterProfileRow | null,
  defaults: LetterProfileDefaults | undefined,
  relation: RelationV2 | undefined
): LetterProfileInput {
  return {
    first_name: profile?.first_name ?? defaults?.firstName ?? '',
    last_name: profile?.last_name ?? defaults?.lastName ?? '',
    address_line1: profile?.address_line1 ?? '',
    address_line2: profile?.address_line2 ?? '',
    postal_code: profile?.postal_code ?? '',
    city: profile?.city ?? '',
    relationship: normalizeRelationLabel(relation, profile?.relationship ?? '') || defaultRelationLabel(relation),
  }
}

/**
 * Carte de rappel du tableau de bord (« Pré-remplissez vos courriers ») : affichée tant qu'aucun
 * profil v2 n'est enregistré. Un profil hérité du 2a n'a que `full_name`, sans prénom ni nom
 * séparés : ses courriers signeraient avec les noms du dossier PF, qui peuvent différer de
 * l'enveloppe. La carte invite donc aussi ces personnes à compléter leurs coordonnées.
 */
export function needsLetterProfileReminder(profile: LetterProfileRow | null): boolean {
  return !profile?.first_name
}

function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false
  const t = Date.parse(value)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === value
}

/**
 * Date de naissance (AAAA-MM-JJ) affichée dans l'interface, dans sa langue : « 14 mars 1941 » /
 * « 14 March 1941 ». Une date seule vaut minuit UTC : formatée en UTC, sinon la veille dans les
 * fuseaux négatifs (Antilles, Guyane). Valeur vide ou invalide : chaîne vide, jamais « Invalid Date ».
 */
export function formatDobForDisplay(iso: string, lang: Lang): string {
  if (!isRealIsoDate(iso)) return ''
  return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Date de naissance à réécrire ? Oui si elle diffère de la date enregistrée (`saved`), l'effacement
 * compris ; vide, null et absent se valent (aucune date).
 */
export function dobNeedsSave(dob: string, saved: string | null | undefined): boolean {
  return (dob || null) !== (saved || null)
}

/** Date du jour en LOCAL (pas toISOString, qui est en UTC — décale d'un jour dans les DOM/TOM). */
export function todayLocalIsoDate(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
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
  const relationship = input.relationship.trim()
  if (!relationship) errors.relationship = 'relationshipRequired'
  else if (relationship.length > LINE_MAX) errors.relationship = 'lineTooLong'
  if (dob && dob.value) {
    if (!isRealIsoDate(dob.value)) errors.deceased_dob = 'dobInvalid'
    else if (dob.value < DOB_MIN) errors.deceased_dob = 'dobTooEarly'
    else if (dob.value > (dob.max || todayLocalIsoDate())) errors.deceased_dob = 'dobAfterDeath'
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
  const { error } = await client
    .from('sender_profiles')
    .upsert({ user_id: userId, ...row, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
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
 * Fusionne un lot de champs dans les réponses (patron générique : deceased_dob,
 * deceased_department, …) — une valeur non nulle pose la clé, null la retire. Relit les réponses
 * juste avant d'écrire (au lieu d'un état déjà en mémoire, potentiellement périmé) pour ne pas
 * écraser une clé modifiée ailleurs entre-temps (deux onglets), et N'ÉCRIT RIEN quand le patch ne
 * change rien (chaque clé à valeur non nulle a déjà cette valeur, chaque clé à null est déjà
 * absente) — évite une écriture à chaque enregistrement du profil courrier alors que rien n'a
 * changé. Une erreur Supabase (lecture ou écriture) remonte son message tel quel ;
 * `questionnaire_not_found` (aucune ligne à la lecture) et `questionnaire_not_updated` (aucune
 * ligne touchée par l'écriture, ex. RLS) sont des codes techniques — les consommateurs affichent un
 * texte i18n. Retourne les réponses à jour (relues, patchées).
 */
export async function patchQuestionnaireAnswers(
  client: SupabaseClient,
  questionnaireId: string,
  patch: Record<string, string | null>
): Promise<Record<string, unknown>> {
  const { data, error: readError } = await client
    .from('questionnaires')
    .select('answers')
    .eq('id', questionnaireId)
    .maybeSingle()
  if (readError) throw new Error(readError.message)
  const row = data as { answers: Record<string, unknown> | null } | null
  if (!row) throw new Error('questionnaire_not_found')

  const current = row.answers ?? {}
  const changed = Object.entries(patch).some(([key, value]) =>
    value !== null ? current[key] !== value : Object.prototype.hasOwnProperty.call(current, key)
  )
  if (!changed) return { ...current }

  const next: Record<string, unknown> = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    if (value !== null) next[key] = value
    else delete next[key]
  }

  const { data: updated, error: writeError } = await client
    .from('questionnaires')
    .update({ answers: next })
    .eq('id', questionnaireId)
    .select('id')
  if (writeError) throw new Error(writeError.message)
  if (!updated || (Array.isArray(updated) && updated.length === 0)) throw new Error('questionnaire_not_updated')
  return next
}

/** Date de naissance du défunt seule — cas d'usage historique de patchQuestionnaireAnswers. */
export async function saveDeceasedDob(
  client: SupabaseClient,
  questionnaireId: string,
  dob: string | null
): Promise<Record<string, unknown>> {
  return patchQuestionnaireAnswers(client, questionnaireId, { deceased_dob: dob || null })
}
