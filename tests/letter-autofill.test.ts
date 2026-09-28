import { describe, it, expect } from 'vitest'
import { buildLetterAutofill, formatSenderAddress } from '@/lib/letter-autofill'
import type { DossierIdentity, LetterProfileRow } from '@/lib/letter-profile'

const PROFILE: LetterProfileRow = {
  first_name: 'Camille',
  last_name: 'Roussel',
  full_name: 'Camille Roussel',
  address_line1: '12 rue des Lilas',
  address_line2: null,
  postal_code: '33000',
  city: 'Bordeaux',
  relationship: 'fille',
}
const DOSSIER: DossierIdentity = {
  family_first_name: 'Camille',
  family_last_name: 'Martin',
  deceased_first_name: 'Bernard',
  deceased_last_name: 'Roussel',
  deceased_death_date: '2026-09-12',
}
const ANSWERS = {
  relation: 'parent',
  deceased_firstname: 'Bernard',
  deceased_lastname: 'Roussel',
  deceased_dod: '2026-09-12',
  deceased_dob: '1941-03-14',
}

describe('formatSenderAddress', () => {
  it('une seule ligne, complément omis quand il est vide', () => {
    expect(formatSenderAddress(PROFILE)).toBe('12 rue des Lilas, 33000 Bordeaux')
  })
  it('avec complément d’adresse', () => {
    expect(formatSenderAddress({ ...PROFILE, address_line2: 'Bât. B' })).toBe('12 rue des Lilas, Bât. B, 33000 Bordeaux')
  })
})

describe('buildLetterAutofill', () => {
  it('profil complet : identité et adresse du profil, défunt des réponses', () => {
    const a = buildLetterAutofill({ profile: PROFILE, dossier: DOSSIER, answers: ANSWERS })
    expect(a.userProfile).toEqual({
      firstname: 'Camille',
      lastname: 'Roussel',
      address: '12 rue des Lilas, 33000 Bordeaux',
      city: 'Bordeaux',
      relation: 'fille',
    })
    expect(a.questionnaireData).toEqual({
      deceased_firstname: 'Bernard',
      deceased_lastname: 'Roussel',
      deceased_dob: '1941-03-14',
      deceased_dod: '2026-09-12',
    })
  })
  it('sans profil : prénom et nom viennent du dossier PF ; adresse, ville et lien restent vides', () => {
    const a = buildLetterAutofill({ profile: null, dossier: DOSSIER, answers: ANSWERS })
    expect(a.userProfile).toEqual({ firstname: 'Camille', lastname: 'Martin', address: undefined, city: undefined, relation: undefined })
  })
  it('profil hérité du 2a (sans first_name/last_name) : repli sur le dossier pour les noms', () => {
    const legacy = { ...PROFILE, first_name: null, last_name: null }
    const a = buildLetterAutofill({ profile: legacy, dossier: DOSSIER, answers: ANSWERS })
    expect(a.userProfile.firstname).toBe('Camille')
    expect(a.userProfile.lastname).toBe('Martin')
    expect(a.userProfile.address).toBe('12 rue des Lilas, 33000 Bordeaux')
  })
  it('lien par défaut : « partenaire de PACS » sans profil, rien pour une relation à deux formes', () => {
    expect(buildLetterAutofill({ profile: null, dossier: null, answers: { relation: 'pacse' } }).userProfile.relation).toBe('partenaire de PACS')
    expect(buildLetterAutofill({ profile: null, dossier: null, answers: { relation: 'parent' } }).userProfile.relation).toBeUndefined()
  })
  it('réponses sans identité (dossier ancien) : repli sur le dossier PF', () => {
    const a = buildLetterAutofill({ profile: null, dossier: DOSSIER, answers: {} })
    expect(a.questionnaireData).toEqual({
      deceased_firstname: 'Bernard',
      deceased_lastname: 'Roussel',
      deceased_dob: undefined,
      deceased_dod: '2026-09-12',
    })
  })
  it('relation « pacse » : la forme par défaut n’écrase jamais un lien déjà enregistré', () => {
    const profile = { ...PROFILE, relationship: 'compagne' }
    expect(buildLetterAutofill({ profile, dossier: null, answers: { relation: 'pacse' } }).userProfile.relation).toBe('compagne')
  })
  it('lien saisi librement au 2a (« Fille ») : écrit « fille » dans les courriers', () => {
    const legacy = { ...PROFILE, relationship: 'Fille' }
    expect(buildLetterAutofill({ profile: legacy, dossier: null, answers: { relation: 'parent' } }).userProfile.relation).toBe('fille')
  })
  it('chaînes vides ou blanches traitées comme absentes', () => {
    const a = buildLetterAutofill({ profile: { ...PROFILE, relationship: '  ' }, dossier: null, answers: { relation: 'parent', deceased_dob: '' } })
    expect(a.userProfile.relation).toBeUndefined()
    expect(a.questionnaireData.deceased_dob).toBeUndefined()
  })
})
