import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

// Mock du SDK Sentry : `vi.mock` intercepte la résolution du module pour TOUT le graphe de ce
// fichier (y compris provider-webhook.js, qui importe '@sentry/node' en production) — plus
// fiable qu'un `vi.spyOn` direct sur un module tiers (bindings ESM parfois non redéfinissables),
// même patron que tests/letters-store.test.ts.
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))

// @ts-expect-error — module JS serveur
import { createProviderWebhookRouter } from '../server/routes/provider-webhook.js'
import * as Sentry from '@sentry/node'

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
//
// Sémantique FIDÈLE à la RPC `record_provider_event` post revue finale (I2, migration
// 20260914170000_resync_reader.sql) : un événement suivi ici par son état `processed` — renvoie
// `true` pour un événement NEUF **ou** un rejeu d'un événement PAS ENCORE traité (à retraiter),
// `false` seulement pour un rejeu d'un événement déjà marqué traité.
type RecordCall = { id: string; sendId?: string | null; eventType?: string | null; payload?: unknown }

function makeStore({
  seedEvents = [] as Array<{ id: string; processed: boolean }>,
  // C1 : uuid syntaxiquement valides mais introuvables en base (FK inconnue) — simule la 23503
  // que lèverait la vraie RPC sur l'INSERT.
  orphanSendIds = new Set<string>(),
} = {}) {
  const known = new Map<string, { processed: boolean }>(seedEvents.map((e) => [e.id, { processed: e.processed }]))
  const calls: { record: RecordCall[]; processed: string[]; update: unknown[] } = {
    record: [],
    processed: [],
    update: [],
  }
  return {
    calls,
    async recordProviderEvent(_client: unknown, params: RecordCall) {
      calls.record.push(params)
      if (params.sendId && orphanSendIds.has(params.sendId)) {
        // Même code Postgres que celui préservé par letters-store.js `translateRpcError`
        // (`.pgCode`) sur une violation de clé étrangère.
        throw Object.assign(
          new Error('insert or update on table "provider_events" violates foreign key constraint'),
          { pgCode: '23503' }
        )
      }
      const existing = known.get(params.id)
      if (!existing) {
        known.set(params.id, { processed: false })
        return true // événement réellement nouveau
      }
      return !existing.processed // I2 : rejeu — à retraiter seulement si pas encore traité
    },
    async markProviderEventProcessed(_client: unknown, id: string) {
      calls.processed.push(id)
      const existing = known.get(id)
      if (existing) existing.processed = true
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
  vi.mocked(Sentry.captureException).mockClear()
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

  it('send_id transmis à recordProviderEvent depuis letter.metadata.seren_send_id, SI ET SEULEMENT SI c’est un uuid valide (C1, revue finale)', async () => {
    const store = makeStore()
    const paperSender = makePaperSender({ 'msb-letter-9': { events: [] } })
    const { app } = makeApp({ store, paperSender })
    const validUuid = 'a1b2c3d4-e5f6-47a8-b9c0-d1e2f3a4b5c6'
    const { body } = eventPayload({ letterId: 'msb-letter-9', sendId: validUuid })

    await postWebhook(app, URL_SECRET, body)

    expect(store.calls.record[0]).toMatchObject({ sendId: validUuid })
  })

  it('metadata.seren_send_id absente → sendId null transmis (jamais undefined, jamais une exception)', async () => {
    const store = makeStore()
    const paperSender = makePaperSender({ 'msb-letter-10': { events: [] } })
    const { app } = makeApp({ store, paperSender })
    const { body } = eventPayload({ letterId: 'msb-letter-10' })

    await postWebhook(app, URL_SECRET, body)

    expect(store.calls.record[0]).toMatchObject({ sendId: null })
  })

  it('metadata.seren_send_id présente mais NON-UUID (C1, revue finale) → sendId null transmis, ack 200, aucun risque de 22P02', async () => {
    const store = makeStore()
    const paperSender = makePaperSender({ 'msb-letter-badid': { events: [] } })
    const { app } = makeApp({ store, paperSender })
    const { body } = eventPayload({ letterId: 'msb-letter-badid', sendId: 'seren-send-abc' })

    const res = await postWebhook(app, URL_SECRET, body)

    expect(res.status).toBe(200)
    expect(store.calls.record[0]).toMatchObject({ sendId: null })
  })

  it('metadata.seren_send_id est un uuid valide mais INCONNU en base (C1, revue finale) → retenté sans corrélation, persisté avec send_id null, ack 200', async () => {
    const unknownUuid = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
    const store = makeStore({ orphanSendIds: new Set([unknownUuid]) })
    const paperSender = makePaperSender({ 'msb-letter-orphanid': { events: [] } })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { app } = makeApp({ store, paperSender })
    const { body } = eventPayload({ letterId: 'msb-letter-orphanid', sendId: unknownUuid })

    const res = await postWebhook(app, URL_SECRET, body)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
    // Deux tentatives : la première avec le send_id (rejetée par la FK simulée), la seconde sans.
    expect(store.calls.record).toEqual([
      expect.objectContaining({ sendId: unknownUuid }),
      expect.objectContaining({ sendId: null }),
    ])
    // Et le traitement post-ack a bien lieu malgré tout (la persistance a fini par réussir).
    await flushMicrotasks()
    expect(paperSender.calls).toEqual(['msb-letter-orphanid'])
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
  it('événement déjà TRAITÉ (processed_at non nul) → ack 200 sans retraitement : ni GET, ni transition, ni marquage', async () => {
    const store = makeStore({ seedEvents: [{ id: 'evt-deja-traite', processed: true }] })
    const paperSender = makePaperSender({ 'msb-letter-1': { events: [{ _id: 'e1', type: 'letter.sent' }] } })
    const { app } = makeApp({ store, paperSender })
    const { body } = eventPayload({ eventId: 'evt-deja-traite', letterId: 'msb-letter-1' })

    const res = await postWebhook(app, URL_SECRET, body)
    await flushMicrotasks()

    expect(res.status).toBe(200)
    expect(store.calls.record).toHaveLength(1) // l'appel part (idempotence vérifiée EN BASE)…
    expect(paperSender.calls).toHaveLength(0) // …mais rien de plus ne se produit
    expect(store.calls.update).toHaveLength(0)
    expect(store.calls.processed).toHaveLength(0)
  })

  it('doublon d’un événement NON traité (processed_at null, ex. GET précédent en échec) → retraitement (I2, revue finale) : le GET est rappelé', async () => {
    const store = makeStore({ seedEvents: [{ id: 'evt-pas-encore-traite', processed: false }] })
    const paperSender = makePaperSender({ 'msb-letter-retry': { events: [{ _id: 'e1', type: 'letter.sent' }] } })
    const { app } = makeApp({ store, paperSender })
    const { body } = eventPayload({ eventId: 'evt-pas-encore-traite', letterId: 'msb-letter-retry' })

    const res = await postWebhook(app, URL_SECRET, body)
    await flushMicrotasks()
    await flushMicrotasks()

    expect(res.status).toBe(200)
    expect(paperSender.calls).toEqual(['msb-letter-retry']) // le GET EST rappelé cette fois
    expect(store.calls.update).toEqual([{ providerRef: 'msb-letter-retry', patch: { status: 'sent' } }])
    expect(store.calls.processed).toEqual(['evt-pas-encore-traite'])
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

  it('paperSender absent (router construit sans adaptateur) → même verdict que l’échec du GET, jamais un throw, événement ABANDONNÉ signalé (Sentry)', async () => {
    const store = makeStore()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { app } = makeApp({ store, paperSender: null })
    const { eventId, body } = eventPayload({ letterId: 'msb-letter-noadapter' })

    const res = await postWebhook(app, URL_SECRET, body)
    await flushMicrotasks()

    expect(res.status).toBe(200)
    expect(store.calls.update).toHaveLength(0)
    expect(store.calls.processed).toHaveLength(0)
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: expect.objectContaining({ reason: 'provider_event_abandoned', event_id: eventId }) })
    )
  })

  it('letter absente du payload → traité comme un échec de corrélation, événement non-processed, jamais un 500, ABANDONNÉ signalé (Sentry)', async () => {
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
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: expect.objectContaining({ reason: 'provider_event_abandoned', event_id: 'evt-sans-letter' }) })
    )
  })
})

describe('POST /api/letters/provider-webhook/:secret — alignement webhook/resync (revue finale, mineur)', () => {
  it('fold sans événement actionnable (statut "prepared") → AUCUN appel updateSendByProviderRef, événement quand même marqué traité', async () => {
    const store = makeStore()
    const paperSender = makePaperSender({ 'msb-letter-noop': { events: [] } })
    const { app } = makeApp({ store, paperSender })
    const { eventId, body } = eventPayload({ letterId: 'msb-letter-noop', eventName: 'letter.opened_by_recipient' })

    const res = await postWebhook(app, URL_SECRET, body)
    await flushMicrotasks()
    await flushMicrotasks()

    expect(res.status).toBe(200)
    expect(paperSender.calls).toEqual(['msb-letter-noop']) // le GET a bien lieu
    expect(store.calls.update).toHaveLength(0) // …mais rien à écrire (fold = 'prepared')
    expect(store.calls.processed).toEqual([eventId]) // traité quand même : rien de plus à en tirer
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
