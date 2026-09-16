import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Sentry mocké pour tout le graphe : la détection d'anomalie « envoi supplémentaire encaissé sans
// forfait » (correctif M1 de la revue Task 9) se vérifie comme le reste du contrat.
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))

import express from 'express'
import request from 'supertest'
import * as Sentry from '@sentry/node'
// @ts-expect-error — module JS serveur
import { createPaymentsRouter } from '../server/routes/payments.js'
import { makePurchasesStore } from './helpers/purchases-fake'

// Gate passe-plat EXPLICITE (A5 : le défaut des factories est fail-closed).
const PASS = (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()

// Le SDK Stripe est injecté : aucun appel réseau, aucun compte, aucune clé réelle.
function makeStripe(behavior: 'ok' | 'fail' = 'ok') {
  const created: Record<string, unknown>[] = []
  const stripe = {
    behavior,
    created,
    checkout: {
      sessions: {
        async create(params: Record<string, unknown>) {
          if (stripe.behavior === 'fail') throw new Error('stripe: carte refusée à la création')
          created.push(params)
          return { id: `cs_test_${created.length}`, url: `https://checkout.stripe.com/c/pay/cs_test_${created.length}` }
        },
      },
    },
    webhooks: { constructEvent: () => ({ type: 'noop' }) },
  }
  return stripe
}

function makeApp(opts: {
  store?: ReturnType<typeof makePurchasesStore>
  stripe?: ReturnType<typeof makeStripe> | null
  extraPriceId?: string | undefined
  getPrice?: () => Promise<{ amount_total: number; currency: string } | null>
  getExtraPrice?: () => Promise<{ amount_total: number; currency: string } | null>
  gate?: express.RequestHandler
} = {}) {
  const store = opts.store ?? makePurchasesStore()
  const stripe = opts.stripe === undefined ? makeStripe() : opts.stripe
  const requireAuth = (req: express.Request & { user?: unknown; supabaseClient?: unknown }, _res: express.Response, next: express.NextFunction) => {
    req.user = { id: 'user-1', email: 'famille@exemple.fr' }
    req.supabaseClient = {}
    next()
  }
  const app = express()
  app.use(express.json())
  app.use('/api/payments', createPaymentsRouter({
    requireAuth,
    requireActiveDossier: opts.gate ?? PASS,
    store,
    stripe,
    publicClient: {},
    getPrice: opts.getPrice ?? (async () => ({ amount_total: 14900, currency: 'eur' })),
    getExtraPrice: opts.getExtraPrice ?? (async () => ({ amount_total: 990, currency: 'eur' })),
    extraPriceId: 'extraPriceId' in opts ? opts.extraPriceId : 'price_extra_456',
    appUrl: 'https://app.seren-app.fr',
  }))
  return { app, store, stripe }
}

beforeEach(() => {
  process.env.WEBHOOK_RPC_SECRET = 'rpc-secret-test'
})
afterEach(() => {
  delete process.env.WEBHOOK_RPC_SECRET
  delete process.env.EXTRA_SENDS_ENABLED
  vi.mocked(Sentry.captureException).mockClear()
})

describe('POST /api/payments/checkout — forfait famille abandonné (v2)', () => {
  it('toujours 503 PAYMENTS_DISABLED, même Stripe et tarif configurés, AUCUNE session', async () => {
    process.env.EXTRA_SENDS_ENABLED = 'true'
    const { app, stripe, store } = makeApp()
    const res = await request(app).post('/api/payments/checkout').send({})
    expect(res.status).toBe(503)
    expect(res.body).toMatchObject({ success: false, code: 'PAYMENTS_DISABLED' })
    expect(stripe!.created).toHaveLength(0)
    expect(store.rows).toHaveLength(0)
  })
})

describe('POST /api/payments/checkout-extra-send — mini-paiement sous EXTRA_SENDS_ENABLED', () => {
  it('flag absent (défaut bêta) : 503 PAYMENTS_DISABLED, aucune session', async () => {
    const { app, stripe } = makeApp()
    const res = await request(app).post('/api/payments/checkout-extra-send').send({})
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('PAYMENTS_DISABLED')
    expect(stripe!.created).toHaveLength(0)
  })
  it('flag « TRUE » (casse) : 503 — seule la valeur exacte ouvre', async () => {
    process.env.EXTRA_SENDS_ENABLED = 'TRUE'
    expect((await request(makeApp().app).post('/api/payments/checkout-extra-send').send({})).status).toBe(503)
  })
  it('flag ouvert mais tarif absent : 503', async () => {
    process.env.EXTRA_SENDS_ENABLED = 'true'
    expect((await request(makeApp({ extraPriceId: undefined }).app).post('/api/payments/checkout-extra-send').send({})).status).toBe(503)
  })
  it('flag ouvert mais SDK absent : 503', async () => {
    process.env.EXTRA_SENDS_ENABLED = 'true'
    expect((await request(makeApp({ stripe: null }).app).post('/api/payments/checkout-extra-send').send({})).status).toBe(503)
  })
  it('flag ouvert, dossier actif : session envoi_sup (1 envoi) SANS exiger de forfait', async () => {
    process.env.EXTRA_SENDS_ENABLED = 'true'
    const { app, stripe, store } = makeApp()
    const res = await request(app).post('/api/payments/checkout-extra-send').send({})
    expect(res.status).toBe(200)
    expect(stripe!.created[0]).toMatchObject({ metadata: { kind: 'envoi_sup', included_sends: '1' } })
    expect(store.rows[0]).toMatchObject({ kind: 'envoi_sup', included_sends: 1 })
  })
  it('gate refusé : 403 DOSSIER_NOT_ACTIVE, aucune session', async () => {
    process.env.EXTRA_SENDS_ENABLED = 'true'
    const refuse = (_req: express.Request, res: express.Response) => res.status(403).json({ success: false, code: 'DOSSIER_NOT_ACTIVE' })
    const { app, stripe } = makeApp({ gate: refuse })
    expect((await request(app).post('/api/payments/checkout-extra-send').send({})).status).toBe(403)
    expect(stripe!.created).toHaveLength(0)
  })
  it('achetable plusieurs fois', async () => {
    process.env.EXTRA_SENDS_ENABLED = 'true'
    const { app, stripe } = makeApp()
    await request(app).post('/api/payments/checkout-extra-send').send({})
    await request(app).post('/api/payments/checkout-extra-send').send({})
    expect(stripe!.created).toHaveLength(2)
  })
  it('échec Stripe : 502', async () => {
    process.env.EXTRA_SENDS_ENABLED = 'true'
    expect((await request(makeApp({ stripe: makeStripe('fail') }).app).post('/api/payments/checkout-extra-send').send({})).status).toBe(502)
  })
  it('le limiteur coupe au 11e appel de l’heure', async () => {
    process.env.EXTRA_SENDS_ENABLED = 'true'
    const { app } = makeApp()
    for (let i = 0; i < 10; i++) await request(app).post('/api/payments/checkout-extra-send').send({})
    expect((await request(app).post('/api/payments/checkout-extra-send').send({})).status).toBe(429)
  })
})

describe('GET /api/payments/status', () => {
  it('renvoie le prix LU DEPUIS STRIPE (jamais un montant en dur) et l’état de l’achat', async () => {
    const store = makePurchasesStore([{ status: 'paid', paid_at: '2026-07-25T10:00:00.000Z', included_sends: 5 }])
    const { app } = makeApp({ store })
    const res = await request(app).get('/api/payments/status')
    expect(res.status).toBe(200)
    // v2 : le forfait famille est abandonné, payments_enabled est constant à false.
    expect(res.body.payments_enabled).toBe(false)
    expect(res.body.price).toEqual({ amount_total: 14900, currency: 'eur' })
    expect(res.body.purchase).toEqual({ status: 'paid', paid_at: '2026-07-25T10:00:00.000Z', included_sends: 5 })
  })

  it('n’expose aucun identifiant Stripe au client', async () => {
    const store = makePurchasesStore([{ status: 'paid', stripe_session_id: 'cs_secret', stripe_payment_intent: 'pi_secret' }])
    const { app } = makeApp({ store })
    const res = await request(app).get('/api/payments/status')
    expect(JSON.stringify(res.body)).not.toContain('cs_secret')
    expect(JSON.stringify(res.body)).not.toContain('pi_secret')
  })

  it('Stripe injoignable : price null, la route reste 200 (l’UI dégrade, elle ne casse pas)', async () => {
    const { app } = makeApp({ getPrice: async () => null })
    const res = await request(app).get('/api/payments/status')
    expect(res.status).toBe(200)
    expect(res.body.price).toBeNull()
  })

  it('expose aussi le prix de l’envoi supplémentaire (chantier 2a) — jamais un montant en dur', async () => {
    const { app } = makeApp()
    const res = await request(app).get('/api/payments/status')
    expect(res.body.extra_price).toEqual({ amount_total: 990, currency: 'eur' })
  })

  it('tarif envoi supplémentaire non configuré : extra_price null (dégrade, ne casse pas)', async () => {
    const { app } = makeApp({ getExtraPrice: async () => null })
    const res = await request(app).get('/api/payments/status')
    expect(res.status).toBe(200)
    expect(res.body.extra_price).toBeNull()
  })

  it('payments_enabled toujours false (forfait abandonné)', async () => {
    const { app } = makeApp()
    const res = await request(app).get('/api/payments/status')
    expect(res.body.payments_enabled).toBe(false)
    expect(res.body.purchase).toBeNull()
  })

  it('erreur de lecture : 500 franc', async () => {
    const store = makePurchasesStore()
    store.failReads = true
    const { app } = makeApp({ store })
    expect((await request(app).get('/api/payments/status')).status).toBe(500)
  })

  // Vigilance I4 (revue Tasks 5+6) : `has_paid` doit venir de getPaidPurchase (filtré
  // kind='forfait'), JAMAIS du dernier achat — sinon un envoi supplémentaire à 1 € afficherait
  // « forfait payé, 1 envoi inclus » et lèverait le paywall côté UI alors que le gate serveur,
  // lui, resterait fermé.
  it('has_paid vient du FORFAIT payé, pas du dernier achat', async () => {
    const store = makePurchasesStore([{ status: 'paid', kind: 'forfait', included_sends: 5, paid_at: '2026-07-25T10:00:00.000Z' }])
    const { app } = makeApp({ store })
    const res = await request(app).get('/api/payments/status')
    expect(res.body.has_paid).toBe(true)
  })

  it('achat d’envoi supplémentaire seul : has_paid false, mais l’achat reste affichable (écran de confirmation)', async () => {
    const store = makePurchasesStore([{ status: 'paid', kind: 'envoi_sup', included_sends: 1, paid_at: '2026-09-13T10:00:00.000Z' }])
    const { app } = makeApp({ store })
    const res = await request(app).get('/api/payments/status')
    expect(res.body.has_paid).toBe(false)
    expect(res.body.purchase).toMatchObject({ status: 'paid', included_sends: 1 })
  })

  it('forfait remboursé : has_paid false', async () => {
    const store = makePurchasesStore([{ status: 'refunded', kind: 'forfait', paid_at: '2026-07-25T10:00:00.000Z' }])
    const { app } = makeApp({ store })
    expect((await request(app).get('/api/payments/status')).body.has_paid).toBe(false)
  })

  // Correctif M1 de la revue Task 9 : l'utilisateur a payé un envoi supplémentaire qu'il ne peut
  // pas consommer. La route est le premier endroit du flux qui peut le CONSTATER (le webhook, lui,
  // lit avec le client anon et ne voit aucune ligne sous RLS).
  it('anomalie : envoi supplémentaire encaissé sans forfait payé → capture Sentry', async () => {
    const store = makePurchasesStore([{ status: 'paid', kind: 'envoi_sup', included_sends: 1, paid_at: '2026-09-13T10:00:00.000Z' }])
    const { app } = makeApp({ store })
    const res = await request(app).get('/api/payments/status')
    expect(res.status).toBe(200)
    expect(Sentry.captureException).toHaveBeenCalled()
  })

  it('cas normal (forfait payé, puis envoi supplémentaire) : aucune capture', async () => {
    const store = makePurchasesStore([
      { status: 'paid', kind: 'forfait', included_sends: 5, paid_at: '2026-07-25T10:00:00.000Z' },
      { status: 'paid', kind: 'envoi_sup', included_sends: 1, paid_at: '2026-09-13T10:00:00.000Z' },
    ])
    const { app } = makeApp({ store })
    await request(app).get('/api/payments/status')
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })
})
