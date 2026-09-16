import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@sentry/node', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import express from 'express'
import request from 'supertest'
import * as Sentry from '@sentry/node'
// @ts-expect-error — module JS serveur
import { createRequireActiveDossier, FAIL_CLOSED_GATE } from '../server/lib/require-active-dossier.js'
// @ts-expect-error — module JS serveur
import { createQuestionnaireRouter } from '../server/routes/questionnaire.js'
// @ts-expect-error — module JS serveur
import { createLettersRouter } from '../server/routes/letters.js'
// @ts-expect-error — module JS serveur
import { createAttachmentsRouter } from '../server/routes/attachments.js'
// @ts-expect-error — module JS serveur
import { createPaymentsRouter } from '../server/routes/payments.js'
// @ts-expect-error — module JS serveur
import { LETTER_CHANNELS } from '../server/lib/letter-channels.js'

type Req = express.Request & { user?: unknown; supabaseClient?: unknown; account?: unknown }

export const ACTIVE_ACCOUNT = {
  user_id: 'user-1', role: 'family', is_admin: false, partner: null,
  dossier: { id: 'd-1', status: 'active', source: 'partner', partner_name: 'Pompes Funèbres Démo',
    deceased_first_name: 'Jean', activated_at: '2026-09-16T10:00:00Z', included_sends: 10 },
  consent: { version: '2026-09-beta-1', required: false, accepted_at: '2026-09-16T10:01:00Z' },
}

const requireAuth = (req: Req, _res: express.Response, next: express.NextFunction) => {
  req.user = { id: 'user-1' }
  req.supabaseClient = { marker: 'user-client' }
  next()
}

function gateWith(result: unknown) {
  const loadAccount = vi.fn(async () => {
    if (result instanceof Error) throw result
    return result
  })
  return { gate: createRequireActiveDossier({ loadAccount }), loadAccount }
}

function mini(gate: express.RequestHandler) {
  const app = express()
  app.use(express.json())
  app.post('/x', requireAuth, gate, (req: Req, res: express.Response) => res.json({ success: true, account: req.account }))
  return app
}

afterEach(() => vi.mocked(Sentry.captureException).mockClear())

describe('createRequireActiveDossier', () => {
  it('dossier actif + consentement à jour : next() et req.account posé', async () => {
    const { gate } = gateWith({ data: ACTIVE_ACCOUNT, error: null })
    const res = await request(mini(gate)).post('/x').send({})
    expect(res.status).toBe(200)
    expect(res.body.account.dossier.id).toBe('d-1')
  })
  it('lit avec le client AU TOKEN utilisateur (req.supabaseClient)', async () => {
    const { gate, loadAccount } = gateWith({ data: ACTIVE_ACCOUNT, error: null })
    await request(mini(gate)).post('/x').send({})
    expect(loadAccount).toHaveBeenCalledWith({ marker: 'user-client' })
  })
  it('RPC en erreur ({ error }) : 500 ACCOUNT_ERROR + Sentry, jamais next()', async () => {
    const { gate } = gateWith({ data: null, error: { message: 'boom', code: 'XX000' } })
    const res = await request(mini(gate)).post('/x').send({})
    expect(res.status).toBe(500)
    expect(res.body).toMatchObject({ success: false, code: 'ACCOUNT_ERROR' })
    expect(res.body.account).toBeUndefined()
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
  })
  it('exception levée : 500 ACCOUNT_ERROR, jamais next()', async () => {
    const { gate } = gateWith(new Error('réseau'))
    const res = await request(mini(gate)).post('/x').send({})
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('ACCOUNT_ERROR')
  })
  it.each([
    ['my_account null', null],
    ['rôle partner', { ...ACTIVE_ACCOUNT, role: 'partner', dossier: null }],
    ['rôle none', { ...ACTIVE_ACCOUNT, role: 'none', dossier: null }],
    ['dossier clos', { ...ACTIVE_ACCOUNT, dossier: { ...ACTIVE_ACCOUNT.dossier, status: 'closed' } }],
    ['famille sans objet dossier', { ...ACTIVE_ACCOUNT, dossier: null }],
  ])('%s : 403 DOSSIER_NOT_ACTIVE', async (_label, data) => {
    const { gate } = gateWith({ data, error: null })
    const res = await request(mini(gate)).post('/x').send({})
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('DOSSIER_NOT_ACTIVE')
  })
  it('consentement requis : 403 CONSENT_REQUIRED', async () => {
    const { gate } = gateWith({ data: { ...ACTIVE_ACCOUNT, consent: { ...ACTIVE_ACCOUNT.consent, required: true } }, error: null })
    const res = await request(mini(gate)).post('/x').send({})
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('CONSENT_REQUIRED')
  })
  it('objet consent absent (forme inattendue) : 403 CONSENT_REQUIRED — lecture fail-closed (note N7)', async () => {
    const withoutConsent = { ...ACTIVE_ACCOUNT } as Partial<typeof ACTIVE_ACCOUNT>
    delete withoutConsent.consent
    const { gate } = gateWith({ data: withoutConsent, error: null })
    expect((await request(mini(gate)).post('/x').send({})).body.code).toBe('CONSENT_REQUIRED')
  })
  it('lang=en : message anglais', async () => {
    const { gate } = gateWith({ data: null, error: null })
    const res = await request(mini(gate)).post('/x').send({ lang: 'en' })
    expect(res.body.error).toMatch(/not activated yet/)
  })
  it('FAIL_CLOSED_GATE : 500 GATE_NOT_CONFIGURED, jamais un passage', async () => {
    const res = await request(mini(FAIL_CLOSED_GATE)).post('/x').send({})
    expect(res.status).toBe(500)
    expect(res.body).toMatchObject({ success: false, code: 'GATE_NOT_CONFIGURED' })
  })
})

const never = (name: string) => () => { throw new Error(`${name} ne doit jamais être atteint`) }

function makeAllRouters(gate: express.RequestHandler) {
  const app = express()
  app.use(express.json())
  app.use('/api/questionnaire', createQuestionnaireRouter({
    requireAuth, requireActiveDossier: gate,
    store: { createSession: never('createSession'), loadSession: never('loadSession'), saveAnswers: never('saveAnswers'), deleteSession: never('deleteSession') },
    writeText: never('writeText'),
  }))
  app.use('/api/letters', createLettersRouter({
    requireAuth, requireActiveDossier: gate, store: { listSends: never('listSends') },
    emailSender: { send: never('emailSender.send') }, channels: LETTER_CHANNELS, extraSendAvailable: false,
  }))
  app.use('/api/attachments', createAttachmentsRouter({ requireAuth, requireActiveDossier: gate }))
  app.use('/api/payments', createPaymentsRouter({
    requireAuth, requireActiveDossier: gate, store: {}, stripe: null, publicClient: {}, appUrl: 'https://app.seren-app.fr',
  }))
  return app
}

const GATED_ROUTES: Array<['post' | 'get' | 'delete', string, Record<string, unknown>]> = [
  ['post', '/api/questionnaire/start', { lang: 'fr' }],
  ['post', '/api/questionnaire/answer', { session_id: 's', question_id: 'relation', value: 'parent' }],
  ['post', '/api/questionnaire/reask', { session_id: 's', question_id: 'relation' }],
  ['post', '/api/questionnaire/resume', { session_id: 's' }],
  ['post', '/api/questionnaire/complete', { session_id: 's' }],
  ['post', '/api/letters/send', { template_id: 'bailleur-notification' }],
  ['get', '/api/letters/quota', {}],
  ['get', '/api/letters/organisations?network=caf', {}],
  ['get', '/api/letters', {}],
  ['post', '/api/attachments', {}],
  ['get', '/api/attachments', {}],
  ['delete', '/api/attachments/11111111-1111-4111-8111-111111111111', {}],
  ['post', '/api/payments/checkout-extra-send', {}],
]

describe('fail-closed sur CHAQUE route gatée (contrat §4.2)', () => {
  it.each(GATED_ROUTES)('%s %s : compte sans dossier → 403 DOSSIER_NOT_ACTIVE', async (method, url, body) => {
    const { gate } = gateWith({ data: { ...ACTIVE_ACCOUNT, role: 'none', dossier: null }, error: null })
    const res = await request(makeAllRouters(gate))[method](url).send(body)
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('DOSSIER_NOT_ACTIVE')
  })
  it.each(GATED_ROUTES)('%s %s : lecture du compte en échec → 500 ACCOUNT_ERROR', async (method, url, body) => {
    const { gate } = gateWith(new Error('panne'))
    const res = await request(makeAllRouters(gate))[method](url).send(body)
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('ACCOUNT_ERROR')
  })
  it.each(GATED_ROUTES)('%s %s : consentement requis → 403 CONSENT_REQUIRED', async (method, url, body) => {
    const { gate } = gateWith({ data: { ...ACTIVE_ACCOUNT, consent: { ...ACTIVE_ACCOUNT.consent, required: true } }, error: null })
    const res = await request(makeAllRouters(gate))[method](url).send(body)
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('CONSENT_REQUIRED')
  })
  it.each([
    ['questionnaire', () => createQuestionnaireRouter({ requireAuth, store: {}, writeText: never('writeText') }), 'post', '/start'],
    ['letters', () => createLettersRouter({ requireAuth, store: {}, emailSender: {}, channels: LETTER_CHANNELS }), 'get', '/quota'],
    ['attachments', () => createAttachmentsRouter({ requireAuth }), 'get', '/'],
    ['payments', () => createPaymentsRouter({ requireAuth, store: {}, stripe: null, publicClient: {}, appUrl: 'x' }), 'post', '/checkout-extra-send'],
  ] as const)('factory %s construite SANS gate : 500 GATE_NOT_CONFIGURED (A5)', async (_name, build, method, url) => {
    const app = express()
    app.use(express.json())
    app.use('/r', build())
    const res = await request(app)[method](`/r${url}`).send({})
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('GATE_NOT_CONFIGURED')
  })
  it('les webhooks ne sont jamais gatés : my_account jamais lu', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET
    delete process.env.STRIPE_WEBHOOK_SECRET
    const { gate, loadAccount } = gateWith(new Error('ne doit pas être lu'))
    const app = makeAllRouters(gate)
    const letters = await request(app).post('/api/letters/webhook').set('Content-Type', 'application/json').send('{}')
    const payments = await request(app).post('/api/payments/webhook').set('Content-Type', 'application/json').send('{}')
    expect(letters.body.code).not.toBe('ACCOUNT_ERROR')
    expect(payments.body.code).not.toBe('ACCOUNT_ERROR')
    expect(loadAccount).not.toHaveBeenCalled()
  })
  it('un refus du gate ne consomme pas le quota de /start (12 refus, puis ouverture : jamais 429)', async () => {
    let current: unknown = { ...ACTIVE_ACCOUNT, role: 'none', dossier: null }
    const gate = createRequireActiveDossier({ loadAccount: async () => ({ data: current, error: null }) })
    const app = express()
    app.use(express.json())
    app.use('/api/questionnaire', createQuestionnaireRouter({
      requireAuth, requireActiveDossier: gate,
      store: {
        async createSession(_c: unknown, userId: string) { return { id: 'sess-1', user_id: userId, answers: {}, lang: 'fr' } },
        async loadSession() { return null }, async saveAnswers() {}, async deleteSession() {},
      },
      writeText: async () => ({ question: 'Question de repli suffisamment longue ?', source: 'fallback' as const }),
    }))
    for (let i = 0; i < 12; i++) expect((await request(app).post('/api/questionnaire/start').send({ lang: 'fr' })).status).toBe(403)
    current = ACTIVE_ACCOUNT
    expect((await request(app).post('/api/questionnaire/start').send({ lang: 'fr' })).status).toBe(200)
  })
})
