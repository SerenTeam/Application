// Messages utilisateur bilingues. Clés stables ; le moteur (questionnaire-engine.js) et les
// routes ne manipulent que des clés — la traduction finale se fait ici, au plus près de la
// réponse HTTP, avec la langue de la session (ou, avant chargement de session, un repli 'fr').
export const MESSAGES = {
  fr: {
    // Sessions / routes
    session_required: 'session_id requis',
    session_and_question_required: 'session_id et question_id requis',
    session_not_found: 'Session non trouvée ou expirée',
    start_error: 'Impossible de démarrer le questionnaire',
    answer_error: 'Erreur lors de l’enregistrement de la réponse',
    reask_error: 'Erreur lors de la reprise de la question',
    resume_error: 'Erreur lors de la reprise',
    complete_error: 'Erreur lors de la finalisation',
    unknown_question: 'Question inconnue',
    question_not_applicable: 'Question non applicable à votre situation',
    question_not_editable: 'Question non modifiable',
    questionnaire_incomplete: 'Questionnaire incomplet',
    invalid_lang: 'Langue invalide',
    too_many_requests: 'Trop de requêtes, réessayez dans quelques minutes.',
    // Moteur (validateAnswer)
    unknown_option: 'Option inconnue',
    yes_no_expected: 'Réponse oui/non attendue',
    tristate_expected: 'Valeur attendue : oui, non ou ne_sait_pas',
    duplicates: 'Doublons dans la sélection',
    unknown_option_in_selection: 'Option inconnue dans la sélection',
    text_required: 'Texte requis',
    text_too_long: 'Maximum 200 caractères',
    date_future: 'La date ne peut pas être dans le futur',
    // Courriers — envoi email (server/routes/letters.js)
    letters_missing_fields: 'Champs requis manquants',
    unknown_template: 'Modèle de courrier inconnu',
    channel_not_available: 'Ce canal d’envoi n’est pas disponible pour ce courrier',
    invalid_recipient_email: 'Adresse email du destinataire invalide',
    letter_incomplete: 'Le courrier contient des variables non renseignées',
    email_not_configured: 'Le service d’envoi d’email n’est pas configuré',
    send_in_progress: 'Un envoi de ce courrier est déjà en cours, patientez un instant.',
    send_failed: 'Échec de l’envoi du courrier',
    send_error: 'Erreur lors de l’envoi du courrier',
    letters_list_error: 'Erreur lors de la récupération des envois',
    // Paiement — forfait Stripe (server/routes/payments.js, server/lib/require-purchase.js)
    payments_disabled: 'Le paiement n’est pas encore ouvert',
    checkout_failed: 'Impossible d’ouvrir la page de paiement, réessayez dans un instant',
    purchase_required: 'Cette action fait partie du forfait Seren',
    payments_status_error: 'Erreur lors de la vérification de votre forfait',
  },
  en: {
    session_required: 'session_id required',
    session_and_question_required: 'session_id and question_id required',
    session_not_found: 'Session not found or expired',
    start_error: 'Unable to start the questionnaire',
    answer_error: 'Error while saving the answer',
    reask_error: 'Error while reloading the question',
    resume_error: 'Error while resuming',
    complete_error: 'Error while finalizing',
    unknown_question: 'Unknown question',
    question_not_applicable: 'Question not applicable to your situation',
    question_not_editable: 'Question cannot be edited',
    questionnaire_incomplete: 'Questionnaire incomplete',
    invalid_lang: 'Invalid language',
    too_many_requests: 'Too many requests, please try again in a few minutes.',
    unknown_option: 'Unknown option',
    yes_no_expected: 'A yes/no answer is expected',
    tristate_expected: 'Expected value: oui, non or ne_sait_pas',
    duplicates: 'Duplicate values in selection',
    unknown_option_in_selection: 'Unknown option in selection',
    text_required: 'Text required',
    text_too_long: 'Maximum 200 characters',
    date_future: 'The date cannot be in the future',
    // Letters — email sending (server/routes/letters.js)
    letters_missing_fields: 'Missing required fields',
    unknown_template: 'Unknown letter template',
    channel_not_available: 'This sending channel is not available for this letter',
    invalid_recipient_email: 'Invalid recipient email address',
    letter_incomplete: 'The letter still contains unresolved variables',
    email_not_configured: 'The email sending service is not configured',
    send_in_progress: 'This letter is already being sent, please wait a moment.',
    send_failed: 'Failed to send the letter',
    send_error: 'Error while sending the letter',
    letters_list_error: 'Error while fetching sends',
    // Payments — Seren plan (server/routes/payments.js, server/lib/require-purchase.js)
    payments_disabled: 'Payment is not open yet',
    checkout_failed: 'Unable to open the payment page, please try again in a moment',
    purchase_required: 'This action is part of the Seren plan',
    payments_status_error: 'Error while checking your plan',
  },
}

// Repli en cascade : langue demandée → fr → la clé elle-même. Le dernier repli (la clé)
// couvre les erreurs du moteur volontairement non traduites (« Tableau attendu »,
// « Format AAAA-MM-JJ attendu », « Date invalide », type inconnu) : elles ne sont pas
// atteignables depuis l'UI — le client envoie toujours un tableau pour un multiselect et
// une date au format ISO via le date picker — seuls des appels API directs mal formés
// les déclenchent. Toute erreur qu'un utilisateur normal peut provoquer a sa clé ci-dessus.
export function msg(lang, key) {
  return MESSAGES[lang]?.[key] ?? MESSAGES.fr[key] ?? key
}
