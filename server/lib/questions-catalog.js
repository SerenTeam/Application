// Catalogue des questions du questionnaire v2 — données pures.
// Miroir du patron src/data/steps-catalog.ts. Voir docs/design-questionnaire-v2.md.
// Règle d'or : chaque question conditionne ≥ 1 étape (testé par tests/invariants.test.ts).
// Les fallback_text ({prenom} interpolé) s'affichent si le rédacteur LLM échoue.

/**
 * @typedef {Object} QuestionSpec
 * @property {string} id - clé du champ QuestionnaireAnswersV2
 * @property {'select'|'multiselect'|'boolean'|'tristate'|'text'|'date'} type
 * @property {{value: string, label: string}[]=} options - canoniques, jamais générées par le LLM
 * @property {Object} applicable_when - conditions sur les réponses antérieures
 * @property {boolean} obligatoire
 * @property {{question: string, aide?: string}} fallback_text
 * @property {string=} writer_hints - contexte métier pour le rédacteur LLM
 * @property {string} categorie
 * @property {number} order
 */

/** @type {QuestionSpec[]} */
export const QUESTIONS_CATALOG = [
  {
    id: 'relation',
    type: 'select',
    options: [
      { value: 'conjoint_marie', label: 'Mon époux / mon épouse' },
      { value: 'pacse', label: 'Mon/ma partenaire de PACS' },
      { value: 'concubin', label: 'Mon compagnon / ma compagne' },
      { value: 'parent', label: 'Mon père ou ma mère' },
      { value: 'enfant', label: 'Mon fils ou ma fille' },
      { value: 'frere_soeur', label: 'Mon frère ou ma sœur' },
      { value: 'autre', label: 'Un autre lien' },
    ],
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: 'Pour commencer, quel était votre lien avec la personne qui vous a quitté ?',
      aide: 'Votre lien de parenté détermine plusieurs de vos droits, comme la pension de réversion pour les époux.',
    },
    writer_hints: 'Première question : accueillir avec douceur, poser le cadre bienveillant de l\'accompagnement.',
    categorie: 'Votre situation',
    order: 1,
  },
  {
    id: 'deceased_firstname',
    type: 'text',
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: 'Quel était son prénom ?',
      aide: 'Son prénom nous permet de personnaliser votre parcours et de pré-remplir vos courriers.',
    },
    writer_hints: 'Adapter à la relation donnée (ex. « Quel était le prénom de votre époux ? »).',
    categorie: 'Votre situation',
    order: 2,
  },
  {
    id: 'deceased_lastname',
    type: 'text',
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: 'Et son nom de famille ?',
      aide: 'Le nom complet est nécessaire pour les courriers officiels.',
    },
    writer_hints: 'Utiliser le prénom désormais connu.',
    categorie: 'Votre situation',
    order: 3,
  },
  {
    id: 'deceased_dod',
    type: 'date',
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: 'À quelle date {prenom} est-il/elle décédé(e) ?',
      aide: 'Cette date nous permet de calculer les délais légaux de chaque démarche.',
    },
    categorie: 'Votre situation',
    order: 4,
  },
  {
    id: 'statut_professionnel',
    type: 'select',
    options: [
      { value: 'salarie', label: 'Salarié(e)' },
      { value: 'fonctionnaire', label: 'Fonctionnaire' },
      { value: 'independant', label: 'Indépendant(e) ou chef d\'entreprise' },
      { value: 'retraite', label: 'Retraité(e)' },
      { value: 'demandeur_emploi', label: 'En recherche d\'emploi' },
      { value: 'sans_activite', label: 'Sans activité professionnelle' },
    ],
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: 'Quelle était la situation professionnelle de {prenom} ?',
      aide: 'Elle détermine les organismes à prévenir : employeur, caisses de retraite, URSSAF…',
    },
    writer_hints: 'Si salarié : mentionner que la prévoyance d\'entreprise peut ouvrir droit à un capital décès, parfois important.',
    categorie: 'Sa situation',
    order: 5,
  },
  {
    id: 'logement',
    type: 'select',
    options: [
      { value: 'locataire', label: 'Locataire de son logement' },
      { value: 'proprietaire', label: 'Propriétaire de son logement' },
      { value: 'heberge_ou_autre', label: 'Hébergé(e) ou autre situation' },
    ],
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: 'Concernant son logement, {prenom} était plutôt…',
      aide: 'Locataire : le bail peut être résilié avec un préavis réduit à 1 mois. Propriétaire : le notaire établira une attestation immobilière.',
    },
    categorie: 'Sa situation',
    order: 6,
  },
  {
    id: 'enfants',
    type: 'select',
    options: [
      { value: 'aucun', label: 'Non, pas d\'enfant' },
      { value: 'majeurs', label: 'Oui, tous majeurs' },
      { value: 'mineurs', label: 'Oui, dont au moins un mineur' },
    ],
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: '{prenom} avait-il/elle des enfants ?',
      aide: 'S\'il y a un enfant mineur héritier, certaines décisions de succession nécessitent l\'accord du juge des tutelles.',
    },
    categorie: 'Sa situation',
    order: 7,
  },
  {
    id: 'has_notary',
    type: 'boolean',
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: 'Un notaire a-t-il déjà été contacté pour la succession ?',
      aide: 'Ce n\'est pas grave si ce n\'est pas encore fait — nous vous guiderons pour en trouver un.',
    },
    writer_hints: 'Rassurer si non : c\'est une étape normale, importante surtout s\'il y a des biens immobiliers.',
    categorie: 'Succession',
    order: 8,
  },
  {
    id: 'has_life_insurance',
    type: 'tristate',
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: 'Savez-vous si {prenom} avait souscrit une assurance vie ?',
      aide: 'Si vous n\'êtes pas sûr(e), pas d\'inquiétude : une recherche gratuite existe via l\'AGIRA.',
    },
    writer_hints: 'L\'assureur doit verser le capital dans le mois suivant la réception du dossier complet.',
    categorie: 'Assurances',
    order: 9,
  },
  {
    id: 'has_joint_account',
    type: 'boolean',
    // Élargi à tous les profils (décision 2026-07-11) : les comptes joints parent/enfant âgé
    // sont fréquents — un enfant co-titulaire doit voir l'étape « débloquer le compte joint ».
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: 'Aviez-vous un compte bancaire joint avec {prenom} ?',
      aide: 'Un compte joint n\'est pas bloqué automatiquement, mais il est important de régulariser la situation avec la banque.',
    },
    categorie: 'Banque',
    order: 10,
  },
  {
    id: 'has_vehicle',
    type: 'boolean',
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: '{prenom} possédait-il/elle un véhicule ?',
      aide: 'La carte grise devra être mise à jour avant toute vente ou utilisation du véhicule.',
    },
    categorie: 'Patrimoine',
    order: 11,
  },
  {
    id: 'has_credits',
    type: 'boolean',
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: '{prenom} avait-il/elle des crédits en cours (immobilier ou consommation) ?',
      aide: 'Bonne nouvelle possible : l\'assurance emprunteur peut rembourser tout ou partie du crédit. Cela vaut la peine de vérifier.',
    },
    writer_hints: 'Insister avec délicatesse : beaucoup de familles ignorent que l\'assurance emprunteur peut solder le crédit.',
    categorie: 'Patrimoine',
    order: 12,
  },
  {
    id: 'employait_aide_domicile',
    type: 'boolean',
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: '{prenom} employait-il/elle une aide à domicile (ménage, garde, assistance) ?',
      aide: 'Si oui, des documents de fin de contrat doivent être remis au salarié dans les 30 jours.',
    },
    categorie: 'Emploi à domicile',
    order: 13,
  },
  {
    id: 'contrat_obseques',
    type: 'tristate',
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: 'Savez-vous si {prenom} avait souscrit un contrat obsèques ?',
      aide: 'Un contrat obsèques peut financer tout ou partie des funérailles. En cas de doute, une recherche gratuite existe.',
    },
    categorie: 'Obsèques',
    order: 14,
  },
  {
    id: 'organismes_contactes',
    type: 'multiselect',
    options: [
      { value: 'banque', label: 'La banque' },
      { value: 'assurance', label: 'Les assurances' },
      { value: 'caf', label: 'La CAF' },
      { value: 'retraite', label: 'La caisse de retraite' },
      { value: 'employeur', label: 'L\'employeur' },
      { value: 'mutuelle', label: 'La mutuelle' },
      { value: 'cpam', label: 'La CPAM' },
      { value: 'impots', label: 'Les impôts' },
    ],
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: 'Dernière question : avez-vous déjà contacté certains de ces organismes ? (aucun, un ou plusieurs)',
      aide: 'Les démarches déjà faites apparaîtront cochées dans votre parcours — vous verrez ce qui est couvert.',
    },
    writer_hints: 'Dernière question : annoncer la fin proche, féliciter avec sobriété pour le chemin parcouru.',
    categorie: 'Vos démarches',
    order: 15,
  },
]
