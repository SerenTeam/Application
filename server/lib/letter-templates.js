// Jumeau serveur du catalogue front `src/data/letter-templates.ts` (source de vérité) — le
// serveur Express reste en JS (voir CLAUDE.md) et ne peut donc pas importer directement le
// module TS. Contrat D2 (spec §5, chantier 2a) : la route d'envoi papier (Task 9) regénère le
// corps depuis CE catalogue + les variables reçues du client via `letter-render.js` — le client
// n'envoie plus jamais de corps libre. Parité stricte avec le front (ids, canaux, corps verbatim,
// ensembles de variables) vérifiée par `tests/letter-templates-server.test.ts` — même mécanique
// que `server/lib/letter-channels.js` ↔ `tests/letter-templates.test.ts`. Toute dérive entre les
// deux fichiers fait échouer `npm test`.
//
// Requalification Task 11 : les 5 templates `lre` (recommandé + AR — jamais implémenté, lot 2c)
// sont devenus `papier` (courrier simple, MySendingBox, chantier 2a), en miroir strict du front.
//
// `variables` est DÉRIVÉ automatiquement des `{{clés}}` réellement présentes dans le texte de
// chaque template (subject + recipient_label + body), jamais recopié à la main — une divergence
// entre le corps et une liste de variables tenue en dur serait invisible jusqu'à un rendu cassé
// en prod. `recipient_label` et `subject` sont des placeholders STRUCTURELS (mise en page du
// courrier, résolus par `letter-render.js`), pas des variables saisies par l'utilisateur : ils
// sont exclus du résultat.

const VARIABLE_PLACEHOLDER_RE = /\{\{([a-zA-Z0-9_]+)\}\}/g
const STRUCTURAL_PLACEHOLDER_KEYS = new Set(['recipient_label', 'subject'])

function deriveVariables(...texts) {
  const keys = new Set()
  for (const text of texts) {
    for (const match of text.matchAll(VARIABLE_PLACEHOLDER_RE)) {
      const key = match[1]
      if (!STRUCTURAL_PLACEHOLDER_KEYS.has(key)) keys.add(key)
    }
  }
  return [...keys].sort()
}

// Signature commune — verbatim de src/data/letter-templates.ts (SIGNATURE).
const SIGNATURE = `Veuillez agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

{{user_firstname}} {{user_lastname}}
{{user_address}}
{{city}}, le {{today_date}}`

// Chaque entrée : id/step_id/organisme/subject/recipient_label/body/tone/notes/channel copiés
// verbatim du front ; `recipient_kind` est propre au serveur (résolution d'adresse Task 9) — un
// commentaire d'une ligne justifie chaque choix. `variables` est ajouté plus bas (dérivé).
const RAW_TEMPLATES = [
  // 1. Banque — Déclaration de décès
  {
    id: 'banque-declaration-deces',
    channel: 'papier',
    // Banque du défunt/de l'utilisateur : relation privée propre au dossier, aucun annuaire
    // réseau possible → adresse toujours saisie par l'utilisateur.
    recipient_kind: 'user_specific',
    subject: 'Déclaration de décès — Comptes de {{deceased_firstname}} {{deceased_lastname}}',
    recipient_label: 'Au Service Succession de {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, né(e) le {{deceased_dob}}, vous informe de son décès survenu le {{deceased_dod}}.

Je vous adresse ce courrier afin de vous notifier ce décès et vous demander de procéder au blocage des comptes détenus dans votre établissement, dans l'attente du règlement de la succession.

Je tiens à votre disposition tout document complémentaire nécessaire (acte de décès, justificatif d'identité).

${SIGNATURE}`,
  },

  // 2. Assurance — Déclaration de décès
  {
    id: 'assurance-declaration-deces',
    channel: 'papier',
    // Assureur propre à l'utilisateur (contrat privé) : pas d'annuaire réseau.
    recipient_kind: 'user_specific',
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
  },

  // 3. Assurance Vie — Demande de versement
  {
    id: 'assurance-vie-demande',
    channel: 'papier',
    // Assureur vie propre à l'utilisateur (contrat privé) : pas d'annuaire réseau.
    recipient_kind: 'user_specific',
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
  },

  // 4. Employeur — Notification
  {
    id: 'employeur-notification',
    channel: 'email',
    // Employeur propre à l'utilisateur/au défunt : pas d'annuaire réseau.
    recipient_kind: 'user_specific',
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
  },

  // 5. CAF — Notification
  {
    id: 'caf-notification',
    channel: 'portail',
    // Organisme du réseau CAF : résolution par annuaire (network + département du défunt).
    recipient_kind: 'network:caf',
    subject: 'Déclaration de décès — Dossier allocataire de {{deceased_firstname}} {{deceased_lastname}}',
    recipient_label: 'À la Caisse d\'Allocations Familiales de {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, vous informe de son décès survenu le {{deceased_dod}}.

Je vous prie de bien vouloir mettre à jour le dossier allocataire et recalculer les droits en fonction de la nouvelle composition du foyer.

Je reste à votre disposition pour fournir tout document nécessaire.

${SIGNATURE}`,
  },

  // 6. CARSAT — Notification
  {
    id: 'carsat-notification',
    channel: 'papier',
    // Organisme du réseau CARSAT : résolution par annuaire (network + département du défunt).
    recipient_kind: 'network:carsat',
    subject: 'Déclaration de décès — {{deceased_firstname}} {{deceased_lastname}}',
    recipient_label: 'À la CARSAT de {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, né(e) le {{deceased_dob}}, vous informe de son décès survenu le {{deceased_dod}}.

Je vous prie de bien vouloir interrompre le versement de sa pension de retraite et de m'indiquer les démarches à suivre pour le remboursement éventuel de trop-perçus.

Le cas échéant, je souhaite également être informé(e) des conditions d'attribution de la pension de réversion.

${SIGNATURE}`,
  },

  // 7. Mutuelle — Résiliation
  {
    id: 'mutuelle-resiliation',
    channel: 'email',
    // Mutuelle propre à l'utilisateur (contrat privé) : pas d'annuaire réseau.
    recipient_kind: 'user_specific',
    subject: 'Résiliation pour décès — Contrat de {{deceased_firstname}} {{deceased_lastname}}',
    recipient_label: 'Au Service Adhésion de {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, vous informe de son décès survenu le {{deceased_dod}}.

Je vous prie de bien vouloir procéder à la résiliation du contrat de complémentaire santé souscrit auprès de votre organisme et de m'adresser un décompte des remboursements en cours ou à venir.

Si j'étais rattaché(e) en tant qu'ayant droit, je vous saurais gré de m'indiquer les conditions de maintien temporaire de mes droits.

${SIGNATURE}`,
  },

  // 8. Bailleur — Notification
  {
    id: 'bailleur-notification',
    channel: 'papier',
    // Bailleur propre à l'utilisateur/au défunt (bail privé) : pas d'annuaire réseau.
    recipient_kind: 'user_specific',
    subject: 'Résiliation de bail pour décès — {{deceased_firstname}} {{deceased_lastname}}',
    recipient_label: 'À {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, vous informe de son décès survenu le {{deceased_dod}}.

{{deceased_firstname}} {{deceased_lastname}} était locataire du logement situé à l'adresse mentionnée dans le bail. Conformément à l'article 14 de la loi du 6 juillet 1989, le décès du locataire entraîne la résiliation du bail avec un préavis d'un mois.

Je vous prie de bien vouloir organiser un état des lieux de sortie et procéder à la restitution du dépôt de garantie.

${SIGNATURE}`,
  },

  // 9. CPAM — Notification
  {
    id: 'cpam-notification',
    channel: 'portail',
    // Organisme du réseau CPAM : résolution par annuaire (network + département du défunt).
    recipient_kind: 'network:cpam',
    subject: 'Déclaration de décès — {{deceased_firstname}} {{deceased_lastname}}',
    recipient_label: 'À la Caisse Primaire d\'Assurance Maladie de {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, né(e) le {{deceased_dob}}, vous informe de son décès survenu le {{deceased_dod}}.

Je vous prie de bien vouloir clôturer ses droits à l'assurance maladie et de m'indiquer s'il existe des remboursements en attente.

Si j'étais rattaché(e) en tant qu'ayant droit, je souhaiterais connaître les modalités de maintien temporaire de mes droits.

${SIGNATURE}`,
  },

  // 10. Impôts (DGFiP) — Notification
  {
    id: 'impots-notification',
    channel: 'portail',
    // Organisme du réseau impôts (centres des finances publiques / DGFiP) : résolution par
    // annuaire (network + département du défunt).
    recipient_kind: 'network:impots',
    subject: 'Déclaration de décès — {{deceased_firstname}} {{deceased_lastname}}',
    recipient_label: 'Au Centre des Finances Publiques de {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, né(e) le {{deceased_dob}}, vous informe de son décès survenu le {{deceased_dod}}.

Je vous prie de bien vouloir prendre en compte ce changement de situation et mettre à jour le dossier fiscal.

Je reste à votre disposition pour fournir tout document nécessaire, notamment en vue de la déclaration de revenus du défunt pour l'année en cours.

${SIGNATURE}`,
  },
]

export const LETTER_TEMPLATES = RAW_TEMPLATES.map((t) => ({
  ...t,
  variables: deriveVariables(t.subject, t.recipient_label, t.body),
}))

export function getLetterTemplate(templateId) {
  return LETTER_TEMPLATES.find((t) => t.id === templateId)
}
