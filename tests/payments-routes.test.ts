import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
// @ts-expect-error — module JS serveur
import { createPaymentsRouter } from '../server/routes/payments.js'
import { makePurchasesStore } from './helpers/purchases-fake'

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
  paymentsEnabled?: boolean
  store?: ReturnType<typeof makePurchasesStore>
  stripe?: ReturnType<typeof makeStripe> | null
  priceId?: string | undefined
  getPrice?: () => Promise<{ amount_total: number; currency: string } | null>
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
    store,
    stripe,
    publicClient: {},
    getPrice: opts.getPrice ?? (async () => ({ amount_total: 14900, currency: 'eur' })),
    paymentsEnabled: opts.paymentsEnabled ?? true,
    priceId: 'priceId' in opts ? opts.priceId : 'price_test_123',
    includedSends: 5,
    appUrl: 'https://app.seren-app.fr',
  }))
  return { app, store, stripe }
}

beforeEach(() => {
  process.env.WEBHOOK_RPC_SECRET = 'rpc-secret-test'
})
afterEach(() => {
  delete process.env.WEBHOOK_RPC_SECRET
})

describe('POST /api/payments/checkout', () => {
  it('vente fermée (PAYMENTS_ENABLED absent) : 503 et AUCUNE session Stripe créée', async () => {
    const { app, stripe, store } = makeApp({ paymentsEnabled: false })
    const res = await request(app).post('/api/payments/checkout').send({})
    expect(res.status).toBe(503)
    expect(stripe!.created).toHaveLength(0)
    expect(store.rows).toHaveLength(0)
  })

  it('flag ouvert mais SDK non configuré (pas de clé Stripe) : 503, pas de demi-état', async () => {
    const { app } = makeApp({ stripe: null })
    expect((await request(app).post('/api/payments/checkout').send({})).status).toBe(503)
  })

  it('flag ouvert mais tarif non configuré : 503', async () => {
    const { app } = makeApp({ priceId: undefined })
    expect((await request(app).post('/api/payments/checkout').send({})).status).toBe(503)
  })

  it('vente ouverte : session one-shot créée, ligne pending écrite, URL renvoyée', async () => {
    const { app, stripe, store } = makeApp()
    const res = await request(app).post('/api/payments/checkout').send({})

    expect(res.status).toBe(200)
    expect(res.body.url).toContain('checkout.stripe.com')

    const params = stripe!.created[0] as Record<string, any>
    expect(params.mode).toBe('payment')
    expect(params.line_items).toEqual([{ price: 'price_test_123', quantity: 1 }])
    expect(params.client_reference_id).toBe('user-1')
    // user_id ET included_sends dans les metadata : le webhook n'a alors rien à deviner, et le
    // quota est figé à l'instant de l'achat même si l'offre change avant l'encaissement.
    expect(params.metadata).toEqual({ user_id: 'user-1', included_sends: '5' })
    expect(params.success_url).toBe('https://app.seren-app.fr/dashboard?checkout=success')

    expect(store.rows).toHaveLength(1)
    expect(store.rows[0]).toMatchObject({ status: 'pending', user_id: 'user-1', included_sends: 5 })
  })

  it('achat déjà encaissé : no-op, aucune seconde session (on ne fait pas repayer)', async () => {
    const store = makePurchasesStore([{ status: 'paid', paid_at: '2026-07-25T10:00:00.000Z' }])
    const { app, stripe } = makeApp({ store })
    const res = await request(app).post('/api/payments/checkout').send({})
    expect(res.status).toBe(200)
    expect(res.body.already_purchased).toBe(true)
    expect(stripe!.created).toHaveLength(0)
  })

  it('échec Stripe : 502, aucune ligne pending orpheline', async () => {
    const { app, store } = makeApp({ stripe: makeStripe('fail') })
    expect((await request(app).post('/api/payments/checkout').send({})).status).toBe(502)
    expect(store.rows).toHaveLength(0)
  })

  it('le limiteur coupe au 11e appel de l’heure', async () => {
    const { app } = makeApp()
    for (let i = 0; i < 10; i++) {
      expect((await request(app).post('/api/payments/checkout').send({})).status).toBe(200)
    }
    expect((await request(app).post('/api/payments/checkout').send({})).status).toBe(429)
  })
})

describe('GET /api/payments/status', () => {
  it('renvoie le prix LU DEPUIS STRIPE (jamais un montant en dur) et l’état de l’achat', async () => {
    const store = makePurchasesStore([{ status: 'paid', paid_at: '2026-07-25T10:00:00.000Z', included_sends: 5 }])
    const { app } = makeApp({ store })
    const res = await request(app).get('/api/payments/status')
    expect(res.status).toBe(200)
    expect(res.body.payments_enabled).toBe(true)
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

  it('vente fermée : payments_enabled false, aucun achat', async () => {
    const { app } = makeApp({ paymentsEnabled: false })
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
})
