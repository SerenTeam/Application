// Pré-remplissage du questionnaire depuis le dossier ouvert par la PF (personnalisation v2,
// spec docs/design-personnalisation-v2.md §4.3). La PF a saisi prénom, nom et date de décès du
// défunt (champs obligatoires de son formulaire) : la famille ne les retape pas, elle les retrouve
// au récapitulatif, modifiables. Lecture par la RPC my_dossier_identity() avec le client AU JETON
// de l'utilisateur (security definer bornée à auth.uid() — migration 20260928121000).
import * as Sentry from '@sentry/node'
import { QUESTIONS_CATALOG } from './questions-catalog.js'
import { validateAnswer, setAnswer } from './questionnaire-engine.js'

// Colonne renvoyée par my_dossier_identity() → question d'identité du catalogue. Les noms de la
// famille (family_*) ne sont PAS des questions : ils servent à l'écran de coordonnées (client).
export const DOSSIER_PREFILL = [
  ['deceased_first_name', 'deceased_firstname'],
  ['deceased_last_name', 'deceased_lastname'],
  ['deceased_death_date', 'deceased_dod'],
]

/**
 * Retourne les réponses enrichies des champs d'identité connus du dossier. Une valeur absente ou
 * invalide est ignorée (la question sera posée) ; une réponse déjà présente n'est jamais écrasée.
 * Un échec de lecture ne bloque pas le démarrage (dégradation, pas un contrôle d'accès) : log sans
 * PII + capture Sentry, et les réponses reviennent inchangées (même référence).
 */
export async function prefillFromDossier(client, answers) {
  let identity
  try {
    const { data, error } = await client.rpc('my_dossier_identity')
    if (error) throw new Error(error.message ?? 'my_dossier_identity')
    identity = data
  } catch (error) {
    console.error('⚠️ questionnaire/start : identité du dossier indisponible, questions posées normalement')
    Sentry.captureException(error)
    return answers
  }
  if (!identity || typeof identity !== 'object') return answers
  let next = answers
  for (const [column, questionId] of DOSSIER_PREFILL) {
    const spec = QUESTIONS_CATALOG.find((q) => q.id === questionId)
    const value = identity[column]
    if (!spec || value == null || next[questionId] !== undefined) continue
    if (!validateAnswer(spec, value).ok) continue
    next = setAnswer(next, spec, value)
  }
  return next
}
