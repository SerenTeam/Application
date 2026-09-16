// Dictionnaire français — source de vérité pour la forme (voir `Strings` dérivé).
// Les clés sont organisées par domaine, en miroir de `src/components/` et `src/pages/`.
// Les courriers (src/data/letter-templates*) et le produit transmission (AccessPage)
// restent hors périmètre : ils ne sont jamais traduits.
export const STRINGS_FR = {
  layout: {
    dashboard: 'Tableau de bord',
    letters: 'Courriers',
    signOut: 'Déconnexion',
    // Navigation latérale du dashboard — wording volontairement identique en FR et EN
    nav: {
      dashboard: 'Dashboard',
      roadmap: 'Roadmap',
      documents: 'Documents',
      contacts: 'Contacts',
    },
    offlineMessage:
      'Vous semblez être hors ligne. Certaines fonctionnalités peuvent être indisponibles.',
    cookie: {
      settingsAriaLabel: 'Gestion des cookies',
      modalTitle: 'Gestion des cookies',
      closeAriaLabel: 'Fermer',
      modalDescription:
        'Choisissez les cookies que vous souhaitez autoriser. Les cookies nécessaires assurent le bon fonctionnement du site et ne peuvent pas être désactivés.',
      necessaryTitle: 'Nécessaires',
      necessaryDescription:
        'Authentification, sécurité et fonctionnement de base. Ces cookies sont indispensables.',
      analyticsTitle: 'Analytics',
      analyticsDescription:
        'Nous aident à comprendre comment vous utilisez Seren pour améliorer votre expérience (PostHog).',
      functionalTitle: 'Fonctionnels',
      functionalDescription:
        'Mémorisent vos préférences (thème, langue) pour personnaliser votre expérience.',
      cancel: 'Annuler',
      saveChoices: 'Enregistrer mes choix',
      bannerAriaLabel: 'Bannière de consentement cookies',
      bannerText:
        'Nous utilisons des cookies pour améliorer votre expérience sur Seren. Vous pouvez personnaliser vos choix à tout moment.',
      learnMore: 'En savoir plus',
      rejectAll: 'Refuser tout',
      customize: 'Personnaliser',
      acceptAll: 'Accepter tout',
    },
  },

  welcome: {
    title: 'Nous sommes là pour vous accompagner',
    description:
      'Ce questionnaire rapide (une quinzaine de questions) nous permet de comprendre votre situation et de générer un parcours personnalisé avec les démarches administratives à effectuer.',
    cta: 'Commencer',
  },

  auth: {
    emailPlaceholder: 'votre@email.com',
    login: {
      title: 'Bienvenue',
      subtitle: 'Connectez-vous pour accéder à votre espace.',
      emailLabel: 'Email',
      passwordLabel: 'Mot de passe',
      submit: 'Se connecter',
      submitting: 'Connexion...',
      forgotPassword: 'Mot de passe oublié ?',
      incorrectCredentials: 'Email ou mot de passe incorrect',
      connectionError: 'Erreur de connexion au serveur. Veuillez réessayer.',
    },
    resetRequest: {
      title: 'Mot de passe oublié',
      subtitle:
        'Renseignez votre adresse email et nous vous enverrons un lien pour réinitialiser votre mot de passe.',
      sentTitle: 'Un lien vous a été envoyé.',
      sentDescription:
        'Si un compte est associé à cette adresse, vous recevrez un email avec les instructions pour réinitialiser votre mot de passe. Pensez à vérifier vos courriers indésirables.',
      backToLogin: 'Retour à la connexion',
      submit: 'Recevoir le lien',
      submitting: 'Envoi en cours...',
      connectionError:
        'Un problème de connexion est survenu. Veuillez vérifier votre connexion internet et réessayer.',
    },
    resetConfirm: {
      linkExpiredTitle: 'Lien expiré',
      linkExpiredDescription:
        "Ce lien de réinitialisation a expiré ou n'est plus valide. Vous pouvez en demander un nouveau.",
      requestNewLink: 'Demander un nouveau lien',
      backToLogin: 'Retour à la connexion',
      title: 'Nouveau mot de passe',
      subtitle: 'Choisissez un nouveau mot de passe pour votre compte.',
      newPasswordLabel: 'Nouveau mot de passe',
      submit: 'Réinitialiser le mot de passe',
      submitting: 'Modification en cours...',
      connectionError: 'Un problème de connexion est survenu. Veuillez réessayer.',
    },
    resetSuccess: {
      title: 'Mot de passe modifié',
      description:
        'Votre mot de passe a bien été modifié. Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.',
      signIn: 'Se connecter',
    },
    passwordConfirm: {
      label: 'Confirmer le mot de passe',
      mismatch: 'Les mots de passe ne correspondent pas',
      match: 'Les mots de passe correspondent',
    },
    passwordInput: {
      show: 'Afficher le mot de passe',
      hide: 'Masquer le mot de passe',
    },
    sessionExpiredTitle: 'Votre session a été fermée',
    sessionExpiredDescription: 'Reconnectez-vous pour continuer.',
    passwordRulesAriaLabel: 'Règles du mot de passe',
    passwordRuleStatusTemplate: '{label}: {status}',
    ruleMet: 'validé',
    ruleNotMet: 'non respecté',
    passwordStrengthTitle: 'Force du mot de passe',
    passwordStrengthAriaTemplate: 'Force du mot de passe: {label}',
    strengthWeak: 'Faible',
    strengthMedium: 'Moyen',
    strengthStrong: 'Fort',
  },

  validation: {
    emailRequired: 'Veuillez renseigner votre adresse email.',
    emailInvalid: 'Cette adresse email n’est pas valide.',
    passwordMinLength: 'Au moins 8 caractères',
    passwordUppercase: 'Une majuscule requise',
    passwordDigit: 'Un chiffre requis',
    passwordSpecialChar: 'Un caractère spécial requis',
    acceptCguRequired: 'Vous devez accepter les CGU pour continuer',
    passwordsMismatch: 'Les mots de passe ne correspondent pas',
    passwordRequired: 'Veuillez renseigner votre mot de passe.',
    currentPasswordRequired: 'Mot de passe actuel requis',
    rules: {
      minLength: '8 caractères minimum',
      hasUppercase: 'Au moins 1 majuscule',
      hasDigit: 'Au moins 1 chiffre',
      hasSpecialChar: 'Au moins 1 caractère spécial (!@#$%...)',
    },
  },

  questionnaire: {
    sessionExpiredMessage:
      "Votre session a expiré après 24 heures d'inactivité. Nous sommes désolés — il faudra reprendre le questionnaire depuis le début. Vos réponses ne sont conservées que le temps de la session, par respect de votre vie privée.",
    restart: 'Recommencer le questionnaire',
    preparing: 'Préparation de votre questionnaire...',
    generatingRoadmap: 'Génération de votre parcours personnalisé...',
    retry: 'Réessayer',
    backToRecap: '← Retour au récapitulatif',
    skip: 'Passer cette question',
    sending: 'Envoi...',
    continueBtn: 'Continuer',
    yes: 'Oui',
    no: 'Non',
    dontKnow: 'Je ne sais pas',
    answerPlaceholder: 'Votre réponse...',
    categoryFallback: 'Question',
    startError: 'Erreur lors du démarrage',
    connectionError: 'Erreur de connexion : {detail}',
    unknownDetail: 'inconnue',
    invalidAnswer: 'Réponse invalide',
    editError: 'Modification impossible',
    finalizeError: 'Finalisation impossible',
    saveAnswersError: 'Impossible de sauvegarder vos réponses.',
    unexpectedError: 'Erreur inattendue',
  },

  recap: {
    title: 'Vérifions ensemble vos réponses',
    description:
      'Votre parcours personnalisé sera construit à partir de ces informations. Vous pouvez modifier chaque réponse avant de confirmer.',
    edit: 'Modifier',
    confirm: 'Confirmer et générer mon parcours',
    generating: 'Génération...',
  },

  completion: {
    title: 'Votre parcours est prêt',
    introPrefix: 'Nous avons identifié',
    stepsUnit: '{count} démarches',
    situationSuffix: 'à effectuer en fonction de votre situation',
    donePrefix: ', dont',
    doneUnit: '{count} déjà faites',
    dashboardHint:
      'Retrouvez votre parcours détaillé avec les courriers pré-remplis sur votre tableau de bord.',
    viewRoadmap: 'Voir mon parcours',
    lettersReady: '{count} courrier{s} prêt{s}',
  },

  dashboardPage: {
    urgencyPhase: {
      urgent: 'Actions urgentes (premières 48h)',
      week: 'Dans la semaine',
      month: 'Dans le mois',
      later: 'À plus long terme',
    },
    loadError: 'Impossible de charger vos démarches.',
    loadingRoadmap: 'Chargement de votre parcours...',
    loadingDetail: 'Récupération des démarches',
    errorTitle: 'Erreur',
    documentsHint: 'Retrouvez vos courriers pré-remplis sur la page dédiée.',
    viewLetters: 'Voir mes courriers',
    contactsHint: 'La gestion des contacts sera disponible prochainement.',
    priorityActionsTitle: 'Prochaines actions prioritaires',
    quickAccessTitle: 'Accès rapides',
    progressTitle: 'Votre progression',
    completedStat: 'Terminées',
    totalStat: 'Étapes totales',
    completeStat: 'Complété',
    allPriorityDone: 'Toutes les étapes prioritaires sont complètes !',
    urgentBadge: 'Urgent',
    importantBadge: 'Important',
    quickAccessButtons: {
      documents: 'Documents transmis',
      roadmap: 'Roadmap complète',
      contacts: 'Contacts',
    },
  },

  roadmap: {
    title: 'Roadmap Administrative',
    subtitle: 'Suivez étape par étape les démarches administratives après le décès',
    notesLabel: 'Notes personnelles :',
    notesPlaceholder: 'Ajoutez vos notes, numéros de dossier, dates, etc.',
    generateLetter: 'Générer le courrier — {organisme}',
    letterTitle: 'Courrier — {organisme}',
    collapse: 'Replier',
    legalReviewNotice:
      'Informations indicatives, en cours de relecture juridique : vérifiez auprès de l’organisme concerné.',
  },

  lettersPage: {
    themeLabels: {
      all: 'Tous',
      banque: 'Banque',
      assurance: 'Assurance',
      administratif: 'Administratif',
      logement: 'Logement',
      succession: 'Succession',
      numerique: 'Numérique',
      fiscal: 'Fiscal',
    },
    loadErrorTitle: 'Erreur de chargement',
    loadErrorDescription: 'Impossible de charger vos courriers.',
    deletedTitle: 'Courrier supprimé',
    deleteErrorTitle: 'Erreur',
    deleteErrorDescription: 'Impossible de supprimer ce courrier.',
    title: 'Mes courriers',
    countLabel: '{count} courrier{s} généré{s}',
    emptyTitle: "Vous n'avez pas encore généré de courrier",
    emptyHint: 'Ouvrez une démarche depuis votre roadmap pour commencer.',
    viewRoadmap: 'Voir ma roadmap',
    statusAll: 'Tous les statuts',
    statusSent: 'Envoyés',
    statusNotSent: 'Non envoyés',
    sortNewest: 'Plus récent',
    sortOldest: 'Plus ancien',
    noMatch: 'Aucun courrier ne correspond à vos filtres.',
    generatedOn: 'Généré le {date}',
    sentBadge: 'Envoyé',
    view: 'Voir',
    copy: 'Copier',
    copied: 'Copié !',
    cancel: 'Annuler',
    confirm: 'Confirmer',
    pdfErrorTitle: 'Erreur',
    pdfErrorDescription: 'Impossible de générer le PDF.',
    pdfFilenamePrefix: 'Courrier',
    copyText: 'Copier le texte',
    downloading: 'Génération...',
    downloadPdf: 'Télécharger en PDF',
    downloadErrorTitle: 'Erreur lors de la génération',
    downloadErrorDescription: 'Veuillez réessayer.',
    completeInfo: 'Complétez les informations manquantes',
    markSentSuccess: 'Courrier marqué comme envoyé',
    markSentErrorTitle: 'Erreur',
    markSentErrorDescription: "Impossible d'enregistrer. Veuillez réessayer.",
    markAsSent: 'Marquer comme envoyé',
    confirmSending: "Confirmer l'envoi",
    sentDateLabel: "Date d'envoi",
    noteLabel: 'Note (optionnel)',
    notePlaceholder: 'Ex : Envoyé en recommandé AR',
    saving: 'Enregistrement...',
    send: {
      recipientLabel: 'Email du destinataire',
      recipientPlaceholder: 'email@exemple.fr',
      cta: 'Envoyer par email',
      sending: 'Envoi...',
      sentBadge: 'Envoyé',
      deliveredBadge: 'Distribué',
      alreadySentBadge: 'Déjà envoyé',
      inProgress: 'Un envoi de ce courrier est déjà en cours, patientez un instant.',
      failedBadge: "Échec de l'envoi",
      notConfigured:
        'L’envoi par Seren n’est pas encore disponible pour ce courrier : téléchargez-le pour l’envoyer vous-même.',
      networkError: 'Une erreur est survenue. Vous pouvez réessayer.',
    },
  },

  profile: {
    backToQuestionnaire: 'Questionnaire',
    back: 'Retour',
    title: 'Mon profil',
    subtitle: 'Consultez et modifiez vos informations personnelles.',
    infoTitle: 'Informations',
    firstNameLabel: 'Prénom',
    notProvided: 'Non renseigné',
    changePasswordTitle: 'Modifier le mot de passe',
    currentPasswordLabel: 'Mot de passe actuel',
    newPasswordLabel: 'Nouveau mot de passe',
    submit: 'Modifier le mot de passe',
    submitting: 'Modification...',
    userNotFound: 'Utilisateur non trouvé',
    currentPasswordIncorrect: 'Le mot de passe actuel est incorrect',
    changeSuccessTitle: 'Mot de passe modifié',
    changeSuccessDescription: 'Votre mot de passe a été mis à jour avec succès.',
    genericError: 'Une erreur est survenue. Veuillez réessayer.',
  },

  errors: {
    somethingWrongTitle: "Une erreur s'est produite",
    somethingWrongDescription:
      'Nos équipes en sont informées et travaillent à la résolution. Vos données sont en sécurité.',
    retry: 'Réessayer',
    backToHome: "Retour à l'accueil",
    maintenanceTitle: 'Seren est en maintenance',
    maintenanceDescription:
      'Nous améliorons le service pour mieux vous accompagner. Revenez dans quelques minutes.',
    maintenanceDataSafe: 'Vos données restent en sécurité pendant cette opération.',
    notFoundTitle: "Cette page n'existe pas",
    notFoundDescription:
      "Il se peut que ce lien soit obsolète ou que l'adresse ait changé. Pas d'inquiétude, vos données sont en sécurité.",
    resumeSteps: 'Reprendre mes démarches',
    saveRoadmapFailed: 'Impossible de sauvegarder votre roadmap. Veuillez réessayer.',
    saveStepsFailed: 'Impossible de sauvegarder les étapes. Veuillez réessayer.',
    copyFailedTitle: 'Impossible de copier',
    copyFailedDescription: 'Veuillez sélectionner le texte manuellement.',
  },

  // Espace partenaire PF v2 (contrat §2.2, §4.4) : la PF ouvre le dossier de la famille, suit ses
  // invitations et ses compteurs. Aucun libellé de montant, aucun libellé de contenu : la PF ne
  // voit jamais ce que la famille remplit.
  partner: {
    title: 'Espace partenaire',
    roleManager: 'Gérant',
    roleAdvisor: 'Conseiller',
    loadError: 'Impossible de charger votre espace partenaire.',
    retry: 'Réessayer',
    privacyNotice:
      'Vous ne voyez jamais le contenu du dossier de la famille : ni ses réponses, ni ses démarches, ni ses courriers, ni ses documents.',
    counters: {
      title: 'Vos dossiers',
      createdThisMonth: 'Créés ce mois',
      createdTotal: 'Créés au total',
      activatedTotal: 'Activés par la famille',
      pendingActivation: 'En attente d’activation',
      expiredInvitations: '{count} invitation{s} expirée{s}',
      cancelledTotal: '{count} annulé{s}',
    },
    form: {
      title: 'Ouvrir un dossier famille',
      familySection: 'La famille',
      deceasedSection: 'Le défunt',
      firstName: 'Prénom',
      lastName: 'Nom',
      email: 'E-mail',
      emailHint: 'L’invitation part à cette adresse : elle doit être personnelle à la famille.',
      phone: 'Téléphone (optionnel)',
      deathDate: 'Date du décès',
      submit: 'Créer et envoyer l’invitation',
      submitting: 'Création...',
      duplicateTitle: 'Un dossier existe déjà pour ce défunt à cette date',
      duplicateBody: 'Confirmez si vous souhaitez tout de même créer un nouveau dossier.',
      duplicateConfirm: 'Créer quand même',
      duplicateCancel: 'Annuler',
      created: 'Dossier créé. L’invitation a été envoyée à {email}.',
      createdEmailFailed: 'Dossier créé, mais l’e-mail n’a pas pu partir : utilisez « Renvoyer l’invitation ».',
      copyLink: 'Copier le lien d’activation (préproduction)',
      linkCopied: 'Lien copié',
      activationsClosed: 'La création de dossiers est momentanément fermée.',
      genericError: 'La création a échoué, réessayez.',
      errors: {
        required: 'Champ obligatoire',
        tooLong: '100 caractères maximum',
        invalidEmail: 'Adresse e-mail invalide',
        invalidPhone: 'Numéro de téléphone invalide',
        futureDate: 'La date ne peut pas être dans le futur',
        tooOld: 'Décès de plus de 2 ans : contactez Seren',
      },
    },
    list: {
      title: 'Dossiers',
      empty: 'Aucun dossier pour le moment.',
      family: 'Famille',
      deceased: 'Défunt : {name} — décès le {date}',
      createdOn: 'Créé le {date}',
      activatedOn: 'Activé le {date}',
      cancelledOn: 'Annulé le {date}',
      invitationValidUntil: 'Invitation valable jusqu’au {date}',
    },
    status: {
      invited: 'Invitation envoyée',
      invitedExpired: 'Invitation expirée',
      active: 'Activé',
      closed: 'Clos',
      cancelled: 'Annulé',
    },
    actions: {
      resend: 'Renvoyer l’invitation',
      resending: 'Envoi...',
      resent: 'Invitation renvoyée.',
      cancel: 'Annuler le dossier',
      cancelConfirm: 'Confirmer l’annulation',
      cancelKeep: 'Garder',
      cancelling: 'Annulation...',
      cancelUntil: 'Annulable jusqu’au {date}',
      actionError: 'L’action a échoué, réessayez.',
    },
  },

  // Envoi papier (chantier 2a) — panneau d'envoi pour les courriers au canal `papier`
  // (courrier simple, MySendingBox). Les courriers eux-mêmes restent toujours en français ;
  // cette UI, elle, est bilingue comme le reste de l'app.
  paperSend: {
    // Profil expéditeur (sender_profiles)
    senderTitle: 'Votre adresse d’expéditeur',
    senderHint: 'Elle figure en tête du courrier et sert d’adresse de retour.',
    senderFullNameLabel: 'Nom complet',
    senderAddressLine1Label: 'Adresse',
    senderAddressLine2Label: 'Complément d’adresse (optionnel)',
    senderPostalCodeLabel: 'Code postal',
    senderCityLabel: 'Ville',
    senderRelationshipLabel: 'Votre lien avec le défunt (optionnel)',
    senderSaveCta: 'Enregistrer mon adresse',
    senderSaving: 'Enregistrement...',
    senderSavedHint: 'Adresse enregistrée.',
    senderSaveError: 'Impossible d’enregistrer votre adresse, réessayez.',
    senderEditCta: 'Modifier',
    senderMissingFields: 'Complétez tous les champs obligatoires.',

    // Adresse du destinataire
    recipientTitle: 'Adresse du destinataire',
    recipientNameLabel: 'Nom du destinataire',
    recipientAddressLine1Label: 'Adresse',
    recipientAddressLine2Label: 'Complément d’adresse (optionnel)',
    recipientPostalCodeLabel: 'Code postal',
    recipientCityLabel: 'Ville',
    recipientPickerLabel: 'Choisir dans l’annuaire',
    recipientPickerPlaceholder: 'Sélectionnez un organisme',
    recipientPickerLoading: 'Chargement de l’annuaire...',
    recipientPickerHint: 'Adresse pré-remplie par l’annuaire, modifiable si besoin.',
    recipientPickerError: 'Impossible de charger l’annuaire, saisissez l’adresse manuellement.',
    recipientDepartmentPrompt: 'Département du défunt',
    recipientDepartmentHint: 'Nécessaire pour retrouver l’organisme local (ex : 75, 2A, 971).',
    recipientDepartmentPlaceholder: 'Ex : 75',
    recipientDepartmentInvalid: 'Département invalide (ex : 75, 2A, 971)',
    recipientDepartmentConfirmCta: 'Valider',
    recipientFrozenNote:
      'L’adresse ne peut pas être modifiée lors de cette reprise : elle fait partie de l’identification de ce courrier.',

    // Partagés (profil expéditeur + destinataire)
    lineCounter: '{count}/45 caractères',
    invalidPostalCode: 'Code postal à 5 chiffres',
    panelLoading: 'Chargement...',

    // Pièces jointes (coffre minimal)
    attachmentsTitle: 'Pièces jointes',
    attachmentsHint: 'Quatre au maximum. L’acte de décès est recommandé pour ce courrier.',
    attachmentsActeDeces: 'Acte de décès',
    attachmentsJustificatif: 'Justificatif',
    attachmentsUploadCta: 'Ajouter un document',
    attachmentsUploading: 'Envoi du document...',
    attachmentsUploadError: 'Impossible d’ajouter ce document, réessayez.',
    attachmentsMaxReached: 'Quatre pièces jointes au maximum.',
    attachmentsEmpty: 'Aucun document dans votre coffre pour le moment.',
    attachmentsFrozenNote:
      'Les pièces jointes ne peuvent pas être modifiées lors de cette reprise : c’est exactement ce qui a déjà été transmis.',
    attachmentsLoadError: 'Impossible de charger votre coffre.',
    attachmentsLoading: 'Chargement de votre coffre...',

    // Quota et facturation à l'acte
    quotaLoading: 'Vérification de votre solde...',
    quotaRemaining: '{count} envoi{s} inclus restant{s} sur {total}',
    quotaExhausted: 'Vous avez utilisé tous vos envois inclus.',
    quotaExhaustedSupport:
      'Vous avez utilisé vos envois inclus. Pour tout envoi supplémentaire, contactez le support : {email}.',
    channelClosed:
      'L’envoi par Seren n’est pas encore disponible pour ce courrier : téléchargez-le pour l’envoyer vous-même.',
    quotaBuyCta: 'Acheter un envoi supplémentaire',
    quotaBuyCtaWithPrice: 'Acheter un envoi supplémentaire — {price}',
    quotaBuyOpening: 'Ouverture du paiement...',
    quotaBuyError: 'Impossible d’ouvrir le paiement, réessayez.',

    // Envoi et statuts
    sendCta: 'Envoyer ce courrier par la poste',
    sending: 'Envoi en cours...',
    retryCta: 'Réessayer l’envoi',
    statusSubmitted: 'Pris en charge',
    statusSent: 'Expédié',
    statusFailedAddressTitle: 'Adresse non distribuable',
    statusFailedAddressHint: 'Corrigez l’adresse puis renvoyez ce courrier — ce renvoi est offert.',
    resendCta: 'Corriger l’adresse et renvoyer (offert)',
    statusFailed: 'L’envoi a échoué',
    retryableHint: 'Service momentanément indisponible, réessayez dans un instant.',
    finalizingPayment: 'Finalisation du paiement en cours, réessayez dans un instant...',
    autoRetrying: 'Nouvelle tentative en cours...',
    missingFieldsHint: 'Complétez les informations ci-dessus avant l’envoi.',
  },
  // Ancres contractuelles v2 (docs/design-v2-demonstrateur.md §8.1) : un namespace NEUF s'insère
  // JUSTE AVANT l'ancre de son lot ; les namespaces existants se modifient en place.

  // Accès v2 (contrat §7.1, §7.2) : écran « accès non activé » rendu par RequireAccess, et
  // remplacement du lien d'inscription sur /login (il n'y a plus d'inscription publique).
  access: {
    loginNoAccount: 'Votre accès vous est ouvert par votre pompe funèbre.',
    notActivatedTitle: 'Votre accès n’est pas encore activé',
    notActivatedBody:
      'Seren est proposé par les pompes funèbres partenaires. Si vous avez reçu une invitation, ouvrez le lien de l’e-mail. Sinon, contactez votre pompe funèbre ou le support.',
    supportLine: 'Support : {email}',
    signOut: 'Se déconnecter',
    backToLogin: 'Retour à la connexion',
  },

  // Page publique /activation (contrat §7.3) : tous les états de la machine d'activation.
  activation: {
    title: 'Activer votre accès Seren',
    checking: 'Vérification de votre lien...',
    invitedBy: '{partner} vous ouvre un accompagnement Seren.',
    invitedByGeneric: 'Votre accompagnement Seren vous attend.',
    greeting: 'Bonjour {name},',
    emailLabel: 'Votre adresse e-mail',
    emailHint: 'C’est l’adresse à laquelle vous avez reçu l’invitation.',
    passwordLabel: 'Choisissez un mot de passe',
    submit: 'Activer mon accès',
    submitting: 'Activation en cours...',
    claiming: 'Ouverture de votre espace...',
    weakPassword: 'Ce mot de passe est trop faible : choisissez-en un plus long.',
    missingTitle: 'Lien incomplet',
    missingBody: 'Rouvrez le lien reçu par e-mail, sans le modifier.',
    invalidTitle: 'Lien non valide',
    invalidBody: 'Ce lien n’est plus valide ou a déjà été utilisé.',
    alreadyActivated: 'Déjà activé ? Connectez-vous',
    expiredTitle: 'Lien expiré',
    expiredBody: 'Demandez un nouveau lien à {partner}.',
    expiredBodyGeneric: 'Demandez un nouveau lien à votre pompe funèbre.',
    closedTitle: 'Activation momentanément indisponible',
    closedBody: 'Réessayez dans quelques instants.',
    otherSessionTitle: 'Un autre compte est connecté',
    otherSessionBody: 'Ce lien concerne une autre adresse e-mail. Déconnectez-vous pour continuer.',
    otherSessionCta: 'Se déconnecter et continuer',
    existingAccountTitle: 'Un compte existe déjà avec cette adresse',
    existingAccountBody: 'Saisissez le mot de passe de ce compte, ou réinitialisez-le.',
    existingAccountPasswordLabel: 'Mot de passe de votre compte',
    existingAccountSubmit: 'Me connecter et activer',
    resetPassword: 'Réinitialiser mon mot de passe',
    errorTitle: 'Une erreur est survenue',
    errorBody: 'Vous pouvez réessayer dans un instant.',
    retry: 'Réessayer',
    support: 'Besoin d’aide ? Écrivez à {email}',
  },

  // Page /bienvenue (contrat §7.4) : les 3 consentements obligatoires, horodatés par record_consents.
  consent: {
    title: 'Bienvenue',
    providedBy: 'Votre accompagnement Seren vous est proposé par {partner}.',
    providedByGeneric: 'Votre accompagnement Seren.',
    deceasedLine: 'Nous sommes à vos côtés pour les démarches liées au décès de {name}.',
    intro: 'Avant de commencer, merci de prendre connaissance de ces trois points.',
    terms: 'J’accepte les conditions générales d’utilisation (version bêta)',
    termsLink: 'Lire les conditions',
    privacy: 'J’ai pris connaissance de la politique de confidentialité',
    privacyLink: 'Lire la politique',
    sensitiveData:
      'J’accepte que Seren traite les informations sensibles nécessaires à mes démarches (décès, situation familiale, patrimoine)',
    cta: 'Commencer',
    submitting: 'Enregistrement...',
    saveError: 'Impossible d’enregistrer votre accord, réessayez.',
    allRequired: 'Les trois cases sont nécessaires pour utiliser Seren.',
  },

  // Pages publiques /legal et /security (contrat §7.1) — VALEURS PROVISOIRES : L7 (Task 34) pose
  // les textes définitifs après la relecture juridique ; seule la structure appartient à L3.
  legalPages: {
    betaBanner: 'Version bêta — relecture juridique en cours.',
    legal: {
      title: 'Conditions générales d’utilisation (version bêta)',
      blocks: [
        { heading: 'Un service en version bêta', body: 'Seren est ouvert en version bêta à des familles invitées par une pompe funèbre partenaire. Les informations et modèles de courriers sont fournis à titre indicatif et sont en cours de relecture juridique : vérifiez-les auprès des organismes concernés.' },
        { heading: 'Contact', body: 'Pour toute question, écrivez au support : support@seren-app.fr.' },
      ],
    },
    security: {
      title: 'Politique de confidentialité (version bêta)',
      blocks: [
        { heading: 'Vos données', body: 'Seren traite les informations nécessaires à vos démarches, transmises par votre pompe funèbre ou saisies par vous. Le contenu de votre dossier (réponses, démarches, courriers, documents) n’est jamais visible par la pompe funèbre.' },
        { heading: 'Vos droits', body: 'Accès, rectification, effacement, opposition : écrivez à support@seren-app.fr. Vous pouvez aussi adresser une réclamation à la CNIL (cnil.fr).' },
      ],
    },
  },
  // v2:ns-l3

  // v2:ns-l4

  // v2:ns-l4b

  // Vue admin Seren (lot L4c) — compteurs par partenaire, jamais de donnée de famille.
  admin: {
    title: 'Administration Seren',
    lead: 'Compteurs par partenaire — aucune donnée des familles.',
    generatedAt: 'Mis à jour le {date}',
    month: 'Mois en cours : {month}',
    refresh: 'Actualiser',
    empty: 'Aucun partenaire.',
    forbidden: 'Accès réservé à l’équipe Seren.',
    loadError: 'Impossible de charger les compteurs.',
    never: '—',
    totals: 'Total',
    columns: {
      partner: 'Partenaire',
      status: 'Statut',
      total: 'Dossiers créés',
      thisMonth: 'Créés ce mois',
      pending: 'Invités en attente',
      activated: 'Activés',
      cancelled: 'Annulés',
      lastDossier: 'Dernier dossier',
    },
    statusLabels: { prospect: 'Prospect', active: 'Actif', suspended: 'Suspendu', terminated: 'Résilié' },
  },
  // v2:ns-l4c

  // Offre v2 côté famille (contrat §7.6) : jamais de prix, jamais de mention LRAR.
  offer: {
    unlimitedAccess: 'Accès sans limite de durée',
    // Deux formes : « postal » ne se pluralise pas avec un simple {s} (postal → postaux).
    includedSends: '{count} envois postaux inclus',
    includedSendsOne: '1 envoi postal inclus',
    providedBy: 'Proposé par {partner}',
    providedByGeneric: 'Votre accompagnement Seren',
  },
  // v2:ns-l5
}

export type Strings = typeof STRINGS_FR
