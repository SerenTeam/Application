import { describe, it, expect, vi } from 'vitest'

vi.mock('@sentry/node', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import express from 'express'
import request from 'supertest'
// @ts-expect-error — module JS serveur
import { createTransmissionRouter } from '../server/routes/transmission.js'

function makeApp(client: Record<string, unknown>) {
  const app = express()
  app.use('/api', createTransmissionRouter({
    requireAuth: (req: express.Request & { user?: unknown; supabaseClient?: unknown }, _res: express.Response, next: express.NextFunction) => {
      req.user = { id: 'user-1' }
      req.supabaseClient = client
      next()
    },
  }))
  return app
}

describe('GET /api/transmission/:code (correctif F1)', () => {
  it('code valide : RPC get_transmission_by_code, 200 { data parsé, created_at }', async () => {
    const rpc = vi.fn(async () => ({ data: [{ data: '{"a":1}', created_at: '2026-07-10T10:00:00Z' }], error: null }))
    const from = vi.fn()
    const res = await request(makeApp({ rpc, from })).get('/api/transmission/abcd1234')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, data: { a: 1 }, created_at: '2026-07-10T10:00:00Z' })
    expect(rpc).toHaveBeenCalledWith('get_transmission_by_code', { p_code: 'abcd1234' })
    expect(from).not.toHaveBeenCalled() // plus JAMAIS de lecture directe de la table
  })
  it('aucune ligne : 404, texte actuel conservé', async () => {
    const res = await request(makeApp({ rpc: async () => ({ data: [], error: null }), from: vi.fn() })).get('/api/transmission/ZZZZ')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ success: false, error: 'Code invalide ou données non trouvées' })
  })
  it('RPC en erreur : 500', async () => {
    const res = await request(makeApp({ rpc: async () => ({ data: null, error: { code: '42883', message: 'function does not exist' } }), from: vi.fn() })).get('/api/transmission/ABCD')
    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
  })
  it('/api/user/transmission : lecture owner inchangée', async () => {
    const builder = {
      select: () => builder, eq: () => builder, order: () => builder, limit: () => builder,
      maybeSingle: async () => ({ data: { id: 't-1' }, error: null }),
    }
    const res = await request(makeApp({ from: () => builder, rpc: vi.fn() })).get('/api/user/transmission')
    expect(res.body).toEqual({ success: true, transmission: { id: 't-1' }, has_transmission: true })
  })
})
