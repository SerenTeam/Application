import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import crypto from 'crypto'
// @ts-expect-error — module JS serveur
import { createLettersRouter } from '../server/routes/letters.js'
// @ts-expect-error — module JS serveur
import { LETTER_CHANNELS } from '../server/lib/letter-channels.js'

// ── Fixtures signature Svix ─────────────────────────────────────────────
// Même algorithme que server/lib/svix-verify.js, recalculé indépendamment ici : secret
// `whsec_<base64>`, contenu signé "{svix-id}.{svix-timestamp}.{corps brut}" (HMAC-SHA256,
// base64), en-tête svix-signature au format "v1,<sig>".
const SECRET_KEY = crypto.randomBytes(32)
const TEST_SECRET = `whsec_${SECRET_KEY.toString('base64')}`

// Secret partagé RPC (env WEBHOOK_RPC_SECRET côté serveur ↔ ligne webhook_config côté base).
// DB_RPC_SECRET simule la valeur stockée en base ; le fake store compare les deux comme la
// clause `exists (select 1 from webhook_config ...)` de la vraie RPC.
const DB_RPC_SECRET = 'rpc-secret-test'

function sign({ svixId, svixTimestamp, rawBody, key = SECRET_KEY }: { svixId: string; svixTimestamp: string; rawBody: string; key?: Buffer }) {
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`
  return `v1,${crypto.createHmac('sha256', key).update(signedContent).digest('base64')}`
}

function nowTimestamp() {
  return String(Math.floor(Date.now() / 1000))
}

// ── Fake store ───────────────────────────────────────────────────────────
// Miroir FIDÈLE de la chaîne réelle updateSendByProviderRef (server/lib/letters-store.js,
// testé unitairement dans tests/letters-store.test.ts) + RPC SQL update_letter_send_status
// (migration 20260716120000_letter_sends.sql) :
//   1. env WEBHOOK_RPC_SECRET absent → throw AVANT tout appel (comportement du vrai store) ;
//   2. secret ≠ valeur en base → 0 ligne modifiée, silencieux (clause exists de la RPC) ;
//   3. provider_ref inconnu → 0 ligne, silencieux ;
//   4. transitions avant-only : sent ← sending seul ; delivered/failed ← sending|sent
//      (delivered et failed sont TERMINAUX — un webhook relivré en retard ne rétrograde rien) ;
//   5. error purgée sur sent/delivered, sinon coalesce(p_error, error).
type Row = { provider_ref: string; status: string; delivered_at: string | null; error: string | null }
type Call = { providerRef: string; patch: Record<string, unknown>; secret: string }

function makeStore(initialRows: Row[] = []) {
  const rows = initialRows.map((r) => ({ ...r }))
  const calls: Call[] = []
  return {
    rows,
    calls,
    async updateSendByProviderRef(_client: unknown, providerRef: string, patch: { status: string; delivered_at?: string | null; error?: string | null }) {
      const rpcSecret = process.env.WEBHOOK_RPC_SECRET
      if (!rpcSecret) throw new Error('WEBHOOK_RPC_SECRET manquant')
      calls.push({ providerRef, patch, secret: rpcSecret })
      if (rpcSecret !== DB_RPC_SECRET) return
      const row = rows.find((r) => r.provider_ref === providerRef)
      if (!row) return
      const { status } = patch
      const allowed =
        (status === 'sent' && row.status === 'sending') ||
        (status === 'delivered' && ['sending', 'sent'].includes(row.status)) ||
        (status === 'failed' && ['sending', 'sent'].includes(row.status))
      if (!allowed) return
      row.status = status
      row.delivered_at = patch.delivered_at ?? row.delivered_at
      row.error = status === 'sent' || status === 'delivered' ? null : (patch.error ?? row.error)
    },
  }
}

function makeApp(opts: { store?: ReturnType<typeof makeStore> } = {}) {
  const store = opts.store ?? makeStore()
  const publicClient = { marker: 'bare-client' }
  const requireAuth = (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()
  const app = express()
  app.use(
    '/api/letters',
    createLettersRouter({
      requireAuth,
      store,
      emailSender: {}, // non utilisé par /webhook
      channels: LETTER_CHANNELS,
      publicClient,
    })
  )
  return { app, store, publicClient }
}

function postWebhook(app: express.Express, { svixId, svixTimestamp, svixSignature, rawBody }: { svixId?: string; svixTimestamp?: string; svixSignature?: string; rawBody: string }) {
  let req = request(app).post('/api/letters/webhook').set('Content-Type', 'application/json')
  if (svixId !== undefined) req = req.set('svix-id', svixId)
  if (svixTimestamp !== undefined) req = req.set('svix-timestamp', svixTimestamp)
  if (svixSignature !== undefined) req = req.set('svix-signature', svixSignature)
  return req.send(rawBody)
}

// Requête signée valide prête à poster — mutualise le boilerplate id/timestamp/signature.
function signedEvent(type: string, data: Record<string, unknown>, svixId = `msg_${crypto.randomUUID()}`) {
  const svixTimestamp = nowTimestamp()
  const rawBody = JSON.stringify({ type, data })
  return { svixId, svixTimestamp, svixSignature: sign({ svixId, svixTimestamp, rawBody }), rawBody }
}

beforeEach(() => {
  vi.stubEnv('RESEND_WEBHOOK_SECRET', TEST_SECRET)
  vi.stubEnv('WEBHOOK_RPC_SECRET', DB_RPC_SECRET)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('POST /api/letters/webhook', () => {
  it('signature valide, email.delivered → status delivered + delivered_at, RPC appelée avec les bons arguments (secret inclus)', async () => {
    const store = makeStore([{ provider_ref: 'resend-abc', status: 'sent', delivered_at: null, error: null }])
    const { app } = makeApp({ store })

    const res = await postWebhook(app, signedEvent('email.delivered', { email_id: 'resend-abc' }))

    expect(res.status).toBe(200)
    expect(store.calls).toHaveLength(1)
    expect(store.calls[0].providerRef).toBe('resend-abc')
    expect(store.calls[0].secret).toBe(DB_RPC_SECRET)
    expect(store.calls[0].patch).toMatchObject({ status: 'delivered', error: null })
    expect(typeof store.calls[0].patch.delivered_at).toBe('string')
    expect(store.rows[0].status).toBe('delivered')
    expect(store.rows[0].delivered_at).toBeTruthy()
  })

  it('email.bounced → status failed + error tiré du payload', async () => {
    const store = makeStore([{ provider_ref: 'resend-xyz', status: 'sent', delivered_at: null, error: null }])
    const { app } = makeApp({ store })

    const res = await postWebhook(app, signedEvent('email.bounced', { email_id: 'resend-xyz', reason: 'Boîte inexistante' }))

    expect(res.status).toBe(200)
    expect(store.calls[0].patch).toMatchObject({ status: 'failed', error: 'Boîte inexistante' })
    expect(store.rows[0].status).toBe('failed')
    expect(store.rows[0].error).toBe('Boîte inexistante')
  })

  it('email.bounced sans détail → error de repli non vide', async () => {
    const store = makeStore([{ provider_ref: 'resend-xyz2', status: 'sent', delivered_at: null, error: null }])
    const { app } = makeApp({ store })

    const res = await postWebhook(app, signedEvent('email.bounced', { email_id: 'resend-xyz2' }))

    expect(res.status).toBe(200)
    expect(store.rows[0].status).toBe('failed')
    expect(store.rows[0].error).toBeTruthy()
  })

  it('signature invalide (altérée) → 401, aucun update', async () => {
    const store = makeStore([{ provider_ref: 'resend-abc', status: 'sent', delivered_at: null, error: null }])
    const { app } = makeApp({ store })
    const event = signedEvent('email.delivered', { email_id: 'resend-abc' })
    // Altère un caractère de la signature (reste un base64 valide, longueur inchangée)
    const tampered = event.svixSignature.slice(0, -1) + (event.svixSignature.endsWith('A') ? 'B' : 'A')

    const res = await postWebhook(app, { ...event, svixSignature: tampered })

    expect(res.status).toBe(401)
    expect(store.calls).toHaveLength(0)
    expect(store.rows[0].status).toBe('sent')
  })

  it('en-tête svix-signature absent → 401, aucun update', async () => {
    const store = makeStore([{ provider_ref: 'resend-abc', status: 'sent', delivered_at: null, error: null }])
    const { app } = makeApp({ store })
    const rawBody = JSON.stringify({ type: 'email.delivered', data: { email_id: 'resend-abc' } })

    const res = await postWebhook(app, { svixId: 'msg_no_sig', svixTimestamp: nowTimestamp(), rawBody })

    expect(res.status).toBe(401)
    expect(store.calls).toHaveLength(0)
  })

  it('signée avec un AUTRE secret → 401, aucun update', async () => {
    const store = makeStore([{ provider_ref: 'resend-abc', status: 'sent', delivered_at: null, error: null }])
    const { app } = makeApp({ store })
    const svixId = 'msg_wrong_key'
    const svixTimestamp = nowTimestamp()
    const rawBody = JSON.stringify({ type: 'email.delivered', data: { email_id: 'resend-abc' } })
    const svixSignature = sign({ svixId, svixTimestamp, rawBody, key: crypto.randomBytes(32) })

    const res = await postWebhook(app, { svixId, svixTimestamp, svixSignature, rawBody })

    expect(res.status).toBe(401)
    expect(store.calls).toHaveLength(0)
  })

  it('provider_ref inconnu → 200 silencieux, aucune ligne modifiée', async () => {
    const store = makeStore([{ provider_ref: 'resend-connu', status: 'sent', delivered_at: null, error: null }])
    const { app } = makeApp({ store })

    const res = await postWebhook(app, signedEvent('email.delivered', { email_id: 'resend-inconnu' }))

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    // La RPC est appelée (le serveur ne sait pas à l'avance si la ref existe) mais ne modifie
    // rien — même sémantique que le WHERE provider_ref = … côté SQL, 0 ligne affectée.
    expect(store.rows[0].status).toBe('sent')
  })

  it('type d’événement inconnu (email.opened) → 200 silencieux, RPC jamais appelée', async () => {
    const store = makeStore([{ provider_ref: 'resend-abc', status: 'sent', delivered_at: null, error: null }])
    const { app } = makeApp({ store })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const res = await postWebhook(app, signedEvent('email.opened', { email_id: 'resend-abc' }))

    expect(res.status).toBe(200)
    expect(store.calls).toHaveLength(0)
    expect(store.rows[0].status).toBe('sent')
    // Le log ne doit JAMAIS contenir le corps du payload (email_id, adresses…) — seulement
    // le type d'événement.
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const loggedArgs = warnSpy.mock.calls[0].join(' ')
    expect(loggedArgs).not.toContain('resend-abc')
    expect(loggedArgs).toContain('email.opened')
  })

  it('timestamp obsolète (> 5 min) → 401, aucun update', async () => {
    const store = makeStore([{ provider_ref: 'resend-abc', status: 'sent', delivered_at: null, error: null }])
    const { app } = makeApp({ store })
    const svixId = 'msg_stale'
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 6 * 60) // 6 min dans le passé
    const rawBody = JSON.stringify({ type: 'email.delivered', data: { email_id: 'resend-abc' } })
    const svixSignature = sign({ svixId, svixTimestamp: staleTimestamp, rawBody })

    const res = await postWebhook(app, { svixId, svixTimestamp: staleTimestamp, svixSignature, rawBody })

    expect(res.status).toBe(401)
    expect(store.calls).toHaveLength(0)
    expect(store.rows[0].status).toBe('sent')
  })

  it('timestamp futur (> 5 min) → 401 également (fenêtre symétrique)', async () => {
    const store = makeStore([{ provider_ref: 'resend-abc', status: 'sent', delivered_at: null, error: null }])
    const { app } = makeApp({ store })
    const svixId = 'msg_future'
    const futureTimestamp = String(Math.floor(Date.now() / 1000) + 6 * 60)
    const rawBody = JSON.stringify({ type: 'email.delivered', data: { email_id: 'resend-abc' } })
    const svixSignature = sign({ svixId, svixTimestamp: futureTimestamp, rawBody })

    const res = await postWebhook(app, { svixId, svixTimestamp: futureTimestamp, svixSignature, rawBody })

    expect(res.status).toBe(401)
    expect(store.calls).toHaveLength(0)
  })

  it('secret RESEND_WEBHOOK_SECRET absent → 503, aucun update (même avec une signature par ailleurs valide)', async () => {
    const store = makeStore([{ provider_ref: 'resend-abc', status: 'sent', delivered_at: null, error: null }])
    const { app } = makeApp({ store })
    const event = signedEvent('email.delivered', { email_id: 'resend-abc' })
    vi.stubEnv('RESEND_WEBHOOK_SECRET', '')

    const res = await postWebhook(app, event)

    expect(res.status).toBe(503)
    expect(store.calls).toHaveLength(0)
  })
})

// Les webhooks Resend peuvent être relivrés en retard et dans le désordre : les transitions
// de statut sont AVANT-ONLY (delivered et failed terminaux) — vérifiées par la RPC SQL,
// dont le fake store reproduit fidèlement la sémantique (voir makeStore).
describe('POST /api/letters/webhook — relivraisons dans le désordre', () => {
  it('email.sent relivré APRÈS un delivered → le statut reste delivered (jamais de rétrogradation)', async () => {
    const store = makeStore([{ provider_ref: 'resend-abc', status: 'sending', delivered_at: null, error: null }])
    const { app } = makeApp({ store })

    const delivered = await postWebhook(app, signedEvent('email.delivered', { email_id: 'resend-abc' }))
    expect(delivered.status).toBe(200)
    expect(store.rows[0].status).toBe('delivered')
    const deliveredAt = store.rows[0].delivered_at

    const lateSent = await postWebhook(app, signedEvent('email.sent', { email_id: 'resend-abc' }))
    expect(lateSent.status).toBe(200) // acquitté quand même (jamais d'erreur sur webhook signé)
    expect(store.rows[0].status).toBe('delivered')
    expect(store.rows[0].delivered_at).toBe(deliveredAt)
  })

  it('email.delivered relivré APRÈS un bounced → failed est terminal, statut et error conservés', async () => {
    const store = makeStore([{ provider_ref: 'resend-abc', status: 'sent', delivered_at: null, error: null }])
    const { app } = makeApp({ store })

    await postWebhook(app, signedEvent('email.bounced', { email_id: 'resend-abc', reason: 'Boîte inexistante' }))
    expect(store.rows[0].status).toBe('failed')

    const lateDelivered = await postWebhook(app, signedEvent('email.delivered', { email_id: 'resend-abc' }))
    expect(lateDelivered.status).toBe(200)
    expect(store.rows[0].status).toBe('failed')
    expect(store.rows[0].error).toBe('Boîte inexistante')
  })

  it('erreur d’un échec passé purgée quand delivered arrive (ligne repassée en sent après retry)', async () => {
    // Un envoi a échoué (error persistée), le retry a réussi (status sent) mais une erreur
    // traîne encore sur la ligne : le delivered doit la purger (CASE WHEN de la RPC).
    const store = makeStore([{ provider_ref: 'resend-abc', status: 'sent', delivered_at: null, error: 'échec tentative précédente' }])
    const { app } = makeApp({ store })

    const res = await postWebhook(app, signedEvent('email.delivered', { email_id: 'resend-abc' }))

    expect(res.status).toBe(200)
    expect(store.rows[0].status).toBe('delivered')
    expect(store.rows[0].error).toBeNull()
  })
})

describe('POST /api/letters/webhook — robustesse (jamais de 500 sur webhook signé valide)', () => {
  it('JSON malformé avec signature VALIDE → 200 sans throw, RPC jamais appelée, log sans le corps', async () => {
    const store = makeStore([{ provider_ref: 'resend-abc', status: 'sent', delivered_at: null, error: null }])
    const { app } = makeApp({ store })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const svixId = 'msg_badjson'
    const svixTimestamp = nowTimestamp()
    const rawBody = '{"type": "email.delivered", "data": {' // tronqué → JSON invalide
    const svixSignature = sign({ svixId, svixTimestamp, rawBody })

    const res = await postWebhook(app, { svixId, svixTimestamp, svixSignature, rawBody })

    expect(res.status).toBe(200)
    expect(store.calls).toHaveLength(0)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0].join(' ')).not.toContain('email.delivered')
  })

  it('store qui lève APRÈS signature valide (ex. BDD indisponible) → 200 + console.error', async () => {
    const store = makeStore([{ provider_ref: 'resend-abc', status: 'sent', delivered_at: null, error: null }])
    store.updateSendByProviderRef = async () => {
      throw new Error('connexion BDD perdue')
    }
    const { app } = makeApp({ store })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await postWebhook(app, signedEvent('email.delivered', { email_id: 'resend-abc' }))

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('WEBHOOK_RPC_SECRET absent côté serveur → le store lève avant l’appel RPC, la route répond quand même 200 + log', async () => {
    // Miroir du vrai store : env manquante → throw AVANT tout appel réseau (voir
    // tests/letters-store.test.ts pour le test unitaire du vrai comportement).
    const store = makeStore([{ provider_ref: 'resend-abc', status: 'sent', delivered_at: null, error: null }])
    const { app } = makeApp({ store })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const event = signedEvent('email.delivered', { email_id: 'resend-abc' })
    vi.stubEnv('WEBHOOK_RPC_SECRET', '')

    const res = await postWebhook(app, event)

    expect(res.status).toBe(200)
    expect(store.calls).toHaveLength(0)
    expect(store.rows[0].status).toBe('sent')
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('WEBHOOK_RPC_SECRET différent de la valeur en base → RPC appelée mais 0 ligne modifiée, 200 silencieux', async () => {
    // Sémantique de la clause `exists (select 1 from webhook_config ...)` : secret faux →
    // l'UPDATE ne matche aucune ligne, sans erreur (un attaquant appelant la RPC en direct
    // via PostgREST n'obtient ni effet ni signal).
    const store = makeStore([{ provider_ref: 'resend-abc', status: 'sent', delivered_at: null, error: null }])
    const { app } = makeApp({ store })
    vi.stubEnv('WEBHOOK_RPC_SECRET', 'mauvais-secret')

    const res = await postWebhook(app, signedEvent('email.delivered', { email_id: 'resend-abc' }))

    expect(res.status).toBe(200)
    expect(store.calls).toHaveLength(1) // l'appel part (le serveur ne peut pas savoir)…
    expect(store.rows[0].status).toBe('sent') // …mais la base ne modifie rien
  })
})
