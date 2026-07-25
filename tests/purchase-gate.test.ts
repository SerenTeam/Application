import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
// @ts-expect-error — module JS serveur
import { createLettersRouter } from '../server/routes/letters.js'
// @ts-expect-error — module JS serveur
import { createRequirePurchase } from '../server/lib/require-purchase.js'
// @ts-expect-error — module JS serveur
import { LETTER_CHANNELS } from '../server/lib/letter-channels.js'
import { makePurchasesStore } from './helpers/purchases-fake'

// Gating du forfait (D1) monté sur la vraie route d'envoi : c'est le seul endroit du produit où
// « avoir payé » se vérifie aujourd'hui, et le middleware sera réutilisé tel quel par les
// chantiers 2 et 3.

function makeLettersStore() {
  const rows: Record<string, unknown>[] = []
  return {
    rows,
    async createSend(_c: unknown, fields: Record<string, unknown>) {
      const row = { id: `send-${rows.length + 1}`, ...fields }
      rows.push(row)
      return { send: row }
    },
    async markSendResult(_c: unknown, id: string, patch: Record<string, unknown>) {
      const row = rows.find((r) => r.id === id)!
      Object.assign(row, patch)
      return row
    },
    async listSends(_c: unknown) {
      return rows
    },
  }
}

function makeApp({ paymentsEnabled, purchases }: { paymentsEnabled: boolean; purchases: ReturnType<typeof makePurchasesStore> }) {
  const lettersStore = makeLettersStore()
  const requireAuth = (req: express.Request & { user?: unknown; supabaseClient?: unknown }, _res: express.Response, next: express.NextFunction) => {
    req.user = { id: 'user-1' }
    req.supabaseClient = {}
    next()
  }
  const app = express()
  app.use(express.json())
  app.use('/api/letters', createLettersRouter({
    requireAuth,
    requirePurchase: createRequirePurchase({ store: purchases, paymentsEnabled }),
    store: lettersStore,
    emailSender: { async send() { return { providerRef: 'prov-1', status: 'sent' } } },
    channels: LETTER_CHANNELS,
  }))
  return { app, lettersStore }
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
