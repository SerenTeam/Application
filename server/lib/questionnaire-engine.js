// Moteur du questionnaire v2 — fonctions PURES (zéro I/O). Voir docs/design-questionnaire-v2.md.
// Le serveur (Plan 2) l'appellera depuis les routes ; testé par tests/questionnaire-engine.test.ts.
import { QUESTIONS_CATALOG } from './questions-catalog.js'

const SORTED = [...QUESTIONS_CATALOG].sort((a, b) => a.order - b.order)
const TRISTATE = ['oui', 'non', 'ne_sait_pas']
const TEXT_MAX = 200

/** Une condition matche si chaque clé correspond : tableau = appartenance, scalaire = égalité stricte. */
export function matchesWhen(when, answers) {
  for (const [key, cond] of Object.entries(when ?? {})) {
    const val = answers[key]
    if (Array.isArray(cond)) {
      if (!cond.includes(val)) return false
    } else if (val !== cond) {
      return false
    }
  }
  return true
}

/** Première question applicable non répondue, dans l'ordre du catalogue. null = questionnaire terminé. */
export function nextQuestion(answers) {
  for (const spec of SORTED) {
    if (answers[spec.id] !== undefined) continue
    if (!matchesWhen(spec.applicable_when, answers)) continue
    return spec
  }
  return null
}

/** Valide une valeur contre la spec (type + options canoniques). */
export function validateAnswer(spec, value) {
  const fail = (error) => ({ ok: false, error })
  switch (spec.type) {
    case 'boolean':
      return typeof value === 'boolean' ? { ok: true } : fail('Réponse oui/non attendue')
    case 'tristate':
      return TRISTATE.includes(value) ? { ok: true } : fail('Valeur attendue : oui, non ou ne_sait_pas')
    case 'select':
      return spec.options.some((o) => o.value === value) ? { ok: true } : fail('Option inconnue')
    case 'multiselect':
      if (!Array.isArray(value)) return fail('Tableau attendu')
      if (new Set(value).size !== value.length) return fail('Doublons dans la sélection')
      return value.every((v) => spec.options.some((o) => o.value === v))
        ? { ok: true }
        : fail('Option inconnue dans la sélection')
    case 'text': {
      if (typeof value !== 'string' || value.trim().length === 0) return fail('Texte requis')
      return value.length <= TEXT_MAX ? { ok: true } : fail(`Maximum ${TEXT_MAX} caractères`)
    }
    case 'date': {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail('Format AAAA-MM-JJ attendu')
      const t = Date.parse(value)
      // Round-trip : rejette les dates impossibles (ex. 2026-02-30) que Date.parse normalise silencieusement
      if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== value) return fail('Date invalide')
      // Date-only = minuit UTC ; +14 h de tolérance couvre tous les fuseaux réels (ex. Nouvelle-Calédonie)
      return t <= Date.now() + 14 * 3600 * 1000 ? { ok: true } : fail('La date ne peut pas être dans le futur')
    }
    default:
      return fail(`Type de question inconnu : ${spec.type}`)
  }
}

/**
 * Enregistre une réponse (nouvelle ou correction) et purge les réponses des branches
 * devenues inapplicables. Une passe ordonnée suffit : les conditions ne référencent
 * que des questions antérieures (invariant testé dans questions-catalog.test.ts).
 * Écrire sur une question actuellement inapplicable est neutralisé par la purge (retour
 * sans la réponse) — les routes doivent vérifier l'applicabilité et renvoyer 400 en amont.
 */
export function setAnswer(answers, spec, value) {
  const clean = spec.type === 'text' && typeof value === 'string' ? value.trim() : value
  const next = { ...answers, [spec.id]: clean }
  for (const s of SORTED) {
    if (next[s.id] !== undefined && !matchesWhen(s.applicable_when, next)) {
      delete next[s.id]
    }
  }
  return next
}

/** Progression : questions applicables répondues / total applicable (le total varie à l'ouverture d'une branche). */
export function progress(answers) {
  const applicable = SORTED.filter((s) => matchesWhen(s.applicable_when, answers))
  const current = applicable.filter((s) => answers[s.id] !== undefined).length
  return { current, total: applicable.length }
}
