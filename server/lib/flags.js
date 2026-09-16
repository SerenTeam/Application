// Flags d'exploitation v2 (contrat §5). Règle unique : SEULE la valeur exacte 'true' ouvre.
// Lecture à CHAQUE appel (jamais figée au démarrage) : ouvrir/fermer = changer la variable Render.
// Ce sont des interrupteurs d'exploitation, PAS des barrières de sécurité (la sécurité est en SQL).
import { msg } from './messages.js'

export const FLAG_NAMES = ['FEATURE_LLM', 'EMAIL_SENDS_ENABLED', 'EXTRA_SENDS_ENABLED', 'PAPER_SENDS_ENABLED',
  'PARTNER_ACTIVATIONS_ENABLED', 'SHOW_ACTIVATION_LINK', 'PARTNER_BILLING_PREVIEW']

export function flagOn(name) {
  return process.env[name] === 'true'
}

// Flags exposés au front par GET /api/me. SHOW_ACTIVATION_LINK n'y figure JAMAIS.
export function publicFlags() {
  return {
    llm_enabled: flagOn('FEATURE_LLM'),
    email_sends_enabled: flagOn('EMAIL_SENDS_ENABLED'),
    extra_sends_enabled: flagOn('EXTRA_SENDS_ENABLED'),
    paper_sends_enabled: flagOn('PAPER_SENDS_ENABLED'),
    partner_activations_enabled: flagOn('PARTNER_ACTIVATIONS_ENABLED'),
    partner_billing_preview: flagOn('PARTNER_BILLING_PREVIEW'),
  }
}

function reqLang(req) {
  return req.body?.lang === 'en' || req.query?.lang === 'en' ? 'en' : 'fr'
}

/** Middleware 503 si le flag n'est pas ouvert. À monter AVANT tout limiteur (un refus
 * d'exploitation ne consomme jamais le quota horaire) et avant tout parseur multipart. */
export function killSwitch(name, { code, messageKey }) {
  return function flagKillSwitch(req, res, next) {
    if (flagOn(name)) return next()
    return res.status(503).json({ success: false, code, error: msg(reqLang(req), messageKey) })
  }
}
