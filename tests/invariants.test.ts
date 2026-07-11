import { describe, it, expect } from 'vitest'
import { STEPS_CATALOG } from '@/data/steps-catalog'
import { isApplicable } from '@/lib/roadmap-generator'
import type { StepTemplate } from '@/data/steps-catalog'
import type { QuestionnaireAnswersV2 } from '@/types/questionnaire'
// @ts-expect-error — module JS serveur
import { QUESTIONS_CATALOG } from '../server/lib/questions-catalog.js'
// @ts-expect-error — module JS serveur
import { matchesWhen } from '../server/lib/questionnaire-engine.js'

// Champs d'identité : servent aux courriers et à la personnalisation, pas au filtrage.
const IDENTITY_FIELDS = ['deceased_firstname', 'deceased_lastname', 'deceased_dod']
// organismes_contactes est branché via organisme_key (statut done), pas via applicable_when.
const SPECIAL_FIELDS = ['organismes_contactes']

describe('invariant : pas de question morte, pas d’étape orpheline', () => {
  it('chaque question (hors identité/spécial) conditionne au moins une étape', () => {
    for (const q of QUESTIONS_CATALOG) {
      if (IDENTITY_FIELDS.includes(q.id) || SPECIAL_FIELDS.includes(q.id)) continue
      const used = STEPS_CATALOG.some((s) =>
        Object.prototype.hasOwnProperty.call(s.applicable_when, q.id)
      )
      expect(used, `question morte : ${q.id} ne conditionne aucune étape`).toBe(true)
    }
  })
  it('chaque condition d’étape correspond à une question du catalogue', () => {
    const questionIds = new Set(QUESTIONS_CATALOG.map((q: { id: string }) => q.id))
    for (const s of STEPS_CATALOG) {
      for (const key of Object.keys(s.applicable_when)) {
        expect(questionIds.has(key), `étape ${s.id} : condition "${key}" sans question`).toBe(true)
      }
    }
  })
  it('chaque valeur de organismes_contactes a une étape porteuse (organisme_key)', () => {
    const orgQuestion = QUESTIONS_CATALOG.find((q: { id: string }) => q.id === 'organismes_contactes')!
    for (const opt of orgQuestion.options) {
      expect(
        STEPS_CATALOG.some((s) => s.organisme_key === opt.value),
        `organisme sans étape : ${opt.value}`
      ).toBe(true)
    }
  })
  it('aucune condition en tableau vide (rendrait l’étape/question inatteignable)', () => {
    const allSpecs = [
      ...STEPS_CATALOG.map((s) => ({ kind: 'étape', id: s.id, when: s.applicable_when as Record<string, unknown> })),
      ...QUESTIONS_CATALOG.map((q: { id: string; applicable_when: Record<string, unknown> }) => ({ kind: 'question', id: q.id, when: q.applicable_when })),
    ]
    for (const { kind, id, when } of allSpecs) {
      for (const [key, cond] of Object.entries(when ?? {})) {
        if (Array.isArray(cond)) {
          expect(cond.length, `${kind} ${id} : condition "${key}" en tableau vide`).toBeGreaterThan(0)
        }
      }
    }
  })
  it('chaque valeur d\'option d\'une question conditionnelle influence ≥ 1 étape, sauf valeurs neutres documentées', () => {
    // Une valeur « neutre » signifie légitimement « rien à faire de plus » — liste exhaustive et volontaire.
    const NEUTRAL: Record<string, string[]> = {
      relation: ['parent', 'enfant', 'frere_soeur', 'autre'], // pacse/concubin pilotent le transfert de contrats (étape logement-transfert-contrats) ; les autres relations sont neutres par nature
      statut_professionnel: ['retraite', 'sans_activite'], // CARSAT/impôts déjà inconditionnels
      logement: ['heberge_ou_autre'],
      enfants: ['aucun', 'majeurs'], // pension d'orphelin = backlog éditorial futur
      has_life_insurance: ['non'],
      contrat_obseques: ['non'],
    }
    for (const q of QUESTIONS_CATALOG) {
      const values = q.options?.map((o: { value: string }) => o.value)
        ?? (q.type === 'tristate' ? ['oui', 'non', 'ne_sait_pas'] : null)
      if (!values || IDENTITY_FIELDS.includes(q.id) || SPECIAL_FIELDS.includes(q.id)) continue
      for (const v of values) {
        if (NEUTRAL[q.id]?.includes(v)) continue
        const used = STEPS_CATALOG.some((s) => {
          const cond = (s.applicable_when as Record<string, unknown>)[q.id]
          return Array.isArray(cond) && cond.includes(v)
        })
        expect(used, `valeur inerte non documentée : ${q.id}=${v}`).toBe(true)
      }
    }
  })
  it('chaque valeur de condition en tableau est une option valide de la question du même champ', () => {
    const TRISTATE_VALUES = ['oui', 'non', 'ne_sait_pas']
    const byId = Object.fromEntries(
      QUESTIONS_CATALOG.map((q: { id: string }) => [q.id, q])
    ) as Record<string, { type: string; options?: { value: string }[] }>
    const allSpecs = [
      ...STEPS_CATALOG.map((s) => ({ kind: 'étape', id: s.id, when: s.applicable_when as Record<string, unknown> })),
      ...QUESTIONS_CATALOG.map((q: { id: string; applicable_when: Record<string, unknown> }) => ({ kind: 'question', id: q.id, when: q.applicable_when })),
    ]
    for (const { kind, id, when } of allSpecs) {
      for (const [key, cond] of Object.entries(when ?? {})) {
        if (!Array.isArray(cond)) continue
        const question = byId[key]
        const validValues = question?.options
          ? question.options.map((o) => o.value)
          : question?.type === 'tristate'
            ? TRISTATE_VALUES
            : null
        expect(validValues, `${kind} ${id} : champ "${key}" sans options ni tristate`).not.toBeNull()
        for (const v of cond) {
          expect(validValues, `${kind} ${id} : valeur "${v}" inconnue pour "${key}"`).toContain(v)
        }
      }
    }
  })

})

describe('parité des matchers isApplicable (TS) ↔ matchesWhen (JS)', () => {
  // Table de cas couvrant : condition vide, appartenance enum (match/non-match/absent),
  // booléen (égalité/inégalité/absent), tristate en tableau, conditions combinées.
  const CASES: Array<{ when: Record<string, unknown>; answers: Record<string, unknown> }> = [
    { when: {}, answers: {} },
    { when: { relation: ['conjoint_marie'] }, answers: { relation: 'conjoint_marie' } },
    { when: { relation: ['conjoint_marie'] }, answers: { relation: 'parent' } },
    { when: { relation: ['conjoint_marie'] }, answers: {} },
    { when: { has_vehicle: true }, answers: { has_vehicle: true } },
    { when: { has_vehicle: true }, answers: { has_vehicle: false } },
    { when: { has_vehicle: false }, answers: {} },
    { when: { has_life_insurance: ['oui', 'ne_sait_pas'] }, answers: { has_life_insurance: 'ne_sait_pas' } },
    { when: { has_life_insurance: ['oui', 'ne_sait_pas'] }, answers: { has_life_insurance: 'non' } },
    { when: { statut_professionnel: ['salarie'], has_credits: true }, answers: { statut_professionnel: 'salarie', has_credits: true } },
    { when: { statut_professionnel: ['salarie'], has_credits: true }, answers: { statut_professionnel: 'salarie', has_credits: false } },
    { when: { relation: [] }, answers: {} },                                  // tableau vide : jamais applicable
    { when: { relation: ['conjoint_marie'] }, answers: { relation: null } },  // null ≠ undefined : doit rester non-match des deux côtés
  ]
  it('les deux matchers donnent le même résultat sur tous les cas', () => {
    for (const { when, answers } of CASES) {
      const step = { applicable_when: when } as unknown as StepTemplate
      const a = answers as unknown as QuestionnaireAnswersV2
      expect(
        isApplicable(step, a),
        `divergence sur when=${JSON.stringify(when)} answers=${JSON.stringify(answers)}`
      ).toBe(matchesWhen(when, answers))
    }
  })
})
