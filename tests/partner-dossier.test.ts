import { describe, it, expect } from 'vitest'
import { canCancel, cancelDeadline, validateDossierForm, EMPTY_DOSSIER_FORM, type DossierFormValues } from '@/lib/partner-dossier'

// NOW est construit en heure LOCALE, et les `created_at` en découlent par soustraction : le
// formulaire compare des JOURS CALENDAIRES locaux (`isoDay`) à un instant. Figer NOW en UTC ferait
// basculer « date future » et « exactement 2 ans » d'un jour dans les fuseaux éloignés (TZ ≥ UTC+12),
// et le fichier passerait rouge selon la machine. Ici il est vert dans tous les fuseaux.
const NOW = new Date(2026, 8, 17, 12, 0, 0)
const agoIso = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const HOUR = 60 * 60 * 1000
const VALID: DossierFormValues = {
  family_first_name: 'Claire', family_last_name: 'Martin', family_email: 'claire.martin@exemple.fr', family_phone: '',
  deceased_first_name: 'Jean', deceased_last_name: 'Dupont', deceased_death_date: '2026-09-10',
}

describe('canCancel (48 h, invités seulement)', () => {
  it('invité créé il y a 47 h 59 : annulable', () => {
    expect(canCancel({ status: 'invited', created_at: agoIso(47 * HOUR + 59 * 60 * 1000) }, NOW)).toBe(true)
  })
  it('invité créé il y a exactement 48 h : NON annulable (borne SQL « created_at > now() - 48 h »)', () => {
    expect(canCancel({ status: 'invited', created_at: agoIso(48 * HOUR) }, NOW)).toBe(false)
  })
  it.each(['active', 'closed', 'cancelled'] as const)('statut %s : jamais annulable', (status) => {
    expect(canCancel({ status, created_at: agoIso(HOUR) }, NOW)).toBe(false)
  })
  it('date invalide : non annulable', () => {
    expect(canCancel({ status: 'invited', created_at: 'n/a' }, NOW)).toBe(false)
  })
  it('cancelDeadline = created_at + 48 h', () => {
    expect(cancelDeadline('2026-09-15T12:00:00Z').toISOString()).toBe('2026-09-17T12:00:00.000Z')
  })
})

describe('validateDossierForm (miroir des règles SQL)', () => {
  it('formulaire valide : aucune erreur', () => {
    expect(validateDossierForm(VALID, NOW)).toEqual({})
  })
  it('formulaire vide : tous les champs obligatoires signalés, téléphone optionnel', () => {
    expect(validateDossierForm(EMPTY_DOSSIER_FORM, NOW)).toEqual({
      family_first_name: 'required', family_last_name: 'required', family_email: 'required',
      deceased_first_name: 'required', deceased_last_name: 'required', deceased_death_date: 'required',
    })
  })
  it('espaces seuls = vide', () => {
    expect(validateDossierForm({ ...VALID, family_last_name: '   ' }, NOW).family_last_name).toBe('required')
  })
  it('nom de 101 caractères : tooLong', () => {
    expect(validateDossierForm({ ...VALID, deceased_last_name: 'x'.repeat(101) }, NOW).deceased_last_name).toBe('tooLong')
  })
  it.each(['claire', 'claire@', 'claire@exemple', 'cla ire@exemple.fr'])('e-mail « %s » : invalidEmail', (email) => {
    expect(validateDossierForm({ ...VALID, family_email: email }, NOW).family_email).toBe('invalidEmail')
  })
  it.each(['12345', 'abcdefgh'])('téléphone « %s » : invalidPhone', (phone) => {
    expect(validateDossierForm({ ...VALID, family_phone: phone }, NOW).family_phone).toBe('invalidPhone')
  })
  it('téléphone au format libre accepté : +33 (0)6 12-34.56', () => {
    expect(validateDossierForm({ ...VALID, family_phone: '+33 (0)6 12-34.56' }, NOW).family_phone).toBeUndefined()
  })
  it('date future : futureDate', () => {
    expect(validateDossierForm({ ...VALID, deceased_death_date: '2026-09-18' }, NOW).deceased_death_date).toBe('futureDate')
  })
  it('date de plus de 2 ans : tooOld ; exactement 2 ans : acceptée', () => {
    expect(validateDossierForm({ ...VALID, deceased_death_date: '2024-09-16' }, NOW).deceased_death_date).toBe('tooOld')
    expect(validateDossierForm({ ...VALID, deceased_death_date: '2024-09-17' }, NOW).deceased_death_date).toBeUndefined()
  })
})
