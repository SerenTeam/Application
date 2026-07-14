// Rédacteur LLM du questionnaire v2 — SEUL point de contact IA de ce flux.
// Garantie structurelle : ne bloque JAMAIS le questionnaire. Timeout, erreur réseau,
// JSON invalide ou champ manquant → fallback_text interpolé du catalogue.
import { buildWriterMessages } from './writer-prompt.js'
import { textIn } from './questions-catalog.js'

const DEFAULT_TIMEOUT_MS = 3000
const MIN_QUESTION_LENGTH = 10
const MAX_QUESTION_LENGTH = 300
const MAX_AIDE_LENGTH = 200

/** Interpole {prenom} dans les textes de secours du catalogue, dans la langue de session. */
export function interpolateFallback(spec, prenom, lang = 'fr') {
  const p = prenom || (lang === 'en' ? 'your loved one' : 'votre proche')
  const question = textIn(spec.fallback_text.question, lang)
  const aide = textIn(spec.fallback_text.aide, lang)
  return {
    question: question.replaceAll('{prenom}', p),
    aide: aide?.replaceAll('{prenom}', p),
  }
}

/**
 * Rédige le texte d'une question via Mistral.
 * @returns {Promise<{ question: string, aide?: string, source: 'llm'|'fallback' }>}
 */
export async function writeQuestionText({ spec, context, mistral, model, timeoutMs = DEFAULT_TIMEOUT_MS, lang = 'fr' }) {
  const fallback = { ...interpolateFallback(spec, context.prenom, lang), source: 'fallback' }
  if (!mistral) return fallback
  try {
    // Timeout natif du SDK : annule réellement la requête HTTP (AbortSignal), contrairement
    // à une course de promesses qui laisserait l'appel Mistral (et son coût) en vol.
    const completion = await mistral.chat.complete(
      {
        model,
        messages: buildWriterMessages(spec, context, lang),
        responseFormat: { type: 'json_object' },
      },
      { timeoutMs }
    )
    const content = completion?.choices?.[0]?.message?.content
    if (typeof content !== 'string') return fallback
    const parsed = JSON.parse(content)
    const question = typeof parsed.question === 'string' ? parsed.question.trim() : ''
    if (question.length < MIN_QUESTION_LENGTH || question.length > MAX_QUESTION_LENGTH) {
      return fallback
    }
    const aide = typeof parsed.aide === 'string' ? parsed.aide.trim() : ''
    if (aide.length > MAX_AIDE_LENGTH) return fallback
    return {
      question,
      aide: aide || undefined,
      source: 'llm',
    }
  } catch {
    return fallback
  }
}
