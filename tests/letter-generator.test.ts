import { describe, it, expect, afterEach } from 'vitest'
import { buildInitialValues, mergeAutoFilled, pickChangedAuto, createAutoSync } from '@/hooks/useLetterGenerator'
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

  // Non-régression I1 : une date seule (AAAA-MM-JJ) est minuit UTC. Sous un fuseau négatif
  // (Martinique, Guadeloupe — départements couverts), la formater en heure locale la faisait
  // reculer d'un jour ; un courrier papier part sans retour possible.
  describe('dates sous un fuseau négatif (TZ=America/Martinique)', () => {
    const originalTz = process.env.TZ

    afterEach(() => {
      if (originalTz === undefined) delete process.env.TZ
      else process.env.TZ = originalTz
    })

    it('deceased_dob et deceased_dod restent le bon jour', () => {
      process.env.TZ = 'America/Martinique'
      const values = buildInitialValues(template, undefined, { deceased_dob: '1941-03-14', deceased_dod: '2026-09-12' })
      expect(values.deceased_dob).toBe('14 mars 1941')
      expect(values.deceased_dod).toBe('12 septembre 2026')
    })

    it('une date invalide ne produit jamais « Invalid Date »', () => {
      process.env.TZ = 'America/Martinique'
      const values = buildInitialValues(template, undefined, { deceased_dob: 'pas-une-date' })
      expect(values.deceased_dob).toBe('')
    })
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

describe('pickChangedAuto', () => {
  it('montage (prevAuto null) : rien à rejouer, l’état initial vient déjà de ces sources', () => {
    expect(pickChangedAuto(null, { city: 'Mérignac', user_address: '1 rue A, 33700 Mérignac' })).toEqual({})
  })
  it('seules les clés dont la valeur a changé sont retenues', () => {
    const prevAuto = { city: 'Mérignac', user_address: '1 rue A, 33700 Mérignac' }
    const auto = { city: 'Mérignac', user_address: '2 rue B, 33700 Mérignac' }
    expect(pickChangedAuto(prevAuto, auto)).toEqual({ user_address: '2 rue B, 33700 Mérignac' })
  })
  it('une clé qui repasse à vide est retenue ici (c’est mergeAutoFilled qui l’ignorera ensuite)', () => {
    expect(pickChangedAuto({ city: 'Mérignac' }, { city: '' })).toEqual({ city: '' })
  })
})

// Câblage testable de la resynchro (re-revue I2) : le hook garde ce suivi dans un useState au lieu
// d'un useRef manipulé à l'intérieur de l'updater passé à setValues — un updater peut être
// double-invoqué par React en StrictMode, ce qui aurait avancé le suivi deux fois pour un seul
// changement réel et fait disparaître la resynchronisation en silence.
describe('createAutoSync', () => {
  it('1er appel : {} (montage) ; 2e appel : seule la clé changée ; 3e appel identique : {} (mémorisé)', () => {
    const autoSync = createAutoSync()
    const v1 = { city: 'Mérignac', user_address: '1 rue A, 33700 Mérignac' }
    expect(autoSync(v1)).toEqual({})

    const v2 = { city: 'Mérignac', user_address: '2 rue B, 33700 Mérignac' }
    expect(autoSync(v2)).toEqual({ user_address: '2 rue B, 33700 Mérignac' })

    // Même valeurs qu'à l'appel précédent : la mémorisation du 2e appel doit être prise en compte.
    expect(autoSync(v2)).toEqual({})
  })
})

// I2 : un changement sur une source SANS RAPPORT avec un champ ne doit jamais réappliquer sa
// dernière valeur auto et écraser une correction manuelle faite pour CE courrier précis.
describe('resynchronisation sélective (I2) — buildInitialValues + pickChangedAuto + mergeAutoFilled', () => {
  it('une correction manuelle de ville survit à un changement d’adresse du profil', () => {
    const template = getLetterTemplate('banque-declaration-deces')!
    const profileV1 = {
      firstname: 'Camille',
      lastname: 'Roussel',
      address: '1 rue des Lilas, 33700 Mérignac',
      city: 'Mérignac',
      relation: 'fille',
    }
    // Seule l'adresse change ; la ville du profil reste « Mérignac ».
    const profileV2 = { ...profileV1, address: '9 rue Neuve, 33700 Mérignac' }

    // Montage : les valeurs initiales viennent déjà du profil v1.
    let values = buildInitialValues(template, profileV1)
    let lastAuto: Record<string, string> | null = null
    let auto = buildInitialValues(template, profileV1)
    values = mergeAutoFilled(values, pickChangedAuto(lastAuto, auto))
    lastAuto = auto

    // La personne corrige la ville de CE courrier.
    values = { ...values, city: 'Bordeaux' }

    // Elle enregistre ensuite seulement une nouvelle adresse sur son profil.
    auto = buildInitialValues(template, profileV2)
    values = mergeAutoFilled(values, pickChangedAuto(lastAuto, auto))
    lastAuto = auto

    expect(values.city).toBe('Bordeaux') // pas écrasée par un changement sans rapport
    expect(values.user_address).toBe('9 rue Neuve, 33700 Mérignac') // suit bien sa propre source
  })
})
