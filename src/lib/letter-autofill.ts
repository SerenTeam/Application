import type { LetterGeneratorOptions } from '@/hooks/useLetterGenerator'
import type { RelationV2 } from '@/types/questionnaire'
import { defaultRelationLabel, normalizeRelationLabel } from '@/lib/relation-labels'
import type { DossierIdentity, LetterProfileRow } from '@/lib/letter-profile'

// Pré-remplissage des courriers (personnalisation v2, spec docs/design-personnalisation-v2.md
// §4.1) : priorités profil courrier → dossier PF → réponses. Fonction pure, sans réseau.
export interface LetterAutofill {
  userProfile: NonNullable<LetterGeneratorOptions['userProfile']>
  questionnaireData: NonNullable<LetterGeneratorOptions['questionnaireData']>
}

interface LetterAutofillSources {
  profile: LetterProfileRow | null
  dossier: DossierIdentity | null
  answers: Record<string, unknown>
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** Adresse sur une ligne, telle qu'écrite sous la signature : « 12 rue X, Bât. B, 33000 Bordeaux ». */
export function formatSenderAddress(
  profile: Pick<LetterProfileRow, 'address_line1' | 'address_line2' | 'postal_code' | 'city'>
): string {
  return [profile.address_line1, profile.address_line2, `${profile.postal_code} ${profile.city}`]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(', ')
}

export function buildLetterAutofill({ profile, dossier, answers }: LetterAutofillSources): LetterAutofill {
  const relation = text(answers.relation) as RelationV2 | undefined
  const address = profile ? formatSenderAddress(profile) : ''
  return {
    userProfile: {
      firstname: text(profile?.first_name) ?? text(dossier?.family_first_name),
      lastname: text(profile?.last_name) ?? text(dossier?.family_last_name),
      address: address || undefined,
      city: text(profile?.city),
      // Lien saisi librement au 2a (« Fille ») : ramené à la forme proposée, « fille », dans le courrier.
      relation: normalizeRelationLabel(relation, profile?.relationship ?? '') || defaultRelationLabel(relation) || undefined,
    },
    questionnaireData: {
      deceased_firstname: text(answers.deceased_firstname) ?? text(dossier?.deceased_first_name),
      deceased_lastname: text(answers.deceased_lastname) ?? text(dossier?.deceased_last_name),
      deceased_dob: text(answers.deceased_dob),
      deceased_dod: text(answers.deceased_dod) ?? text(dossier?.deceased_death_date),
    },
  }
}
