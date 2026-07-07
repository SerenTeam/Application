import { describe, it, expect } from 'vitest'
import { adaptAnswersV1toV2 } from '@/lib/answers-adapter'

const baseV1 = {
  relation: 'conjoint' as const,
  has_notary: true,
  organismes: ['banque', 'caf'] as ('banque' | 'caf')[],
  deceased_was_employed: true,
  deceased_was_tenant: false,
  has_life_insurance: true,
  has_joint_account: true,
  deceased_firstname: 'Pierre',
  deceased_lastname: 'Dupont',
  deceased_dod: '2026-04-10',
}

describe('adaptAnswersV1toV2', () => {
  it('mappe conjoint → conjoint_marie', () => {
    expect(adaptAnswersV1toV2(baseV1).relation).toBe('conjoint_marie')
  })
  it('conserve les autres relations', () => {
    expect(adaptAnswersV1toV2({ ...baseV1, relation: 'parent' }).relation).toBe('parent')
  })
  it('mappe employed → statut salarie / sans_activite', () => {
    expect(adaptAnswersV1toV2(baseV1).statut_professionnel).toBe('salarie')
    expect(adaptAnswersV1toV2({ ...baseV1, deceased_was_employed: false }).statut_professionnel).toBe('sans_activite')
  })
  it('mappe tenant → logement', () => {
    expect(adaptAnswersV1toV2({ ...baseV1, deceased_was_tenant: true }).logement).toBe('locataire')
    expect(adaptAnswersV1toV2(baseV1).logement).toBe('heberge_ou_autre')
  })
  it('mappe les booléens assurance vie en tri-état', () => {
    expect(adaptAnswersV1toV2(baseV1).has_life_insurance).toBe('oui')
    expect(adaptAnswersV1toV2({ ...baseV1, has_life_insurance: false }).has_life_insurance).toBe('non')
  })
  it('valeurs neutres pour les champs sans équivalent v1', () => {
    const v2 = adaptAnswersV1toV2(baseV1)
    expect(v2.enfants).toBe('aucun')
    expect(v2.has_vehicle).toBe(false)
    expect(v2.has_credits).toBe(false)
    expect(v2.employait_aide_domicile).toBe(false)
    expect(v2.contrat_obseques).toBe('non')
  })
  it('transmet identité et organismes', () => {
    const v2 = adaptAnswersV1toV2(baseV1)
    expect(v2.deceased_firstname).toBe('Pierre')
    expect(v2.organismes_contactes).toEqual(['banque', 'caf'])
  })
  it('filtre logement des organismes (géré par le champ logement en v2)', () => {
    expect(
      adaptAnswersV1toV2({ ...baseV1, organismes: ['banque', 'logement'] }).organismes_contactes
    ).toEqual(['banque'])
  })
})
