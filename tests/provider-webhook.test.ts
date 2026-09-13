import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
// @ts-expect-error — module JS serveur
import { createProviderWebhookRouter } from '../server/routes/provider-webhook.js'

// Webhook MySendingBox (chantier 2a, Task 10) : ping NON FIABLE (pas de signature documentée,
// spec §6) — sécurisé par un secret dans l'URL, comparé en temps constant. Contrat :
// docs/plan-chantier-2a-envoi-papier.md Task 10 + docs/design-chantier-2a-envoi-papier.md §6.
// Toute écriture de statut passe PAR UN GET provider (jamais depuis le payload seul) : le fold
// (server/lib/msb-status.js, testé indépendamment dans tests/msb-status.test.ts) est réutilisé
// tel quel ici.

const URL_SECRET = 'url-secret-test-abcdef'
const DB_RPC_SECRET = 'rpc-secret-test'

// ── Fake store — miroir des contrats réels de server/lib/letters-store.js ─────────────────────
// (recordProviderEvent/markProviderEventProcessed/updateSendByProviderRef, testés unitairement
// dans tests/letters-store.test.ts). `client` n'est jamais inspecté ici (les vrais contrats le
// passthrough vers Supabase) — seuls les PARAMÈTRES métier sont enregistrés.
type RecordCall = { id: string; sendId?: string | null; eventType?: string | null; payload?: unknown }

function makeStore({ knownEventIds = new Set<string>() } = {}) {
  const calls: { record: RecordCall[]; processed: unknown[]; update: unknown[] } = {
    record: [],
    processed: [],
    update: [],
  }
  return {
    calls,
    async recordProviderEvent(_client: unknown, params: RecordCall) {
      calls.record.push(params)
      if (knownEventIds.has(params.id)) return false // rejeu déjà connu
      knownEventIds.add(params.id)
      return true
    },
    async markProviderEventProcessed(_client: unknown, id: string) {
      calls.processed.push(id)
      return true
    },
    async updateSendByProviderRef(_client: unknown, providerRef: string, patch: Record<string, unknown>) {
      calls.update.push({ providerRef, patch })
    },
  }
}

// ── Fake paperSender — seul `getLetter` est utilisé par ce router ────────────────────────────
function makePaperSender(byRef: Record<string, { events: Array<Record<string, unknown>> }>) {
  const calls: string[] = []
  return {
    calls,
    async getLetter(providerRef: string) {
      calls.push(providerRef)
      const letter = byRef[providerRef]
      if (!letter) throw new Error(`lettre inconnue du fake : ${providerRef}`)
      return { _id: providerRef, ...letter }
    },
  }
}

function makeApp(opts: { store?: ReturnType<typeof makeStore>; paperSender?: ReturnType<typeof makePaperSender> | null } = {}) {
  const store = opts.store ?? makeStore()
  const paperSender = opts.paperSender === undefined ? makePaperSender({}) : opts.paperSender
  const publicClient = { marker: 'bare-client' }
  const app = express()
  app.use('/api/letters/provider-webhook', createProviderWebhookRouter({ store, paperSender, publicClient }))
  return { app, store, paperSender, publicClient }
}

function postWebhook(app: express.Express, secret: string, body: string) {
  return request(app)
    .post(`/api/letters/provider-webhook/${secret}`)
    .set('Content-Type', 'application/json')
    .send(body)
}

// Attend que les micro-tâches en attente (le traitement post-ack, jamais awaité par la route)
// se soient déroulées, sans dépendre d'un délai arbitraire.
function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve))
}

function eventPayload({
  eventId = `evt_${Math.random().toString(36).slice(2)}`,
  eventName = 'letter.sent',
  letterId = 'msb-letter-1',
  sendId,
  events = [{ _id: 'e1', type: 'letter.sent' }],
}: {
  eventId?: string
  eventName?: string
  letterId?: string
  sendId?: string
  events?: Array<Record<string, unknown>>
} = {}) {
  const letter: Record<string, unknown> = { _id: letterId, events }
  if (sendId) letter.metadata = { seren_send_id: sendId }
  return { eventId, body: JSON.stringify({ event: { _id: eventId, name: eventName }, letter }) }
}

beforeEach(() => {
  vi.stubEnv('MSB_WEBHOOK_URL_SECRET', URL_SECRET)
  vi.stubEnv('WEBHOOK_RPC_SECRET', DB_RPC_SECRET)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('POST /api/letters/provider-webhook/:secret — porte du secret d’URL', () => {
  it('secret faux → 404 muet, AUCUN appel store (ne confirme pas l’existence de la route)', async () => {
    const store = makeStore()
    const { app } = makeApp({ store })
    const { body } = eventPayload()

    const res = await postWebhook(app, 'un-mauvais-secret', body)

    expect(res.status).toBe(404)
    expect(store.calls.record).toHaveLength(0)
  })

  it('MSB_WEBHOOK_URL_SECRET absente côté serveur → 404 (feature inerte), même avec le bon secret présenté', async () => {
    vi.stubEnv('MSB_WEBHOOK_URL_SECRET', '')
    const store = makeStore()
    const { app } = makeApp({ store })
    const { body } = eventPayload()

    const res = await postWebhook(app, URL_SECRET, body)

    expect(res.status).toBe(404)
    expect(store.calls.record).toHaveLength(0)
  })

  it('secret correct mais de longueur différente → 404 (la comparaison passe par des hash, jamais un timingSafeEqual direct qui lèverait)', async () => {
    const store = makeStore()
    const { app } = makeApp({ store })
    const { body } = eventPayload()

    const res = await postWebhook(app, `${URL_SECRET}-en-plus-long`, body)

    expect(res.status).toBe(404)
    expect(store.calls.record).toHaveLength(0)
  })
})

describe('POST /api/letters/provider-webhook/:secret — corps', () => {
  it('JSON invalide → 400 et rien d’autre (aucun appel store)', async () => {
    const store = makeStore()
    const { app } = makeApp({ store })

    const res = await postWebhook(app, URL_SECRET, '{"event": invalide')

    expect(res.status).toBe(400)
    expect(store.calls.record).toHaveLength(0)
  })

  it('JSON valide mais sans event._id exploitable → 400 (persistance impossible sans clé d’idempotence)', async () => {
    const store = makeStore()
    const { app } = makeApp({ store })
    const body = JSON.stringify({ event: {}, letter: { _id: 'msb-letter-1' } })

    const res = await postWebhook(app, URL_SECRET, body)

    expect(res.status).toBe(400)
    expect(store.calls.record).toHaveLength(0)
  })
})

describe('POST /api/letters/provider-webhook/:secret — événement neuf : persist → ack → GET → transition', () => {
  it('persist AVANT ack, GET APRÈS ack (traitement post-ack réellement asynchrone)', async () => {
    const store = makeStore()
    let resolveGetLetter!: (v: { _id: string; events: Array<Record<string, unknown>> }) => void
    const gate = new Promise<{ _id: string; events: Array<Record<string, unknown>> }>((resolve) => {
      resolveGetLetter = resolve
    })
    const paperSender = {
      calls: [] as string[],
      async getLetter(providerRef: string) {
        this.calls.push(providerRef)
        return gate
      },
    }
    const { app } = makeApp({ store, paperSender })
    const { body } = eventPayload({ letterId: 'msb-letter-42' })

    const responsePromise = postWebhook(app, URL_SECRET, body)
    const res = await responsePromise

    // La réponse HTTP est déjà revenue : le GET (bloqué sur `gate`, jamais résolu à ce stade)
    // n'a pourtant pas empêché l'ACK — la preuve que le traitement post-ack n'est pas awaité par
    // la route.
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
    expect(store.calls.record).toHaveLength(1)
    expect(paperSender.calls).toEqual(['msb-letter-42']) // le GET a bien démarré, en tâche de fond
    expect(store.calls.update).toHaveLength(0) // …mais n'a pas encore abouti

    resolveGetLetter({ _id: 'msb-letter-42', events: [{ _id: 'e1', type: 'letter.sent' }] })
    await flushMicrotasks()
    await flushMicrotasks()

    expect(store.calls.update).toEqual([{ providerRef: 'msb-letter-42', patch: { status: 'sent' } }])
    expect(store.calls.processed).toEqual([store.calls.record[0].id])
  })

  it('GET fait avec letter._id (pas l’event._id), fold appliqué sur letter.events, transition écrite par provider_ref', async () => {
    const store = makeStore()
    const paperSender = makePaperSender({
      'msb-letter-77': { events: [{ _id: 'e1', type: 'letter.created' }, { _id: 'e2', type: 'letter.wrong_address' }] },
    })
    const { app } = makeApp({ store, paperSender })
    const { eventId, body } = eventPayload({ letterId: 'msb-letter-77', eventName: 'letter.wrong_address' })

    const res = await postWebhook(app, URL_SECRET, body)
    await flushMicrotasks()
    await flushMicrotasks()

    expect(res.status).toBe(200)
    expect(paperSender.calls).toEqual(['msb-letter-77'])
    expect(store.calls.update).toEqual([{ providerRef: 'msb-letter-77', patch: { status: 'failed_address' } }])
    expect(store.calls.processed).toEqual([eventId])
  })

  it('send_id transmis à recordProviderEvent depuis letter.metadata.seren_send_id (fallback de corrélation, jamais requis pour la transition)', async () => {
    const store = makeStore()
    const paperSender = makePaperSender({ 'msb-letter-9': { events: [] } })
    const { app } = makeApp({ store, paperSender })
    const { body } = eventPayload({ letterId: 'msb-letter-9', sendId: 'seren-send-abc' })

    await postWebhook(app, URL_SECRET, body)

    expect(store.calls.record[0]).toMatchObject({ sendId: 'seren-send-abc' })
  })

  it('metadata.seren_send_id absente → sendId null transmis (jamais undefined, jamais une exception)', async () => {
    const store = makeStore()
    const paperSender = makePaperSender({ 'msb-letter-10': { events: [] } })
    const { app } = makeApp({ store, paperSender })
    const { body } = eventPayload({ letterId: 'msb-letter-10' })

    await postWebhook(app, URL_SECRET, body)

    expect(store.calls.record[0]).toMatchObject({ sendId: null })
  })

  it('eventType transmis depuis event.name (métadonnée de traçabilité — n’influence jamais le fold, qui lit toujours letter.events[].type)', async () => {
    const store = makeStore()
    const paperSender = makePaperSender({ 'msb-letter-11': { events: [] } })
    const { app } = makeApp({ store, paperSender })
    const { body } = eventPayload({ letterId: 'msb-letter-11', eventName: 'letter.accepted' })

    await postWebhook(app, URL_SECRET, body)

    expect(store.calls.record[0]).toMatchObject({ eventType: 'letter.accepted' })
  })
})

describe('POST /api/letters/provider-webhook/:secret — doublon', () => {
  it('événement déjà connu → ack 200 sans retraitement : ni GET, ni transition, ni marquage', async () => {
    const knownEventIds = new Set(['evt-deja-vu'])
    const store = makeStore({ knownEventIds })
    const paperSender = makePaperSender({ 'msb-letter-1': { events: [{ _id: 'e1', type: 'letter.sent' }] } })
    const { app } = makeApp({ store, paperSender })
    const { body } = eventPayload({ eventId: 'evt-deja-vu', letterId: 'msb-letter-1' })

    const res = await postWebhook(app, URL_SECRET, body)
    await flushMicrotasks()

    expect(res.status).toBe(200)
    expect(store.calls.record).toHaveLength(1) // l'appel part (idempotence vérifiée EN BASE)…
    expect(paperSender.calls).toHaveLength(0) // …mais rien de plus ne se produit
    expect(store.calls.update).toHaveLength(0)
    expect(store.calls.processed).toHaveLength(0)
  })
})

describe('POST /api/letters/provider-webhook/:secret — échec du GET provider', () => {
  it('GET qui rejette → événement laissé NON-PROCESSED (la resync le rattrapera), aucune transition, ack déjà rendu', async () => {
    const store = makeStore()
    const paperSender = {
      calls: [] as string[],
      async getLetter(providerRef: string) {
        this.calls.push(providerRef)
        throw new Error('provider_unavailable')
      },
    }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { app } = makeApp({ store, paperSender })
    const { body } = eventPayload({ letterId: 'msb-letter-down' })

    const res = await postWebhook(app, URL_SECRET, body)
    await flushMicrotasks()
    await flushMicrotasks()

    expect(res.status).toBe(200) // ack déjà parti, indépendant du sort du GET
    expect(paperSender.calls).toEqual(['msb-letter-down'])
    expect(store.calls.update).toHaveLength(0)
    expect(store.calls.processed).toHaveLength(0) // pas marqué traité → la resync le reprendra
    expect(errorSpy).toHaveBeenCalled()
    // Jamais le payload (adresse, contenu…) dans un log technique.
    const logged = errorSpy.mock.calls.map((c) => c.join(' ')).join(' ')
    expect(logged).not.toContain('msb-letter-down')
  })

  it('paperSender absent (router construit sans adaptateur) → même verdict que l’échec du GET, jamais un throw', async () => {
    const store = makeStore()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { app } = makeApp({ store, paperSender: null })
    const { body } = eventPayload({ letterId: 'msb-letter-noadapter' })

    const res = await postWebhook(app, URL_SECRET, body)
    await flushMicrotasks()

    expect(res.status).toBe(200)
    expect(store.calls.update).toHaveLength(0)
    expect(store.calls.processed).toHaveLength(0)
  })

  it('letter absente du payload → traité comme un échec de corrélation, événement non-processed, jamais un 500', async () => {
    const store = makeStore()
    const paperSender = makePaperSender({})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { app } = makeApp({ store, paperSender })
    const body = JSON.stringify({ event: { _id: 'evt-sans-letter', name: 'letter.sent' } })

    const res = await postWebhook(app, URL_SECRET, body)
    await flushMicrotasks()

    expect(res.status).toBe(200)
    expect(paperSender.calls).toHaveLength(0)
    expect(store.calls.update).toHaveLength(0)
    expect(store.calls.processed).toHaveLength(0)
  })
})

describe('POST /api/letters/provider-webhook/:secret — robustesse de la persistance', () => {
  it('recordProviderEvent qui lève (BDD indisponible) → 500, PAS d’ack (le provider réessaiera)', async () => {
    const store = makeStore()
    store.recordProviderEvent = async () => {
      throw new Error('connexion BDD perdue')
    }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { app } = makeApp({ store })
    const { body } = eventPayload()

    const res = await postWebhook(app, URL_SECRET, body)

    expect(res.status).toBe(500)
    expect(errorSpy).toHaveBeenCalled()
  })
})
