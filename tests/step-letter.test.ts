import { describe, it, expect } from 'vitest'
import { stepLetterTemplateId } from '@/lib/step-letter'
import { STEPS_CATALOG } from '@/data/steps-catalog'

// Le courrier d'une étape est figé en base à la création de la roadmap (steps.letter_template_id).
// Décision d'Arnaud (2026-09-28) : le tableau de bord masque un courrier que le catalogue ne
// propose plus sur l'étape, sans jamais en ajouter. Cas réel : sur main, l'étape syndic était
// affichée à tous (propriétaires, EHPAD, hébergés compris) avec le courrier bailleur, qui affirme
// que le défunt « était locataire ».

const step = (id: string) => STEPS_CATALOG.find((s) => s.id === id)

describe('stepLetterTemplateId — courrier affiché pour une étape d’une roadmap existante', () => {
  it('le courrier bailleur n’est plus affiché sur l’étape syndic d’une ancienne roadmap', () => {
    expect(step('logement-prevenir-syndic')).toBeDefined()
    expect(stepLetterTemplateId(step('logement-prevenir-syndic'), 'bailleur-notification')).toBeUndefined()
  })

  it('le courrier bailleur reste affiché sur « Résilier le bail »', () => {
    expect(stepLetterTemplateId(step('logement-resilier-bail'), 'bailleur-notification')).toBe('bailleur-notification')
  })

  // Même famille de défaut (2026-09-28) : le courrier banque-declaration-deces demande « le blocage
  // des comptes », à l'inverse du but de l'étape compte joint (continuer à l'utiliser, le transférer).
  it('le courrier de blocage des comptes n’est plus affiché sur l’étape compte joint d’une ancienne roadmap', () => {
    expect(step('banque-debloquer-compte-joint')).toBeDefined()
    expect(stepLetterTemplateId(step('banque-debloquer-compte-joint'), 'banque-declaration-deces')).toBeUndefined()
  })

  it('le courrier de blocage reste affiché sur les deux étapes qui déclarent le décès à une banque', () => {
    expect(stepLetterTemplateId(step('banque-declaration-principale'), 'banque-declaration-deces')).toBe('banque-declaration-deces')
    expect(stepLetterTemplateId(step('banque-autres-banques'), 'banque-declaration-deces')).toBe('banque-declaration-deces')
  })

  it('jamais d’ajout : une étape créée sans courrier n’en gagne pas un, même ajouté depuis au catalogue', () => {
    expect(step('logement-resiliation-telecom')?.letter_template_id).toBe('resiliation-telecom')
    expect(stepLetterTemplateId(step('logement-resiliation-telecom'), null)).toBeUndefined()
  })

  it('courrier remplacé au catalogue : l’ancien est masqué, le nouveau n’est pas ajouté', () => {
    expect(stepLetterTemplateId({ letter_template_id: 'nouveau-courrier' }, 'ancien-courrier')).toBeUndefined()
  })

  it('étape inconnue du catalogue : la valeur en base est conservée', () => {
    expect(stepLetterTemplateId(undefined, 'banque-declaration-deces')).toBe('banque-declaration-deces')
  })
})
