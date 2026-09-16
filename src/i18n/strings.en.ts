import type { Strings } from './strings.fr'

// Dictionnaire anglais — DOIT avoir exactement les mêmes clés que STRINGS_FR.
// tsc échoue si une clé manque ou diverge : c'est l'invariant de parité UI.
// Textes récoltés depuis la branche `demo-en` (jamais retraduits).
export const STRINGS_EN: Strings = {
  layout: {
    dashboard: 'Dashboard',
    letters: 'Letters',
    signOut: 'Sign out',
    nav: {
      dashboard: 'Dashboard',
      roadmap: 'Roadmap',
      documents: 'Documents',
      contacts: 'Contacts',
    },
    offlineMessage:
      'You appear to be offline. Some features may be unavailable.',
    cookie: {
      settingsAriaLabel: 'Cookie settings',
      modalTitle: 'Cookie settings',
      closeAriaLabel: 'Close',
      modalDescription:
        "Choose which cookies you'd like to allow. Necessary cookies keep the site running properly and cannot be disabled.",
      necessaryTitle: 'Necessary',
      necessaryDescription:
        'Authentication, security and core functionality. These cookies are essential.',
      analyticsTitle: 'Analytics',
      analyticsDescription:
        'Help us understand how you use Seren so we can improve your experience (PostHog).',
      functionalTitle: 'Functional',
      functionalDescription:
        'Remember your preferences (theme, language) to personalize your experience.',
      cancel: 'Cancel',
      saveChoices: 'Save my choices',
      bannerAriaLabel: 'Cookie consent banner',
      bannerText:
        'We use cookies to improve your experience on Seren. You can customize your choices at any time.',
      learnMore: 'Learn more',
      rejectAll: 'Reject all',
      customize: 'Customize',
      acceptAll: 'Accept all',
    },
  },

  welcome: {
    title: "We're here to support you",
    description:
      "This quick questionnaire (around fifteen questions) helps us understand your situation and generate a personalized roadmap with the administrative steps to take.",
    cta: 'Get started',
  },

  auth: {
    emailPlaceholder: 'your@email.com',
    login: {
      title: 'Welcome',
      subtitle: 'Sign in to access your space.',
      emailLabel: 'Email',
      passwordLabel: 'Password',
      submit: 'Sign in',
      submitting: 'Signing in...',
      forgotPassword: 'Forgot your password?',
      incorrectCredentials: 'Incorrect email or password',
      connectionError: 'Server connection error. Please try again.',
    },
    resetRequest: {
      title: 'Forgot your password?',
      subtitle:
        "Enter your email address and we'll send you a link to reset your password.",
      sentTitle: 'A link has been sent to you.',
      sentDescription:
        "If an account is associated with this address, you'll receive an email with instructions to reset your password. Remember to check your spam folder.",
      backToLogin: 'Back to sign in',
      submit: 'Send me the link',
      submitting: 'Sending...',
      connectionError:
        'A connection problem occurred. Please check your internet connection and try again.',
    },
    resetConfirm: {
      linkExpiredTitle: 'Link expired',
      linkExpiredDescription:
        'This reset link has expired or is no longer valid. You can request a new one.',
      requestNewLink: 'Request a new link',
      backToLogin: 'Back to sign in',
      title: 'New password',
      subtitle: 'Choose a new password for your account.',
      newPasswordLabel: 'New password',
      submit: 'Reset password',
      submitting: 'Updating...',
      connectionError: 'A connection problem occurred. Please try again.',
    },
    resetSuccess: {
      title: 'Password changed',
      description:
        'Your password has been successfully changed. You can now sign in with your new password.',
      signIn: 'Sign in',
    },
    passwordConfirm: {
      label: 'Confirm password',
      mismatch: 'Passwords do not match',
      match: 'Passwords match',
    },
    passwordInput: {
      show: 'Show password',
      hide: 'Hide password',
    },
    sessionExpiredTitle: 'Your session has ended',
    sessionExpiredDescription: 'Please sign in again to continue.',
    passwordRulesAriaLabel: 'Password rules',
    passwordRuleStatusTemplate: '{label}: {status}',
    ruleMet: 'met',
    ruleNotMet: 'not met',
    passwordStrengthTitle: 'Password strength',
    passwordStrengthAriaTemplate: 'Password strength: {label}',
    strengthWeak: 'Weak',
    strengthMedium: 'Medium',
    strengthStrong: 'Strong',
  },

  validation: {
    emailRequired: 'Please enter your email address.',
    emailInvalid: 'This email address is not valid.',
    passwordMinLength: 'At least 8 characters',
    passwordUppercase: 'An uppercase letter is required',
    passwordDigit: 'A digit is required',
    passwordSpecialChar: 'A special character is required',
    acceptCguRequired: 'You must accept the terms of service to continue',
    passwordsMismatch: 'Passwords do not match',
    passwordRequired: 'Please enter your password.',
    currentPasswordRequired: 'Current password is required',
    rules: {
      minLength: 'At least 8 characters',
      hasUppercase: 'At least 1 uppercase letter',
      hasDigit: 'At least 1 digit',
      hasSpecialChar: 'At least 1 special character (!@#$%...)',
    },
  },

  questionnaire: {
    sessionExpiredMessage:
      "Your session expired after 24 hours of inactivity. We're sorry — you'll need to start the questionnaire over. Your answers are only kept for the duration of the session, to protect your privacy.",
    restart: 'Restart the questionnaire',
    preparing: 'Preparing your questionnaire...',
    generatingRoadmap: 'Generating your personalized roadmap...',
    retry: 'Retry',
    backToRecap: '← Back to summary',
    skip: 'Skip this question',
    sending: 'Sending...',
    continueBtn: 'Continue',
    yes: 'Yes',
    no: 'No',
    dontKnow: "I don't know",
    answerPlaceholder: 'Your answer...',
    categoryFallback: 'Question',
    startError: 'Error starting the questionnaire',
    connectionError: 'Connection error: {detail}',
    unknownDetail: 'unknown',
    invalidAnswer: 'Invalid answer',
    editError: 'Unable to edit',
    finalizeError: 'Unable to finalize',
    saveAnswersError: 'Unable to save your answers.',
    unexpectedError: 'Unexpected error',
  },

  recap: {
    title: "Let's review your answers together",
    description:
      'Your personalized roadmap will be built from this information. You can edit any answer before confirming.',
    edit: 'Edit',
    confirm: 'Confirm and generate my roadmap',
    generating: 'Generating...',
  },

  completion: {
    title: 'Your roadmap is ready',
    introPrefix: "We've identified",
    stepsUnit: '{count} steps',
    situationSuffix: 'to complete based on your situation',
    donePrefix: ', including',
    doneUnit: '{count} already done',
    dashboardHint:
      'Find your detailed roadmap with pre-filled letters on your dashboard.',
    viewRoadmap: 'View my roadmap',
    lettersReady: '{count} letter{s} ready',
  },

  dashboardPage: {
    urgencyPhase: {
      urgent: 'Urgent actions (first 48h)',
      week: 'Within the week',
      month: 'Within the month',
      later: 'Longer term',
    },
    loadError: 'Unable to load your procedures.',
    loadingRoadmap: 'Loading your roadmap...',
    loadingDetail: 'Retrieving procedures',
    errorTitle: 'Error',
    documentsHint: 'Find your pre-filled letters on the dedicated page.',
    viewLetters: 'View my letters',
    contactsHint: 'Contact management will be available soon.',
    priorityActionsTitle: 'Next priority actions',
    quickAccessTitle: 'Quick access',
    progressTitle: 'Your progress',
    completedStat: 'Completed',
    totalStat: 'Total steps',
    completeStat: 'Complete',
    allPriorityDone: 'All priority steps are complete!',
    urgentBadge: 'Urgent',
    importantBadge: 'Important',
    quickAccessButtons: {
      documents: 'My letters',
      roadmap: 'Full roadmap',
      contacts: 'Contacts',
    },
  },

  roadmap: {
    title: 'Administrative Roadmap',
    subtitle: 'Follow the administrative procedures after a death, step by step',
    notesLabel: 'Personal notes:',
    notesPlaceholder: 'Add your notes, file numbers, dates, etc.',
    generateLetter: 'Generate letter — {organisme}',
    letterTitle: 'Letter — {organisme}',
    collapse: 'Collapse',
    legalReviewNotice:
      'Guidance only, currently under legal review: please check with the organisation concerned.',
  },

  lettersPage: {
    themeLabels: {
      all: 'All',
      banque: 'Banking',
      assurance: 'Insurance',
      administratif: 'Administrative',
      logement: 'Housing',
      succession: 'Estate',
      numerique: 'Digital',
      fiscal: 'Tax',
    },
    loadErrorTitle: 'Loading error',
    loadErrorDescription: 'Unable to load your letters.',
    deletedTitle: 'Letter deleted',
    deleteErrorTitle: 'Error',
    deleteErrorDescription: 'Unable to delete this letter.',
    title: 'My letters',
    countLabel: '{count} letter{s} generated',
    emptyTitle: "You haven't generated any letters yet",
    emptyHint: 'Open a step from your roadmap to get started.',
    viewRoadmap: 'View my roadmap',
    statusAll: 'All statuses',
    statusSent: 'Sent',
    statusNotSent: 'Not sent',
    sortNewest: 'Newest',
    sortOldest: 'Oldest',
    noMatch: 'No letters match your filters.',
    generatedOn: 'Generated on {date}',
    sentBadge: 'Sent',
    view: 'View',
    copy: 'Copy',
    copied: 'Copied!',
    cancel: 'Cancel',
    confirm: 'Confirm',
    pdfErrorTitle: 'Error',
    pdfErrorDescription: 'Unable to generate the PDF.',
    pdfFilenamePrefix: 'Letter',
    copyText: 'Copy text',
    downloading: 'Generating...',
    downloadPdf: 'Download as PDF',
    downloadErrorTitle: 'Generation error',
    downloadErrorDescription: 'Please try again.',
    completeInfo: 'Complete the missing information',
    markSentSuccess: 'Letter marked as sent',
    markSentErrorTitle: 'Error',
    markSentErrorDescription: 'Unable to save. Please try again.',
    markAsSent: 'Mark as sent',
    confirmSending: 'Confirm sending',
    sentDateLabel: 'Date sent',
    noteLabel: 'Note (optional)',
    notePlaceholder: 'E.g.: Sent by registered letter with acknowledgement of receipt',
    saving: 'Saving...',
    send: {
      recipientLabel: 'Recipient email',
      recipientPlaceholder: 'email@example.com',
      cta: 'Send by email',
      sending: 'Sending...',
      sentBadge: 'Sent',
      deliveredBadge: 'Delivered',
      alreadySentBadge: 'Already sent',
      inProgress: 'This letter is already being sent, please wait a moment.',
      failedBadge: 'Sending failed',
      notConfigured: 'Sending through Seren is not available for this letter yet: download it to send it yourself.',
      networkError: 'Something went wrong. You can try again.',
    },
  },

  profile: {
    backToQuestionnaire: 'Questionnaire',
    back: 'Back',
    title: 'My profile',
    subtitle: 'View and edit your personal information.',
    infoTitle: 'Information',
    firstNameLabel: 'First name',
    notProvided: 'Not provided',
    changePasswordTitle: 'Change password',
    currentPasswordLabel: 'Current password',
    newPasswordLabel: 'New password',
    submit: 'Change password',
    submitting: 'Updating...',
    userNotFound: 'User not found',
    currentPasswordIncorrect: 'The current password is incorrect',
    changeSuccessTitle: 'Password changed',
    changeSuccessDescription: 'Your password has been successfully updated.',
    genericError: 'An error occurred. Please try again.',
  },

  errors: {
    somethingWrongTitle: 'Something went wrong',
    somethingWrongDescription:
      'Our teams have been notified and are working on a fix. Your data is safe.',
    retry: 'Retry',
    backToHome: 'Back to home',
    maintenanceTitle: 'Seren is under maintenance',
    maintenanceDescription:
      "We're improving the service to support you better. Please check back in a few minutes.",
    maintenanceDataSafe: 'Your data remains safe during this operation.',
    notFoundTitle: "This page doesn't exist",
    notFoundDescription:
      "This link may be outdated, or the address may have changed. Don't worry, your data is safe.",
    resumeSteps: 'Resume my procedures',
    saveRoadmapFailed: 'Unable to save your roadmap. Please try again.',
    saveStepsFailed: 'Unable to save the steps. Please try again.',
    copyFailedTitle: 'Unable to copy',
    copyFailedDescription: 'Please select the text manually.',
  },

  // v2 partner space (contract §2.2, §4.4): the funeral home opens the family's case and follows
  // its invitations and counters. No amount labels, no content labels: the partner never sees
  // what the family fills in.
  partner: {
    title: 'Partner area',
    roleManager: 'Manager',
    roleAdvisor: 'Advisor',
    loadError: 'Unable to load your partner area.',
    retry: 'Try again',
    privacyNotice:
      'You never see the content of the family’s file: not their answers, steps, letters or documents.',
    counters: {
      title: 'Your cases',
      createdThisMonth: 'Created this month',
      createdTotal: 'Created in total',
      activatedTotal: 'Activated by the family',
      pendingActivation: 'Awaiting activation',
      expiredInvitations: '{count} expired invitation{s}',
      cancelledTotal: '{count} cancelled',
    },
    form: {
      title: 'Open a family case',
      familySection: 'The family',
      deceasedSection: 'The deceased',
      firstName: 'First name',
      lastName: 'Last name',
      email: 'Email',
      emailHint: 'The invitation is sent to this address: it must belong to the family.',
      phone: 'Phone (optional)',
      deathDate: 'Date of death',
      submit: 'Create and send the invitation',
      submitting: 'Creating...',
      duplicateTitle: 'A case already exists for this deceased person on this date',
      duplicateBody: 'Confirm if you still want to create a new case.',
      duplicateConfirm: 'Create anyway',
      duplicateCancel: 'Cancel',
      created: 'Case created. The invitation was sent to {email}.',
      createdEmailFailed: 'Case created, but the email could not be sent: use “Resend invitation”.',
      copyLink: 'Copy the activation link (pre-production)',
      linkCopied: 'Link copied',
      activationsClosed: 'Case creation is temporarily closed.',
      genericError: 'Creation failed, please try again.',
      errors: {
        required: 'Required field',
        tooLong: '100 characters maximum',
        invalidEmail: 'Invalid email address',
        invalidPhone: 'Invalid phone number',
        futureDate: 'The date cannot be in the future',
        tooOld: 'Death more than 2 years ago: contact Seren',
      },
    },
    list: {
      title: 'Cases',
      empty: 'No cases yet.',
      family: 'Family',
      deceased: 'Deceased: {name} — died on {date}',
      createdOn: 'Created on {date}',
      activatedOn: 'Activated on {date}',
      cancelledOn: 'Cancelled on {date}',
      invitationValidUntil: 'Invitation valid until {date}',
    },
    status: {
      invited: 'Invitation sent',
      invitedExpired: 'Invitation expired',
      active: 'Activated',
      closed: 'Closed',
      cancelled: 'Cancelled',
    },
    actions: {
      resend: 'Resend invitation',
      resending: 'Sending...',
      resent: 'Invitation resent.',
      cancel: 'Cancel the case',
      cancelConfirm: 'Confirm cancellation',
      cancelKeep: 'Keep',
      cancelling: 'Cancelling...',
      cancelUntil: 'Can be cancelled until {date}',
      actionError: 'The action failed, please try again.',
    },
  },

  // Paper sending (chantier 2a) — send panel for `papier` channel letters (simple mail,
  // MySendingBox). The letters themselves stay in French ; this UI is bilingual like the rest
  // of the app.
  paperSend: {
    // Sender address (sender_profiles)
    senderTitle: 'Your sender address',
    senderHint: 'It appears at the top of the letter and serves as the return address.',
    senderFullNameLabel: 'Full name',
    senderAddressLine1Label: 'Address',
    senderAddressLine2Label: 'Address line 2 (optional)',
    senderPostalCodeLabel: 'Postal code',
    senderCityLabel: 'City',
    senderRelationshipLabel: 'Your relationship with the deceased (optional)',
    senderSaveCta: 'Save my address',
    senderSaving: 'Saving...',
    senderSavedHint: 'Address saved.',
    senderSaveError: 'Unable to save your address, please try again.',
    senderEditCta: 'Edit',
    senderMissingFields: 'Fill in all required fields.',

    // Recipient address
    recipientTitle: 'Recipient address',
    recipientNameLabel: 'Recipient name',
    recipientAddressLine1Label: 'Address',
    recipientAddressLine2Label: 'Address line 2 (optional)',
    recipientPostalCodeLabel: 'Postal code',
    recipientCityLabel: 'City',
    recipientPickerLabel: 'Pick from the directory',
    recipientPickerPlaceholder: 'Select an organisation',
    recipientPickerLoading: 'Loading the directory...',
    recipientPickerHint: 'Address pre-filled from the directory, editable if needed.',
    recipientPickerError: 'Unable to load the directory, enter the address manually.',
    recipientDepartmentPrompt: 'Département of the deceased',
    recipientDepartmentHint: 'Needed to find the local organisation (e.g. 75, 2A, 971).',
    recipientDepartmentPlaceholder: 'E.g. 75',
    recipientDepartmentInvalid: 'Invalid département (e.g. 75, 2A, 971)',
    recipientDepartmentConfirmCta: 'Confirm',
    recipientFrozenNote: 'The address cannot be changed on this resume: it is part of this letter’s identification.',

    // Shared (sender + recipient forms)
    lineCounter: '{count}/45 characters',
    invalidPostalCode: '5-digit postal code',
    panelLoading: 'Loading...',

    // Attachments (minimal vault)
    attachmentsTitle: 'Attachments',
    attachmentsHint: 'Four maximum. The death certificate is recommended for this letter.',
    attachmentsActeDeces: 'Death certificate',
    attachmentsJustificatif: 'Supporting document',
    attachmentsUploadCta: 'Add a document',
    attachmentsUploading: 'Uploading document...',
    attachmentsUploadError: 'Unable to add this document, please try again.',
    attachmentsMaxReached: 'Four attachments maximum.',
    attachmentsEmpty: 'No documents in your vault yet.',
    attachmentsFrozenNote:
      'Attachments cannot be changed on this resume — this is exactly what was already submitted.',
    attachmentsLoadError: 'Unable to load your vault.',
    attachmentsLoading: 'Loading your vault...',

    // Quota and pay-per-send
    quotaLoading: 'Checking your balance...',
    quotaRemaining: '{count} included send{s} left out of {total}',
    quotaExhausted: 'You have used every included send.',
    quotaExhaustedSupport: 'You have used your included sends. For any additional send, contact support: {email}.',
    channelClosed: 'Sending through Seren is not available for this letter yet: download it to send it yourself.',
    quotaBuyCta: 'Buy an extra send',
    quotaBuyCtaWithPrice: 'Buy an extra send — {price}',
    quotaBuyOpening: 'Opening payment...',
    quotaBuyError: 'Unable to open payment, please try again.',

    // Sending and statuses
    sendCta: 'Send this letter by post',
    sending: 'Sending...',
    retryCta: 'Retry sending',
    statusSubmitted: 'Accepted',
    statusSent: 'Sent',
    statusFailedAddressTitle: 'Address could not be delivered',
    statusFailedAddressHint: 'Correct the address, then resend this letter — this resend is free.',
    resendCta: 'Correct the address and resend (free)',
    statusFailed: 'Sending failed',
    retryableHint: 'Service temporarily unavailable, please try again in a moment.',
    finalizingPayment: 'Finalizing payment, please try again in a moment...',
    autoRetrying: 'Retrying automatically...',
    missingFieldsHint: 'Fill in the information above before sending.',
  },
  // v2 contractual anchors (docs/design-v2-demonstrateur.md §8.1): a NEW namespace is inserted
  // RIGHT BEFORE its lot's anchor; existing namespaces are edited in place.

  // Accès v2 (contrat §7.1, §7.2) : écran « accès non activé » rendu par RequireAccess, et
  // remplacement du lien d'inscription sur /login (il n'y a plus d'inscription publique).
  access: {
    loginNoAccount: 'Your access is opened for you by your funeral home.',
    notActivatedTitle: 'Your access is not activated yet',
    notActivatedBody:
      'Seren is offered by partner funeral homes. If you received an invitation, open the link in the email. Otherwise, contact your funeral home or support.',
    supportLine: 'Support: {email}',
    signOut: 'Sign out',
    backToLogin: 'Back to sign in',
  },

  // Page publique /activation (contrat §7.3) : tous les états de la machine d'activation.
  activation: {
    title: 'Activate your Seren access',
    checking: 'Checking your link...',
    invitedBy: '{partner} is opening a Seren support account for you.',
    invitedByGeneric: 'Your Seren support is waiting for you.',
    greeting: 'Hello {name},',
    emailLabel: 'Your email address',
    emailHint: 'This is the address the invitation was sent to.',
    passwordLabel: 'Choose a password',
    submit: 'Activate my access',
    submitting: 'Activating...',
    claiming: 'Opening your space...',
    weakPassword: 'This password is too weak: please choose a longer one.',
    missingTitle: 'Incomplete link',
    missingBody: 'Open the link from the email again, without changing it.',
    invalidTitle: 'Invalid link',
    invalidBody: 'This link is no longer valid or has already been used.',
    alreadyActivated: 'Already activated? Sign in',
    expiredTitle: 'Link expired',
    expiredBody: 'Ask {partner} for a new link.',
    expiredBodyGeneric: 'Ask your funeral home for a new link.',
    closedTitle: 'Activation temporarily unavailable',
    closedBody: 'Please try again in a few moments.',
    otherSessionTitle: 'Another account is signed in',
    otherSessionBody: 'This link belongs to another email address. Sign out to continue.',
    otherSessionCta: 'Sign out and continue',
    existingAccountTitle: 'An account already exists with this address',
    existingAccountBody: 'Enter the password of this account, or reset it.',
    existingAccountPasswordLabel: 'Your account password',
    existingAccountSubmit: 'Sign in and activate',
    resetPassword: 'Reset my password',
    errorTitle: 'Something went wrong',
    errorBody: 'You can try again in a moment.',
    retry: 'Try again',
    support: 'Need help? Write to {email}',
  },

  // Page /bienvenue (contrat §7.4) : les 3 consentements obligatoires, horodatés par record_consents.
  consent: {
    title: 'Welcome',
    providedBy: 'Your Seren support is provided by {partner}.',
    providedByGeneric: 'Your Seren support.',
    deceasedLine: 'We are by your side for the formalities following the death of {name}.',
    intro: 'Before you start, please read these three points.',
    terms: 'I accept the terms of use (beta version)',
    termsLink: 'Read the terms',
    privacy: 'I have read the privacy policy',
    privacyLink: 'Read the policy',
    sensitiveData:
      'I agree that Seren processes the sensitive information needed for my formalities (death, family situation, assets)',
    sensitiveDataNotice:
      'This information is what you will tell us about the death, your family situation and your loved one’s assets. It is used only to prepare your formalities and to fill in your letters. You can withdraw your agreement at any time by requesting the erasure of your account at support@seren-app.fr.',
    cta: 'Start',
    submitting: 'Saving...',
    saveError: 'Unable to save your agreement, please try again.',
    allRequired: 'All three boxes are required to use Seren.',
  },

  // Pages publiques /legal et /security (contrat §7.1) — traduction du texte porté in extenso
  // depuis docs/textes-beta-v2.md §1.1→1.10 (CGU) et §2.1→2.10 (confidentialité), lot TEXTES.
  // Même nombre de blocs que la version FR (10 + 10) : la parité est tenue à la main, tsc ne
  // vérifie pas la longueur d'un tableau. Marqueurs d'identité d'éditeur conservés tels quels.
  legalPages: {
    betaBanner: 'Beta version — legal review in progress.',
    legal: {
      title: 'Terms of use (beta version)',
      blocks: [
        {
          heading: '1. Purpose',
          body:
            'Seren is an online service that helps the relatives of someone who has died identify and complete the administrative formalities that follow a death. The service offers a questionnaire, a personalised list of formalities, pre-filled letter templates and, when that function is open, their postal dispatch.\n\n' +
            'The service is published by [company name to be completed], SIREN [to be completed], whose registered office is [address to be completed]. Publication director: [to be completed].\n\n' +
            'These terms apply to the beta version of the service, open to a limited number of families.',
        },
        {
          heading: '2. Access by invitation',
          body:
            'Access to Seren is opened by a partner funeral home, when the funeral is being arranged. The funeral home creates the file and Seren sends the designated person an email containing a personal activation link, valid for 7 days.\n\n' +
            'The account is personal. The activation link must not be forwarded. Once the password has been chosen, access is no longer time-limited.\n\n' +
            'If the link has expired, the funeral home can send a new one. If the email address is already used by an existing account, you need to sign in to that account or write to support (support@seren-app.fr).',
        },
        {
          heading: '3. Beta version: information is indicative',
          body:
            'Seren is in beta. The information displayed, the list of formalities and the letter templates are indicative and under legal review. They do not replace the advice of a professional (notary, lawyer, adviser) or the official information of the organisations concerned.\n\n' +
            'Before any binding step, it is for the user to check with the organisation concerned which documents are expected, the deadlines and the conditions. A banner is a reminder of this on the list of formalities.',
        },
        {
          heading: '4. Postal dispatches',
          body:
            'The support includes 10 postal dispatches, carried out on the user’s behalf by a printing and franking provider.\n\n' +
            '• The content of the letter is produced from a template and the information entered by the user. The user remains responsible for what they send: it is for them to re-read the letter before requesting dispatch.\n\n' +
            '• A letter that has been sent can no longer be modified or recalled. The dispatch request is final.\n\n' +
            '• Dispatches are deducted from the 10 included. Once these have been used, the service displays a message inviting you to contact support; no payment is offered in the application during the beta.\n\n' +
            '• Seren is not responsible for postal delivery times, nor for the action taken by the recipient organisations.\n\n' +
            '• When the dispatch function is not open, the letter remains downloadable as a PDF for the user to send themselves.',
        },
        {
          heading: '5. What the funeral home sees, and does not see',
          body:
            'The funeral home that opened the file sees:\n\n' +
            '• the identity and contact details it entered itself (first name, last name, email, any phone number of the person supported);\n\n' +
            '• the first name, last name and date of death of the deceased, which it also entered;\n\n' +
            '• the status of the file: invitation sent, invitation expired, access activated, file cancelled, with the corresponding dates.\n\n' +
            'The funeral home never sees: the questionnaire answers, the list of formalities and their progress, the content of the letters, the documents uploaded, the dispatches made and their tracking.\n\n' +
            'This separation is enforced by the service itself, and not by a mere display rule.',
        },
        {
          heading: '6. Liability',
          body:
            'Seren undertakes to use reasonable means to keep the service available and to ensure the information offered is accurate and up to date. This is an obligation of means.\n\n' +
            'Seren provides neither legal advice, nor tax advice, nor investment advice. The service carries out no formality on the user’s behalf other than the postal dispatches they expressly request.\n\n' +
            'The service may be interrupted for maintenance or to correct a defect, particularly during the beta phase.',
        },
        {
          heading: '7. Personal data',
          body:
            'The processing of personal data is described in the privacy policy, available from the “Privacy” page, which forms an integral part of these terms.',
        },
        {
          heading: '8. Ending use, and erasure',
          body:
            'The user may stop using the service at any time and request the erasure of their account and their data by writing to support@seren-app.fr. The request is handled within 30 days.\n\n' +
            'The following are then deleted: the account, the questionnaire answers, the formalities, the letters, the documents uploaded and the dispatch history. Seren keeps a record of the file with no identifying data whatsoever (issuing funeral home, dates, amounts), needed for its invoicing and its accounting obligations.',
        },
        {
          heading: '9. Governing law',
          body:
            'These terms are governed by French law. In the event of a dispute, an amicable solution will be sought before any legal action. Failing that, the French courts have jurisdiction.',
        },
        {
          heading: '10. Contact',
          body:
            'For any question about the service, about your data, or to request the erasure of your account: support@seren-app.fr. Reply within 5 working days.',
        },
      ],
    },
    security: {
      title: 'Privacy policy (beta version)',
      blocks: [
        {
          heading: '1. Data controller',
          body:
            '[company name to be completed], SIREN [to be completed], [registered office address to be completed], is the controller of the data described below. Contact: support@seren-app.fr.',
        },
        {
          heading: '2. Data received from the funeral home',
          body:
            'To open your support, the funeral home passes on to Seren:\n\n' +
            '• your first name, your last name, your email address and, where applicable, your phone number;\n\n' +
            '• the first name, last name and date of death of your loved one.\n\n' +
            'You are informed of this in the very first message Seren sends you.',
        },
        {
          heading: '3. Data you enter',
          body:
            'In the service, you provide: your questionnaire answers (family situation, housing, income, the assets of the deceased), the progress of your formalities, the content of your letters and their variables, your sender address, and the documents you upload — including the death certificate when it has to be attached to a dispatch.',
        },
        {
          heading: '4. Purposes and legal bases',
          body:
            '• Create your access and support you through your formalities — legal basis: performance of the service offered by your funeral home.\n\n' +
            '• Prepare, produce and send your letters — legal basis: performance of the service.\n\n' +
            '• Process the sensitive information needed for these formalities (death, family situation, assets) — legal basis: explicit consent (art. 9.2.a GDPR), obtained when your access is opened.\n\n' +
            '• Ensure security and proper technical operation — legal basis: legitimate interest.',
        },
        {
          heading: '5. Recipients and processors',
          body:
            '• Supabase — database and authentication — European Union (eu-west-1, Ireland).\n\n' +
            '• Render — application hosting — European Union.\n\n' +
            '• Resend — sending the invitation and password reset emails — location being verified before the beta opens.\n\n' +
            '• MySendingBox — printing, enveloping and franking of the letters — location being verified before the beta opens.\n\n' +
            '• Sentry — technical error reporting, without personal data (tokens and content stripped before sending) — European Union.\n\n' +
            '• PostHog — audience measurement, only after cookies have been accepted — European Union.\n\n' +
            'Your data is neither sold, nor rented, nor used for advertising purposes.',
        },
        {
          heading: '6. What the funeral home does not receive — and what no AI receives',
          body:
            'The funeral home that opened your file has access to no content: not your answers, not your formalities, not your letters, not your documents, not your dispatches.\n\n' +
            'During the beta, no data is sent to a language model: the assisted drafting function is disabled and the texts displayed are written in advance.',
        },
        {
          heading: '7. Retention period',
          body:
            'Your data is kept for 12 months after your last sign-in (proposed period, to be confirmed before the beta opens), then deleted. You can request its erasure before that date.\n\n' +
            'After erasure, Seren keeps the record of the file with no identifying data (funeral home, dates, amounts), for its invoicing and its accounting obligations.',
        },
        {
          heading: '8. Your rights',
          body:
            'You have a right of access, rectification, erasure, objection, restriction and portability, as well as the right to withdraw your consent to the processing of sensitive information at any time (withdrawal amounts to a request for erasure, as the service can no longer work without this information).\n\n' +
            'To exercise these rights: support@seren-app.fr. Reply within 5 working days, execution within 30 days.\n\n' +
            'You may also lodge a complaint with the CNIL (cnil.fr, 3 place de Fontenoy, 75007 Paris).',
        },
        {
          heading: '9. Security',
          body:
            'Exchanges with the service are encrypted (HTTPS). Each account is isolated from the others in the database by rules enforced by the database server itself. The documents you upload are stored in a private space, accessible only from your account. Technical access is limited to the people who need it, who are bound by confidentiality.',
        },
        {
          heading: '10. Known beta limitation: document upload',
          body:
            'During the beta, uploaded documents are not scanned by an antivirus (file type check, size limited to 5 MB, private space). This limitation is accepted and documented; antivirus scanning and the retention policy are planned for a later version.\n\n' +
            'Recommendation: upload only the documents needed for your dispatches (the death certificate in particular), and nothing else.',
        },
      ],
    },
  },
  // v2:ns-l3

  // v2:ns-l4

  // v2:ns-l4b

  // Seren admin view (lot L4c) — counters per partner, never any family data.
  admin: {
    title: 'Seren administration',
    lead: 'Counters per partner — no family data.',
    generatedAt: 'Updated on {date}',
    month: 'Current month: {month}',
    refresh: 'Refresh',
    empty: 'No partners.',
    forbidden: 'Seren team only.',
    loadError: 'Unable to load the counters.',
    never: '—',
    totals: 'Total',
    columns: {
      partner: 'Partner',
      status: 'Status',
      total: 'Cases created',
      thisMonth: 'Created this month',
      pending: 'Invited, pending',
      activated: 'Activated',
      cancelled: 'Cancelled',
      lastDossier: 'Latest case',
    },
    statusLabels: { prospect: 'Prospect', active: 'Active', suspended: 'Suspended', terminated: 'Terminated' },
  },
  // v2:ns-l4c

  // v2 family-facing offer (contract §7.6): never a price, never an LRAR mention.
  offer: {
    unlimitedAccess: 'Access with no time limit',
    includedSends: '{count} postal sends included',
    includedSendsOne: '1 postal send included',
    providedBy: 'Provided by {partner}',
    providedByGeneric: 'Your Seren support',
  },
  // v2:ns-l5
}
