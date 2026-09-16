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
    // Courriers — envoi papier (chantier 2a, server/routes/letters.js branche papier)
    paper_disabled: 'L’envoi de courrier papier n’est pas encore activé',
    paper_not_configured: 'Le service d’envoi de courrier papier n’est pas configuré',
    provider_unavailable: 'Le service d’envoi de courrier papier est momentanément indisponible, réessayez dans un instant',
    sender_profile_required: 'Renseignez votre adresse d’expéditeur avant d’envoyer un courrier papier',
    sender_profile_invalid: 'Votre adresse d’expéditeur n’est pas utilisable pour un envoi postal (45 caractères maximum par ligne)',
    invalid_recipient_address: 'Adresse du destinataire invalide (45 caractères maximum par ligne, code postal à 5 chiffres)',
    letter_missing_variables: 'Le courrier contient des informations non renseignées',
    attachment_not_found: 'Pièce jointe introuvable',
    attachments_too_many: 'Quatre pièces jointes au maximum par courrier',
    attachments_duplicate: 'La même pièce jointe ne peut pas être sélectionnée deux fois',
    attachment_fetch_failed: 'Impossible de joindre vos documents à ce courrier',
    send_limit_reached: 'Trop d’envois papier sur les dernières 24 heures, réessayez demain',
    send_already_exists: 'Ce courrier a déjà été préparé pour ce destinataire',
    invalid_resend_of: 'Le courrier à renvoyer est introuvable',
    resend_already_exists: 'Ce courrier a déjà fait l’objet d’un renvoi',
    quota_exhausted: 'Vous avez utilisé tous les envois inclus dans votre forfait',
    letters_quota_error: 'Erreur lors de la lecture de votre solde d’envois',
    invalid_network: 'Réseau d’organismes inconnu',
    organisations_error: 'Erreur lors de la recherche de l’organisme',
    attachments_mismatch: 'Les pièces jointes ne peuvent pas être modifiées lors d’une reprise d’envoi',
    // Coffre minimal — pièces jointes (server/routes/attachments.js)
    attachments_missing_file: 'Aucun fichier reçu',
    attachments_invalid_kind: 'Type de pièce jointe invalide',
    attachments_invalid_type: 'Ce fichier n’est ni un PDF, ni une image JPEG ou PNG valide',
    attachments_too_large: 'Le fichier dépasse la taille maximale autorisée (5 Mo)',
    attachments_upload_error: 'Erreur lors de l’enregistrement de la pièce jointe',
    attachments_not_found: 'Pièce jointe introuvable',
    attachments_list_error: 'Erreur lors de la récupération des pièces jointes',
    attachments_delete_error: 'Erreur lors de la suppression de la pièce jointe',
    attachments_quota_reached: 'Vous avez atteint la limite de 20 pièces jointes, supprimez-en une avant d’en ajouter une nouvelle',
    // Paiement — forfait Stripe (server/routes/payments.js, server/lib/require-purchase.js)
    payments_disabled: 'Le paiement n’est pas encore ouvert',
    checkout_failed: 'Impossible d’ouvrir la page de paiement, réessayez dans un instant',
    purchase_required: 'Cette action fait partie du forfait Seren',
    payments_status_error: 'Erreur lors de la vérification de votre forfait',
    forfait_required: 'Le forfait Seren est nécessaire avant d’acheter un envoi supplémentaire',
    // Ancres contractuelles v2 (§8.1) : chaque lot insère ses clés JUSTE AVANT son ancre.
    // v2:messages-l2a

    // v2:messages-l2b

    // Vue admin Seren (server/routes/admin.js, lot L4c)
    not_admin: 'Accès réservé à l’équipe Seren',
    admin_error: 'Erreur dans l’espace d’administration',
    // v2:messages-l4c
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
    // Letters — paper sending (chantier 2a, server/routes/letters.js paper branch)
    paper_disabled: 'Paper letter sending is not enabled yet',
    paper_not_configured: 'The paper sending service is not configured',
    provider_unavailable: 'The paper sending service is temporarily unavailable, please try again in a moment',
    sender_profile_required: 'Add your sender address before sending a paper letter',
    sender_profile_invalid: 'Your sender address cannot be used for postal mail (45 characters maximum per line)',
    invalid_recipient_address: 'Invalid recipient address (45 characters maximum per line, 5-digit postal code)',
    letter_missing_variables: 'The letter still has unfilled information',
    attachment_not_found: 'Attachment not found',
    attachments_too_many: 'Four attachments maximum per letter',
    attachments_duplicate: 'The same attachment cannot be selected twice',
    attachment_fetch_failed: 'Unable to attach your documents to this letter',
    send_limit_reached: 'Too many paper letters in the last 24 hours, please try again tomorrow',
    send_already_exists: 'This letter has already been prepared for this recipient',
    invalid_resend_of: 'The letter to resend cannot be found',
    resend_already_exists: 'This letter has already been resent once',
    quota_exhausted: 'You have used every send included in your plan',
    letters_quota_error: 'Error while reading your send balance',
    invalid_network: 'Unknown organisation network',
    organisations_error: 'Error while looking up the organisation',
    attachments_mismatch: 'Attachments cannot be changed when resuming a send',
    // Attachments vault (server/routes/attachments.js)
    attachments_missing_file: 'No file received',
    attachments_invalid_kind: 'Invalid attachment kind',
    attachments_invalid_type: 'This file is not a valid PDF, JPEG, or PNG',
    attachments_too_large: 'The file exceeds the maximum allowed size (5 MB)',
    attachments_upload_error: 'Error while saving the attachment',
    attachments_not_found: 'Attachment not found',
    attachments_list_error: 'Error while fetching attachments',
    attachments_delete_error: 'Error while deleting the attachment',
    attachments_quota_reached: 'You have reached the 20-attachment limit, delete one before adding a new one',
    // Payments — Seren plan (server/routes/payments.js, server/lib/require-purchase.js)
    payments_disabled: 'Payment is not open yet',
    checkout_failed: 'Unable to open the payment page, please try again in a moment',
    purchase_required: 'This action is part of the Seren plan',
    payments_status_error: 'Error while checking your plan',
    forfait_required: 'The Seren plan is required before buying an extra send',
    // v2 contractual anchors (§8.1): each lot inserts its keys RIGHT BEFORE its anchor.
    // v2:messages-l2a

    // v2:messages-l2b

    // Seren admin view (server/routes/admin.js, lot L4c)
    not_admin: 'Seren team only',
    admin_error: 'Admin area error',
    // v2:messages-l4c
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
