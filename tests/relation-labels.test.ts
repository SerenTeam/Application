import { describe, it, expect } from 'vitest'
import {
  relationLabelOptions,
  defaultRelationLabel,
  normalizeRelationLabel,
  isFreeRelationLabel,
} from '@/lib/relation-labels'
import type { RelationV2 } from '@/types/questionnaire'

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
  it('clé héritée du prototype (« constructor », « hasOwnProperty ») → aucune option, jamais d’exception', () => {
    expect(relationLabelOptions('constructor' as unknown as RelationV2)).toBeNull()
    expect(relationLabelOptions('hasOwnProperty' as unknown as RelationV2)).toBeNull()
  })
})

describe('defaultRelationLabel', () => {
  it('seule la forme sans ambiguïté de genre est choisie d’office (PACS)', () => {
    expect(defaultRelationLabel('pacse')).toBe('partenaire de PACS')
    expect(defaultRelationLabel('parent')).toBe('')
    expect(defaultRelationLabel('autre')).toBe('')
    expect(defaultRelationLabel(undefined)).toBe('')
  })
  it('clé héritée du prototype → saisie libre, jamais d’exception', () => {
    expect(defaultRelationLabel('constructor' as unknown as RelationV2)).toBe('')
    expect(defaultRelationLabel('hasOwnProperty' as unknown as RelationV2)).toBe('')
  })
})

describe('normalizeRelationLabel — lien enregistré relu dans le formulaire', () => {
  it('ramène une saisie libre du 2a à la forme proposée (casse et accents ignorés)', () => {
    expect(normalizeRelationLabel('parent', 'Fille')).toBe('fille')
    expect(normalizeRelationLabel('enfant', ' Pere ')).toBe('père')
    expect(normalizeRelationLabel('conjoint_marie', 'EPOUSE')).toBe('épouse')
  })
  it('ne confond pas deux formes distinctes', () => {
    expect(normalizeRelationLabel('conjoint_marie', 'époux')).toBe('époux')
    expect(normalizeRelationLabel('parent', 'fils')).toBe('fils')
  })
  it('« Soeur » tapé sans œ (clavier courant) retrouve « sœur »', () => {
    expect(normalizeRelationLabel('frere_soeur', 'Soeur')).toBe('sœur')
  })
  it('garde tel quel, sans espaces autour, un lien hors des formes proposées', () => {
    expect(normalizeRelationLabel('parent', ' neveu ')).toBe('neveu')
    expect(normalizeRelationLabel('autre', 'ami')).toBe('ami')
    expect(normalizeRelationLabel(undefined, 'petite-fille')).toBe('petite-fille')
  })
  it('vide reste vide', () => {
    expect(normalizeRelationLabel('parent', '   ')).toBe('')
  })
})

describe('isFreeRelationLabel — saisie libre ou boutons', () => {
  it('saisie libre quand aucune forme n’est proposée', () => {
    expect(isFreeRelationLabel('autre', '')).toBe(true)
    expect(isFreeRelationLabel(undefined, 'fille')).toBe(true)
  })
  it('boutons quand le lien est vide ou fait partie des formes proposées', () => {
    expect(isFreeRelationLabel('parent', '')).toBe(false)
    expect(isFreeRelationLabel('parent', 'fille')).toBe(false)
  })
  it('saisie libre pour un lien enregistré hors des formes proposées (il reste visible)', () => {
    expect(isFreeRelationLabel('parent', 'neveu')).toBe(true)
    expect(isFreeRelationLabel('enfant', 'fille')).toBe(true) // relation changée par un nouveau questionnaire
  })
  it('une valeur non normalisée (« Fille ») reste en saisie libre, donc visible', () => {
    expect(isFreeRelationLabel('parent', 'Fille')).toBe(true)
  })
})
