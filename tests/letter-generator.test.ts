import { describe, it, expect } from 'vitest'
import { buildInitialValues, mergeAutoFilled } from '@/hooks/useLetterGenerator'
import { getLetterTemplate } from '@/data/letter-templates'

describe('buildInitialValues', () => {
  const template = getLetterTemplate('banque-declaration-deces')!

  it('remplit la ville et l’adresse depuis le profil courrier', () => {
    const values = buildInitialValues(template, {
      firstname: 'Camille',
      lastname: 'Roussel',
      address: '12 rue des Lilas, 33000 Bordeaux',
      relation: 'fille',
      city: 'Bordeaux',
    })
    expect(values.city).toBe('Bordeaux')
    expect(values.user_address).toBe('12 rue des Lilas, 33000 Bordeaux')
    expect(values.user_relation).toBe('fille')
  })
  it('date de naissance du défunt rédigée en toutes lettres', () => {
    const values = buildInitialValues(template, undefined, { deceased_dob: '1941-03-14' })
    expect(values.deceased_dob).toBe('14 mars 1941')
  })
})

describe('mergeAutoFilled', () => {
  it('les valeurs auto non vides remplacent, les vides n’effacent pas une saisie', () => {
    const prev = { organisme_name: 'Banque X', user_address: '', deceased_dob: '1941-03-14' }
    const auto = { user_address: '12 rue des Lilas, 33000 Bordeaux', deceased_dob: '' }
    expect(mergeAutoFilled(prev, auto)).toEqual({
      organisme_name: 'Banque X',
      user_address: '12 rue des Lilas, 33000 Bordeaux',
      deceased_dob: '1941-03-14',
    })
  })
  it('rien à changer : même référence (pas de rendu inutile)', () => {
    const prev = { city: 'Bordeaux' }
    expect(mergeAutoFilled(prev, { city: 'Bordeaux' })).toBe(prev)
  })
})
