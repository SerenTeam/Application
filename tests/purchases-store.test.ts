import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
// @ts-expect-error — module JS serveur
import { getPaidPurchase, createPending, markPaid } from '../server/lib/purchases-store.js'

/**
 * Fake du query-builder Supabase (même patron que tests/letters-store.test.ts) : chaîne fluide
 * qui enregistre les appels et résout `maybeSingle` sur un résultat unique.
 */
function fakeClient(result: { data?: unknown; error?: { message: string } | null }) {
  const calls: Array<[string, unknown[]]> = []
  const chain: Record<string, unknown> = {}
  for (const m of ['from', 'select', 'eq', 'order', 'limit']) {
    chain[m] = (...args: unknown[]) => {
      calls.push([m, args])
      return chain
    }
  }
  chain.maybeSingle = () => Promise.resolve(result)
  return { client: chain as never, calls }
}

beforeEach(() => {
  vi.stubEnv('WEBHOOK_RPC_SECRET', 'rpc-secret-test')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

// Chantier 2a, amendement AM-2 : un achat `kind='envoi_sup'` (facturation à l'acte) ne doit
// JAMAIS ouvrir le gate du forfait à lui seul — voir aussi tests/purchase-gate.test.ts pour la
// vérification de bout en bout à travers le middleware requirePurchase.
describe('purchases-store — getPaidPurchase', () => {
  it('filtre par user_id, status=paid ET kind=forfait (le gate ne s’ouvre que sur un forfait payé)', async () => {
    const row = { id: 'purchase-1', status: 'paid', kind: 'forfait' }
    const { client, calls } = fakeClient({ data: row, error: null })
    const result = await getPaidPurchase(client, 'user-1')
    expect(result).toEqual(row)
    expect(calls).toContainEqual(['from', ['purchases']])
    expect(calls).toContainEqual(['eq', ['user_id', 'user-1']])
    expect(calls).toContainEqual(['eq', ['status', 'paid']])
    expect(calls).toContainEqual(['eq', ['kind', 'forfait']])
  })

  it('aucun achat trouvé (filtré par la base, ex. un envoi_sup seul) → null', async () => {
    const { client } = fakeClient({ data: null, error: null })
    expect(await getPaidPurchase(client, 'user-1')).toBeNull()
  })

  it('propage les erreurs Supabase en exceptions lisibles', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } })
    await expect(getPaidPurchase(client, 'user-1')).rejects.toThrow(/boom/)
  })
})

/** Client à RPC (les écritures passent toutes par des fonctions security definer). */
function fakeRpcClient(result: { data?: unknown; error?: { message: string } | null } = { error: null }) {
  const calls: Array<[string, Record<string, unknown>]> = []
  const client = {
    rpc: (name: string, params: Record<string, unknown>) => {
      calls.push([name, params])
      return Promise.resolve(result)
    },
  }
  return { client: client as never, calls }
}

// Chantier 2a : `kind` distingue le forfait (qui ouvre le gate du produit) de l'achat d'un envoi
// supplémentaire. Correctif I2 de la revue Task 9 : une valeur inconnue LÈVE au lieu d'être
// silencieusement ramenée à 'forfait' — la valeur privilégiée ne s'obtient jamais par accident.
describe('purchases-store — kind (facturation à l’acte)', () => {
  it('createPending transmet p_kind tel quel', async () => {
    const { client, calls } = fakeRpcClient()
    await createPending(client, { userId: 'user-1', sessionId: 'cs_1', includedSends: 1, kind: 'envoi_sup' })
    expect(calls[0][0]).toBe('create_pending_purchase')
    expect(calls[0][1]).toMatchObject({ p_kind: 'envoi_sup', p_included_sends: 1 })
  })

  it('markPaid sans kind : repli « forfait » (appelant d’avant le chantier 2a, metadata absente)', async () => {
    const { client, calls } = fakeRpcClient()
    await markPaid(client, { sessionId: 'cs_1', userId: 'user-1', paymentIntent: null, amountTotal: null, currency: null, includedSends: 5 })
    expect(calls[0][1]).toMatchObject({ p_kind: 'forfait' })
  })

  it('kind inconnu : LÈVE, aucune écriture tentée (le webhook acquitte quand même et capture)', async () => {
    const { client, calls } = fakeRpcClient()
    await expect(
      markPaid(client, { sessionId: 'cs_1', userId: 'user-1', paymentIntent: null, amountTotal: null, currency: null, includedSends: 1, kind: 'abonnement' }),
    ).rejects.toThrow(/kind inattendu/)
    expect(calls).toHaveLength(0)
  })
})
