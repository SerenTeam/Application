// Rédacteur LLM du questionnaire v2 — SEUL point de contact IA de ce flux.
// Garantie structurelle : ne bloque JAMAIS le questionnaire. Timeout, erreur réseau,
// JSON invalide ou champ manquant → fallback_text interpolé du catalogue.
import { buildWriterMessages } from './writer-prompt.js'

const DEFAULT_TIMEOUT_MS = 3000
const MIN_QUESTION_LENGTH = 10

/** Interpole {prenom} dans les textes de secours du catalogue. */
export function interpolateFallback(spec, prenom) {
  const p = prenom || 'votre proche'
  return {
    question: spec.fallback_text.question.replaceAll('{prenom}', p),
    aide: spec.fallback_text.aide?.replaceAll('{prenom}', p),
  }
}

/**
 * Rédige le texte d'une question via Mistral.
 * @returns {Promise<{ question: string, aide?: string, source: 'llm'|'fallback' }>}
 */
export async function writeQuestionText({ spec, context, mistral, model, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const fallback = { ...interpolateFallback(spec, context.prenom), source: 'fallback' }
  if (!mistral) return fallback
  try {
    const completion = await Promise.race([
      mistral.chat.complete({
        model,
        messages: buildWriterMessages(spec, context),
        responseFormat: { type: 'json_object' },
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('writer timeout')), timeoutMs)),
    ])
    const content = completion?.choices?.[0]?.message?.content
    if (typeof content !== 'string') return fallback
    const parsed = JSON.parse(content)
    if (typeof parsed.question !== 'string' || parsed.question.trim().length < MIN_QUESTION_LENGTH) {
      return fallback
    }
    return {
      question: parsed.question.trim(),
      aide: typeof parsed.aide === 'string' && parsed.aide.trim() ? parsed.aide.trim() : undefined,
      source: 'llm',
    }
  } catch {
    return fallback
  }
}
