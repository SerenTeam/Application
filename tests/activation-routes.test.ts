import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@sentry/node', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import express from 'express'
import request from 'supertest'
// @ts-expect-error — module JS serveur
import { createActivationRouter } from '../server/routes/activation.js'

const HASH = 'ea866a757e4c38babfa8127cbe9a409d3e1f93a00ff1488ff735fcf917afffd0'
const TOKEN = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'
const PREVIEW = { valid: true, email: 'claire.martin@exemple.fr', partner_name: 'Pompes Funèbres Démo',
  family_first_name: 'Claire', deceased_first_name: 'Jean', expires_at: '2026-09-23T08:00:00Z' }

type RpcResult = { data?: unknown; error?: { message: string; code?: string } | null }
function client(result: RpcResult) {
  return { rpc: vi.fn(async () => result) }
}
function makeApp({ publicClient = client({ data: PREVIEW, error: null }), userClient = client({ data: null, error: null }) } = {}) {
  const app = express()
  app.set('trust proxy', 1)
  app.use(express.json())
  app.use('/api/activation', createActivationRouter({
    requireAuth: (req: express.Request & { user?: unknown; supabaseClient?: unknown }, res: express.Response, next: express.NextFunction) => {
      if (!req.headers.authorization) return res.status(401).json({ success: false, code: 'AUTH_REQUIRED' })
      req.user = { id: 'famille-1' }
      req.supabaseClient = userClient
      next()
    },
    publicClient,
    supportEmail: 'support@seren-app.fr',
  }))
  return { app, publicClient, userClient }
}

afterEach(() => {
  delete process.env.PARTNER_ACTIVATIONS_ENABLED
  vi.restoreAllMocks()
})

describe('POST /api/activation/check (public)', () => {
  it('flag fermé : 503 PARTNER_ACTIVATIONS_DISABLED sans appel base', async () => {
    const { app, publicClient } = makeApp()
    const res = await request(app).post('/api/activation/check').send({ token_hash: HASH })
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('PARTNER_ACTIVATIONS_DISABLED')
    expect(publicClient.rpc).not.toHaveBeenCalled()
  })
  it.each([[TOKEN], [HASH.toUpperCase()], [HASH.slice(1)], [undefined], [42]])('hash hors motif (%s) : 400 INVALID_TOKEN sans appel base', async (value) => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const { app, publicClient } = makeApp()
    const res = await request(app).post('/api/activation/check').send({ token_hash: value })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_TOKEN')
    expect(publicClient.rpc).not.toHaveBeenCalled()
  })
  it('valide : invitation_preview via le client PUBLIC, 200 forme exacte, jamais le hash en retour', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const { app, publicClient } = makeApp()
    const res = await request(app).post('/api/activation/check').send({ token_hash: HASH, lang: 'fr' })
    expect(res.status).toBe(200)
    expect(publicClient.rpc).toHaveBeenCalledWith('invitation_preview', { p_token_hash: HASH })
    expect(res.body).toEqual({
      success: true,
      invitation: { email: 'claire.martin@exemple.fr', partner_name: 'Pompes Funèbres Démo', family_first_name: 'Claire',
        deceased_first_name: 'Jean', expires_at: '2026-09-23T08:00:00Z' },
      support_email: 'support@seren-app.fr',
    })
    expect(JSON.stringify(res.body)).not.toContain(HASH)
  })
  it('expirée : 410 INVITATION_EXPIRED + partner_name + support_email', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const { app } = makeApp({ publicClient: client({ data: { valid: false, reason: 'expired', partner_name: 'PF Démo' }, error: null }) })
    const res = await request(app).post('/api/activation/check').send({ token_hash: HASH })
    expect(res.status).toBe(410)
    expect(res.body).toMatchObject({ success: false, code: 'INVITATION_EXPIRED', partner_name: 'PF Démo', support_email: 'support@seren-app.fr' })
  })
  it('invalide : 404 INVITATION_INVALID', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const { app } = makeApp({ publicClient: client({ data: { valid: false, reason: 'invalid' }, error: null }) })
    expect((await request(app).post('/api/activation/check').send({ token_hash: HASH })).body.code).toBe('INVITATION_INVALID')
  })
  it('RPC en erreur : 500 ACTIVATION_ERROR', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const { app } = makeApp({ publicClient: client({ data: null, error: { message: 'boom', code: 'XX000' } }) })
    expect((await request(app).post('/api/activation/check').send({ token_hash: HASH })).status).toBe(500)
  })
  it('limite par IP : 31e appel en 10 min → 429 ; une autre IP (X-Forwarded-For) passe', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const { app } = makeApp()
    for (let i = 0; i < 30; i++) {
      expect((await request(app).post('/api/activation/check').set('X-Forwarded-For', '203.0.113.7').send({ token_hash: HASH })).status).toBe(200)
    }
    expect((await request(app).post('/api/activation/check').set('X-Forwarded-For', '203.0.113.7').send({ token_hash: HASH })).status).toBe(429)
    expect((await request(app).post('/api/activation/check').set('X-Forwarded-For', '198.51.100.9').send({ token_hash: HASH })).status).toBe(200)
  })
  it('aucun console.* n’émet le hash, même en erreur', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const logs: string[] = []
    for (const level of ['log', 'info', 'warn', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { logs.push(args.map((a) => String(a instanceof Error ? a.message : JSON.stringify(a))).join(' ')) })
    }
    const { app } = makeApp({ publicClient: client({ data: null, error: { message: `boom ${HASH}`, code: 'XX000' } }) })
    await request(app).post('/api/activation/check').send({ token_hash: HASH })
    expect(logs.join('\n')).not.toContain(HASH)
  })
})

describe('POST /api/activation/claim', () => {
  it('sans Bearer : 401 avant toute chose', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    expect((await request(makeApp().app).post('/api/activation/claim').send({ token_hash: HASH })).status).toBe(401)
  })
  it('flag fermé : 503', async () => {
    const { app, userClient } = makeApp()
    expect((await request(app).post('/api/activation/claim').set('Authorization', 'Bearer x').send({ token_hash: HASH })).status).toBe(503)
    expect(userClient.rpc).not.toHaveBeenCalled()
  })
  it('hash invalide : 400 INVALID_TOKEN sans appel base', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const { app, userClient } = makeApp()
    expect((await request(app).post('/api/activation/claim').set('Authorization', 'Bearer x').send({ token_hash: TOKEN })).status).toBe(400)
    expect(userClient.rpc).not.toHaveBeenCalled()
  })
  it('claim : claim_dossier via le client UTILISATEUR, 200 forme exacte', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const userClient = client({ data: { claimed: true, already_active: false, dossier_id: 'd-1', partner_name: 'PF Démo' }, error: null })
    const { app, publicClient } = makeApp({ userClient })
    const res = await request(app).post('/api/activation/claim').set('Authorization', 'Bearer x').send({ token_hash: HASH })
    expect(res.status).toBe(200)
    expect(userClient.rpc).toHaveBeenCalledWith('claim_dossier', { p_token_hash: HASH })
    expect(publicClient.rpc).not.toHaveBeenCalled()
    expect(res.body).toEqual({ success: true, claimed: true, already_active: false, dossier_id: 'd-1', partner_name: 'PF Démo' })
  })
  it('rejeu idempotent : 200 already_active true, sans partner_name', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const { app } = makeApp({ userClient: client({ data: { claimed: false, already_active: true, dossier_id: 'd-1' }, error: null }) })
    const res = await request(app).post('/api/activation/claim').set('Authorization', 'Bearer x').send({ token_hash: HASH })
    expect(res.body).toEqual({ success: true, claimed: false, already_active: true, dossier_id: 'd-1' })
  })
  it.each([
    ['invalid_token', 404, 'INVITATION_INVALID'],
    ['invitation_expired', 410, 'INVITATION_EXPIRED'],
    ['email_mismatch', 403, 'EMAIL_MISMATCH'],
    ['account_role_forbidden', 403, 'ACCOUNT_ROLE_FORBIDDEN'],
    ['account_already_linked', 409, 'ACCOUNT_ALREADY_LINKED'],
    ['not_authenticated', 500, 'ACTIVATION_ERROR'],
  ])('erreur SQL %s → %i %s', async (sqlCode, status, code) => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const { app } = makeApp({ userClient: client({ data: null, error: { message: sqlCode as string, code: 'P0001' } }) })
    const res = await request(app).post('/api/activation/claim').set('Authorization', 'Bearer x').send({ token_hash: HASH })
    expect(res.status).toBe(status)
    expect(res.body.code).toBe(code)
  })
})
