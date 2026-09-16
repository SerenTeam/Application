import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@sentry/node', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import express from 'express'
import request from 'supertest'
import * as Sentry from '@sentry/node'
// @ts-expect-error — module JS serveur
import { createMeRouter } from '../server/routes/me.js'

const FAMILY = {
  user_id: 'user-1', role: 'family', is_admin: false, partner: null,
  dossier: { id: 'd-1', status: 'active', source: 'partner', partner_name: 'Pompes Funèbres Démo',
    deceased_first_name: 'Jean', activated_at: '2026-09-16T10:00:00Z', included_sends: 10 },
  consent: { version: '2026-09-beta-1', required: true, accepted_at: null },
}
const PARTNER = { ...FAMILY, role: 'partner', dossier: null,
  partner: { id: 'p-1', name: 'Pompes Funèbres Démo', status: 'active', user_role: 'manager' },
  consent: { version: '2026-09-beta-1', required: false, accepted_at: null } }

type Rows = Record<string, unknown>[]
function makeClient(opts: { account: unknown; accountError?: unknown; purchases?: Rows; debits?: Rows; failTable?: string }) {
  const from = vi.fn((table: string) => {
    const rows = table === 'purchases' ? opts.purchases ?? [] : table === 'send_debits' ? opts.debits ?? [] : null
    if (!rows) throw new Error(`table inattendue : ${table}`)
    const result = opts.failTable === table ? { data: null, error: { code: 'XX000', message: 'boom' } } : { data: rows, error: null }
    const builder = {
      select: () => builder, eq: () => builder, order: () => builder,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
    }
    return builder
  })
  return {
    rpc: vi.fn(async (name: string) => {
      if (name !== 'my_account') throw new Error(`rpc inattendue : ${name}`)
      return { data: opts.account, error: opts.accountError ?? null }
    }),
    from,
  }
}

function makeApp(client: ReturnType<typeof makeClient>) {
  const app = express()
  app.use(express.json())
  app.use('/api/me', createMeRouter({
    requireAuth: (req: express.Request & { user?: unknown; supabaseClient?: unknown }, _res: express.Response, next: express.NextFunction) => {
      req.user = { id: 'user-1' }
      req.supabaseClient = client
      next()
    },
  }))
  return app
}

afterEach(() => {
  delete process.env.SUPPORT_EMAIL
  delete process.env.PAPER_SENDS_ENABLED
  delete process.env.SHOW_ACTIVATION_LINK
  vi.mocked(Sentry.captureException).mockClear()
})

describe('GET /api/me', () => {
  it('famille active : 200 forme exacte (account, quota, flags, support_email) — non gatée par le consentement', async () => {
    process.env.PAPER_SENDS_ENABLED = 'true'
    const client = makeClient({ account: FAMILY, purchases: [{ included_sends: 10 }], debits: [{ source: 'included' }, { source: 'offert' }] })
    const res = await request(makeApp(client)).get('/api/me')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: true,
      account: FAMILY,
      quota: { balance: 9, included_total: 10 },
      flags: { llm_enabled: false, email_sends_enabled: false, extra_sends_enabled: false, paper_sends_enabled: true,
        partner_activations_enabled: false, partner_billing_preview: false },
      support_email: 'support@seren-app.fr',
    })
    expect(client.rpc).toHaveBeenCalledWith('my_account')
  })
  it('quota plancher 0 (débits > inclus)', async () => {
    const client = makeClient({ account: FAMILY, purchases: [{ included_sends: 1 }], debits: [{ source: 'included' }, { source: 'extra' }] })
    expect((await request(makeApp(client)).get('/api/me')).body.quota).toEqual({ balance: 0, included_total: 1 })
  })
  it('partenaire : quota null, aucune lecture purchases/send_debits', async () => {
    const client = makeClient({ account: PARTNER })
    const res = await request(makeApp(client)).get('/api/me')
    expect(res.body.quota).toBeNull()
    expect(client.from).not.toHaveBeenCalled()
  })
  it('compte sans dossier (role none) : quota null', async () => {
    const client = makeClient({ account: { ...FAMILY, role: 'none', dossier: null } })
    expect((await request(makeApp(client)).get('/api/me')).body.quota).toBeNull()
  })
  it('my_account null : 200 account null, quota null', async () => {
    const res = await request(makeApp(makeClient({ account: null }))).get('/api/me')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ success: true, account: null, quota: null })
  })
  it('RPC en erreur : 500 ACCOUNT_ERROR + Sentry', async () => {
    const res = await request(makeApp(makeClient({ account: null, accountError: { code: 'XX000', message: 'boom' } }))).get('/api/me')
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('ACCOUNT_ERROR')
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
  })
  it('lecture du quota en erreur : 500 ACCOUNT_ERROR', async () => {
    const res = await request(makeApp(makeClient({ account: FAMILY, failTable: 'send_debits' }))).get('/api/me')
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('ACCOUNT_ERROR')
  })
  it('SHOW_ACTIVATION_LINK jamais exposé ; SUPPORT_EMAIL surchargeable', async () => {
    process.env.SHOW_ACTIVATION_LINK = 'true'
    process.env.SUPPORT_EMAIL = 'aide@seren-app.fr'
    const res = await request(makeApp(makeClient({ account: PARTNER }))).get('/api/me')
    expect(JSON.stringify(res.body)).not.toMatch(/activation_link/i)
    expect(res.body.support_email).toBe('aide@seren-app.fr')
  })
})
