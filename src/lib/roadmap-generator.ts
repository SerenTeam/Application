import { STEPS_CATALOG, type StepTemplate } from '@/data/steps-catalog'
import type { QuestionnaireAnswersV2 } from '@/types/questionnaire'
import { supabase } from '@/lib/supabase'

// Ré-export transitoire du contrat v1 (utilisé par l'ancien flux jusqu'au Plan 2)
export interface QuestionnaireAnswers {
  relation: 'conjoint' | 'parent' | 'enfant' | 'frere_soeur' | 'autre'
  has_notary: boolean
  organismes: ('banque' | 'assurance' | 'caf' | 'retraite' | 'employeur' | 'mutuelle' | 'logement' | 'cpam')[]
  deceased_was_employed: boolean
  deceased_was_tenant: boolean
  has_life_insurance: boolean
  has_joint_account: boolean
  deceased_firstname?: string
  deceased_lastname?: string
  deceased_dod?: string
}

const URGENCY_ORDER: Record<StepTemplate['urgency'], number> = {
  urgent: 0,
  week: 1,
  month: 2,
  later: 3,
}

export type RoadmapStep = StepTemplate & { initial_status: 'todo' | 'done' }

// Matcher générique : tableau = appartenance, booléen = égalité stricte.
// Même sémantique que matchesWhen() dans server/lib/questionnaire-engine.js (dupliqué :
// le serveur JS ne peut pas importer ce module TS — garder les deux alignés).
function isApplicable(step: StepTemplate, answers: QuestionnaireAnswersV2): boolean {
  for (const [key, cond] of Object.entries(step.applicable_when)) {
    const val = (answers as unknown as Record<string, unknown>)[key]
    if (Array.isArray(cond)) {
      if (!cond.includes(val as never)) return false
    } else if (val !== cond) {
      return false
    }
  }
  return true
}

export function generateRoadmap(answers: QuestionnaireAnswersV2): RoadmapStep[] {
  return STEPS_CATALOG
    .filter((step) => isApplicable(step, answers))
    .sort(
      (a, b) =>
        URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] || a.display_order - b.display_order
    )
    .map((step) => ({
      ...step,
      initial_status:
        step.organisme_key && answers.organismes_contactes.includes(step.organisme_key)
          ? 'done'
          : 'todo',
    }))
}

export async function saveRoadmapToDb(
  userId: string,
  questionnaireId: string,
  steps: RoadmapStep[]
) {
  const { data: roadmap, error: roadmapError } = await supabase
    .from('roadmaps')
    .insert({
      user_id: userId,
      questionnaire_id: questionnaireId,
      total_steps: steps.length,
    })
    .select()
    .single()

  if (roadmapError || !roadmap) {
    throw new Error('Impossible de sauvegarder votre roadmap. Veuillez réessayer.')
  }

  const { error: stepsError } = await supabase.from('steps').insert(
    steps.map((step, i) => ({
      roadmap_id: roadmap.id,
      user_id: userId,
      template_id: step.id,
      title: step.title,
      theme: step.theme,
      urgency: step.urgency,
      urgency_label: step.urgency_label,
      status: step.initial_status,
      display_order: i,
      letter_template_id: step.letter_template_id ?? null,
      warning_badge: step.warning_badge ?? null,
    }))
  )

  if (stepsError) {
    throw new Error('Impossible de sauvegarder les étapes. Veuillez réessayer.')
  }

  return roadmap.id as string
}
