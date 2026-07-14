import type { ApplicableWhenV2, OrganismeContacte } from '@/types/questionnaire'
import type { Lang } from '@/i18n'
import { STEPS_CATALOG_FR } from './steps-catalog.fr'
import { STEPS_CATALOG_EN } from './steps-catalog.en'

export interface StepTemplate {
  id: string
  title: string
  description: string
  theme: 'banque' | 'numerique' | 'obseques' | 'succession' | 'administratif' | 'assurance' | 'logement' | 'fiscal'
  urgency: 'urgent' | 'week' | 'month' | 'later'
  urgency_label: string
  when_to_do: string
  why_to_do: string
  what_you_do: string[]
  what_notary_does?: string
  responsable: 'vous' | 'notaire' | 'partage'
  warning_badge?: string
  requires_notary: boolean
  applicable_when: ApplicableWhenV2
  organisme_key?: OrganismeContacte   // si présent : étape pré-cochée quand l'organisme a déjà été contacté
  source_url?: string                  // source officielle (service-public.fr, CNIL…)
  letter_template_id?: string
  display_order: number
}

// Résout le catalogue d'étapes de la langue active. Les deux tableaux sont jumeaux :
// mêmes id/ordre/champs structurels, seuls les textes diffèrent (invariant de parité
// dans tests/invariants.test.ts).
export function getStepsCatalog(lang: Lang): StepTemplate[] {
  return lang === 'en' ? STEPS_CATALOG_EN : STEPS_CATALOG_FR
}

// Compatibilité : les consommateurs structurels (invariants, générateur par défaut)
// restent sur le FR — l'id/ordre/champs structurels sont identiques dans les deux langues.
export const STEPS_CATALOG: StepTemplate[] = STEPS_CATALOG_FR

