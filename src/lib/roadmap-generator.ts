import { getStepsCatalog, type StepTemplate } from '@/data/steps-catalog'
import type { QuestionnaireAnswersV2 } from '@/types/questionnaire'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Lang } from '@/i18n'
import { STRINGS_FR } from '@/i18n/strings.fr'
import { STRINGS_EN } from '@/i18n/strings.en'

// Module non-composant : pas d'accès à useT() (hook React). On résout directement
// dans le dictionnaire de la langue passée en paramètre — mêmes clés `errors.*` que
// l'UI, cohérence garantie par l'invariant de parité des dictionnaires (tsc).
const STRINGS = { fr: STRINGS_FR, en: STRINGS_EN }

const URGENCY_ORDER: Record<StepTemplate['urgency'], number> = {
  urgent: 0,
  week: 1,
  month: 2,
  later: 3,
}

export type RoadmapStep = StepTemplate & { initial_status: 'todo' | 'done' }

// Matcher générique : tableau = appartenance (ou, si la réponse est elle-même un tableau — question
// à cocher —, au moins une valeur commune), booléen = égalité stricte.
// Même sémantique que matchesWhen() dans server/lib/questionnaire-engine.js (dupliqué :
// le serveur JS ne peut pas importer ce module TS — garder les deux alignés).
// Exportée pour le test de parité tests/invariants.test.ts.
export function isApplicable(step: StepTemplate, answers: QuestionnaireAnswersV2): boolean {
  for (const [key, cond] of Object.entries(step.applicable_when)) {
    const val = (answers as unknown as Record<string, unknown>)[key]
    if (Array.isArray(cond)) {
      const accepted = cond as readonly unknown[]
      const hit = Array.isArray(val) ? val.some((v) => accepted.includes(v)) : accepted.includes(val)
      if (!hit) return false
    } else if (val !== cond) {
      return false
    }
  }
  return true
}

export function generateRoadmap(answers: QuestionnaireAnswersV2, lang: Lang = 'fr'): RoadmapStep[] {
  return getStepsCatalog(lang)
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

// Idempotente par questionnaire (une roadmap par questionnaire complété) : le « Réessayer »
// de QuestionnairePage repasse le même questionnaireId, donc un retry retrouve la roadmap
// déjà créée — même si la réponse de l'insert s'est perdue — au lieu d'en créer une seconde,
// et ne réinsère pas des étapes déjà sauvegardées. Pas de nettoyage compensatoire possible :
// la RLS n'accorde aucun DELETE sur roadmaps ni sur steps. Reste une course théorique — un
// retry lancé avant qu'une écriture initiale ne soit validée — que seule une contrainte
// d'unicité en base fermerait.
// Le client est injecté pour rester testable sans variables d'environnement.
export async function saveRoadmapToDb(
  client: SupabaseClient,
  userId: string,
  questionnaireId: string,
  steps: RoadmapStep[],
  lang: Lang = 'fr'
) {
  const t = STRINGS[lang]

  // La plus récente, comme le dashboard : la course ci-dessus peut laisser deux roadmaps pour
  // un même questionnaire, et sans limit(1) maybeSingle() ferait alors échouer chaque retry.
  const { data: existing, error: lookupError } = await client
    .from('roadmaps')
    .select('id')
    .eq('user_id', userId)
    .eq('questionnaire_id', questionnaireId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Recherche en échec : on ne sait pas si la roadmap existe, donc on ne crée rien à l'aveugle.
  if (lookupError) {
    throw new Error(t.errors.saveRoadmapFailed)
  }

  let roadmapId: string
  if (existing) {
    roadmapId = existing.id
    // Les étapes partent en un seul INSERT, atomique : s'il en existe une, elles y sont toutes.
    const { data: saved, error: checkError } = await client
      .from('steps')
      .select('id')
      .eq('roadmap_id', roadmapId)
      .limit(1)

    if (checkError) {
      throw new Error(t.errors.saveStepsFailed)
    }
    if (saved.length > 0) return roadmapId
  } else {
    const { data: roadmap, error: roadmapError } = await client
      .from('roadmaps')
      .insert({
        user_id: userId,
        questionnaire_id: questionnaireId,
        total_steps: steps.length,
      })
      .select()
      .single()

    if (roadmapError || !roadmap) {
      throw new Error(t.errors.saveRoadmapFailed)
    }
    roadmapId = roadmap.id
  }

  const { error: stepsError } = await client.from('steps').insert(
    steps.map((step, i) => ({
      roadmap_id: roadmapId,
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
    throw new Error(t.errors.saveStepsFailed)
  }

  return roadmapId
}
