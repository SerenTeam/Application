import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
// @ts-expect-error — module JS serveur
import { createSend, listSends, updateSendByProviderRef, markSendResult, claimRetry } from '../server/lib/letters-store.js'

/**
 * Fake du query-builder Supabase : chaîne fluide qui enregistre les appels et résout
 * `single`/`then`/`rpc` sur une file de résultats (un résultat par appel terminal, le
 * dernier étant réutilisé au-delà) — nécessaire ici car `createSend` enchaîne deux appels
 * terminaux distincts sur le même client en cas de conflit `dedup_key` (insert puis reload).
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

describe('letters-store', () => {
  describe('createSend', () => {
    it('insère les champs fournis et retourne { send }', async () => {
      const fields = { user_id: 'u1', template_id: 'mutuelle-resiliation', channel: 'email', dedup_key: 'k1' }
      const row = { id: 's1', status: 'sending', ...fields }
      const { client, calls } = fakeClient([{ data: row, error: null }])
      const result = await createSend(client, fields)
      expect(result).toEqual({ send: row })
      expect(calls).toContainEqual(['from', ['letter_sends']])
      expect(calls).toContainEqual(['insert', [fields]])
    })

    it('conflit dedup_key (23505) : recharge la ligne existante et signale le duplicata', async () => {
      const fields = { user_id: 'u1', template_id: 'mutuelle-resiliation', channel: 'email', dedup_key: 'k1' }
      const existing = { id: 's0', status: 'sent', ...fields }
      const { client, calls } = fakeClient([
        { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } },
        { data: existing, error: null },
      ])
      const result = await createSend(client, fields)
      expect(result).toEqual({ duplicate: true, send: existing })
      // La recharge doit filtrer par dedup_key, pas par id
      expect(calls).toContainEqual(['eq', ['dedup_key', 'k1']])
    })

    it('propage les erreurs Supabase non-23505 en exceptions lisibles', async () => {
      const fields = { user_id: 'u1', template_id: 't', channel: 'email', dedup_key: 'k2' }
      const { client } = fakeClient([{ data: null, error: { message: 'boom' } }])
      await expect(createSend(client, fields)).rejects.toThrow(/boom/)
    })
  })

  describe('listSends', () => {
    it('sélectionne les envois du user, triés created_at desc', async () => {
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

  describe('markSendResult', () => {
    it('met à jour la ligne par id et retourne la ligne mise à jour', async () => {
      const updated = { id: 's1', status: 'sent', provider_ref: 'prov-1', sent_at: '2026-07-17T00:00:00.000Z' }
      const { client, calls } = fakeClient([{ data: updated, error: null }])
      const result = await markSendResult(client, 's1', { status: 'sent', provider_ref: 'prov-1', sent_at: '2026-07-17T00:00:00.000Z' })
      expect(result).toEqual(updated)
      expect(calls).toContainEqual(['from', ['letter_sends']])
      expect(calls).toContainEqual(['update', [{ status: 'sent', provider_ref: 'prov-1', sent_at: '2026-07-17T00:00:00.000Z' }]])
      expect(calls).toContainEqual(['eq', ['id', 's1']])
    })

    it('propage les erreurs Supabase en exceptions lisibles', async () => {
      const { client } = fakeClient([{ data: null, error: { message: 'boom' } }])
      await expect(markSendResult(client, 's1', { status: 'failed', error: 'boom' })).rejects.toThrow(/boom/)
    })
  })

  describe('claimRetry', () => {
    it('ligne failed : UPDATE conditionnel WHERE status=failed → claim gagné, retourne la ligne', async () => {
      const row = { id: 's1', status: 'sending' }
      const { client, calls } = fakeClient([{ data: [row], error: null }])
      const result = await claimRetry(client, 's1')
      expect(result).toEqual(row)
      const updateCall = calls.find(([m]) => m === 'update')
      expect(updateCall?.[1][0]).toMatchObject({ status: 'sending' })
      expect((updateCall?.[1][0] as { updated_at: string }).updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(calls).toContainEqual(['eq', ['id', 's1']])
      expect(calls).toContainEqual(['eq', ['status', 'failed']])
    })

    it('allowStaleSending : garde WHERE status=sending AND updated_at < now-60s', async () => {
      const { client, calls } = fakeClient([{ data: [{ id: 's1', status: 'sending' }], error: null }])
      await claimRetry(client, 's1', { allowStaleSending: true })
      expect(calls).toContainEqual(['eq', ['status', 'sending']])
      const ltCall = calls.find(([m]) => m === 'lt')
      expect(ltCall?.[1][0]).toBe('updated_at')
      // La borne de fraîcheur doit être ≈ now - 60 s
      const bound = new Date(ltCall?.[1][1] as string).getTime()
      expect(Date.now() - bound).toBeGreaterThanOrEqual(59_000)
      expect(Date.now() - bound).toBeLessThan(70_000)
    })

    it('0 ligne modifiée (une autre requête possède l’envoi) → claim perdu → null', async () => {
      const { client } = fakeClient([{ data: [], error: null }])
      expect(await claimRetry(client, 's1')).toBeNull()
    })

    it('propage les erreurs Supabase', async () => {
      const { client } = fakeClient([{ data: null, error: { message: 'boom' } }])
      await expect(claimRetry(client, 's1')).rejects.toThrow(/boom/)
    })
  })

  describe('updateSendByProviderRef', () => {
    // La RPC est publiquement appelable via PostgREST (clé publishable + grant EXECUTE) :
    // le secret partagé WEBHOOK_RPC_SECRET ↔ webhook_config est la vraie barrière, vérifiée
    // PAR LA BASE — il doit donc TOUJOURS être transmis en p_secret.
    beforeEach(() => {
      vi.stubEnv('WEBHOOK_RPC_SECRET', 'rpc-secret-test')
    })
    afterEach(() => {
      vi.unstubAllEnvs()
      vi.restoreAllMocks()
    })

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
})
