// Routes du questionnaire v2 — le serveur possède le flux (moteur) et les données (sessions).
// Factory à dépendances injectées : testable avec supertest sans Mistral ni Supabase.
// Contrat API : docs/design-questionnaire-v2.md, section « Contrat API ».
import { Router } from 'express'
import { QUESTIONS_CATALOG, textIn } from '../lib/questions-catalog.js'
import { nextQuestion, validateAnswer, setAnswer, matchesWhen, progress } from '../lib/questionnaire-engine.js'
import * as supabaseStore from '../lib/sessions-store.js'
import { writeQuestionText } from '../lib/question-writer.js'
import { createUserRateLimiter } from '../lib/rate-limit.js'
import { msg } from '../lib/messages.js'

const SORTED = [...QUESTIONS_CATALOG].sort((a, b) => a.order - b.order)
const TRISTATE_LABELS = {
  fr: { oui: 'Oui', non: 'Non', ne_sait_pas: 'Je ne sais pas' },
  en: { oui: 'Yes', non: 'No', ne_sait_pas: 'Not sure' },
}
const BOOLEAN_LABELS = { fr: { true: 'Oui', false: 'Non' }, en: { true: 'Yes', false: 'No' } }
const NONE_LABEL = { fr: 'Aucun', en: 'None' }
// Types à valeurs fermées (enums non identifiants) : seuls autorisés dans le contexte LLM.
const CLOSED_TYPES = ['boolean', 'tristate', 'select', 'multiselect']

/**
 * Langue à utiliser pour un message d'erreur émis AVANT le chargement d'une session (ou quand
 * la session n'existe pas) : la session (seule source fiable de la langue de l'utilisateur)
 * n'est pas encore connue. Repli simple sur le corps de la requête si présent, sinon 'fr' —
 * ces messages ne sont normalement jamais vus par un utilisateur normal de l'UI (session_id
 * absent/invalide, erreurs 500), donc ce repli imparfait est un choix assumé de simplicité.
 */
function bodyLang(req) {
  return req.body?.lang === 'en' ? 'en' : 'fr'
}

/** Contexte court pour le rédacteur — jamais d'historique complet. */
function writerContext(answers, last) {
  return {
    prenom: answers.deceased_firstname,
    relation: answers.relation,
    derniereQuestion: last?.question,
    derniereReponse: last?.value,
  }
}

/** RenderedQuestion : la spec côté client, SANS les champs serveur (fallback_text, writer_hints). */
function toRendered(spec, answers, text, lang) {
  return {
    action: 'question',
    question_id: spec.id,
    question: text.question,
    aide: text.aide,
    type: spec.type,
    options: spec.options?.map((o) => ({ value: o.value, label: textIn(o.label, lang) })),
    obligatoire: spec.obligatoire,
    categorie: textIn(spec.categorie, lang),
    progress: progress(answers),
  }
}

/** Libellé humain d'une réponse, pour l'écran récapitulatif. */
export function displayValue(spec, value, lang = 'fr') {
  switch (spec.type) {
    case 'boolean':
      return (BOOLEAN_LABELS[lang] ?? BOOLEAN_LABELS.fr)[String(value)]
    case 'tristate':
      return (TRISTATE_LABELS[lang] ?? TRISTATE_LABELS.fr)[value] ?? String(value)
    case 'select':
      return textIn(spec.options.find((o) => o.value === value)?.label, lang) ?? String(value)
    case 'multiselect': {
      if (!Array.isArray(value) || value.length === 0) return NONE_LABEL[lang] ?? NONE_LABEL.fr
      return value.map((v) => textIn(spec.options.find((o) => o.value === v)?.label, lang) ?? v).join(', ')
    }
    default:
      return String(value)
  }
}

function buildRecap(answers, lang) {
  const prenom = answers.deceased_firstname || (lang === 'en' ? 'your loved one' : 'votre proche')
  return SORTED.filter((spec) => answers[spec.id] !== undefined).map((spec) => ({
    question_id: spec.id,
    question: textIn(spec.fallback_text.question, lang).replaceAll('{prenom}', prenom),
    display: displayValue(spec, answers[spec.id], lang),
  }))
}

export function createQuestionnaireRouter({
  requireAuth,
  store = supabaseStore,
  mistral = null,
  model = 'mistral-small-latest',
  writeText = writeQuestionText,
}) {
  const router = Router()

  // Chaque /start coûte 1 ligne BDD + 1 appel LLM : 10/h par utilisateur suffit largement
  // pour un usage légitime (recommencer quelques fois) et coupe l'abus. Ce plafond ne borne
  // que la création de sessions — /resume, /answer et /reask ont chacun leur propre limite.
  const startLimiter = createUserRateLimiter({
    max: 10,
    windowMs: 60 * 60 * 1000,
    message: (req) => msg(bodyLang(req), 'too_many_requests'),
  })
  // /resume déclenche aussi une génération LLM : limite plus lâche que /start (les refreshs
  // légitimes sont fréquents), mais bornée. /answer et /reask restent couverts par le backlog.
  // Message statique FR : /resume n'a pas la langue en amont (elle vit sur la session, chargée
  // APRÈS le rate-limiter) — choix simple assumé, comme documenté ci-dessus pour bodyLang().
  const resumeLimiter = createUserRateLimiter({ max: 60, windowMs: 60 * 60 * 1000 })

  async function renderNext(session, last) {
    const spec = nextQuestion(session.answers)
    if (spec === null) return { action: 'recap', recap: buildRecap(session.answers, session.lang) }
    const text = await writeText({ spec, context: writerContext(session.answers, last), mistral, model, lang: session.lang })
    return toRendered(spec, session.answers, text, session.lang)
  }

  router.post('/start', requireAuth, startLimiter, async (req, res) => {
    const rawLang = req.body?.lang
    const lang = rawLang === undefined ? 'fr' : rawLang
    if (lang !== 'fr' && lang !== 'en') {
      return res.status(400).json({ success: false, error: msg('fr', 'invalid_lang') })
    }
    try {
      const session = await store.createSession(req.supabaseClient, req.user.id, lang)
      const data = await renderNext(session)
      res.json({ success: true, session_id: session.id, data })
    } catch (error) {
      console.error('❌ questionnaire/start :', error)
      res.status(500).json({ success: false, error: msg(lang, 'start_error') })
    }
  })

  router.post('/answer', requireAuth, async (req, res) => {
    try {
      const { session_id, question_id, value } = req.body
      if (!session_id || !question_id) {
        return res.status(400).json({ success: false, error: msg(bodyLang(req), 'session_and_question_required') })
      }
      const session = await store.loadSession(req.supabaseClient, session_id)
      if (!session) return res.status(404).json({ success: false, error: msg(bodyLang(req), 'session_not_found') })
      const spec = SORTED.find((q) => q.id === question_id)
      if (!spec) return res.status(400).json({ success: false, error: msg(session.lang, 'unknown_question') })
      if (!matchesWhen(spec.applicable_when, session.answers)) {
        return res.status(400).json({ success: false, error: msg(session.lang, 'question_not_applicable') })
      }
      const check = validateAnswer(spec, value)
      if (!check.ok) return res.status(400).json({ success: false, error: msg(session.lang, check.error) })
      session.answers = setAnswer(session.answers, spec, value)
      await store.saveAnswers(req.supabaseClient, session_id, session.answers)
      // PII : la transition n'envoie la dernière réponse au LLM que pour les types fermés
      // (valeurs enum non identifiantes). Nom de famille et date de décès ne partent pas.
      // Libellé humain plutôt qu'enum brut : « Mon père ou ma mère » est sans ambiguïté
      // de direction, là où « parent » a fait écrire au rédacteur qu'un enfant était décédé.
      const last = CLOSED_TYPES.includes(spec.type)
        ? { question: textIn(spec.fallback_text.question, session.lang), value: displayValue(spec, value, session.lang) }
        : undefined
      const data = await renderNext(session, last)
      res.json({ success: true, data })
    } catch (error) {
      console.error('❌ questionnaire/answer :', error)
      res.status(500).json({ success: false, error: msg(bodyLang(req), 'answer_error') })
    }
  })

  router.post('/reask', requireAuth, async (req, res) => {
    try {
      const { session_id, question_id } = req.body
      if (!session_id || !question_id) {
        return res.status(400).json({ success: false, error: msg(bodyLang(req), 'session_and_question_required') })
      }
      const session = await store.loadSession(req.supabaseClient, session_id)
      if (!session) return res.status(404).json({ success: false, error: msg(bodyLang(req), 'session_not_found') })
      const spec = SORTED.find((q) => q.id === question_id)
      if (!spec || session.answers[spec.id] === undefined || !matchesWhen(spec.applicable_when, session.answers)) {
        return res.status(400).json({ success: false, error: msg(session.lang, 'question_not_editable') })
      }
      const text = await writeText({ spec, context: writerContext(session.answers), mistral, model, lang: session.lang })
      // current_value : permet au client de pré-remplir le formulaire lors d'une
      // modification depuis le récap (sinon un multiselect vide re-soumis effacerait tout).
      res.json({
        success: true,
        data: { ...toRendered(spec, session.answers, text, session.lang), current_value: session.answers[spec.id] },
      })
    } catch (error) {
      console.error('❌ questionnaire/reask :', error)
      res.status(500).json({ success: false, error: msg(bodyLang(req), 'reask_error') })
    }
  })

  router.post('/resume', requireAuth, resumeLimiter, async (req, res) => {
    try {
      const { session_id } = req.body
      if (!session_id) return res.status(400).json({ success: false, error: msg(bodyLang(req), 'session_required') })
      const session = await store.loadSession(req.supabaseClient, session_id)
      if (!session) return res.status(404).json({ success: false, error: msg(bodyLang(req), 'session_not_found') })
      // Reprise par construction : nextQuestion(answers) repart exactement où on en était.
      // La langue vient de la session (figée au /start), jamais du corps de cette requête.
      const data = await renderNext(session)
      res.json({ success: true, data })
    } catch (error) {
      console.error('❌ questionnaire/resume :', error)
      res.status(500).json({ success: false, error: msg(bodyLang(req), 'resume_error') })
    }
  })

  router.post('/complete', requireAuth, async (req, res) => {
    try {
      const { session_id } = req.body
      if (!session_id) return res.status(400).json({ success: false, error: msg(bodyLang(req), 'session_required') })
      const session = await store.loadSession(req.supabaseClient, session_id)
      if (!session) return res.status(404).json({ success: false, error: msg(bodyLang(req), 'session_not_found') })
      if (nextQuestion(session.answers) !== null) {
        return res.status(409).json({ success: false, error: msg(session.lang, 'questionnaire_incomplete') })
      }
      // Pas de deleteSession : /complete doit être idempotent. Si la réponse HTTP se perd,
      // un retry renvoie les mêmes answers au lieu d'un 404 (l'utilisateur ne refait pas
      // 15 questions). Le TTL expires_at (24 h) se charge du nettoyage.
      res.json({ success: true, answers: session.answers })
    } catch (error) {
      console.error('❌ questionnaire/complete :', error)
      res.status(500).json({ success: false, error: msg(bodyLang(req), 'complete_error') })
    }
  })

  return router
}
