// E-mail d'invitation famille (contrat §4.4) — PREMIER contact avec une personne dont les données
// ont été saisies par un tiers (la PF) : information RGPD art. 14 obligatoire. Texte brut, sans
// pièce jointe, sans aucune valeur relative au défunt. Ne dépend PAS d'EMAIL_SENDS_ENABLED (qui ne
// gouverne que les courriers aux organismes). Toute modification de ces textes est reportée à
// l'identique dans docs/textes-beta-v2.md (§ art. 14), relu par Arnaud.
const FALLBACK_PARTNER = { fr: 'Votre pompe funèbre', en: 'Your funeral home' }

function formatDate(iso, lang) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris',
  }).format(date)
}

function securityUrlFrom(activationUrl) {
  try {
    return `${new URL(activationUrl).origin}/security`
  } catch {
    return null
  }
}

export function renderInvitationEmail({ lang = 'fr', partnerName, familyFirstName, activationUrl, expiresAt, supportEmail }) {
  const l = lang === 'en' ? 'en' : 'fr'
  const partner = partnerName || FALLBACK_PARTNER[l]
  const until = formatDate(expiresAt, l)
  const securityUrl = securityUrlFrom(activationUrl)

  if (l === 'en') {
    const lines = [
      familyFirstName ? `Hello ${familyFirstName},` : 'Hello,',
      '',
      `${partner} is opening a Seren support account for you, to help with the administrative steps after the death of your loved one. This support is included in ${partner}'s services: you have nothing to pay to Seren.`,
      '',
      `To activate your access, choose your password by opening this personal link, valid for 7 days${until ? ` (until ${until})` : ''}:`,
      activationUrl,
      '',
      'This link is personal: please do not forward it.',
      '',
      'Why are you receiving this message?',
      `To open this service, ${partner} shared with Seren your first name, last name, email address and, where applicable, your phone number, as well as the first name, last name and date of death of your loved one. Seren uses this information only to create and prepare your support (basis: performance of the service offered by ${partner}). The retention period is set out in our privacy policy.`,
      '',
      `Your rights: you can request access to this information, its rectification or erasure, and object to its use, by writing to ${supportEmail}. You can also lodge a complaint with the CNIL (cnil.fr).`,
      securityUrl ? `Privacy policy: ${securityUrl}` : null,
      '',
      `If you do not wish to use Seren, simply ignore this message: without activation, the invitation expires${until ? ` on ${until}` : ' after 7 days'}.`,
      '',
      'The Seren team',
    ]
    return { subject: `${partner} opens your Seren support`, text: lines.filter((line) => line !== null).join('\n') }
  }

  const lines = [
    familyFirstName ? `Bonjour ${familyFirstName},` : 'Bonjour,',
    '',
    `${partner} vous ouvre un accompagnement Seren pour vous aider dans les démarches administratives après le décès de votre proche. Cet accompagnement est compris dans les prestations de ${partner} : vous n'avez rien à payer à Seren.`,
    '',
    `Pour activer votre accès, choisissez votre mot de passe en ouvrant ce lien personnel, valable 7 jours${until ? ` (jusqu'au ${until})` : ''} :`,
    activationUrl,
    '',
    'Ce lien est personnel : ne le transférez pas.',
    '',
    'Pourquoi recevez-vous ce message ?',
    `Pour ouvrir ce service, ${partner} a transmis à Seren votre prénom, votre nom, votre adresse e-mail et, le cas échéant, votre numéro de téléphone, ainsi que le prénom, le nom et la date de décès de votre proche. Seren utilise ces informations uniquement pour créer et préparer votre accompagnement (base : exécution du service proposé par ${partner}). La durée de conservation est précisée dans notre politique de confidentialité.`,
    '',
    `Vos droits : vous pouvez demander l'accès à ces informations, leur rectification ou leur effacement, et vous opposer à leur utilisation, en écrivant à ${supportEmail}. Vous pouvez aussi adresser une réclamation à la CNIL (cnil.fr).`,
    securityUrl ? `Politique de confidentialité : ${securityUrl}` : null,
    '',
    `Si vous ne souhaitez pas utiliser Seren, ignorez simplement ce message : sans activation, l'invitation expire${until ? ` le ${until}` : ' au bout de 7 jours'}.`,
    '',
    "L'équipe Seren",
  ]
  return { subject: `${partner} vous ouvre votre accompagnement Seren`, text: lines.filter((line) => line !== null).join('\n') }
}

export function createInvitationSender({ resendClient, from }) {
  return {
    async send(opts) {
      if (!resendClient || !from) throw new Error('email_not_configured')
      const { subject, text } = renderInvitationEmail(opts)
      const { data, error } = await resendClient.emails.send({ from, to: opts.to, subject, text })
      // Jamais le message du fournisseur : il peut contenir l'adresse du destinataire.
      if (error) throw new Error('invitation_provider_error')
      return { providerRef: data?.id ?? null }
    },
  }
}
