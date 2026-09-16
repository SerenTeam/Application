import { describe, it, expect, vi } from 'vitest'

vi.mock('@sentry/node', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import express from 'express'
import request from 'supertest'
import * as Sentry from '@sentry/node'
// @ts-expect-error — module JS serveur
import { createAdminRouter } from '../server/routes/admin.js'

const OVERVIEW = {
  generated_at: '2026-09-17T10:00:00Z', month: '2026-09',
  partners: [{ partner_id: 'p-1', name: 'Pompes Funèbres Démo', status: 'active', dossiers_total: 7, dossiers_this_month: 3,
    invited_pending: 2, activated: 4, cancelled: 1, last_dossier_at: '2026-09-16T08:00:00Z' }],
}

function makeApp(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result)
  const app = express()
  app.use('/api/admin', createAdminRouter({
    requireAuth: (req: express.Request & { user?: unknown; supabaseClient?: unknown }, _res: express.Response, next: express.NextFunction) => {
      req.user = { id: 'admin-1' }
      req.supabaseClient = { rpc }
      next()
    },
  }))
  return { app, rpc }
}

describe('GET /api/admin/overview', () => {
  it('admin : 200 { success, overview } via admin_partner_overview au token utilisateur', async () => {
    const { app, rpc } = makeApp({ data: OVERVIEW, error: null })
    const res = await request(app).get('/api/admin/overview')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, overview: OVERVIEW })
    expect(rpc).toHaveBeenCalledWith('admin_partner_overview')
  })
  it('RPC null (compte non admin : PF, famille, none) : 403 NOT_ADMIN', async () => {
    const res = await request(makeApp({ data: null, error: null }).app).get('/api/admin/overview')
    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ success: false, code: 'NOT_ADMIN' })
  })
  it('RPC en erreur : 500 ADMIN_ERROR + Sentry', async () => {
    const res = await request(makeApp({ data: null, error: { code: 'XX000', message: 'boom' } }).app).get('/api/admin/overview?lang=en')
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('ADMIN_ERROR')
    expect(res.body.error).toBe('Admin area error')
    expect(Sentry.captureException).toHaveBeenCalled()
  })
})
