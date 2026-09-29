import type { StepTemplate } from '@/data/steps-catalog'

// Courrier affiché pour une étape d'une roadmap existante. `steps.letter_template_id` est figé en
// base à la création de la roadmap : un courrier que le catalogue ne propose plus sur l'étape est
// masqué (ex. le courrier bailleur, qui affirme « était locataire », sur l'étape syndic), mais
// aucun courrier n'est jamais ajouté (décision d'Arnaud, 2026-09-28). Étape inconnue du catalogue :
// valeur en base conservée.
export function stepLetterTemplateId(
  catalogStep: Pick<StepTemplate, 'letter_template_id'> | undefined,
  storedLetterTemplateId: string | null
): string | undefined {
  if (!storedLetterTemplateId) return undefined
  if (!catalogStep) return storedLetterTemplateId
  return catalogStep.letter_template_id === storedLetterTemplateId ? storedLetterTemplateId : undefined
}
