import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
// @ts-expect-error — module JS serveur
import { createQuestionnaireRouter } from '../server/routes/questionnaire.js'

// ── Fakes ────────────────────────────────────────────────────────────────
type Session = { id: string; user_id: string; answers: Record<string, unknown> }

function makeApp() {
  const sessions = new Map<string, Session>()
  let seq = 0
  const store = {
    async createSession(_c: unknown, userId: string) {
      const s: Session = { id: `sess-${++seq}`, user_id: userId, answers: {} }
      sessions.set(s.id, s)
      return s
    },
    async loadSession(_c: unknown, id: string) {
      const s = sessions.get(id)
      return s ? structuredClone(s) : null // clone : force les routes à passer par saveAnswers
    },
    async saveAnswers(_c: unknown, id: string, answers: Record<string, unknown>) {
      const s = sessions.get(id)
      if (s) s.answers = answers
    },
    async deleteSession(_c: unknown, id: string) {
      sessions.delete(id)
    },
  }
  const requireAuth = (req: express.Request & { user?: unknown; supabaseClient?: unknown }, _res: express.Response, next: express.NextFunction) => {
    req.user = { id: 'user-1' }
    req.supabaseClient = {}
    next()
  }
  // writer synchrone déterministe : pas de LLM dans les tests de routes
  const writeText = async ({ spec }: { spec: { fallback_text: { question: string; aide?: string } } }) => ({
    question: spec.fallback_text.question,
    aide: spec.fallback_text.aide,
    source: 'fallback' as const,
  })
  const app = express()
  app.use(express.json())
  app.use('/api/questionnaire', createQuestionnaireRouter({ requireAuth, store, writeText }))
  return { app, sessions }
}

const CANNED: Record<string, unknown> = {
  relation: 'conjoint_marie', deceased_firstname: 'Pierre', deceased_lastname: 'Dupont',
  deceased_dod: '2026-04-10', statut_professionnel: 'salarie', logement: 'locataire',
  enfants: 'aucun', has_notary: false, has_life_insurance: 'oui',
  has_joint_account: true, has_vehicle: false, has_credits: false,
  employait_aide_domicile: false, contrat_obseques: 'non', organismes_contactes: ['banque'],
}

async function runToRecap(app: express.Express) {
  const start = await request(app).post('/api/questionnaire/start')
  const sessionId = start.body.session_id
  let data = start.body.data
  let guard = 0
  while (data.action === 'question') {
    const res = await request(app)
      .post('/api/questionnaire/answer')
      .send({ session_id: sessionId, question_id: data.question_id, value: CANNED[data.question_id] })
    expect(res.status).toBe(200)
    data = res.body.data
    if (++guard > 20) throw new Error('boucle infinie')
  }
  return { sessionId, recap: data }
}

// ── Tests ────────────────────────────────────────────────────────────────
describe('POST /api/questionnaire/start', () => {
  it('crée une session et rend la première question sans champs serveur', async () => {
    const { app } = makeApp()
    const res = await request(app).post('/api/questionnaire/start')
    expect(res.status).toBe(200)
    expect(res.body.session_id).toBeDefined()
    const q = res.body.data
    expect(q.action).toBe('question')
    expect(q.question_id).toBe('relation')
    expect(q.options[0]).toEqual({ value: 'conjoint_marie', label: 'Mon époux / mon épouse' })
    expect(q.fallback_text).toBeUndefined()
    expect(q.writer_hints).toBeUndefined()
    expect(q.progress).toEqual({ current: 0, total: 15 })
  })
})

describe('POST /api/questionnaire/answer', () => {
  let app: express.Express
  let sessions: Map<string, Session>
  let sessionId: string
  beforeEach(async () => {
    const made = makeApp()
    app = made.app
    sessions = made.sessions
    const start = await request(app).post('/api/questionnaire/start')
    sessionId = start.body.session_id
  })
  it('valeur valide → question suivante, progress avance', async () => {
    const res = await request(app)
      .post('/api/questionnaire/answer')
      .send({ session_id: sessionId, question_id: 'relation', value: 'conjoint_marie' })
    expect(res.status).toBe(200)
    expect(res.body.data.question_id).toBe('deceased_firstname')
    expect(res.body.data.progress).toEqual({ current: 1, total: 15 }) // branche conjoint ouverte
    expect(sessions.get(sessionId)?.answers.relation).toBe('conjoint_marie') // persisté via saveAnswers, pas par aliasing
  })
  it('valeur hors options → 400 avec message du moteur', async () => {
    const res = await request(app)
      .post('/api/questionnaire/answer')
      .send({ session_id: sessionId, question_id: 'relation', value: 'cousin' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Option inconnue')
  })
  // NOTE post-revue (Task 1, plan v3, décision 2026-07-11) : has_joint_account était la seule
  // question du catalogue avec un applicable_when non vide. Devenue universelle, il n'existe
  // plus aucune question conditionnelle à rendre « inapplicable » via l'API avec le catalogue
  // réel — le test 'question inapplicable → 400' qui vivait ici ne peut plus être exercé.
  // Le mécanisme matchesWhen (utilisé par la route pour le 400) reste couvert unitairement par
  // tests/invariants.test.ts (parité isApplicable ↔ matchesWhen avec des specs synthétiques).
  // À réintroduire au niveau route si un futur lot (ex. Task 6, éditorial) rétablit des
  // questions conditionnelles.
  it('session inconnue → 404', async () => {
    const res = await request(app)
      .post('/api/questionnaire/answer')
      .send({ session_id: 'sess-inexistante', question_id: 'relation', value: 'parent' })
    expect(res.status).toBe(404)
  })
  it('échec de persistance → 500 générique sans détail interne', async () => {
    // App dédiée avec un saveAnswers qui rejette
    const app2 = express()
    app2.use(express.json())
    app2.use('/api/questionnaire', createQuestionnaireRouter({
      requireAuth: (req: express.Request & { user?: unknown; supabaseClient?: unknown }, _res: express.Response, next: express.NextFunction) => { req.user = { id: 'u' }; req.supabaseClient = {}; next() },
      store: {
        async createSession() { throw new Error('n/a') },
        async loadSession() { return { id: 's', user_id: 'u', answers: {} } },
        async saveAnswers() { throw new Error('secret interne boom') },
        async deleteSession() {},
      },
      writeText: async () => ({ question: 'Q de secours suffisamment longue ?', source: 'fallback' as const }),
    }))
    const res = await request(app2).post('/api/questionnaire/answer').send({ session_id: 's', question_id: 'relation', value: 'parent' })
    expect(res.status).toBe(500)
    expect(res.body.error).not.toContain('secret interne')
  })
})

describe('parcours complet → récap → complete', () => {
  it('le récap contient les libellés humains', async () => {
    const { app } = makeApp()
    const { recap } = await runToRecap(app)
    expect(recap.action).toBe('recap')
    const byId = Object.fromEntries(recap.recap.map((e: { question_id: string; display: string }) => [e.question_id, e.display]))
    expect(byId['relation']).toBe('Mon époux / mon épouse')
    expect(byId['has_notary']).toBe('Non')
    expect(byId['has_life_insurance']).toBe('Oui')
    expect(byId['organismes_contactes']).toBe('La banque')
    expect(byId['deceased_firstname']).toBe('Pierre')
  })
  it('reask d’une question répondue → 200 ; non répondue → 400', async () => {
    const { app } = makeApp()
    const { sessionId } = await runToRecap(app)
    const ok = await request(app).post('/api/questionnaire/reask').send({ session_id: sessionId, question_id: 'relation' })
    expect(ok.status).toBe(200)
    expect(ok.body.data.question_id).toBe('relation')
    const start2 = await request(app).post('/api/questionnaire/start')
    const ko = await request(app).post('/api/questionnaire/reask').send({ session_id: start2.body.session_id, question_id: 'has_notary' })
    expect(ko.status).toBe(400)
  })
  it('reask renvoie la valeur courante pour pré-remplir', async () => {
    const { app } = makeApp()
    const { sessionId } = await runToRecap(app)
    const res = await request(app).post('/api/questionnaire/reask').send({ session_id: sessionId, question_id: 'organismes_contactes' })
    expect(res.status).toBe(200)
    expect(res.body.data.current_value).toEqual(['banque'])
  })
  it('correction parent→conjoint depuis le récap : aucune question rouverte, has_joint_account déjà répondu', async () => {
    const { app } = makeApp()
    const { sessionId } = await runToRecap(app) // profil conjoint_marie complet
    // bascule vers parent (has_joint_account survit, question universelle) puis retour vers conjoint
    await request(app).post('/api/questionnaire/answer').send({ session_id: sessionId, question_id: 'relation', value: 'parent' })
    const back = await request(app).post('/api/questionnaire/answer').send({ session_id: sessionId, question_id: 'relation', value: 'conjoint_marie' })
    expect(back.status).toBe(200)
    expect(back.body.data.action).toBe('recap') // aucune question rouverte : has_joint_account déjà répondu
  })
  it('correction au récap : relation conjoint→parent conserve le compte joint (question universelle)', async () => {
    const { app } = makeApp()
    const { sessionId } = await runToRecap(app)
    const res = await request(app)
      .post('/api/questionnaire/answer')
      .send({ session_id: sessionId, question_id: 'relation', value: 'parent' })
    expect(res.status).toBe(200)
    expect(res.body.data.action).toBe('recap')
    const complete = await request(app).post('/api/questionnaire/complete').send({ session_id: sessionId })
    expect(complete.body.answers.has_joint_account).toBe(true)
    expect(complete.body.answers.relation).toBe('parent')
  })
  it('complete avant la fin → 409 ; après → answers, et idempotent (mêmes answers au 2e appel)', async () => {
    const { app } = makeApp()
    const start = await request(app).post('/api/questionnaire/start')
    const early = await request(app).post('/api/questionnaire/complete').send({ session_id: start.body.session_id })
    expect(early.status).toBe(409)

    const { sessionId } = await runToRecap(app)
    const done = await request(app).post('/api/questionnaire/complete').send({ session_id: sessionId })
    expect(done.status).toBe(200)
    expect(done.body.answers.relation).toBe('conjoint_marie')
    const again = await request(app).post('/api/questionnaire/complete').send({ session_id: sessionId })
    expect(again.status).toBe(200) // idempotent : une réponse HTTP perdue n'est pas fatale
    expect(again.body.answers).toEqual(done.body.answers)
  })
  it('resume : session en cours → prochaine question ; session finie → récap', async () => {
    const { app } = makeApp()
    const start = await request(app).post('/api/questionnaire/start')
    await request(app).post('/api/questionnaire/answer').send({ session_id: start.body.session_id, question_id: 'relation', value: 'parent' })
    const mid = await request(app).post('/api/questionnaire/resume').send({ session_id: start.body.session_id })
    expect(mid.status).toBe(200)
    expect(mid.body.data.question_id).toBe('deceased_firstname')
    const { sessionId } = await runToRecap(app)
    const done = await request(app).post('/api/questionnaire/resume').send({ session_id: sessionId })
    expect(done.body.data.action).toBe('recap')
  })
  it('resume : session inconnue → 404', async () => {
    const { app } = makeApp()
    const res = await request(app).post('/api/questionnaire/resume').send({ session_id: 'sess-inexistante' })
    expect(res.status).toBe(404)
  })
})
