import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@sentry/node', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import express from 'express'
import request from 'supertest'
import * as Sentry from '@sentry/node'
// @ts-expect-error — module JS serveur
import { createRequireActiveDossier, FAIL_CLOSED_GATE } from '../server/lib/require-active-dossier.js'

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
