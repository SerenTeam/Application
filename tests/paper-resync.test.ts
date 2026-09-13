import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock du SDK Sentry : `vi.mock` intercepte la résolution du module pour TOUT le graphe de ce
// fichier (y compris paper-resync.js, qui importe '@sentry/node' en production) — plus fiable
// qu'un `vi.spyOn` direct sur un module tiers (bindings ESM parfois non redéfinissables), même
// patron que tests/letters-store.test.ts.
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))

// @ts-expect-error — module JS serveur
import { createPaperResync } from '../server/lib/paper-resync.js'
import * as Sentry from '@sentry/node'

// Resynchronisation périodique du cycle papier (chantier 2a, Task 10 — décision actée : TIMER
// SERVEUR `setInterval`, PAS de pg_cron/pg_net). Contrat : docs/plan-chantier-2a-envoi-papier.md
// Task 10, docs/design-chantier-2a-envoi-papier.md §6.
//
// Le fake store ci-dessous mirrors FIDÈLEMENT le périmètre réel de la RPC SQL
// `list_sends_for_resync` (supabase/migrations/20260914170000_resync_reader.sql, amendée par la
// revue finale Task 10 — I1) : channel papier/lre/lrar ET provider_ref non nul pour `submitted`
// (> 24h) et `sent` (≤ J+30) ; channel = 'papier' STRICTEMENT, `provider_ref is null`, `updated_at`
// > 2h ET un débit `send_debits` existant (non libéré) pour `prepared` (l'orphelin RÉEL du régime
// incertain Task 9 — l'ancienne formulation « prepared + provider_ref non nul » décrivait un état
// inatteignable, aucune RPC ne pose jamais cette combinaison). Appliqué ici en JS sur une table
// brute, exactement comme le ferait le WHERE de la migration, pour que « périmètre exact » soit
// vérifiable sans base réelle.

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

type RawSend = {
  id: string
  provider_ref: string | null
  status: string
  channel: string
  updated_at: number // timestamp epoch ms — construit avec ago(durée), voir plus bas
  sent_at?: number | null
  debited?: boolean // ligne présente dans send_debits (débit non libéré) — pertinent pour `prepared` uniquement
}

// `updated_at`/`sent_at` des fixtures sont exprimés comme une DURÉE ÉCOULÉE (ex. `ago(25 * HOUR)`
// = « il y a 25 h ») plutôt qu'un timestamp absolu — plus lisible dans les cas ci-dessous.
function ago(ms: number) {
  return Date.now() - ms
}

// Applique le MÊME filtre que la migration 20260914170000_resync_reader.sql (post revue finale).
function filterResyncScope(rows: RawSend[]) {
  const now = Date.now()
  return rows
    .filter((r) => {
      if (r.status === 'submitted') {
        return ['papier', 'lre', 'lrar'].includes(r.channel) && r.provider_ref != null && now - r.updated_at > 24 * HOUR
      }
      if (r.status === 'sent') {
        return (
          ['papier', 'lre', 'lrar'].includes(r.channel) &&
          r.provider_ref != null &&
          (r.sent_at == null || now - r.sent_at <= 30 * DAY)
        )
      }
      if (r.status === 'prepared') {
        return r.channel === 'papier' && r.provider_ref == null && now - r.updated_at > 2 * HOUR && Boolean(r.debited)
      }
      return false
    })
    .map((r) => ({ id: r.id, provider_ref: r.provider_ref, status: r.status, channel: r.channel }))
}

function makeStore(rawRows: RawSend[]) {
  const calls: { list: number; update: unknown[] } = { list: 0, update: [] }
  return {
    calls,
    async listSendsForResync() {
      calls.list += 1
      return filterResyncScope(rawRows)
    },
    async updateSendByProviderRef(_client: unknown, providerRef: string, patch: Record<string, unknown>) {
      calls.update.push({ providerRef, patch })
    },
  }
}

function makePaperSender(byRef: Record<string, { events: Array<Record<string, unknown>> } | Error>) {
  const calls: string[] = []
  return {
    calls,
    async getLetter(providerRef: string) {
      calls.push(providerRef)
      const entry = byRef[providerRef]
      if (entry instanceof Error) throw entry
      if (!entry) throw new Error(`lettre inconnue du fake : ${providerRef}`)
      return { _id: providerRef, ...entry }
    },
  }
}

const publicClient = { marker: 'bare-client' }

beforeEach(() => {
  vi.stubEnv('MYSENDINGBOX_API_KEY', 'msb-key-test')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.mocked(Sentry.captureException).mockClear()
})

describe('createPaperResync — périmètre (filtre de la migration, exercé via le fake store)', () => {
  it('retient submitted > 24h, sent ≤ J+30, prepared orphelin débité > 2h — écarte tout le reste', async () => {
    const rawRows: RawSend[] = [
      // ── retenus (GET tenté) ──
      { id: 'keep-submitted', provider_ref: 'msb-1', status: 'submitted', channel: 'papier', updated_at: ago(25 * HOUR) },
      { id: 'keep-sent-recent', provider_ref: 'msb-2', status: 'sent', channel: 'papier', updated_at: ago(1 * DAY), sent_at: ago(1 * DAY) },
      { id: 'keep-sent-29j', provider_ref: 'msb-3', status: 'sent', channel: 'papier', updated_at: ago(29 * DAY), sent_at: ago(29 * DAY) },
      { id: 'keep-submitted-tres-vieux', provider_ref: 'msb-5', status: 'submitted', channel: 'papier', updated_at: ago(90 * DAY) }, // "sans limite d'âge"
      // ── écartés ──
      { id: 'skip-submitted-recent', provider_ref: 'msb-6', status: 'submitted', channel: 'papier', updated_at: ago(1 * HOUR) }, // < 24h
      { id: 'skip-sent-vieux', provider_ref: 'msb-7', status: 'sent', channel: 'papier', updated_at: ago(40 * DAY), sent_at: ago(40 * DAY) }, // > J+30
      { id: 'skip-sent-sans-ref', provider_ref: null, status: 'sent', channel: 'papier', updated_at: ago(1 * DAY), sent_at: ago(1 * DAY) }, // garde mineure : sent sans provider_ref
      // ── prepared : SEUL le vrai orphelin (débité, sans ref, > 2h) est retenu (traité à part, pas de GET) ──
      { id: 'skip-prepared-recent-debite', provider_ref: null, status: 'prepared', channel: 'papier', updated_at: ago(30 * 60 * 1000), debited: true }, // < 2h (30 min)
      { id: 'skip-prepared-non-debite', provider_ref: null, status: 'prepared', channel: 'papier', updated_at: ago(3 * HOUR), debited: false }, // rien engagé, pas d'orphelin
      { id: 'skip-prepared-avec-ref', provider_ref: 'msb-impossible', status: 'prepared', channel: 'papier', updated_at: ago(3 * HOUR), debited: true }, // état désormais hors périmètre (I1)
      { id: 'skip-failed', provider_ref: 'msb-8', status: 'failed', channel: 'papier', updated_at: ago(1 * HOUR) }, // clos
      { id: 'skip-failed-address', provider_ref: 'msb-9', status: 'failed_address', channel: 'papier', updated_at: ago(1 * HOUR) }, // clos
      { id: 'skip-email', provider_ref: 'resend-1', status: 'sending', channel: 'email', updated_at: ago(1 * HOUR) }, // autre canal
    ]
    const store = makeStore(rawRows)
    const paperSender = makePaperSender(
      Object.fromEntries(['msb-1', 'msb-2', 'msb-3', 'msb-5'].map((ref) => [ref, { events: [{ _id: 'e', type: 'letter.sent' }] }]))
    )
    const resync = createPaperResync({ store, paperSender, publicClient })

    await resync.runOnce()

    expect(paperSender.calls.sort()).toEqual(['msb-1', 'msb-2', 'msb-3', 'msb-5'].sort())
  })

  it('prepared orphelin débité > 2h EST dans le périmètre (mais traité à part, sans GET — voir describe dédié)', async () => {
    const rawRows: RawSend[] = [
      { id: 'orphan-1', provider_ref: null, status: 'prepared', channel: 'papier', updated_at: ago(3 * HOUR), debited: true },
    ]
    const store = makeStore(rawRows)
    const rows = await store.listSendsForResync()
    expect(rows).toEqual([{ id: 'orphan-1', provider_ref: null, status: 'prepared', channel: 'papier' }])
  })
})

describe('createPaperResync — transition seulement si le fold diffère du statut courant', () => {
  it('fold identique au statut courant → AUCUN appel updateSendByProviderRef', async () => {
    const rawRows: RawSend[] = [
      { id: 's1', provider_ref: 'msb-1', status: 'sent', channel: 'papier', updated_at: ago(1 * DAY), sent_at: ago(1 * DAY) },
    ]
    const store = makeStore(rawRows)
    // events[] ne fait que confirmer 'sent' : le fold renvoie 'sent', identique au statut courant.
    const paperSender = makePaperSender({ 'msb-1': { events: [{ _id: 'e1', type: 'letter.sent' }] } })
    const resync = createPaperResync({ store, paperSender, publicClient })

    await resync.runOnce()

    expect(store.calls.update).toHaveLength(0)
  })

  it('fold plus avancé (NPAI arrivé après sent) → transition écrite via updateSendByProviderRef, par provider_ref', async () => {
    const rawRows: RawSend[] = [
      { id: 's1', provider_ref: 'msb-1', status: 'sent', channel: 'papier', updated_at: ago(5 * DAY), sent_at: ago(5 * DAY) },
    ]
    const store = makeStore(rawRows)
    const paperSender = makePaperSender({
      'msb-1': { events: [{ _id: 'e1', type: 'letter.sent' }, { _id: 'e2', type: 'letter.wrong_address' }] },
    })
    const resync = createPaperResync({ store, paperSender, publicClient })

    await resync.runOnce()

    expect(store.calls.update).toEqual([{ providerRef: 'msb-1', patch: { status: 'failed_address' } }])
  })

})

describe('createPaperResync — orphelins débités sans provider_ref (revue finale Task 10, I1)', () => {
  it('ligne prepared orpheline (débitée, sans provider_ref) → AUCUN GET, signalée en Sentry (tag orphan_debited_send)', async () => {
    const rawRows: RawSend[] = [
      { id: 'orphan-1', provider_ref: null, status: 'prepared', channel: 'papier', updated_at: ago(3 * HOUR), debited: true },
    ]
    const store = makeStore(rawRows)
    const paperSender = makePaperSender({})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const resync = createPaperResync({ store, paperSender, publicClient })

    await resync.runOnce()

    expect(paperSender.calls).toHaveLength(0) // rien à corréler côté provider sans provider_ref
    expect(store.calls.update).toHaveLength(0)
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: expect.objectContaining({ reason: 'orphan_debited_send', send_id: 'orphan-1' }) })
    )
  })

  it('un orphelin sans provider_ref ne bloque pas le traitement des autres lignes du même passage', async () => {
    const rawRows: RawSend[] = [
      { id: 'orphan-1', provider_ref: null, status: 'prepared', channel: 'papier', updated_at: ago(3 * HOUR), debited: true },
      { id: 's-ok', provider_ref: 'msb-ok', status: 'submitted', channel: 'papier', updated_at: ago(25 * HOUR) },
    ]
    const store = makeStore(rawRows)
    const paperSender = makePaperSender({ 'msb-ok': { events: [{ _id: 'e1', type: 'letter.sent' }] } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const resync = createPaperResync({ store, paperSender, publicClient })

    await resync.runOnce()

    expect(paperSender.calls).toEqual(['msb-ok'])
    expect(store.calls.update).toEqual([{ providerRef: 'msb-ok', patch: { status: 'sent' } }])
  })
})

describe('createPaperResync — robustesse', () => {
  it('un GET en échec pour une ligne ne bloque pas le traitement des autres', async () => {
    const rawRows: RawSend[] = [
      { id: 's1', provider_ref: 'msb-down', status: 'submitted', channel: 'papier', updated_at: ago(25 * HOUR) },
      { id: 's2', provider_ref: 'msb-ok', status: 'submitted', channel: 'papier', updated_at: ago(25 * HOUR) },
    ]
    const store = makeStore(rawRows)
    const paperSender = makePaperSender({
      'msb-down': new Error('provider_unavailable'),
      'msb-ok': { events: [{ _id: 'e1', type: 'letter.sent' }] },
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const resync = createPaperResync({ store, paperSender, publicClient })

    await resync.runOnce()

    expect(store.calls.update).toEqual([{ providerRef: 'msb-ok', patch: { status: 'sent' } }])
  })

  it('listSendsForResync qui lève → logué, ne fait pas planter runOnce', async () => {
    const store = {
      async listSendsForResync() {
        throw new Error('boom')
      },
      updateSendByProviderRef: vi.fn(),
    }
    const paperSender = makePaperSender({})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const resync = createPaperResync({ store, paperSender, publicClient })

    await expect(resync.runOnce()).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalled()
  })

  it('updateSendByProviderRef qui lève pour une ligne ne bloque pas les suivantes', async () => {
    const rawRows: RawSend[] = [
      { id: 's1', provider_ref: 'msb-1', status: 'submitted', channel: 'papier', updated_at: ago(25 * HOUR) },
      { id: 's2', provider_ref: 'msb-2', status: 'submitted', channel: 'papier', updated_at: ago(25 * HOUR) },
    ]
    const store = makeStore(rawRows)
    store.updateSendByProviderRef = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined)
    const paperSender = makePaperSender({
      'msb-1': { events: [{ _id: 'e1', type: 'letter.sent' }] },
      'msb-2': { events: [{ _id: 'e1', type: 'letter.sent' }] },
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const resync = createPaperResync({ store, paperSender, publicClient })

    await resync.runOnce()

    expect(store.updateSendByProviderRef).toHaveBeenCalledTimes(2)
  })
})

describe('createPaperResync — armement du timer', () => {
  it('MYSENDINGBOX_API_KEY absente → start() désarmé : log une ligne, aucun setInterval, runOnce jamais déclenché tout seul', () => {
    vi.stubEnv('MYSENDINGBOX_API_KEY', '')
    const store = makeStore([])
    const paperSender = makePaperSender({})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const setIntervalSpy = vi.spyOn(global, 'setInterval')
    const resync = createPaperResync({ store, paperSender, publicClient })

    resync.start()

    expect(setIntervalSpy).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(logSpy.mock.calls[0].join(' ')).toMatch(/désarmé/i)
  })

  it('MYSENDINGBOX_API_KEY présente → start() arme un setInterval(intervalMs) et appelle .unref() sur le timer obtenu', () => {
    const store = makeStore([])
    const paperSender = makePaperSender({})
    const fakeTimer = { unref: vi.fn() }
    const setIntervalSpy = vi.spyOn(global, 'setInterval').mockReturnValue(fakeTimer as unknown as NodeJS.Timeout)
    const resync = createPaperResync({ store, paperSender, publicClient, intervalMs: 6 * 60 * 60 * 1000 })

    resync.start()

    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    expect(setIntervalSpy.mock.calls[0][1]).toBe(6 * 60 * 60 * 1000)
    // La preuve explicite qui manquait : .unref() est bien appelé sur LE TIMER RENVOYÉ par
    // setInterval — sans lui, ce timer de fond empêcherait le process de s'arrêter proprement.
    expect(fakeTimer.unref).toHaveBeenCalledTimes(1)
  })

  it('stop() annule le timer armé (vi.getTimerCount() retombe à 0)', () => {
    const store = makeStore([])
    const paperSender = makePaperSender({})
    vi.useFakeTimers()
    const resync = createPaperResync({ store, paperSender, publicClient, intervalMs: 6 * 60 * 60 * 1000 })

    resync.start()
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    resync.stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('le timer déclenche bien runOnce à intervalles réguliers', async () => {
    const rawRows: RawSend[] = [
      { id: 's1', provider_ref: 'msb-1', status: 'submitted', channel: 'papier', updated_at: ago(25 * HOUR) },
    ]
    const store = makeStore(rawRows)
    const paperSender = makePaperSender({ 'msb-1': { events: [{ _id: 'e1', type: 'letter.sent' }] } })
    vi.useFakeTimers()
    const resync = createPaperResync({ store, paperSender, publicClient, intervalMs: 1000 })

    resync.start()
    expect(store.calls.list).toBe(0) // rien avant la première échéance

    await vi.advanceTimersByTimeAsync(1000)
    expect(store.calls.list).toBe(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(store.calls.list).toBe(2)

    resync.stop()
  })
})
