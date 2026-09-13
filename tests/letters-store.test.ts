import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock du SDK Sentry : `vi.mock` intercepte la résolution du module pour TOUT le graphe de ce
// fichier de test (y compris letters-store.js, qui importe '@sentry/node' en production) — plus
// fiable qu'un vi.spyOn direct sur un module tiers (bindings ESM parfois non redéfinissables).
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))

// @ts-expect-error — module JS serveur
import { createSend, listSends, updateSendByProviderRef, markSendResult, claimRetry, consumeSend, releaseDebit, recordProviderEvent, markProviderEventProcessed, checkSendLimits } from '../server/lib/letters-store.js'
import * as Sentry from '@sentry/node'

/**
 * Fake du query-builder Supabase : chaîne fluide qui enregistre les appels et résout
 * `single`/`then`/`rpc` sur une file de résultats (un résultat par appel terminal, le dernier
 * étant réutilisé au-delà).
 */
function fakeClient(results: Array<{ data?: unknown; error?: { message: string; code?: string } | null }>) {
  const calls: Array<[string, unknown[]]> = []
  let i = 0
  const nextResult = () => results[Math.min(i++, results.length - 1)]
  const chain: Record<string, unknown> = {}
  for (const m of ['from', 'insert', 'select', 'eq', 'lt', 'order', 'update', 'delete']) {
    chain[m] = (...args: unknown[]) => {
      calls.push([m, args])
      return chain
    }
  }
  chain.single = () => Promise.resolve(nextResult())
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(nextResult()).then(resolve)
  chain.rpc = (...args: unknown[]) => {
    calls.push(['rpc', args])
    return Promise.resolve(nextResult())
  }
  return { client: chain as never, calls }
}

// Depuis le chantier 2a, TOUTE écriture de letter_sends passe par une RPC à secret — le secret
// est donc stubé pour l'ensemble du fichier ; les quelques tests « secret absent » l'enlèvent
// localement.
beforeEach(() => {
  vi.stubEnv('WEBHOOK_RPC_SECRET', 'rpc-secret-test')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.mocked(Sentry.captureException).mockClear()
})

describe('letters-store', () => {
  describe('createSend', () => {
    it('canal email : appelle create_letter_send et retourne { duplicate: false, send }', async () => {
      const fields = { user_id: 'u1', template_id: 'mutuelle-resiliation', channel: 'email', dedup_key: 'k1', status: 'sending', provider: 'resend', recipient: { email: 'a@b.fr' } }
      const row = { id: 's1', ...fields }
      const { client, calls } = fakeClient([{ data: { duplicate: false, send: row }, error: null }])
      const result = await createSend(client, fields)
      expect(result).toEqual({ duplicate: false, send: row })
      const rpcCall = calls.find(([m]) => m === 'rpc')!
      expect(rpcCall[1][0]).toBe('create_letter_send')
      expect(rpcCall[1][1]).toEqual({
        p_secret: 'rpc-secret-test',
        p_user_id: 'u1',
        p_template_id: 'mutuelle-resiliation',
        p_channel: 'email',
        p_dedup_key: 'k1',
        p_step_id: null,
        p_status: 'sending',
        p_provider: 'resend',
        p_recipient: { email: 'a@b.fr' },
        p_resend_of: null,
        p_attachment_ids: null,
        p_cost_cents: null,
      })
    })

    it('dedup_key déjà présent : la RPC renvoie duplicate=true avec la ligne existante (sémantique inchangée)', async () => {
      const fields = { user_id: 'u1', template_id: 'mutuelle-resiliation', channel: 'email', dedup_key: 'k1' }
      const existing = { id: 's0', status: 'sent', ...fields }
      const { client } = fakeClient([{ data: { duplicate: true, send: existing }, error: null }])
      const result = await createSend(client, fields)
      expect(result).toEqual({ duplicate: true, send: existing })
    })

    it('canal papier : transmet resend_of/attachment_ids/cost_cents, p_status=null (la RPC choisit le statut initial)', async () => {
      const fields = {
        user_id: 'u1',
        template_id: 'caf-notification',
        channel: 'papier',
        dedup_key: 'k2',
        resend_of: 'send-orig',
        attachment_ids: ['att-1'],
        cost_cents: 120,
      }
      const { client, calls } = fakeClient([{ data: { duplicate: false, send: { id: 's2' } }, error: null }])
      await createSend(client, fields)
      const rpcCall = calls.find(([m]) => m === 'rpc')!
      expect(rpcCall[1][1]).toMatchObject({
        p_status: null,
        p_resend_of: 'send-orig',
        p_attachment_ids: ['att-1'],
        p_cost_cents: 120,
      })
    })

    it.each(['invalid_initial_status', 'invalid_resend_of', 'resend_already_exists', 'user_daily_exceeded', 'global_daily_exceeded', 'send_not_found'])(
      'exception nommée %s → LetterStoreError.code correspondant',
      async (code) => {
        const { client } = fakeClient([{ data: null, error: { message: code } }])
        await expect(createSend(client, { user_id: 'u1', template_id: 't', channel: 'papier', dedup_key: 'k3' }))
          .rejects.toMatchObject({ code, name: 'LetterStoreError' })
      },
    )

    it('erreur Supabase non nommée → exception lisible générique', async () => {
      const { client } = fakeClient([{ data: null, error: { message: 'boom' } }])
      await expect(createSend(client, { user_id: 'u1', template_id: 't', channel: 'email', dedup_key: 'k4' })).rejects.toThrow(/boom/)
    })

    it('WEBHOOK_RPC_SECRET absent → lève AVANT tout appel RPC', async () => {
      vi.unstubAllEnvs()
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { client, calls } = fakeClient([{ data: null, error: null }])
      await expect(createSend(client, { user_id: 'u1', template_id: 't', channel: 'email', dedup_key: 'k5' })).rejects.toThrow(/WEBHOOK_RPC_SECRET/)
      expect(calls.filter(([m]) => m === 'rpc')).toHaveLength(0)
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('claimRetry', () => {
    it('claim gagné : renvoie la ligne retournée par la RPC (p_allow_stale=false par défaut)', async () => {
      const row = { id: 's1', status: 'prepared' }
      const { client, calls } = fakeClient([{ data: row, error: null }])
      const result = await claimRetry(client, 's1')
      expect(result).toEqual(row)
      const rpcCall = calls.find(([m]) => m === 'rpc')!
      expect(rpcCall[1]).toEqual(['claim_letter_retry', { p_secret: 'rpc-secret-test', p_id: 's1', p_allow_stale: false }])
    })

    it('allowStaleSending + staleSeconds transmis à la RPC (canal papier : fenêtre plus large)', async () => {
      const { client, calls } = fakeClient([{ data: null, error: null }])
      await claimRetry(client, 's1', { allowStaleSending: true, staleSeconds: 300 })
      const rpcCall = calls.find(([m]) => m === 'rpc')!
      expect(rpcCall[1][1]).toEqual({ p_secret: 'rpc-secret-test', p_id: 's1', p_allow_stale: true, p_stale_seconds: 300 })
    })

    it('0 ligne modifiée (RPC renvoie null) → claim perdu → null', async () => {
      const { client } = fakeClient([{ data: null, error: null }])
      expect(await claimRetry(client, 's1')).toBeNull()
    })

    it('propage les erreurs Supabase non nommées', async () => {
      const { client } = fakeClient([{ data: null, error: { message: 'boom' } }])
      await expect(claimRetry(client, 's1')).rejects.toThrow(/boom/)
    })
  })

  describe('markSendResult', () => {
    it('déballe .send et expose transition_applied=true', async () => {
      const row = { id: 's1', status: 'sent', provider_ref: 'prov-1', sent_at: '2026-09-13T00:00:00.000Z' }
      const { client, calls } = fakeClient([{ data: { send: row, transition_applied: true }, error: null }])
      const result = await markSendResult(client, 's1', { status: 'sent', provider_ref: 'prov-1', sent_at: row.sent_at })
      expect(result).toEqual({ ...row, transition_applied: true })
      const rpcCall = calls.find(([m]) => m === 'rpc')!
      expect(rpcCall[1]).toEqual([
        'mark_letter_result',
        { p_secret: 'rpc-secret-test', p_id: 's1', p_status: 'sent', p_provider_ref: 'prov-1', p_sent_at: row.sent_at, p_error: null, p_cost_cents: null },
      ])
    })

    it('transition_applied=false (course avec le webhook) : la ligne est quand même renvoyée à plat avec ses métadonnées', async () => {
      // Le statut le plus avancé (déjà écrit par le webhook) est conservé côté RPC ; la route ne
      // doit pas traiter ce cas comme une erreur.
      const row = { id: 's1', status: 'sent', provider_ref: 'prov-1' }
      const { client } = fakeClient([{ data: { send: row, transition_applied: false }, error: null }])
      const result = await markSendResult(client, 's1', { status: 'submitted', provider_ref: 'prov-1' })
      expect(result).toEqual({ ...row, transition_applied: false })
    })

    it('send_not_found → LetterStoreError', async () => {
      const { client } = fakeClient([{ data: null, error: { message: 'send_not_found' } }])
      await expect(markSendResult(client, 'inconnu', { status: 'sent' })).rejects.toMatchObject({ code: 'send_not_found' })
    })

    it('propage les erreurs Supabase non nommées en exceptions lisibles', async () => {
      const { client } = fakeClient([{ data: null, error: { message: 'boom' } }])
      await expect(markSendResult(client, 's1', { status: 'failed', error: 'boom' })).rejects.toThrow(/boom/)
    })
  })

  describe('listSends', () => {
    it('sélectionne les envois du user, triés created_at desc (lecture directe, inchangée)', async () => {
      const rows = [{ id: 's2' }, { id: 's1' }]
      const { client, calls } = fakeClient([{ data: rows, error: null }])
      const result = await listSends(client, 'u1')
      expect(result).toEqual(rows)
      expect(calls).toContainEqual(['from', ['letter_sends']])
      expect(calls).toContainEqual(['eq', ['user_id', 'u1']])
      expect(calls).toContainEqual(['order', ['created_at', { ascending: false }]])
    })

    it('retourne un tableau vide si data est null', async () => {
      const { client } = fakeClient([{ data: null, error: null }])
      const result = await listSends(client, 'u1')
      expect(result).toEqual([])
    })

    it('propage les erreurs Supabase', async () => {
      const { client } = fakeClient([{ data: null, error: { message: 'boom' } }])
      await expect(listSends(client, 'u1')).rejects.toThrow(/boom/)
    })
  })

  describe('updateSendByProviderRef', () => {
    it('appelle la RPC security definer avec les bons arguments, p_secret inclus', async () => {
      const { client, calls } = fakeClient([{ data: null, error: null }])
      await updateSendByProviderRef(client, 'prov-ref-1', { status: 'delivered', delivered_at: '2026-07-17T00:00:00.000Z' })
      expect(calls).toContainEqual([
        'rpc',
        [
          'update_letter_send_status',
          { p_secret: 'rpc-secret-test', p_provider_ref: 'prov-ref-1', p_status: 'delivered', p_delivered_at: '2026-07-17T00:00:00.000Z', p_error: null },
        ],
      ])
    })

    it('transmet error et omet delivered_at par défaut', async () => {
      const { client, calls } = fakeClient([{ data: null, error: null }])
      await updateSendByProviderRef(client, 'prov-ref-2', { status: 'failed', error: 'bounced' })
      const rpcCall = calls.find(([m]) => m === 'rpc')
      expect(rpcCall?.[1][1]).toEqual({ p_secret: 'rpc-secret-test', p_provider_ref: 'prov-ref-2', p_status: 'failed', p_delivered_at: null, p_error: 'bounced' })
    })

    it('WEBHOOK_RPC_SECRET absent → lève AVANT tout appel RPC, log explicite sans payload', async () => {
      vi.unstubAllEnvs()
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { client, calls } = fakeClient([{ data: null, error: null }])
      await expect(updateSendByProviderRef(client, 'prov-ref-3', { status: 'delivered' })).rejects.toThrow(/WEBHOOK_RPC_SECRET/)
      expect(calls.filter(([m]) => m === 'rpc')).toHaveLength(0)
      expect(errorSpy).toHaveBeenCalledTimes(1)
      const logged = errorSpy.mock.calls[0].join(' ')
      expect(logged).toContain('WEBHOOK_RPC_SECRET')
      expect(logged).not.toContain('prov-ref-3')
    })

    it('propage les erreurs Supabase', async () => {
      const { client } = fakeClient([{ data: null, error: { message: 'boom' } }])
      await expect(updateSendByProviderRef(client, 'ref', { status: 'sent' })).rejects.toThrow(/boom/)
    })
  })

  describe('consumeSend', () => {
    it('debited=true, source=included : passthrough intégral de la RPC', async () => {
      const payload = { debited: true, already_debited: false, source: 'included', free_resend: false, balance_after: 4 }
      const { client, calls } = fakeClient([{ data: payload, error: null }])
      const result = await consumeSend(client, 'send-1', 'user-1')
      expect(result).toEqual(payload)
      const rpcCall = calls.find(([m]) => m === 'rpc')!
      expect(rpcCall[1]).toEqual(['consume_send', { p_secret: 'rpc-secret-test', p_send_id: 'send-1', p_user_id: 'user-1' }])
    })

    it('already_debited=true (retry sur un envoi déjà débité) : passthrough, aucune exception', async () => {
      const payload = { debited: false, already_debited: true, source: 'included', free_resend: false, balance_after: 4 }
      const { client } = fakeClient([{ data: payload, error: null }])
      await expect(consumeSend(client, 'send-1', 'user-1')).resolves.toEqual(payload)
    })

    it('re-envoi offert : source=offert, free_resend=true passthrough', async () => {
      const payload = { debited: true, already_debited: false, source: 'offert', free_resend: true, balance_after: 4 }
      const { client } = fakeClient([{ data: payload, error: null }])
      await expect(consumeSend(client, 'send-2', 'user-1')).resolves.toEqual(payload)
    })

    it('quota_exhausted → LetterStoreError traduit, AUCUNE capture Sentry (flux utilisateur normal)', async () => {
      const { client } = fakeClient([{ data: null, error: { message: 'quota_exhausted' } }])
      await expect(consumeSend(client, 'send-1', 'user-1')).rejects.toMatchObject({ code: 'quota_exhausted', name: 'LetterStoreError' })
      expect(Sentry.captureException).not.toHaveBeenCalled()
    })

    it('send_not_found → LetterStoreError', async () => {
      const { client } = fakeClient([{ data: null, error: { message: 'send_not_found' } }])
      await expect(consumeSend(client, 'inconnu', 'user-1')).rejects.toMatchObject({ code: 'send_not_found' })
    })
  })

  describe('releaseDebit', () => {
    it('true = débit libéré, TOUJOURS appelé avec p_user_id', async () => {
      const { client, calls } = fakeClient([{ data: true, error: null }])
      const result = await releaseDebit(client, 'send-1', 'user-1')
      expect(result).toBe(true)
      const rpcCall = calls.find(([m]) => m === 'rpc')!
      expect(rpcCall[1]).toEqual(['release_debit', { p_secret: 'rpc-secret-test', p_send_id: 'send-1', p_user_id: 'user-1' }])
    })

    it('false = rien à libérer (débit inexistant ou envoi déjà engagé) : ce n’est PAS une erreur', async () => {
      const { client } = fakeClient([{ data: false, error: null }])
      await expect(releaseDebit(client, 'send-1', 'user-1')).resolves.toBe(false)
    })

    it('propage les erreurs Supabase non nommées', async () => {
      const { client } = fakeClient([{ data: null, error: { message: 'boom' } }])
      await expect(releaseDebit(client, 'send-1', 'user-1')).rejects.toThrow(/boom/)
    })
  })

  describe('recordProviderEvent', () => {
    it('événement nouveau → true, tous les paramètres transmis', async () => {
      const { client, calls } = fakeClient([{ data: true, error: null }])
      const result = await recordProviderEvent(client, { id: 'msb-evt-1', sendId: 'send-1', eventType: 'letter.sent', payload: { foo: 'bar' } })
      expect(result).toBe(true)
      const rpcCall = calls.find(([m]) => m === 'rpc')!
      expect(rpcCall[1]).toEqual([
        'record_provider_event',
        { p_secret: 'rpc-secret-test', p_id: 'msb-evt-1', p_send_id: 'send-1', p_event_type: 'letter.sent', p_payload: { foo: 'bar' } },
      ])
    })

    it('événement déjà connu (rejeu du webhook) → false, idempotent, aucune exception', async () => {
      const { client } = fakeClient([{ data: false, error: null }])
      await expect(recordProviderEvent(client, { id: 'msb-evt-1' })).resolves.toBe(false)
    })
  })

  describe('markProviderEventProcessed', () => {
    it('passthrough booléen', async () => {
      const { client, calls } = fakeClient([{ data: true, error: null }])
      expect(await markProviderEventProcessed(client, 'msb-evt-1')).toBe(true)
      const rpcCall = calls.find(([m]) => m === 'rpc')!
      expect(rpcCall[1]).toEqual(['mark_provider_event_processed', { p_secret: 'rpc-secret-test', p_id: 'msb-evt-1' }])
    })
  })

  describe('checkSendLimits', () => {
    it.each(['ok', 'user_daily_exceeded', 'global_daily_exceeded'])('%s renvoyé tel quel (pas une exception)', async (status) => {
      const { client } = fakeClient([{ data: status, error: null }])
      expect(await checkSendLimits(client, 'user-1')).toBe(status)
    })
  })

  // invalid_secret peut survenir sur N'IMPORTE QUELLE RPC neuve (désynchronisation entre l'env
  // serveur et la ligne webhook_config) : chaque occurrence doit être traduite en LetterStoreError
  // ET capturée par Sentry (vigilance de revue Task 4/5 — signal d'alerte, pas de compteur).
  describe('invalid_secret renvoyé par la base — traduit + alerte Sentry, sur toutes les RPC', () => {
    const cases: Array<[string, (client: never) => Promise<unknown>]> = [
      ['create_letter_send', (client) => createSend(client, { user_id: 'u1', template_id: 't', channel: 'email', dedup_key: 'k' })],
      ['claim_letter_retry', (client) => claimRetry(client, 's1')],
      ['mark_letter_result', (client) => markSendResult(client, 's1', { status: 'sent' })],
      ['consume_send', (client) => consumeSend(client, 's1', 'u1')],
      ['release_debit', (client) => releaseDebit(client, 's1', 'u1')],
      ['record_provider_event', (client) => recordProviderEvent(client, { id: 'evt1' })],
      ['mark_provider_event_processed', (client) => markProviderEventProcessed(client, 'evt1')],
      ['check_send_limits', (client) => checkSendLimits(client, 'u1')],
    ]

    it.each(cases)('%s', async (_name, call) => {
      const { client } = fakeClient([{ data: null, error: { message: 'invalid_secret' } }])
      await expect(call(client)).rejects.toMatchObject({ code: 'invalid_secret', name: 'LetterStoreError' })
      expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    })
  })
})
