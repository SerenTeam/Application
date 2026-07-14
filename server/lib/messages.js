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
