// Contrat v2 questionnaire → roadmap. Voir docs/design-questionnaire-v2.md.
// Toute modification doit respecter l'invariant testé dans tests/invariants.test.ts.

export type TriState = 'oui' | 'non' | 'ne_sait_pas'

export type RelationV2 =
  | 'conjoint_marie' | 'pacse' | 'concubin'
  | 'parent' | 'enfant' | 'frere_soeur' | 'autre'

export type StatutProfessionnel =
  | 'salarie' | 'fonctionnaire' | 'independant'
  | 'retraite' | 'demandeur_emploi' | 'sans_activite'

export type Logement = 'locataire' | 'proprietaire' | 'heberge_ou_autre'

export type Enfants = 'aucun' | 'majeurs' | 'mineurs'

export type OrganismeContacte =
  | 'banque' | 'assurance' | 'caf' | 'retraite'
  | 'employeur' | 'mutuelle' | 'cpam' | 'impots'

export interface QuestionnaireAnswersV2 {
  // Tronc commun
  relation: RelationV2
  deceased_firstname: string
  deceased_lastname: string
  deceased_dod: string // YYYY-MM-DD
  statut_professionnel: StatutProfessionnel
  logement: Logement
  enfants: Enfants
  has_notary: boolean
  has_life_insurance: TriState
  // Complémentaires (universelles)
  has_joint_account?: boolean // demandé à tous les profils (décision 2026-07-11)
  has_vehicle: boolean
  has_credits: boolean
  employait_aide_domicile: boolean
  contrat_obseques: TriState
  organismes_contactes: OrganismeContacte[]
}

// Conditions d'applicabilité (questions ET étapes) : clés = champs du contrat.
// Tableau = appartenance ; booléen = égalité stricte.
export interface ApplicableWhenV2 {
  relation?: RelationV2[]
  statut_professionnel?: StatutProfessionnel[]
  logement?: Logement[]
  enfants?: Enfants[]
  has_notary?: boolean
  has_life_insurance?: TriState[]
  contrat_obseques?: TriState[]
  has_joint_account?: boolean
  has_vehicle?: boolean
  has_credits?: boolean
  employait_aide_domicile?: boolean
}

// Garde de compilation : toute clé d'ApplicableWhenV2 doit exister dans le contrat.
// Si un champ du contrat est renommé sans mettre à jour les conditions, l'assignation
// ci-dessous devient never et la compilation échoue.
type ApplicableWhenKeyCheck = keyof ApplicableWhenV2 extends keyof QuestionnaireAnswersV2 ? true : never
export const APPLICABLE_WHEN_KEYS_VALID: ApplicableWhenKeyCheck = true
