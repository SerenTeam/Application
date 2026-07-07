import type { QuestionData } from '@/components/questionnaire/QuestionCard'

export interface DeterministicQuestion extends QuestionData {
  answer_key: keyof import('@/lib/roadmap-generator').QuestionnaireAnswers
}

const QUESTIONS: DeterministicQuestion[] = [
  {
    question_id: 'relation',
    question: 'Quel est votre lien avec la personne decedee ?',
    type: 'select',
    options: ['Conjoint(e)', 'Parent', 'Enfant', 'Frere / Soeur', 'Autre'],
    aide: 'Cette information nous permet d\'adapter les demarches a votre situation.',
    categorie: 'Situation personnelle',
    obligatoire: true,
    answer_key: 'relation',
  },
  {
    question_id: 'deceased_firstname',
    question: 'Quel est le prenom de la personne decedee ?',
    type: 'text',
    categorie: 'Situation personnelle',
    obligatoire: false,
    answer_key: 'deceased_firstname',
  },
  {
    question_id: 'deceased_lastname',
    question: 'Quel est le nom de famille de la personne decedee ?',
    type: 'text',
    categorie: 'Situation personnelle',
    obligatoire: false,
    answer_key: 'deceased_lastname',
  },
  {
    question_id: 'deceased_dod',
    question: 'Quelle est la date du deces ?',
    type: 'date',
    aide: 'Certaines demarches sont soumises a des delais legaux a compter de cette date.',
    categorie: 'Situation personnelle',
    obligatoire: false,
    answer_key: 'deceased_dod',
  },
  {
    question_id: 'has_notary',
    question: 'Avez-vous deja un notaire en charge de la succession ?',
    type: 'boolean',
    aide: 'Si ce n\'est pas encore le cas, nous vous guiderons dans cette demarche.',
    categorie: 'Succession',
    obligatoire: true,
    answer_key: 'has_notary',
  },
  {
    question_id: 'deceased_was_employed',
    question: 'La personne decedee exercait-elle une activite professionnelle ?',
    type: 'boolean',
    aide: 'Des demarches specifiques sont necessaires aupres de l\'employeur.',
    categorie: 'Situation professionnelle',
    obligatoire: true,
    answer_key: 'deceased_was_employed',
  },
  {
    question_id: 'deceased_was_tenant',
    question: 'La personne decedee etait-elle locataire de son logement ?',
    type: 'boolean',
    aide: 'Des demarches specifiques existent pour le bail et le depot de garantie.',
    categorie: 'Logement',
    obligatoire: true,
    answer_key: 'deceased_was_tenant',
  },
  {
    question_id: 'has_life_insurance',
    question: 'La personne decedee avait-elle une assurance vie ?',
    type: 'boolean',
    aide: 'Si vous n\'etes pas certain(e), repondez Non. Vous pourrez modifier cette information plus tard.',
    categorie: 'Assurances',
    obligatoire: true,
    answer_key: 'has_life_insurance',
  },
  {
    question_id: 'has_joint_account',
    question: 'Aviez-vous un compte bancaire joint avec la personne decedee ?',
    type: 'boolean',
    aide: 'Les comptes joints font l\'objet de demarches bancaires particulieres.',
    categorie: 'Banque',
    obligatoire: true,
    answer_key: 'has_joint_account',
  },
  {
    question_id: 'organismes',
    question: 'Quels organismes devez-vous prevenir ?',
    type: 'multiselect',
    options: [
      'Banque',
      'Assurance',
      'CAF',
      'Caisse de retraite',
      'Employeur',
      'Mutuelle',
      'Bailleur / Logement',
      'CPAM (Securite sociale)',
    ],
    aide: 'Selectionnez tous les organismes concernes. Nous genererons les courriers correspondants.',
    categorie: 'Organismes',
    obligatoire: true,
    answer_key: 'organismes',
  },
]

export const TOTAL_QUESTIONS = QUESTIONS.length

export function getQuestion(index: number): DeterministicQuestion | null {
  return QUESTIONS[index] ?? null
}

export function getAllQuestions(): DeterministicQuestion[] {
  return QUESTIONS
}
