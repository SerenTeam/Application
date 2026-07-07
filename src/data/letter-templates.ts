export interface LetterVariable {
  key: string
  label: string
  type: 'text' | 'date' | 'number'
  auto_filled: boolean
  required: boolean
}

export interface LetterTemplate {
  id: string
  step_id: string
  organisme: string
  subject: string
  recipient_label: string
  body: string
  variables: LetterVariable[]
  tone: 'formel' | 'semi-formel'
  notes?: string
}

// ── Variables partagées ─────────────────────────────────────────────────

const VAR_DECEASED_FIRSTNAME: LetterVariable = { key: 'deceased_firstname', label: 'Prénom du défunt', type: 'text', auto_filled: true, required: true }
const VAR_DECEASED_LASTNAME: LetterVariable = { key: 'deceased_lastname', label: 'Nom du défunt', type: 'text', auto_filled: true, required: true }
const VAR_DECEASED_DOB: LetterVariable = { key: 'deceased_dob', label: 'Date de naissance du défunt', type: 'date', auto_filled: true, required: true }
const VAR_DECEASED_DOD: LetterVariable = { key: 'deceased_dod', label: 'Date de décès', type: 'date', auto_filled: true, required: true }
const VAR_USER_FIRSTNAME: LetterVariable = { key: 'user_firstname', label: 'Votre prénom', type: 'text', auto_filled: true, required: true }
const VAR_USER_LASTNAME: LetterVariable = { key: 'user_lastname', label: 'Votre nom', type: 'text', auto_filled: true, required: true }
const VAR_USER_ADDRESS: LetterVariable = { key: 'user_address', label: 'Votre adresse', type: 'text', auto_filled: true, required: true }
const VAR_USER_RELATION: LetterVariable = { key: 'user_relation', label: 'Votre lien de parenté', type: 'text', auto_filled: true, required: true }
const VAR_TODAY_DATE: LetterVariable = { key: 'today_date', label: 'Date du jour', type: 'date', auto_filled: true, required: true }
const VAR_CITY: LetterVariable = { key: 'city', label: 'Votre ville', type: 'text', auto_filled: false, required: true }
const VAR_ORGANISME_NAME: LetterVariable = { key: 'organisme_name', label: 'Nom de l\'organisme', type: 'text', auto_filled: false, required: true }
export const VAR_ACCOUNT_NUMBER: LetterVariable = { key: 'account_number', label: 'Numéro de compte ou contrat', type: 'text', auto_filled: false, required: false }

// ── Signature commune ───────────────────────────────────────────────────

const SIGNATURE = `Veuillez agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

{{user_firstname}} {{user_lastname}}
{{user_address}}
{{city}}, le {{today_date}}`

// ── Templates ───────────────────────────────────────────────────────────

export const LETTER_TEMPLATES: LetterTemplate[] = [
  // 1. Banque — Déclaration de décès
  {
    id: 'banque-declaration-deces',
    step_id: 'banque-declaration-principale',
    organisme: 'Banque',
    subject: 'Déclaration de décès — Comptes de {{deceased_firstname}} {{deceased_lastname}}',
    recipient_label: 'Au Service Succession de {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, né(e) le {{deceased_dob}}, vous informe de son décès survenu le {{deceased_dod}}.

Je vous adresse ce courrier afin de vous notifier ce décès et vous demander de procéder au blocage des comptes détenus dans votre établissement, dans l'attente du règlement de la succession.

Je tiens à votre disposition tout document complémentaire nécessaire (acte de décès, justificatif d'identité).

${SIGNATURE}`,
    variables: [
      VAR_ORGANISME_NAME,
      VAR_USER_FIRSTNAME,
      VAR_USER_LASTNAME,
      VAR_USER_RELATION,
      VAR_DECEASED_FIRSTNAME,
      VAR_DECEASED_LASTNAME,
      VAR_DECEASED_DOB,
      VAR_DECEASED_DOD,
      VAR_USER_ADDRESS,
      VAR_CITY,
      VAR_TODAY_DATE,
    ],
    tone: 'formel',
    notes: 'Envoi recommandé avec accusé de réception. Joindre une copie de l\'acte de décès.',
  },

  // 2. Assurance — Déclaration de décès
  {
    id: 'assurance-declaration-deces',
    step_id: 'assurance-declaration-deces',
    organisme: 'Assurance',
    subject: 'Déclaration de décès — Contrats de {{deceased_firstname}} {{deceased_lastname}}',
    recipient_label: 'Au Service Sinistres de {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, né(e) le {{deceased_dob}}, vous informe de son décès survenu le {{deceased_dod}}.

Je vous prie de bien vouloir prendre en compte cette information concernant les contrats d'assurance souscrits auprès de votre compagnie et de m'indiquer les démarches à suivre pour leur résiliation ou leur transfert.

Je vous serais reconnaissant(e) de me préciser si un capital décès ou une garantie est prévu(e) dans les contrats en cours.

Je tiens à votre disposition tout document complémentaire nécessaire.

${SIGNATURE}`,
    variables: [
      VAR_ORGANISME_NAME,
      VAR_USER_FIRSTNAME,
      VAR_USER_LASTNAME,
      VAR_USER_RELATION,
      VAR_DECEASED_FIRSTNAME,
      VAR_DECEASED_LASTNAME,
      VAR_DECEASED_DOB,
      VAR_DECEASED_DOD,
      VAR_USER_ADDRESS,
      VAR_CITY,
      VAR_TODAY_DATE,
    ],
    tone: 'formel',
    notes: 'Envoi recommandé avec accusé de réception. Joindre une copie de l\'acte de décès.',
  },

  // 3. Assurance Vie — Demande de versement
  {
    id: 'assurance-vie-demande',
    step_id: 'assurance-vie-contact',
    organisme: 'Assurance Vie',
    subject: 'Demande de versement du capital — Contrat de {{deceased_firstname}} {{deceased_lastname}}',
    recipient_label: 'Au Service Assurance Vie de {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, né(e) le {{deceased_dob}}, vous informe de son décès survenu le {{deceased_dod}}.

Je me permets de vous contacter en qualité de bénéficiaire potentiel(le) du contrat d'assurance vie souscrit auprès de votre établissement.

Je vous prie de bien vouloir m'indiquer les démarches à suivre et les documents à fournir pour procéder au versement du capital.

Conformément à l'article L132-23-1 du Code des assurances, je vous rappelle que le versement doit intervenir dans un délai d'un mois suivant la réception du dossier complet.

Je tiens à votre disposition tout document complémentaire nécessaire.

${SIGNATURE}`,
    variables: [
      VAR_ORGANISME_NAME,
      VAR_USER_FIRSTNAME,
      VAR_USER_LASTNAME,
      VAR_USER_RELATION,
      VAR_DECEASED_FIRSTNAME,
      VAR_DECEASED_LASTNAME,
      VAR_DECEASED_DOB,
      VAR_DECEASED_DOD,
      VAR_USER_ADDRESS,
      VAR_CITY,
      VAR_TODAY_DATE,
    ],
    tone: 'formel',
    notes: 'Envoi recommandé avec AR. Joindre : acte de décès, pièce d\'identité, justificatif de qualité de bénéficiaire.',
  },

  // 4. Employeur — Notification
  {
    id: 'employeur-notification',
    step_id: 'administratif-prevenir-employeur',
    organisme: 'Employeur',
    subject: 'Notification de décès — {{deceased_firstname}} {{deceased_lastname}}',
    recipient_label: 'Au Service des Ressources Humaines de {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, vous informe de son décès survenu le {{deceased_dod}}.

{{deceased_firstname}} {{deceased_lastname}} était salarié(e) de votre entreprise. Je vous prie de bien vouloir prendre en compte cette information et de m'adresser les documents suivants :

- Le solde de tout compte
- Le certificat de travail
- L'attestation Pôle emploi
- Les informations relatives à la prévoyance d'entreprise

Je vous remercie de votre compréhension dans cette période difficile.

${SIGNATURE}`,
    variables: [
      VAR_ORGANISME_NAME,
      VAR_USER_FIRSTNAME,
      VAR_USER_LASTNAME,
      VAR_USER_RELATION,
      VAR_DECEASED_FIRSTNAME,
      VAR_DECEASED_LASTNAME,
      VAR_DECEASED_DOD,
      VAR_USER_ADDRESS,
      VAR_CITY,
      VAR_TODAY_DATE,
    ],
    tone: 'semi-formel',
    notes: 'Email ou courrier simple. Joindre une copie de l\'acte de décès.',
  },

  // 5. CAF — Notification
  {
    id: 'caf-notification',
    step_id: 'administratif-caf',
    organisme: 'CAF',
    subject: 'Déclaration de décès — Dossier allocataire de {{deceased_firstname}} {{deceased_lastname}}',
    recipient_label: 'À la Caisse d\'Allocations Familiales de {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, vous informe de son décès survenu le {{deceased_dod}}.

Je vous prie de bien vouloir mettre à jour le dossier allocataire et recalculer les droits en fonction de la nouvelle composition du foyer.

Je reste à votre disposition pour fournir tout document nécessaire.

${SIGNATURE}`,
    variables: [
      VAR_ORGANISME_NAME,
      VAR_USER_FIRSTNAME,
      VAR_USER_LASTNAME,
      VAR_USER_RELATION,
      VAR_DECEASED_FIRSTNAME,
      VAR_DECEASED_LASTNAME,
      VAR_DECEASED_DOD,
      VAR_USER_ADDRESS,
      VAR_CITY,
      VAR_TODAY_DATE,
    ],
    tone: 'formel',
    notes: 'Espace CAF en ligne (caf.fr) ou courrier simple. Joindre l\'acte de décès.',
  },

  // 6. CARSAT — Notification
  {
    id: 'carsat-notification',
    step_id: 'administratif-carsat-retraite',
    organisme: 'CARSAT',
    subject: 'Déclaration de décès — {{deceased_firstname}} {{deceased_lastname}}',
    recipient_label: 'À la CARSAT de {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, né(e) le {{deceased_dob}}, vous informe de son décès survenu le {{deceased_dod}}.

Je vous prie de bien vouloir interrompre le versement de sa pension de retraite et de m'indiquer les démarches à suivre pour le remboursement éventuel de trop-perçus.

Le cas échéant, je souhaite également être informé(e) des conditions d'attribution de la pension de réversion.

${SIGNATURE}`,
    variables: [
      VAR_ORGANISME_NAME,
      VAR_USER_FIRSTNAME,
      VAR_USER_LASTNAME,
      VAR_USER_RELATION,
      VAR_DECEASED_FIRSTNAME,
      VAR_DECEASED_LASTNAME,
      VAR_DECEASED_DOB,
      VAR_DECEASED_DOD,
      VAR_USER_ADDRESS,
      VAR_CITY,
      VAR_TODAY_DATE,
    ],
    tone: 'formel',
    notes: 'Envoi recommandé avec AR. Joindre l\'acte de décès.',
  },

  // 7. Mutuelle — Résiliation
  {
    id: 'mutuelle-resiliation',
    step_id: 'administratif-mutuelle',
    organisme: 'Mutuelle',
    subject: 'Résiliation pour décès — Contrat de {{deceased_firstname}} {{deceased_lastname}}',
    recipient_label: 'Au Service Adhésion de {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, vous informe de son décès survenu le {{deceased_dod}}.

Je vous prie de bien vouloir procéder à la résiliation du contrat de complémentaire santé souscrit auprès de votre organisme et de m'adresser un décompte des remboursements en cours ou à venir.

Si j'étais rattaché(e) en tant qu'ayant droit, je vous saurais gré de m'indiquer les conditions de maintien temporaire de mes droits.

${SIGNATURE}`,
    variables: [
      VAR_ORGANISME_NAME,
      VAR_USER_FIRSTNAME,
      VAR_USER_LASTNAME,
      VAR_USER_RELATION,
      VAR_DECEASED_FIRSTNAME,
      VAR_DECEASED_LASTNAME,
      VAR_DECEASED_DOD,
      VAR_USER_ADDRESS,
      VAR_CITY,
      VAR_TODAY_DATE,
    ],
    tone: 'formel',
    notes: 'Email ou courrier simple. Joindre l\'acte de décès.',
  },

  // 8. Bailleur — Notification
  {
    id: 'bailleur-notification',
    step_id: 'logement-resilier-bail',
    organisme: 'Bailleur',
    subject: 'Résiliation de bail pour décès — {{deceased_firstname}} {{deceased_lastname}}',
    recipient_label: 'À {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, vous informe de son décès survenu le {{deceased_dod}}.

{{deceased_firstname}} {{deceased_lastname}} était locataire du logement situé à l'adresse mentionnée dans le bail. Conformément à l'article 14 de la loi du 6 juillet 1989, le décès du locataire entraîne la résiliation du bail avec un préavis d'un mois.

Je vous prie de bien vouloir organiser un état des lieux de sortie et procéder à la restitution du dépôt de garantie.

${SIGNATURE}`,
    variables: [
      VAR_ORGANISME_NAME,
      VAR_USER_FIRSTNAME,
      VAR_USER_LASTNAME,
      VAR_USER_RELATION,
      VAR_DECEASED_FIRSTNAME,
      VAR_DECEASED_LASTNAME,
      VAR_DECEASED_DOD,
      VAR_USER_ADDRESS,
      VAR_CITY,
      VAR_TODAY_DATE,
    ],
    tone: 'formel',
    notes: 'Envoi recommandé avec AR obligatoire. Joindre l\'acte de décès.',
  },

  // 9. CPAM — Notification
  {
    id: 'cpam-notification',
    step_id: 'administratif-cpam',
    organisme: 'CPAM',
    subject: 'Déclaration de décès — {{deceased_firstname}} {{deceased_lastname}}',
    recipient_label: 'À la Caisse Primaire d\'Assurance Maladie de {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, né(e) le {{deceased_dob}}, vous informe de son décès survenu le {{deceased_dod}}.

Je vous prie de bien vouloir clôturer ses droits à l'assurance maladie et de m'indiquer s'il existe des remboursements en attente.

Si j'étais rattaché(e) en tant qu'ayant droit, je souhaiterais connaître les modalités de maintien temporaire de mes droits.

${SIGNATURE}`,
    variables: [
      VAR_ORGANISME_NAME,
      VAR_USER_FIRSTNAME,
      VAR_USER_LASTNAME,
      VAR_USER_RELATION,
      VAR_DECEASED_FIRSTNAME,
      VAR_DECEASED_LASTNAME,
      VAR_DECEASED_DOB,
      VAR_DECEASED_DOD,
      VAR_USER_ADDRESS,
      VAR_CITY,
      VAR_TODAY_DATE,
    ],
    tone: 'formel',
    notes: 'Espace ameli.fr ou courrier simple. Joindre l\'acte de décès.',
  },

  // 10. Impôts (DGFiP) — Notification
  {
    id: 'impots-notification',
    step_id: 'administratif-impots',
    organisme: 'Direction Générale des Finances Publiques',
    subject: 'Déclaration de décès — {{deceased_firstname}} {{deceased_lastname}}',
    recipient_label: 'Au Centre des Finances Publiques de {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, né(e) le {{deceased_dob}}, vous informe de son décès survenu le {{deceased_dod}}.

Je vous prie de bien vouloir prendre en compte ce changement de situation et mettre à jour le dossier fiscal.

Je reste à votre disposition pour fournir tout document nécessaire, notamment en vue de la déclaration de revenus du défunt pour l'année en cours.

${SIGNATURE}`,
    variables: [
      VAR_ORGANISME_NAME,
      VAR_USER_FIRSTNAME,
      VAR_USER_LASTNAME,
      VAR_USER_RELATION,
      VAR_DECEASED_FIRSTNAME,
      VAR_DECEASED_LASTNAME,
      VAR_DECEASED_DOB,
      VAR_DECEASED_DOD,
      VAR_USER_ADDRESS,
      VAR_CITY,
      VAR_TODAY_DATE,
    ],
    tone: 'formel',
    notes: 'Espace impots.gouv.fr (messagerie sécurisée) ou courrier simple.',
  },
]

export function getLetterTemplate(templateId: string): LetterTemplate | undefined {
  return LETTER_TEMPLATES.find((t) => t.id === templateId)
}

export function getLetterTemplateByStepId(stepId: string): LetterTemplate | undefined {
  return LETTER_TEMPLATES.find((t) => t.step_id === stepId)
}
