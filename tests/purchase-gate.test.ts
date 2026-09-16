import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
// @ts-expect-error — module JS serveur
import { createRequirePurchase } from '../server/lib/require-purchase.js'
// @ts-expect-error — module JS serveur
import { createUserRateLimiter } from '../server/lib/rate-limit.js'
import { makePurchasesStore } from './helpers/purchases-fake'

// Code mort v2 (contrat §1.4) : createRequirePurchase n'est plus monté par server.js. Il est
// conservé, et vérifié ISOLÉMENT, jusqu'au nettoyage post-bêta.
function makeApp({ paymentsEnabled, purchases }: { paymentsEnabled: boolean; purchases: ReturnType<typeof makePurchasesStore> }) {
  const rows: unknown[] = []
  const requireAuth = (req: express.Request & { user?: unknown; supabaseClient?: unknown }, _res: express.Response, next: express.NextFunction) => {
    req.user = { id: 'user-1' }
    req.supabaseClient = {}
    next()
  }
  const app = express()
  app.use(express.json())
  const limiter = createUserRateLimiter({ max: 20, windowMs: 60 * 60 * 1000 })
  app.post('/api/letters/send', requireAuth, createRequirePurchase({ store: purchases, paymentsEnabled }), limiter,
    (req: express.Request, res: express.Response) => { rows.push(req.body); res.json({ success: true }) })
  app.get('/api/letters', requireAuth, (_req: express.Request, res: express.Response) => res.json({ success: true, sends: rows }))
  return { app, lettersStore: { rows } }
}

const PAYLOAD = {
  template_id: 'mutuelle-resiliation',
  step_id: 'administratif-mutuelle',
  subject: 'Résiliation pour décès',
  resolved_body: 'Madame, Monsieur, je vous informe du décès de mon proche. Cordialement.',
  recipient_email: 'contact@mutuelle-exemple.fr',
}

beforeEach(() => {
  process.env.WEBHOOK_RPC_SECRET = 'rpc-secret-test'
})
afterEach(() => {
  delete process.env.WEBHOOK_RPC_SECRET
})

describe('gating de POST /api/letters/send', () => {
  it('vente fermée : l’envoi passe, exactement comme avant le chantier 1', async () => {
    const { app, lettersStore } = makeApp({ paymentsEnabled: false, purchases: makePurchasesStore() })
    const res = await request(app).post('/api/letters/send').send(PAYLOAD)
    expect(res.status).toBe(200)
    expect(lettersStore.rows).toHaveLength(1)
  })

  it('vente ouverte sans achat : 402 PURCHASE_REQUIRED, aucun envoi persisté', async () => {
    const { app, lettersStore } = makeApp({ paymentsEnabled: true, purchases: makePurchasesStore() })
    const res = await request(app).post('/api/letters/send').send(PAYLOAD)
    expect(res.status).toBe(402)
    expect(res.body.code).toBe('PURCHASE_REQUIRED')
    expect(lettersStore.rows).toHaveLength(0)
  })

  it('vente ouverte avec achat payé : l’envoi passe', async () => {
    const purchases = makePurchasesStore([{ status: 'paid', paid_at: '2026-07-25T10:00:00.000Z' }])
    const { app, lettersStore } = makeApp({ paymentsEnabled: true, purchases })
    expect((await request(app).post('/api/letters/send').send(PAYLOAD)).status).toBe(200)
    expect(lettersStore.rows).toHaveLength(1)
  })

  it('après remboursement : 402 de nouveau', async () => {
    const purchases = makePurchasesStore([{ status: 'refunded', paid_at: '2026-07-25T10:00:00.000Z' }])
    const { app } = makeApp({ paymentsEnabled: true, purchases })
    expect((await request(app).post('/api/letters/send').send(PAYLOAD)).status).toBe(402)
  })

  it('achat d’un AUTRE utilisateur : 402 (le gate lit par user_id)', async () => {
    const purchases = makePurchasesStore([{ status: 'paid', user_id: 'user-2', paid_at: '2026-07-25T10:00:00.000Z' }])
    const { app } = makeApp({ paymentsEnabled: true, purchases })
    expect((await request(app).post('/api/letters/send').send(PAYLOAD)).status).toBe(402)
  })

  // Chantier 2a (amendement AM-2) : un envoi supplémentaire (facturation à l'acte) est une ligne
  // purchases payée comme une autre — sans le filtre kind='forfait' de getPaidPurchase, l'acheter
  // seul (sans jamais avoir pris le forfait) ouvrirait le gate du produit entier.
  it('achat kind=envoi_sup seul (payé) : 402 — un envoi supplémentaire n’ouvre jamais le gate à lui seul', async () => {
    const purchases = makePurchasesStore([{ status: 'paid', kind: 'envoi_sup', included_sends: 1, paid_at: '2026-09-13T10:00:00.000Z' }])
    const { app, lettersStore } = makeApp({ paymentsEnabled: true, purchases })
    const res = await request(app).post('/api/letters/send').send(PAYLOAD)
    expect(res.status).toBe(402)
    expect(res.body.code).toBe('PURCHASE_REQUIRED')
    expect(lettersStore.rows).toHaveLength(0)
  })

  it('incident de lecture : 500 franc, JAMAIS un passage (un bug base n’offre pas un envoi)', async () => {
    const purchases = makePurchasesStore([{ status: 'paid', paid_at: '2026-07-25T10:00:00.000Z' }])
    purchases.failReads = true
    const { app, lettersStore } = makeApp({ paymentsEnabled: true, purchases })
    expect((await request(app).post('/api/letters/send').send(PAYLOAD)).status).toBe(500)
    expect(lettersStore.rows).toHaveLength(0)
  })

  it('la consultation de ses envois n’est jamais gatée (même sans achat)', async () => {
    const { app } = makeApp({ paymentsEnabled: true, purchases: makePurchasesStore() })
    expect((await request(app).get('/api/letters')).status).toBe(200)
  })

  it('un refus 402 ne consomme pas le quota horaire d’envois', async () => {
    const purchases = makePurchasesStore()
    const { app } = makeApp({ paymentsEnabled: true, purchases })
    // 25 refus > le plafond de 20/h du limiteur : si le gate était monté APRÈS lui, le 21e
    // renverrait 429 au lieu de 402.
    for (let i = 0; i < 25; i++) {
      expect((await request(app).post('/api/letters/send').send(PAYLOAD)).status).toBe(402)
    }
  })
})
