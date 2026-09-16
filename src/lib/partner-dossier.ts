// Espace PF (contrat §3.3.12, §4.4) : types des réponses /api/partner/* et règles de formulaire.
// Les règles MIROITENT celles de partner_create_dossier (la base reste seule juge) : elles évitent
// un aller-retour pour une faute de frappe, jamais elles n'autorisent quoi que ce soit.
//
// Règle rouge (contrat §1.1) : AUCUN de ces types ne porte de contenu du dossier famille —
// ni réponses au questionnaire, ni roadmap, ni courriers, ni documents, ni envois. Identité de
// la famille et du défunt, statuts et dates : rien d'autre ne doit y entrer.
export type DossierStatus = 'invited' | 'active' | 'closed' | 'cancelled'

export interface PartnerInfo { id: string; name: string; status: 'prospect' | 'active' | 'suspended' | 'terminated'; user_role: 'manager' | 'advisor' }

export interface PartnerDossier {
  id: string
  status: DossierStatus
  source: 'partner' | 'demo'
  family_first_name: string | null
  family_last_name: string | null
  family_email: string
  family_phone: string | null
  deceased_first_name: string | null
  deceased_last_name: string | null
  deceased_death_date: string | null
  created_at: string
  activated_at: string | null
  cancelled_at: string | null
  invite_expires_at: string | null
  invite_expired: boolean
  can_resend: boolean
  can_cancel: boolean
  cancel_deadline: string
}

export interface BillingPreviewData { billable_count: number; seren_due_ttc_cents: number; unit_due_ttc_cents: number; currency: 'EUR' }

export interface PartnerCountersData {
  month: string
  created_this_month: number
  created_total: number
  activated_total: number
  pending_activation: number
  expired_invitations: number
  cancelled_total: number
  activated_this_month: number
  billing_preview: BillingPreviewData | null
}

export interface DossierFormValues {
  family_first_name: string
  family_last_name: string
  family_email: string
  family_phone: string
  deceased_first_name: string
  deceased_last_name: string
  deceased_death_date: string
}

export type DossierFormField = keyof DossierFormValues
export type DossierFormErrorKey = 'required' | 'tooLong' | 'invalidEmail' | 'invalidPhone' | 'futureDate' | 'tooOld'

export const EMPTY_DOSSIER_FORM: DossierFormValues = {
  family_first_name: '', family_last_name: '', family_email: '', family_phone: '',
  deceased_first_name: '', deceased_last_name: '', deceased_death_date: '',
}

const CANCEL_WINDOW_MS = 48 * 60 * 60 * 1000
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const PHONE_RE = /^[0-9 +().-]{6,30}$/
const NAME_FIELDS: DossierFormField[] = ['family_first_name', 'family_last_name', 'deceased_first_name', 'deceased_last_name']

export function cancelDeadline(createdAt: string): Date {
  return new Date(new Date(createdAt).getTime() + CANCEL_WINDOW_MS)
}

export function canCancel(dossier: Pick<PartnerDossier, 'status' | 'created_at'>, now: Date = new Date()): boolean {
  const created = new Date(dossier.created_at).getTime()
  if (Number.isNaN(created)) return false
  return dossier.status === 'invited' && now.getTime() < created + CANCEL_WINDOW_MS
}

/** Jour calendaire local au format AAAA-MM-JJ (valeur de <input type="date">). */
export function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function validateDossierForm(values: DossierFormValues, today: Date = new Date()): Partial<Record<DossierFormField, DossierFormErrorKey>> {
  const errors: Partial<Record<DossierFormField, DossierFormErrorKey>> = {}
  for (const field of NAME_FIELDS) {
    const value = values[field].trim()
    if (!value) errors[field] = 'required'
    else if (value.length > 100) errors[field] = 'tooLong'
  }
  const email = values.family_email.trim().toLowerCase()
  if (!email) errors.family_email = 'required'
  else if (email.length > 254 || !EMAIL_RE.test(email)) errors.family_email = 'invalidEmail'

  const phone = values.family_phone.trim()
  if (phone && !PHONE_RE.test(phone)) errors.family_phone = 'invalidPhone'

  const date = values.deceased_death_date
  if (!date) {
    errors.deceased_death_date = 'required'
  } else {
    const twoYearsAgo = new Date(today)
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
    if (date > isoDay(today)) errors.deceased_death_date = 'futureDate'
    else if (date < isoDay(twoYearsAgo)) errors.deceased_death_date = 'tooOld'
  }
  return errors
}
