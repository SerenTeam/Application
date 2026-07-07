import { STEPS_CATALOG, type StepTemplate } from '@/data/steps-catalog'
import { supabase } from '@/lib/supabase'

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

function isApplicable(step: StepTemplate, answers: QuestionnaireAnswers): boolean {
  const w = step.applicable_when

  if (w.relations?.length && !w.relations.includes(answers.relation)) return false
  if (w.has_notary !== undefined && w.has_notary !== answers.has_notary) return false
  if (w.deceased_was_employed !== undefined && w.deceased_was_employed !== answers.deceased_was_employed) return false
  if (w.deceased_was_tenant !== undefined && w.deceased_was_tenant !== answers.deceased_was_tenant) return false
  if (w.has_life_insurance !== undefined && w.has_life_insurance !== answers.has_life_insurance) return false
  if (w.has_joint_account !== undefined && w.has_joint_account !== answers.has_joint_account) return false

  return true
}

export function generateRoadmap(answers: QuestionnaireAnswers): StepTemplate[] {
  return STEPS_CATALOG
    .filter((step) => isApplicable(step, answers))
    .sort(
      (a, b) =>
        URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] || a.display_order - b.display_order
    )
}

export async function saveRoadmapToDb(
  userId: string,
  questionnaireId: string,
  steps: StepTemplate[]
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
      status: 'todo',
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
