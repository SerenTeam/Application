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

describe("invariant : pas de question morte, pas d'etape orpheline", () => {
  it("chaque question (hors identite/special) conditionne au moins une etape", () => {
    for (const q of QUESTIONS_CATALOG) {
      if (IDENTITY_FIELDS.includes(q.id) || SPECIAL_FIELDS.includes(q.id)) continue
      const used = STEPS_CATALOG.some((s) =>
        Object.prototype.hasOwnProperty.call(s.applicable_when, q.id)
      )
      expect(used, `question morte : ${q.id} ne conditionne aucune étape`).toBe(true)
    }
  })
  it("chaque condition d'etape correspond a une question du catalogue", () => {
    const questionIds = new Set(QUESTIONS_CATALOG.map((q: { id: string }) => q.id))
    for (const s of STEPS_CATALOG) {
      for (const key of Object.keys(s.applicable_when)) {
        expect(questionIds.has(key), `etape ${s.id} : condition "${key}" sans question`).toBe(true)
      }
    }
  })
  it("chaque valeur de organismes_contactes a une etape porteuse (organisme_key)", () => {
    const orgQuestion = QUESTIONS_CATALOG.find((q: { id: string }) => q.id === 'organismes_contactes')!
    for (const opt of orgQuestion.options) {
      expect(
        STEPS_CATALOG.some((s) => s.organisme_key === opt.value),
        `organisme sans etape : ${opt.value}`
      ).toBe(true)
    }
  })
})

describe("parite des matchers isApplicable (TS) vs matchesWhen (JS)", () => {
  // Table de cas couvrant : condition vide, appartenance enum (match/non-match/absent),
  // booleen (egalite/inegalite/absent), tristate en tableau, conditions combinees.
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
  ]
  it("les deux matchers donnent le meme resultat sur tous les cas", () => {
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
