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
  // Le nom d'organisme est saisi librement (ou recopié de l'annuaire) : aucun article ni aucune
  // préposition du libellé ne s'y accorde — `{{organisme_name}}` seul, ou précédé de « — ». Seul
  // pour les modèles réseau : le nom de l'annuaire désigne déjà l'organisme (Caf, CGSS, Cnav, SIP…).
  // Testé dans tests/letter-templates-server.test.ts.
  recipient_label: string
  body: string
  variables: LetterVariable[]
  tone: 'formel' | 'semi-formel'
  notes?: string
  channel: 'email' | 'lre' | 'papier' | 'portail'
  portal_url?: string
  // Le corps affirme « Vous trouverez ci-joint une copie de l'acte de décès » : le panneau d'envoi
  // papier avertit, sans bloquer, tant qu'aucune pièce jointe n'est sélectionnée (décision d'Arnaud).
  // Cohérence drapeau ↔ corps testée dans tests/letter-templates.test.ts.
  encloses_death_certificate?: boolean
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
const VAR_CITY: LetterVariable = { key: 'city', label: 'Votre ville', type: 'text', auto_filled: true, required: true }
const VAR_ORGANISME_NAME: LetterVariable = { key: 'organisme_name', label: 'Nom de l\'organisme', type: 'text', auto_filled: false, required: true }
export const VAR_ACCOUNT_NUMBER: LetterVariable = { key: 'account_number', label: 'Numéro de compte ou contrat', type: 'text', auto_filled: false, required: false }
// Personnalisation v2 : identifiant indispensable à l'éditeur ou à l'opérateur pour retrouver le
// contrat — REQUIS (une variable facultative vide laisserait « [LIBELLÉ] » dans un courrier envoyé).
const VAR_SUBSCRIBER_NUMBER: LetterVariable = { key: 'subscriber_number', label: 'Numéro d\'abonné ou de client', type: 'text', auto_filled: false, required: true }

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
    recipient_label: 'À l\'attention du service succession — {{organisme_name}}',
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
    notes: 'Seren l\'envoie pour vous par courrier ; joindre l\'acte de décès.',
    channel: 'papier',
  },

  // 2. Assurance — Déclaration de décès
  {
    id: 'assurance-declaration-deces',
    step_id: 'assurance-declaration-deces',
    organisme: 'Assurance',
    subject: 'Déclaration de décès — Contrats de {{deceased_firstname}} {{deceased_lastname}}',
    recipient_label: 'À l\'attention du service sinistres — {{organisme_name}}',
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
    notes: 'Seren l\'envoie pour vous par courrier ; joindre l\'acte de décès.',
    channel: 'papier',
  },

  // 3. Assurance Vie — Demande de versement
  {
    id: 'assurance-vie-demande',
    step_id: 'assurance-vie-contact',
    organisme: 'Assurance Vie',
    subject: 'Demande de versement du capital — Contrat de {{deceased_firstname}} {{deceased_lastname}}',
    recipient_label: 'À l\'attention du service assurance vie — {{organisme_name}}',
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
    notes: 'Seren l\'envoie pour vous par courrier ; joindre l\'acte de décès.',
    channel: 'papier',
  },

  // 4. Employeur — Notification
  {
    id: 'employeur-notification',
    step_id: 'administratif-prevenir-employeur',
    organisme: 'Employeur',
    subject: 'Notification de décès — {{deceased_firstname}} {{deceased_lastname}}',
    recipient_label: 'À l\'attention du service des ressources humaines — {{organisme_name}}',
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
    channel: 'email',
  },

  // 5. CAF — Notification
  {
    id: 'caf-notification',
    step_id: 'administratif-caf',
    organisme: 'CAF',
    subject: 'Déclaration de décès — Dossier allocataire de {{deceased_firstname}} {{deceased_lastname}}',
    recipient_label: '{{organisme_name}}',
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
    channel: 'portail',
    portal_url: 'https://www.caf.fr',
  },

  // 6. CARSAT — Notification
  {
    id: 'carsat-notification',
    step_id: 'administratif-carsat-retraite',
    organisme: 'CARSAT',
    subject: 'Déclaration de décès — {{deceased_firstname}} {{deceased_lastname}}',
    recipient_label: '{{organisme_name}}',
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
    notes: 'Seren l\'envoie pour vous par courrier ; joindre l\'acte de décès.',
    channel: 'papier',
  },

  // 7. Mutuelle — Résiliation
  {
    id: 'mutuelle-resiliation',
    step_id: 'administratif-mutuelle',
    organisme: 'Mutuelle',
    subject: 'Résiliation pour décès — Contrat de {{deceased_firstname}} {{deceased_lastname}}',
    recipient_label: 'À l\'attention du service des adhésions — {{organisme_name}}',
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
    channel: 'email',
  },

  // 8. Bailleur — Notification
  {
    id: 'bailleur-notification',
    step_id: 'logement-resilier-bail',
    organisme: 'Bailleur',
    subject: 'Résiliation de bail pour décès — {{deceased_firstname}} {{deceased_lastname}}',
    recipient_label: 'À l\'attention du bailleur — {{organisme_name}}',
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
    notes: 'Seren l\'envoie pour vous par courrier ; joindre l\'acte de décès.',
    channel: 'papier',
  },

  // 9. CPAM — Notification
  {
    id: 'cpam-notification',
    step_id: 'administratif-cpam',
    organisme: 'CPAM',
    subject: 'Déclaration de décès — {{deceased_firstname}} {{deceased_lastname}}',
    recipient_label: '{{organisme_name}}',
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
    channel: 'portail',
    portal_url: 'https://www.ameli.fr',
  },

  // 10. Impôts (DGFiP) — Notification
  {
    id: 'impots-notification',
    step_id: 'administratif-impots',
    organisme: 'Direction Générale des Finances Publiques',
    subject: 'Déclaration de décès — {{deceased_firstname}} {{deceased_lastname}}',
    recipient_label: '{{organisme_name}}',
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
    channel: 'portail',
    portal_url: 'https://www.impots.gouv.fr',
  },

  // ── Personnalisation v2 : courriers papier, destinataire saisi par la famille ──

  // 11. Presse — Résiliation d'abonnement
  {
    id: 'resiliation-presse',
    step_id: 'abonnements-presse',
    organisme: 'Presse',
    subject: 'Résiliation de l\'abonnement de {{deceased_firstname}} {{deceased_lastname}} à la suite de son décès',
    recipient_label: 'À l\'attention du service abonnements — {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}
Abonnement n° {{subscriber_number}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, vous informe de son décès survenu le {{deceased_dod}}.

Je vous demande de bien vouloir résilier l'abonnement n° {{subscriber_number}} souscrit à son nom, à compter de la réception de ce courrier, et de mettre fin aux prélèvements correspondants.

Je vous remercie de me confirmer cette résiliation par écrit et de procéder, le cas échéant, au remboursement des numéros payés d'avance et non servis.

Vous trouverez ci-joint une copie de l'acte de décès.

${SIGNATURE}`,
    variables: [
      { ...VAR_ORGANISME_NAME, label: 'Titre du journal ou du magazine' },
      VAR_SUBSCRIBER_NUMBER,
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
    notes: 'Seren l\'envoie pour vous par courrier ; joindre l\'acte de décès.',
    channel: 'papier',
    encloses_death_certificate: true,
  },

  // 12. Opérateur télécom — Résiliation des contrats
  {
    id: 'resiliation-telecom',
    step_id: 'logement-resiliation-telecom',
    organisme: 'Opérateur télécom',
    subject: 'Résiliation des contrats de {{deceased_firstname}} {{deceased_lastname}} à la suite de son décès',
    recipient_label: 'À l\'attention du service clients — {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}
Numéro client ou de ligne : {{subscriber_number}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, vous informe de son décès survenu le {{deceased_dod}}.

Je vous demande de bien vouloir résilier l'ensemble des contrats souscrits à son nom et rattachés au numéro {{subscriber_number}} (ligne mobile, box internet ou ligne fixe).

Je vous remercie de procéder à cette résiliation sans frais, au motif du décès du titulaire, de m'adresser la facture de clôture et de m'indiquer les modalités de restitution du matériel éventuel (box, décodeur). Les sommes éventuellement versées d'avance devront être restituées au plus tard dix jours après le paiement de la dernière facture, conformément à l'article L. 224-35 du code de la consommation.

Vous trouverez ci-joint une copie de l'acte de décès.

${SIGNATURE}`,
    variables: [
      { ...VAR_ORGANISME_NAME, label: 'Nom de l\'opérateur' },
      { ...VAR_SUBSCRIBER_NUMBER, label: 'Numéro client ou numéro de ligne' },
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
    notes: 'Seren l\'envoie pour vous par courrier ; joindre l\'acte de décès.',
    channel: 'papier',
    encloses_death_certificate: true,
  },

  // 13. Club, salle de sport ou association — Fin d'abonnement ou d'adhésion
  {
    id: 'resiliation-sport-association',
    step_id: 'abonnements-sport-association',
    organisme: 'Club ou association',
    subject: 'Fin de l\'abonnement ou de l\'adhésion de {{deceased_firstname}} {{deceased_lastname}} à la suite de son décès',
    recipient_label: 'À l\'attention du service des adhésions — {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, né(e) le {{deceased_dob}}, vous informe de son décès survenu le {{deceased_dod}}.

Je vous demande de bien vouloir mettre fin à son abonnement ou à son adhésion à compter de la réception de ce courrier, et d'arrêter les prélèvements correspondants.

Je vous remercie de me confirmer cette résiliation par écrit et de m'indiquer si un remboursement de la période non utilisée est prévu.

Vous trouverez ci-joint une copie de l'acte de décès.

${SIGNATURE}`,
    variables: [
      { ...VAR_ORGANISME_NAME, label: 'Nom du club, de la salle ou de l\'association' },
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
    notes: 'Seren l\'envoie pour vous par courrier ; joindre l\'acte de décès.',
    channel: 'papier',
    encloses_death_certificate: true,
  },

  // 14. EHPAD — Fin du séjour après le décès du résident
  {
    id: 'ehpad-fin-contrat',
    step_id: 'logement-ehpad',
    organisme: 'EHPAD',
    subject: 'Décès de {{deceased_firstname}} {{deceased_lastname}} — fin du séjour et facture de clôture',
    recipient_label: 'À l\'attention de la direction — {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, né(e) le {{deceased_dob}}, résident(e) de votre établissement, vous confirme son décès survenu le {{deceased_dod}}.

Je souhaite convenir avec vous, dans les meilleurs délais, d'une date pour retirer ses effets personnels et réaliser l'état des lieux de sortie.

Je vous remercie de m'adresser la facture de clôture, établie selon les règles applicables après le décès d'un résident (pour un EHPAD, articles L. 314-10-1 et R. 314-149 du code de l'action sociale et des familles), et de restituer les sommes perçues d'avance ainsi que, le cas échéant, le dépôt de garantie, dans les délais prévus.

Vous trouverez ci-joint une copie de l'acte de décès.

${SIGNATURE}`,
    variables: [
      { ...VAR_ORGANISME_NAME, label: 'Nom de l\'établissement' },
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
    notes: 'Seren l\'envoie pour vous par courrier ; joindre l\'acte de décès.',
    channel: 'papier',
    encloses_death_certificate: true,
  },

  // 15. Conseil départemental — Aides versées au défunt
  {
    id: 'aides-departement',
    step_id: 'aides-departement',
    organisme: 'Conseil départemental',
    subject: 'Décès de {{deceased_firstname}} {{deceased_lastname}} — aides versées par le département',
    recipient_label: 'À l\'attention du service autonomie — {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, né(e) le {{deceased_dob}}, vous informe de son décès survenu le {{deceased_dod}}.

{{deceased_firstname}} {{deceased_lastname}} bénéficiait d'une ou de plusieurs aides versées par votre département (allocation personnalisée d'autonomie, aide sociale à l'hébergement ou prestation de compensation du handicap). Je vous demande de bien vouloir mettre fin à leur versement et de m'indiquer, le cas échéant, les sommes à régulariser.

Si une aide sociale à l'hébergement lui était accordée, je vous remercie de m'adresser le relevé des sommes versées, afin que je puisse le transmettre, le cas échéant, au notaire chargé de la succession.

Vous trouverez ci-joint une copie de l'acte de décès.

${SIGNATURE}`,
    variables: [
      { ...VAR_ORGANISME_NAME, label: 'Nom du conseil départemental' },
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
    notes: 'Seren l\'envoie pour vous par courrier ; joindre l\'acte de décès. Adressez-le au département qui versait les aides : après une entrée en établissement, c\'est en principe celui du domicile précédent.',
    channel: 'papier',
    encloses_death_certificate: true,
  },
]

// Clés des variables à faire saisir par l'utilisateur, figées à partir d'un instantané de
// `values` (typiquement l'état initial post auto-remplissage). NE PAS rappeler cette fonction
// à chaque frappe avec les valeurs courantes : un champ auto_filled resté vide sortirait du
// set dès qu'il reçoit une valeur non vide, donc dès la 1ʳᵉ lettre tapée.
export function editableVariableKeys(
  variables: LetterVariable[],
  values: Record<string, string>
): Set<string> {
  return new Set(
    variables.filter((v) => !v.auto_filled || !values[v.key]?.trim()).map((v) => v.key)
  )
}

// Valeur telle qu'écrite dans le courrier : un <input type="date"> renvoie l'ISO AAAA-MM-JJ, rendu
// JJ/MM/AAAA. Appliqué AU RENDU seulement (valeurs stockées intactes) ; toute autre valeur passe
// telle quelle. Miroir exact : `formatLetterValue` de server/lib/letter-render.js (parité testée).
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function formatLetterValue(value: string | undefined): string | undefined {
  const match = value ? ISO_DATE_RE.exec(value) : null
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value
}

export function getLetterTemplate(templateId: string): LetterTemplate | undefined {
  return LETTER_TEMPLATES.find((t) => t.id === templateId)
}

export function getLetterTemplateByStepId(stepId: string): LetterTemplate | undefined {
  return LETTER_TEMPLATES.find((t) => t.step_id === stepId)
}

// ── Réseau du destinataire (chantier 2a, panneau papier) ────────────────
//
// `recipient_kind` (network:caf|cpam|carsat|impots | user_specific | portail) est une donnée
// PROPRE AU SERVEUR (server/lib/letter-templates.js — résolution d'adresse à l'envoi, Task 9) :
// on ne la duplique pas ici pour ne rien pouvoir faire diverger d'un fichier source de vérité
// serveur. Cette carte est un simple indice d'UI (quel formulaire d'adresse afficher : annuaire
// ou saisie libre) — jamais utilisée pour valider ou construire ce qui part réellement : le
// serveur revalide entièrement l'adresse reçue (garde 4 de POST /api/letters/send), quel que
// soit ce que le client croyait afficher. Parité avec les `recipient_kind` serveur (les 4
// `network:*`) vérifiée par `tests/letter-templates-server.test.ts` (describe « parité
// NETWORK_RECIPIENT_TEMPLATES ↔ recipient_kind serveur ») — corrigé après la revue finale, qui a
// relevé que cette promesse n'était pas tenue par un test réel.
export const NETWORK_RECIPIENT_TEMPLATES: Record<string, 'caf' | 'cpam' | 'carsat' | 'impots'> = {
  'caf-notification': 'caf',
  'cpam-notification': 'cpam',
  'carsat-notification': 'carsat',
  'impots-notification': 'impots',
}

export function getTemplateNetwork(templateId: string): 'caf' | 'cpam' | 'carsat' | 'impots' | null {
  return NETWORK_RECIPIENT_TEMPLATES[templateId] ?? null
}
