// TRANSITOIRE — supprimé au Plan 2 quand le serveur produira directement du v2.
// Convertit les réponses de l'ancien questionnaire (agent Mistral) vers le contrat v2
// pour que generateRoadmap() v2 fonctionne pendant la migration.
import type { QuestionnaireAnswers } from '@/lib/roadmap-generator'
import type { QuestionnaireAnswersV2 } from '@/types/questionnaire'

export function adaptAnswersV1toV2(v1: QuestionnaireAnswers): QuestionnaireAnswersV2 {
  return {
    relation: v1.relation === 'conjoint' ? 'conjoint_marie' : v1.relation,
    deceased_firstname: v1.deceased_firstname ?? '',
    deceased_lastname: v1.deceased_lastname ?? '',
    deceased_dod: v1.deceased_dod ?? '',
    statut_professionnel: v1.deceased_was_employed ? 'salarie' : 'sans_activite',
    // v1 ne distingue pas propriétaire : non-locataire → heberge_ou_autre (l'étape 'proprietaire' arrive avec le vrai flux v2)
    logement: v1.deceased_was_tenant ? 'locataire' : 'heberge_ou_autre',
    enfants: 'aucun',
    has_notary: v1.has_notary,
    has_life_insurance: v1.has_life_insurance ? 'oui' : 'non',
    has_joint_account: v1.has_joint_account,
    has_vehicle: false,
    has_credits: false,
    employait_aide_domicile: false,
    contrat_obseques: 'non',
    // 'logement' (bailleur) n'est plus un organisme v2 : piloté par logement:['locataire']
    organismes_contactes: (v1.organismes ?? []).filter(
      (o): o is Exclude<typeof o, 'logement'> => o !== 'logement'
    ),
  }
}
