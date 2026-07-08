import { describe, it, expect } from 'vitest'
// @ts-expect-error — module JS serveur
import { nextQuestion, validateAnswer, setAnswer, progress } from '../server/lib/questionnaire-engine.js'
// @ts-expect-error — module JS serveur
import { QUESTIONS_CATALOG } from '../server/lib/questions-catalog.js'

type Answers = Record<string, unknown>
const spec = (id: string) => QUESTIONS_CATALOG.find((q: { id: string }) => q.id === id)!

/** Répond automatiquement à toutes les questions avec des valeurs types. */
function runProfile(fixed: Answers): { sequence: string[]; answers: Answers } {
  const canned: Answers = {
    relation: 'parent', deceased_firstname: 'Pierre', deceased_lastname: 'Dupont',
    deceased_dod: '2026-04-10', statut_professionnel: 'retraite', logement: 'proprietaire',
    enfants: 'aucun', has_notary: false, has_life_insurance: 'ne_sait_pas',
    has_joint_account: true, has_vehicle: false, has_credits: false,
    employait_aide_domicile: false, contrat_obseques: 'non', organismes_contactes: [],
    ...fixed,
  }
  let answers: Answers = {}
  const sequence: string[] = []
  let q = nextQuestion(answers)
  while (q !== null) {
    sequence.push(q.id)
    answers = setAnswer(answers, q, canned[q.id])
    q = nextQuestion(answers)
    if (sequence.length > 20) throw new Error('boucle infinie')
  }
  return { sequence, answers }
}

describe('nextQuestion — séquences par profil', () => {
  it('conjoint marié : 15 questions, compte joint inclus, ordre croissant', () => {
    const { sequence } = runProfile({ relation: 'conjoint_marie' })
    expect(sequence).toHaveLength(15)
    expect(sequence).toContain('has_joint_account')
    expect(sequence[0]).toBe('relation')
    expect(sequence[sequence.length - 1]).toBe('organismes_contactes')
  })
  it('enfant du défunt : 14 questions, pas de compte joint', () => {
    const { sequence } = runProfile({ relation: 'enfant' })
    expect(sequence).toHaveLength(14)
    expect(sequence).not.toContain('has_joint_account')
  })
  it('null quand tout est répondu', () => {
    const { answers } = runProfile({})
    expect(nextQuestion(answers)).toBeNull()
  })
})

describe('validateAnswer', () => {
  it('select : accepte une valeur canonique, rejette le reste', () => {
    expect(validateAnswer(spec('relation'), 'parent').ok).toBe(true)
    expect(validateAnswer(spec('relation'), 'cousin').ok).toBe(false)
    expect(validateAnswer(spec('relation'), 'Père ou mère').ok).toBe(false) // label ≠ value
  })
  it('boolean / tristate', () => {
    expect(validateAnswer(spec('has_notary'), true).ok).toBe(true)
    expect(validateAnswer(spec('has_notary'), 'oui').ok).toBe(false)
    expect(validateAnswer(spec('has_life_insurance'), 'ne_sait_pas').ok).toBe(true)
    expect(validateAnswer(spec('has_life_insurance'), true).ok).toBe(false)
  })
  it('multiselect : sous-ensemble des options, vide accepté', () => {
    expect(validateAnswer(spec('organismes_contactes'), ['banque', 'caf']).ok).toBe(true)
    expect(validateAnswer(spec('organismes_contactes'), []).ok).toBe(true)
    expect(validateAnswer(spec('organismes_contactes'), ['pole_emploi']).ok).toBe(false)
    expect(validateAnswer(spec('organismes_contactes'), 'banque').ok).toBe(false)
  })
  it('multiselect : rejette les doublons', () => {
    expect(validateAnswer(spec('organismes_contactes'), ['banque', 'banque']).ok).toBe(false)
  })
  it('text : non vide, ≤ 200 caractères', () => {
    expect(validateAnswer(spec('deceased_firstname'), 'Pierre').ok).toBe(true)
    expect(validateAnswer(spec('deceased_firstname'), '   ').ok).toBe(false)
    expect(validateAnswer(spec('deceased_firstname'), 'x'.repeat(201)).ok).toBe(false)
  })
  it('text : la longueur est vérifiée sur la valeur trimée', () => {
    expect(validateAnswer(spec('deceased_firstname'), 'x'.repeat(195) + '          ').ok).toBe(true)
  })
  it('date : format ISO, pas dans le futur', () => {
    expect(validateAnswer(spec('deceased_dod'), '2026-04-10').ok).toBe(true)
    expect(validateAnswer(spec('deceased_dod'), '10/04/2026').ok).toBe(false)
    expect(validateAnswer(spec('deceased_dod'), '2999-01-01').ok).toBe(false)
  })
  it('date : rejette les dates calendaires impossibles', () => {
    expect(validateAnswer(spec('deceased_dod'), '2026-02-30').ok).toBe(false)
    expect(validateAnswer(spec('deceased_dod'), '2026-04-31').ok).toBe(false)
  })
  it('date : la date du jour passe, quel que soit le fuseau', () => {
    expect(validateAnswer(spec('deceased_dod'), new Date().toISOString().slice(0, 10)).ok).toBe(true)
  })
})

describe('setAnswer — purge des branches invalidées (correction au récap)', () => {
  it('changer relation conjoint→parent purge has_joint_account', () => {
    let answers: Answers = {}
    answers = setAnswer(answers, spec('relation'), 'conjoint_marie')
    // avance jusqu'à has_joint_account
    answers = { ...answers, deceased_firstname: 'P', deceased_lastname: 'D', deceased_dod: '2026-04-10',
      statut_professionnel: 'retraite', logement: 'locataire', enfants: 'aucun',
      has_notary: false, has_life_insurance: 'non' }
    answers = setAnswer(answers, spec('has_joint_account'), true)
    expect(answers.has_joint_account).toBe(true)
    // correction : plus conjoint → la branche devient inapplicable et sa réponse est purgée
    answers = setAnswer(answers, spec('relation'), 'parent')
    expect(answers.has_joint_account).toBeUndefined()
    expect(nextQuestion(answers)?.id).toBe('has_vehicle')
  })
  it('trim les valeurs texte', () => {
    expect(setAnswer({}, spec('deceased_firstname'), '  Pierre  ').deceased_firstname).toBe('Pierre')
  })
})

describe('progress', () => {
  it('reflète le total applicable et le courant, en pourcentage croissant', () => {
    let answers: Answers = {}
    const p0 = progress(answers)
    expect(p0.current).toBe(0)
    expect(p0.total).toBeGreaterThanOrEqual(14)
    answers = setAnswer(answers, spec('relation'), 'conjoint_marie')
    const p1 = progress(answers)
    expect(p1.current).toBe(1)
    expect(p1.total).toBe(15) // branche conjoint ouverte
  })
})
