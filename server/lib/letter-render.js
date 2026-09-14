// Fusion mustache-light `template + variables → { subject, body, missingVariables }` — MIROIR
// EXACT de la logique de `src/hooks/useLetterGenerator.ts` (résolution `{{...}}`, substitution en
// trois temps : sujet, libellé destinataire, corps), transposée pour consommer le catalogue
// serveur (`letter-templates.js`, `variables: string[]`) plutôt que le `LetterVariable[]` du
// front. Contrat D2 (spec §5, chantier 2a) : le corps envoyé au provider est TOUJOURS regénéré
// ici à partir du template + des variables reçues du client — jamais un corps libre.
//
// Différence assumée avec le front (qui affiche `[LABEL EN MAJUSCULES]` faute de valeur, pour
// guider la saisie utilisateur) : le catalogue serveur ne porte pas de libellé humain par
// variable (juste des clés), donc le repli affiche `[CLÉ EN MAJUSCULES]` — même mécanique
// (jamais de `{{...}}` laissé tel quel), texte de repli adapté à l'absence de métadonnée.
import { getLetterTemplate } from './letter-templates.js'

const MUSTACHE_RE = /\{\{[a-zA-Z0-9_]+\}\}/

/** Erreur applicative distinguable par `.code` — même patron que PaperSenderError
 * (server/lib/paper-sender.js) / LetterStoreError (server/lib/letters-store.js). */
export class LetterRenderError extends Error {
  constructor(code, extra) {
    super(code)
    this.name = 'LetterRenderError'
    this.code = code
    if (extra) Object.assign(this, extra)
  }
}

// Repli sur variable absente : MÊME comportement que le front (`values[v.key] || fallback`, un
// test de vérité JS classique — une valeur vide ou blanche tombe dans le repli, pas de `.trim()`
// ici volontairement, pour rester bit-à-bit fidèle à `useLetterGenerator`).
function resolveValue(key, values) {
  return values[key] || `[${key.toUpperCase()}]`
}

function substitute(text, keys, values) {
  let result = text
  for (const key of keys) {
    result = result.replaceAll(`{{${key}}}`, resolveValue(key, values))
  }
  return result
}

// Cœur pur de la fusion, séparé de la résolution par id pour rester testable avec un template
// FORGÉ (tests de la garde `unresolved_variables` — une variable référencée dans le corps mais
// absente de `template.variables`, impossible à produire avec le vrai catalogue puisque
// `variables` y est dérivé automatiquement du corps, voir `letter-templates.js`).
/**
 * @param {{ id?: string, subject: string, recipient_label: string, body: string, variables: string[] }} template
 * @param {Record<string, string>} variables
 * @returns {{ subject: string, body: string, missingVariables: string[] }}
 */
export function renderTemplate(template, variables) {
  const values = variables ?? {}
  const keys = template.variables

  // Miroir exact de `resolvedSubject` (useLetterGenerator) : le sujet est résolu en premier, il
  // sert aussi de valeur pour le placeholder structurel `{{subject}}` dans le corps.
  const subject = substitute(template.subject, keys, values)

  // Miroir exact : le libellé destinataire est résolu séparément avant d'être injecté dans le
  // corps (permet à `{{organisme_name}}`, etc. d'apparaître dans `recipient_label` sans avoir à
  // figurer aussi littéralement dans `body`).
  const recipientLabel = substitute(template.recipient_label, keys, values)

  let body = template.body
  body = body.replaceAll('{{recipient_label}}', recipientLabel)
  body = body.replaceAll('{{subject}}', subject)
  body = substitute(body, keys, values)

  // Miroir exact de `missingVariables` (useLetterGenerator) : le catalogue serveur ne distingue
  // pas auto_filled/manuel (pas de métadonnée par variable) — une clé déclarée est « manquante »
  // si sa valeur courante est vide ou blanche une fois retirés les espaces (même `.trim()` que le
  // front pour cette détection — seule la substitution ci-dessus s'en dispense, à l'identique du
  // front).
  const missingVariables = keys.filter((key) => !values[key]?.trim())

  // Garde finale (défense contre une divergence de regex ou une variable référencée dans le
  // corps mais absente de `template.variables`, ex. faute de frappe dans un `{{...}}`) : si
  // aucune variable n'est manquante, la substitution ci-dessus a dû consommer TOUT le mustache
  // du template — un résidu signale que le corps référence une clé jamais dérivée.
  if (missingVariables.length === 0 && (MUSTACHE_RE.test(subject) || MUSTACHE_RE.test(body))) {
    throw new LetterRenderError('unresolved_variables', { templateId: template.id })
  }

  return { subject, body, missingVariables }
}

/**
 * Point d'entrée utilisé par la route d'envoi (Task 9) : résout `templateId` dans le catalogue
 * serveur réel puis délègue à `renderTemplate`.
 * @param {string} templateId
 * @param {Record<string, string>} variables
 * @returns {{ subject: string, body: string, missingVariables: string[] }}
 */
export function renderLetter(templateId, variables) {
  const template = getLetterTemplate(templateId)
  if (!template) {
    throw new LetterRenderError('unknown_template', { templateId })
  }
  return renderTemplate(template, variables)
}
