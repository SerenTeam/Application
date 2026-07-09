// Routes du questionnaire v2 — le serveur possède le flux (moteur) et les données (sessions).
// Factory à dépendances injectées : testable avec supertest sans Mistral ni Supabase.
// Contrat API : docs/design-questionnaire-v2.md, section « Contrat API ».
import { Router } from 'express'
import { QUESTIONS_CATALOG } from '../lib/questions-catalog.js'
import { nextQuestion, validateAnswer, setAnswer, matchesWhen, progress } from '../lib/questionnaire-engine.js'
import * as supabaseStore from '../lib/sessions-store.js'
import { writeQuestionText } from '../lib/question-writer.js'

const SORTED = [...QUESTIONS_CATALOG].sort((a, b) => a.order - b.order)
const TRISTATE_LABELS = { oui: 'Oui', non: 'Non', ne_sait_pas: 'Je ne sais pas' }
// Types à valeurs fermées (enums non identifiants) : seuls autorisés dans le contexte LLM.
const CLOSED_TYPES = ['boolean', 'tristate', 'select', 'multiselect']

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
function toRendered(spec, answers, text) {
  return {
    action: 'question',
    question_id: spec.id,
    question: text.question,
    aide: text.aide,
    type: spec.type,
    options: spec.options,
    obligatoire: spec.obligatoire,
    categorie: spec.categorie,
    progress: progress(answers),
  }
}

/** Libellé humain d'une réponse, pour l'écran récapitulatif. */
export function displayValue(spec, value) {
  switch (spec.type) {
    case 'boolean':
      return value ? 'Oui' : 'Non'
    case 'tristate':
      return TRISTATE_LABELS[value] ?? String(value)
    case 'select':
      return spec.options.find((o) => o.value === value)?.label ?? String(value)
    case 'multiselect': {
      if (!Array.isArray(value) || value.length === 0) return 'Aucun'
      return value.map((v) => spec.options.find((o) => o.value === v)?.label ?? v).join(', ')
    }
    default:
      return String(value)
  }
}

function buildRecap(answers) {
  const prenom = answers.deceased_firstname || 'votre proche'
  return SORTED.filter((spec) => answers[spec.id] !== undefined).map((spec) => ({
    question_id: spec.id,
    question: spec.fallback_text.question.replaceAll('{prenom}', prenom),
    display: displayValue(spec, answers[spec.id]),
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

  async function renderNext(session, last) {
    const spec = nextQuestion(session.answers)
    if (spec === null) return { action: 'recap', recap: buildRecap(session.answers) }
    const text = await writeText({ spec, context: writerContext(session.answers, last), mistral, model })
    return toRendered(spec, session.answers, text)
  }

  router.post('/start', requireAuth, async (req, res) => {
    try {
      const session = await store.createSession(req.supabaseClient, req.user.id)
      const data = await renderNext(session)
      res.json({ success: true, session_id: session.id, data })
    } catch (error) {
      console.error('❌ questionnaire/start :', error)
      res.status(500).json({ success: false, error: 'Impossible de démarrer le questionnaire' })
    }
  })

  router.post('/answer', requireAuth, async (req, res) => {
    try {
      const { session_id, question_id, value } = req.body
      if (!session_id || !question_id) {
        return res.status(400).json({ success: false, error: 'session_id et question_id requis' })
      }
      const session = await store.loadSession(req.supabaseClient, session_id)
      if (!session) return res.status(404).json({ success: false, error: 'Session non trouvée ou expirée' })
      const spec = SORTED.find((q) => q.id === question_id)
      if (!spec) return res.status(400).json({ success: false, error: 'Question inconnue' })
      if (!matchesWhen(spec.applicable_when, session.answers)) {
        return res.status(400).json({ success: false, error: 'Question non applicable à votre situation' })
      }
      const check = validateAnswer(spec, value)
      if (!check.ok) return res.status(400).json({ success: false, error: check.error })
      session.answers = setAnswer(session.answers, spec, value)
      await store.saveAnswers(req.supabaseClient, session_id, session.answers)
      // PII : la transition n'envoie la dernière réponse au LLM que pour les types fermés
      // (valeurs enum non identifiantes). Nom de famille et date de décès ne partent pas.
      const last = CLOSED_TYPES.includes(spec.type)
        ? { question: spec.fallback_text.question, value }
        : undefined
      const data = await renderNext(session, last)
      res.json({ success: true, data })
    } catch (error) {
      console.error('❌ questionnaire/answer :', error)
      res.status(500).json({ success: false, error: 'Erreur lors de l’enregistrement de la réponse' })
    }
  })

  router.post('/reask', requireAuth, async (req, res) => {
    try {
      const { session_id, question_id } = req.body
      if (!session_id || !question_id) {
        return res.status(400).json({ success: false, error: 'session_id et question_id requis' })
      }
      const session = await store.loadSession(req.supabaseClient, session_id)
      if (!session) return res.status(404).json({ success: false, error: 'Session non trouvée ou expirée' })
      const spec = SORTED.find((q) => q.id === question_id)
      if (!spec || session.answers[spec.id] === undefined || !matchesWhen(spec.applicable_when, session.answers)) {
        return res.status(400).json({ success: false, error: 'Question non modifiable' })
      }
      const text = await writeText({ spec, context: writerContext(session.answers), mistral, model })
      // current_value : permet au client de pré-remplir le formulaire lors d'une
      // modification depuis le récap (sinon un multiselect vide re-soumis effacerait tout).
      res.json({
        success: true,
        data: { ...toRendered(spec, session.answers, text), current_value: session.answers[spec.id] },
      })
    } catch (error) {
      console.error('❌ questionnaire/reask :', error)
      res.status(500).json({ success: false, error: 'Erreur lors de la reprise de la question' })
    }
  })

  router.post('/complete', requireAuth, async (req, res) => {
    try {
      const { session_id } = req.body
      if (!session_id) return res.status(400).json({ success: false, error: 'session_id requis' })
      const session = await store.loadSession(req.supabaseClient, session_id)
      if (!session) return res.status(404).json({ success: false, error: 'Session non trouvée ou expirée' })
      if (nextQuestion(session.answers) !== null) {
        return res.status(409).json({ success: false, error: 'Questionnaire incomplet' })
      }
      // Pas de deleteSession : /complete doit être idempotent. Si la réponse HTTP se perd,
      // un retry renvoie les mêmes answers au lieu d'un 404 (l'utilisateur ne refait pas
      // 15 questions). Le TTL expires_at (24 h) se charge du nettoyage.
      res.json({ success: true, answers: session.answers })
    } catch (error) {
      console.error('❌ questionnaire/complete :', error)
      res.status(500).json({ success: false, error: 'Erreur lors de la finalisation' })
    }
  })

  return router
}
