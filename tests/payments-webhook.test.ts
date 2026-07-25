import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import crypto from 'crypto'
// @ts-expect-error — module JS serveur
import { createPaymentsRouter } from '../server/routes/payments.js'
import { makePurchasesStore } from './helpers/purchases-fake'

// ── Fixtures de signature ────────────────────────────────────────────────
// `constructEvent` est fourni par le SDK injecté, mais on reproduit ici le VRAI schéma Stripe
// (`t=<timestamp>,v1=<HMAC-SHA256(timestamp.payload)>`) plutôt qu'un booléen : c'est ce qui rend
// le test capable d'attraper une régression du montage `express.raw()`. Si le corps était
// reparsé en objet JS puis re-sérialisé, l'octet-à-octet changerait et le HMAC ne tomberait plus.
const TEST_SECRET = 'whsec_test_secret'

function sign(rawBody: string, secret = TEST_SECRET) {
  const t = 1_785_000_000
  const sig = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')
  return `t=${t},v1=${sig}`
}

function makeStripe() {
  return {
    checkout: { sessions: { async create() { return { id: 'cs_unused', url: 'https://unused' } } } },
    webhooks: {
      constructEvent(rawBody: Buffer | string, header: string | undefined, secret: string) {
        const raw = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody)
        if (!header || header !== sign(raw, secret)) {
          throw new Error('No signatures found matching the expected signature for payload')
        }
        return JSON.parse(raw)
      },
    },
  }
}

function makeApp(store = makePurchasesStore()) {
  const app = express()
  app.use('/api/payments', createPaymentsRouter({
    requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
    store,
    stripe: makeStripe(),
    publicClient: {},
    getPrice: async () => null,
    paymentsEnabled: true,
    priceId: 'price_test_123',
    includedSends: 5,
    appUrl: 'https://app.seren-app.fr',
  }))
  return { app, store }
}

function post(app: express.Express, payload: unknown, { signed = true } = {}) {
  const raw = JSON.stringify(payload)
  const req = request(app)
    .post('/api/payments/webhook')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', signed ? sign(raw) : 't=1,v1=deadbeef')
  return req.send(raw)
}

const completed = (over: Record<string, unknown> = {}) => ({
  id: 'evt_1',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_test_1',
      payment_status: 'paid',
      payment_intent: 'pi_test_1',
      amount_total: 14900,
      currency: 'eur',
      client_reference_id: 'user-1',
      metadata: { user_id: 'user-1', included_sends: '5' },
      ...over,
    },
  },
})

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = TEST_SECRET
  process.env.WEBHOOK_RPC_SECRET = 'rpc-secret-test'
})
afterEach(() => {
  delete process.env.STRIPE_WEBHOOK_SECRET
  delete process.env.WEBHOOK_RPC_SECRET
})

describe('POST /api/payments/webhook — signature', () => {
  it('signature invalide : 401, aucune écriture', async () => {
    const { app, store } = makeApp()
    const res = await post(app, completed(), { signed: false })
    expect(res.status).toBe(401)
    expect(store.rows).toHaveLength(0)
  })

  it('secret non configuré : 503', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET
    const { app } = makeApp()
    expect((await post(app, completed())).status).toBe(503)
  })

  it('événement non géré : 200 silencieux, aucune écriture', async () => {
    const { app, store } = makeApp()
    const res = await post(app, { id: 'evt_x', type: 'customer.created', data: { object: {} } })
    expect(res.status).toBe(200)
    expect(store.rows).toHaveLength(0)
  })
})

describe('POST /api/payments/webhook — encaissement', () => {
  it('checkout.session.completed payé : la ligne pending passe à paid', async () => {
    const store = makePurchasesStore([{ status: 'pending', stripe_session_id: 'cs_test_1', included_sends: 5 }])
    const { app } = makeApp(store)
    expect((await post(app, completed())).status).toBe(200)
    expect(store.rows).toHaveLength(1)
    expect(store.rows[0]).toMatchObject({
      status: 'paid', amount_total: 14900, currency: 'eur', stripe_payment_intent: 'pi_test_1',
    })
    expect(store.rows[0].paid_at).not.toBeNull()
  })

  it('REJEU du même événement : aucun second achat, aucun changement', async () => {
    const store = makePurchasesStore([{ status: 'pending', stripe_session_id: 'cs_test_1' }])
    const { app } = makeApp(store)
    await post(app, completed())
    const after = JSON.parse(JSON.stringify(store.rows))
    await post(app, completed())
    await post(app, completed())
    expect(store.rows).toHaveLength(1)
    expect(store.rows).toEqual(after)
  })

  it('webhook arrivé AVANT la ligne pending : l’achat est créé directement en paid', async () => {
    const { app, store } = makeApp()
    expect((await post(app, completed())).status).toBe(200)
    expect(store.rows).toHaveLength(1)
    expect(store.rows[0]).toMatchObject({ status: 'paid', user_id: 'user-1', included_sends: 5 })
  })

  it('completed non payé (moyen différé) : rien n’est encaissé', async () => {
    const { app, store } = makeApp()
    await post(app, completed({ payment_status: 'unpaid' }))
    expect(store.rows).toHaveLength(0)
  })

  it('async_payment_succeeded : encaissement confirmé plus tard', async () => {
    const store = makePurchasesStore([{ status: 'pending', stripe_session_id: 'cs_test_1' }])
    const { app } = makeApp(store)
    const evt = completed()
    await post(app, { ...evt, type: 'checkout.session.async_payment_succeeded' })
    expect(store.rows[0].status).toBe('paid')
  })

  it('sans user_id exploitable : ignoré proprement, 200', async () => {
    const { app, store } = makeApp()
    const res = await post(app, completed({ metadata: {}, client_reference_id: null }))
    expect(res.status).toBe(200)
    expect(store.rows).toHaveLength(0)
  })

  it('échec du store : 200 quand même (Stripe ne doit jamais boucler sur un 500)', async () => {
    // Secret RPC absent → le store lève, comme en production sans WEBHOOK_RPC_SECRET.
    delete process.env.WEBHOOK_RPC_SECRET
    const { app } = makeApp()
    expect((await post(app, completed())).status).toBe(200)
  })
})

describe('POST /api/payments/webhook — expiration et remboursement', () => {
  it('checkout.session.expired : la ligne pending passe à expired', async () => {
    const store = makePurchasesStore([{ status: 'pending', stripe_session_id: 'cs_test_1' }])
    const { app } = makeApp(store)
    await post(app, { id: 'evt_2', type: 'checkout.session.expired', data: { object: { id: 'cs_test_1' } } })
    expect(store.rows[0].status).toBe('expired')
  })

  it('charge.refunded : l’achat passe à refunded (l’accès se referme seul — D4)', async () => {
    const store = makePurchasesStore([{ status: 'paid', stripe_payment_intent: 'pi_test_1' }])
    const { app } = makeApp(store)
    await post(app, { id: 'evt_3', type: 'charge.refunded', data: { object: { payment_intent: 'pi_test_1' } } })
    expect(store.rows[0].status).toBe('refunded')
    expect(store.rows[0].refunded_at).not.toBeNull()
  })

  it('completed relivré APRÈS un remboursement : ne ressuscite jamais l’accès', async () => {
    const store = makePurchasesStore([{ status: 'paid', stripe_session_id: 'cs_test_1', stripe_payment_intent: 'pi_test_1' }])
    const { app } = makeApp(store)
    await post(app, { id: 'evt_3', type: 'charge.refunded', data: { object: { payment_intent: 'pi_test_1' } } })
    await post(app, completed())
    expect(store.rows[0].status).toBe('refunded')
  })

  it('rejeu de charge.refunded : refunded_at inchangé', async () => {
    const store = makePurchasesStore([{ status: 'paid', stripe_payment_intent: 'pi_test_1' }])
    const { app } = makeApp(store)
    const refund = { id: 'evt_3', type: 'charge.refunded', data: { object: { payment_intent: 'pi_test_1' } } }
    await post(app, refund)
    const first = store.rows[0].refunded_at
    await post(app, refund)
    expect(store.rows[0].refunded_at).toBe(first)
  })
})
