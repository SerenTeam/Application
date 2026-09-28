import { describe, it, expect } from 'vitest'
import { relationLabelOptions, defaultRelationLabel } from '@/lib/relation-labels'

describe('relationLabelOptions — ce qu’est l’utilisateur pour le défunt', () => {
  const values = (r: Parameters<typeof relationLabelOptions>[0]) => relationLabelOptions(r)?.map((o) => o.value)

  it('inverse la relation : le défunt était « mon père ou ma mère » → fils / fille', () => {
    expect(values('parent')).toEqual(['fils', 'fille'])
    expect(values('enfant')).toEqual(['père', 'mère'])
  })
  it('couples et fratrie', () => {
    expect(values('conjoint_marie')).toEqual(['époux', 'épouse'])
    expect(values('pacse')).toEqual(['partenaire de PACS'])
    expect(values('concubin')).toEqual(['concubin', 'concubine'])
    expect(values('frere_soeur')).toEqual(['frère', 'sœur'])
  })
  it('« autre » ou relation inconnue → saisie libre (null)', () => {
    expect(relationLabelOptions('autre')).toBeNull()
    expect(relationLabelOptions(undefined)).toBeNull()
  })
  it('libellé FR = le mot seul ; libellé EN = le mot français suivi d’une glose', () => {
    const [fils] = relationLabelOptions('parent')!
    expect(fils.label.fr).toBe('fils')
    expect(fils.label.en).toBe('fils — son')
  })
})

describe('defaultRelationLabel', () => {
  it('seule la forme sans ambiguïté de genre est choisie d’office (PACS)', () => {
    expect(defaultRelationLabel('pacse')).toBe('partenaire de PACS')
    expect(defaultRelationLabel('parent')).toBe('')
    expect(defaultRelationLabel('autre')).toBe('')
    expect(defaultRelationLabel(undefined)).toBe('')
  })
})
