// Catalogue des questions du questionnaire v2 — données pures.
// Miroir du patron src/data/steps-catalog.ts. Voir docs/design-questionnaire-v2.md.
// Règle d'or : chaque question conditionne ≥ 1 étape (testé par tests/invariants.test.ts).
// Les fallback_text ({prenom} interpolé) s'affichent si le rédacteur LLM échoue.
//
// i18n (docs/design-i18n.md) : chaque champ textuel (fallback_text, aide, writer_hints,
// label d'option, categorie) est bilingue `{ fr, en }` DANS LE MÊME OBJET — un seul
// catalogue, aucune divergence structurelle possible. id/value/type/applicable_when/order
// restent intacts (le moteur ne lit jamais les textes). Résoudre via `textIn(champ, lang)`.

/**
 * @typedef {Object} QuestionSpec
 * @property {string} id - clé du champ QuestionnaireAnswersV2
 * @property {'select'|'multiselect'|'boolean'|'tristate'|'text'|'date'} type
 * @property {{value: string, label: {fr: string, en: string}}[]=} options - canoniques, jamais générées par le LLM
 * @property {Object} applicable_when - conditions sur les réponses antérieures
 * @property {boolean} obligatoire
 * @property {{question: {fr: string, en: string}, aide?: {fr: string, en: string}}} fallback_text
 * @property {{fr: string, en: string}=} writer_hints - contexte métier pour le rédacteur LLM
 * @property {{fr: string, en: string}} categorie
 * @property {number} order
 */

/** Résout un champ textuel bilingue { fr, en } (chaîne brute acceptée par tolérance). */
export function textIn(field, lang) {
  if (field == null || typeof field === 'string') return field
  return field[lang] ?? field.fr
}

/** @type {QuestionSpec[]} */
export const QUESTIONS_CATALOG = [
  {
    id: 'relation',
    type: 'select',
    options: [
      { value: 'conjoint_marie', label: { fr: 'Mon époux / mon épouse', en: 'My husband / my wife' } },
      { value: 'pacse', label: { fr: 'Mon/ma partenaire de PACS', en: 'My PACS partner' } },
      { value: 'concubin', label: { fr: 'Mon compagnon / ma compagne', en: 'My unmarried partner' } },
      { value: 'parent', label: { fr: 'Mon père ou ma mère', en: 'My father or my mother' } },
      { value: 'enfant', label: { fr: 'Mon fils ou ma fille', en: 'My son or my daughter' } },
      { value: 'frere_soeur', label: { fr: 'Mon frère ou ma sœur', en: 'My brother or my sister' } },
      { value: 'autre', label: { fr: 'Un autre lien', en: 'A different relationship' } },
    ],
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: {
        fr: 'Pour commencer, quel était votre lien avec la personne qui vous a quitté ?',
        en: 'To begin, what was your relationship with your loved one?',
      },
      aide: {
        fr: 'Votre lien de parenté détermine plusieurs de vos droits, comme la pension de réversion pour les époux.',
        en: 'Your relationship determines several of your rights, such as the survivor\'s pension for spouses.',
      },
    },
    writer_hints: {
      fr: 'Première question : accueillir avec douceur, poser le cadre bienveillant de l\'accompagnement.',
      en: 'First question: welcome the user gently, setting a caring, supportive tone for the journey ahead.',
    },
    categorie: { fr: 'Votre situation', en: 'Your situation' },
    order: 1,
  },
  {
    id: 'deceased_firstname',
    type: 'text',
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: { fr: 'Quel était son prénom ?', en: 'What was their first name?' },
      aide: {
        fr: 'Son prénom nous permet de personnaliser votre parcours et de pré-remplir vos courriers.',
        en: 'Their first name lets us personalize your journey and pre-fill your letters.',
      },
    },
    writer_hints: {
      fr: 'Adapter à la relation donnée (ex. « Quel était le prénom de votre époux ? »).',
      en: 'Adapt to the given relationship (e.g. "What was your husband\'s first name?").',
    },
    categorie: { fr: 'Votre situation', en: 'Your situation' },
    order: 2,
  },
  {
    id: 'deceased_lastname',
    type: 'text',
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: { fr: 'Et son nom de famille ?', en: 'And their last name?' },
      aide: { fr: 'Le nom complet est nécessaire pour les courriers officiels.', en: 'The full name is needed for official letters.' },
    },
    writer_hints: { fr: 'Utiliser le prénom désormais connu.', en: 'Use the first name now that it is known.' },
    categorie: { fr: 'Votre situation', en: 'Your situation' },
    order: 3,
  },
  {
    id: 'deceased_dod',
    type: 'date',
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: { fr: 'À quelle date {prenom} est-il/elle décédé(e) ?', en: 'On what date did {prenom} pass away?' },
      aide: {
        fr: 'Cette date nous permet de calculer les délais légaux de chaque démarche.',
        en: 'This date lets us calculate the legal deadlines for each step.',
      },
    },
    categorie: { fr: 'Votre situation', en: 'Your situation' },
    order: 4,
  },
  {
    id: 'statut_professionnel',
    type: 'select',
    options: [
      { value: 'salarie', label: { fr: 'Salarié(e)', en: 'Employee' } },
      { value: 'fonctionnaire', label: { fr: 'Fonctionnaire', en: 'Civil servant' } },
      { value: 'independant', label: { fr: 'Indépendant(e) ou chef d\'entreprise', en: 'Self-employed or business owner' } },
      { value: 'retraite', label: { fr: 'Retraité(e)', en: 'Retired' } },
      { value: 'demandeur_emploi', label: { fr: 'En recherche d\'emploi', en: 'Job seeker' } },
      { value: 'sans_activite', label: { fr: 'Sans activité professionnelle', en: 'Not working' } },
    ],
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: { fr: 'Quelle était la situation professionnelle de {prenom} ?', en: 'What was {prenom}\'s professional situation?' },
      aide: {
        fr: 'Elle détermine les organismes à prévenir : employeur, caisses de retraite, URSSAF…',
        en: 'It determines which organizations to notify: employer, pension funds, URSSAF…',
      },
    },
    writer_hints: {
      fr: 'Si salarié : mentionner que la prévoyance d\'entreprise peut ouvrir droit à un capital décès, parfois important.',
      en: 'If an employee: mention that company group insurance may provide a death benefit, sometimes a substantial one.',
    },
    categorie: { fr: 'Sa situation', en: 'Their situation' },
    order: 5,
  },
  {
    id: 'logement',
    type: 'select',
    options: [
      { value: 'locataire', label: { fr: 'Locataire de son logement', en: 'Renting their home' } },
      { value: 'proprietaire', label: { fr: 'Propriétaire de son logement', en: 'Owned their home' } },
      { value: 'heberge_ou_autre', label: { fr: 'Hébergé(e) ou autre situation', en: 'Living with someone else, or another situation' } },
    ],
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: { fr: 'Concernant son logement, {prenom} était plutôt…', en: 'Regarding their housing, {prenom} was…' },
      aide: {
        fr: 'Locataire : le bail peut être résilié avec un préavis réduit à 1 mois. Propriétaire : le notaire établira une attestation immobilière.',
        en: 'Renting: the lease can be terminated with a reduced 1-month notice period. Owner: the notaire will draw up a property certificate.',
      },
    },
    categorie: { fr: 'Sa situation', en: 'Their situation' },
    order: 6,
  },
  {
    id: 'enfants',
    type: 'select',
    options: [
      { value: 'aucun', label: { fr: 'Non, pas d\'enfant', en: 'No children' } },
      { value: 'majeurs', label: { fr: 'Oui, tous majeurs', en: 'Yes, all adults' } },
      { value: 'mineurs', label: { fr: 'Oui, dont au moins un mineur', en: 'Yes, including at least one minor' } },
    ],
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: { fr: '{prenom} avait-il/elle des enfants ?', en: 'Did {prenom} have children?' },
      aide: {
        fr: 'S\'il y a un enfant mineur héritier, certaines décisions de succession nécessitent l\'accord du juge des tutelles.',
        en: 'If a minor child is an heir, some estate decisions require approval from the guardianship judge.',
      },
    },
    categorie: { fr: 'Sa situation', en: 'Their situation' },
    order: 7,
  },
  {
    id: 'has_notary',
    type: 'boolean',
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: { fr: 'Un notaire a-t-il déjà été contacté pour la succession ?', en: 'Has a notaire already been contacted for the estate?' },
      aide: {
        fr: 'Ce n\'est pas grave si ce n\'est pas encore fait — nous vous guiderons pour en trouver un.',
        en: 'It\'s fine if this hasn\'t been done yet — we\'ll guide you to find one.',
      },
    },
    writer_hints: {
      fr: 'Rassurer si non : c\'est une étape normale, importante surtout s\'il y a des biens immobiliers.',
      en: 'Reassure if not: this is a normal step, especially important if there is real estate involved.',
    },
    categorie: { fr: 'Succession', en: 'Estate' },
    order: 8,
  },
  {
    id: 'has_life_insurance',
    type: 'tristate',
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: { fr: 'Savez-vous si {prenom} avait souscrit une assurance vie ?', en: 'Do you know if {prenom} had a life insurance policy?' },
      aide: {
        fr: 'Si vous n\'êtes pas sûr(e), pas d\'inquiétude : une recherche gratuite existe via l\'AGIRA.',
        en: 'If you\'re not sure, no worries: a free search is available through AGIRA.',
      },
    },
    writer_hints: {
      fr: 'L\'assureur doit verser le capital dans le mois suivant la réception du dossier complet.',
      en: 'The insurer must pay out the benefit within one month of receiving the complete file.',
    },
    categorie: { fr: 'Assurances', en: 'Insurance' },
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
      question: { fr: 'Aviez-vous un compte bancaire joint avec {prenom} ?', en: 'Did you have a joint bank account with {prenom}?' },
      aide: {
        fr: 'Un compte joint n\'est pas bloqué automatiquement, mais il est important de régulariser la situation avec la banque.',
        en: 'A joint account isn\'t automatically frozen, but it\'s important to sort out the situation with the bank.',
      },
    },
    categorie: { fr: 'Banque', en: 'Bank' },
    order: 10,
  },
  {
    id: 'has_vehicle',
    type: 'boolean',
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: { fr: '{prenom} possédait-il/elle un véhicule ?', en: 'Did {prenom} own a vehicle?' },
      aide: {
        fr: 'La carte grise devra être mise à jour avant toute vente ou utilisation du véhicule.',
        en: 'The registration certificate (carte grise) will need to be updated before the vehicle is sold or used.',
      },
    },
    categorie: { fr: 'Patrimoine', en: 'Assets' },
    order: 11,
  },
  {
    id: 'has_credits',
    type: 'boolean',
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: {
        fr: '{prenom} avait-il/elle des crédits en cours (immobilier ou consommation) ?',
        en: 'Did {prenom} have any outstanding loans (mortgage or consumer credit)?',
      },
      aide: {
        fr: 'Bonne nouvelle possible : l\'assurance emprunteur peut rembourser tout ou partie du crédit. Cela vaut la peine de vérifier.',
        en: 'Possible good news: borrower\'s insurance may repay all or part of the loan. It\'s worth checking.',
      },
    },
    writer_hints: {
      fr: 'Insister avec délicatesse : beaucoup de familles ignorent que l\'assurance emprunteur peut solder le crédit.',
      en: 'Bring this up gently: many families don\'t realize that borrower\'s insurance can pay off the loan in full.',
    },
    categorie: { fr: 'Patrimoine', en: 'Assets' },
    order: 12,
  },
  {
    id: 'employait_aide_domicile',
    type: 'boolean',
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: {
        fr: '{prenom} employait-il/elle une aide à domicile (ménage, garde, assistance) ?',
        en: 'Did {prenom} employ home help (cleaning, care, assistance)?',
      },
      aide: {
        fr: 'Si oui, des documents de fin de contrat doivent être remis au salarié dans les 30 jours.',
        en: 'If so, end-of-contract documents must be given to the employee within 30 days.',
      },
    },
    categorie: { fr: 'Emploi à domicile', en: 'Home employment' },
    order: 13,
  },
  {
    id: 'contrat_obseques',
    type: 'tristate',
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: { fr: 'Savez-vous si {prenom} avait souscrit un contrat obsèques ?', en: 'Do you know if {prenom} had a funeral insurance plan?' },
      aide: {
        fr: 'Un contrat obsèques peut financer tout ou partie des funérailles. En cas de doute, une recherche gratuite existe.',
        en: 'A funeral insurance plan can cover all or part of the funeral costs. If you\'re unsure, a free search is available.',
      },
    },
    categorie: { fr: 'Obsèques', en: 'Funeral arrangements' },
    order: 14,
  },
  {
    id: 'organismes_contactes',
    type: 'multiselect',
    options: [
      { value: 'banque', label: { fr: 'La banque', en: 'The bank' } },
      { value: 'assurance', label: { fr: 'Les assurances', en: 'Insurance companies' } },
      { value: 'caf', label: { fr: 'La CAF', en: 'CAF' } },
      { value: 'retraite', label: { fr: 'La caisse de retraite', en: 'The pension fund' } },
      { value: 'employeur', label: { fr: 'L\'employeur', en: 'The employer' } },
      { value: 'mutuelle', label: { fr: 'La mutuelle', en: 'The supplementary health insurer' } },
      { value: 'cpam', label: { fr: 'La CPAM', en: 'CPAM' } },
      { value: 'impots', label: { fr: 'Les impôts', en: 'The tax authorities' } },
    ],
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: {
        fr: 'Dernière question : avez-vous déjà contacté certains de ces organismes ? (aucun, un ou plusieurs)',
        en: 'Last question: have you already contacted any of these organizations? (none, one, or several)',
      },
      aide: {
        fr: 'Les démarches déjà faites apparaîtront cochées dans votre parcours — vous verrez ce qui est couvert.',
        en: 'Steps you\'ve already taken will show up checked off in your journey — you\'ll see what\'s already covered.',
      },
    },
    writer_hints: {
      fr: 'Dernière question : annoncer la fin proche, féliciter avec sobriété pour le chemin parcouru.',
      en: 'Last question: signal that the end is near, and offer a brief, understated acknowledgment of the path they\'ve walked.',
    },
    categorie: { fr: 'Vos démarches', en: 'Your steps' },
    order: 15,
  },
]
