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
      return sessions.get(id) ?? null
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
    expect(q.progress).toEqual({ current: 0, total: 14 })
  })
})

describe('POST /api/questionnaire/answer', () => {
  let app: express.Express
  let sessionId: string
  beforeEach(async () => {
    const made = makeApp()
    app = made.app
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
  })
  it('valeur hors options → 400 avec message du moteur', async () => {
    const res = await request(app)
      .post('/api/questionnaire/answer')
      .send({ session_id: sessionId, question_id: 'relation', value: 'cousin' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Option inconnue')
  })
  it('question inapplicable → 400', async () => {
    await request(app).post('/api/questionnaire/answer').send({ session_id: sessionId, question_id: 'relation', value: 'parent' })
    const res = await request(app)
      .post('/api/questionnaire/answer')
      .send({ session_id: sessionId, question_id: 'has_joint_account', value: true })
    expect(res.status).toBe(400)
  })
  it('session inconnue → 404', async () => {
    const res = await request(app)
      .post('/api/questionnaire/answer')
      .send({ session_id: 'sess-inexistante', question_id: 'relation', value: 'parent' })
    expect(res.status).toBe(404)
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
  it('correction au récap : relation conjoint→parent purge le compte joint et repose la branche', async () => {
    const { app } = makeApp()
    const { sessionId } = await runToRecap(app)
    const res = await request(app)
      .post('/api/questionnaire/answer')
      .send({ session_id: sessionId, question_id: 'relation', value: 'parent' })
    expect(res.status).toBe(200)
    expect(res.body.data.action).toBe('recap') // has_joint_account purgé, plus rien d'applicable à demander
    const complete = await request(app).post('/api/questionnaire/complete').send({ session_id: sessionId })
    expect(complete.body.answers.has_joint_account).toBeUndefined()
    expect(complete.body.answers.relation).toBe('parent')
  })
  it('complete avant la fin → 409 ; après → answers puis session supprimée (404 au 2e appel)', async () => {
    const { app } = makeApp()
    const start = await request(app).post('/api/questionnaire/start')
    const early = await request(app).post('/api/questionnaire/complete').send({ session_id: start.body.session_id })
    expect(early.status).toBe(409)

    const { sessionId } = await runToRecap(app)
    const done = await request(app).post('/api/questionnaire/complete').send({ session_id: sessionId })
    expect(done.status).toBe(200)
    expect(done.body.answers.relation).toBe('conjoint_marie')
    expect(done.body.answers.deceased_firstname).toBe('Pierre')
    const again = await request(app).post('/api/questionnaire/complete').send({ session_id: sessionId })
    expect(again.status).toBe(404)
  })
})
