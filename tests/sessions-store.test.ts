import { describe, it, expect } from 'vitest'
// @ts-expect-error — module JS serveur
import { createSession, loadSession, saveAnswers, deleteSession } from '../server/lib/sessions-store.js'

/**
 * Fake du query-builder Supabase : chaîne fluide qui enregistre les appels et
 * résout `single`/`maybeSingle`/`await` sur le résultat fourni.
 */
function fakeClient(result: { data?: unknown; error?: { message: string } | null }) {
  const calls: Array<[string, unknown[]]> = []
  const chain: Record<string, unknown> = {}
  for (const m of ['from', 'insert', 'select', 'eq', 'gt', 'update', 'delete']) {
    chain[m] = (...args: unknown[]) => {
      calls.push([m, args])
      return chain
    }
  }
  chain.single = () => Promise.resolve(result)
  chain.maybeSingle = () => Promise.resolve(result)
  // le builder Supabase est thenable : `await client.from(...).update(...).eq(...)`
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return { client: chain as never, calls }
}

describe('sessions-store', () => {
  it('createSession insère user_id + lang (défaut fr) et retourne la ligne', async () => {
    const row = { id: 'abc', user_id: 'u1', answers: {}, lang: 'fr' }
    const { client, calls } = fakeClient({ data: row, error: null })
    const session = await createSession(client, 'u1')
    expect(session).toEqual(row)
    expect(calls).toContainEqual(['from', ['questionnaire_sessions']])
    expect(calls).toContainEqual(['insert', [{ user_id: 'u1', lang: 'fr' }]])
  })
  it('createSession propage la langue explicite (en)', async () => {
    const row = { id: 'abc', user_id: 'u1', answers: {}, lang: 'en' }
    const { client, calls } = fakeClient({ data: row, error: null })
    const session = await createSession(client, 'u1', 'en')
    expect(session).toEqual(row)
    expect(calls).toContainEqual(['insert', [{ user_id: 'u1', lang: 'en' }]])
  })
  it('loadSession filtre les sessions expirées (gt expires_at)', async () => {
    const { client, calls } = fakeClient({ data: null, error: null })
    const session = await loadSession(client, 'abc')
    expect(session).toBeNull()
    const gtCall = calls.find(([m]) => m === 'gt')
    expect(gtCall?.[1][0]).toBe('expires_at')
  })
  it('saveAnswers met à jour answers et updated_at', async () => {
    const { client, calls } = fakeClient({ data: null, error: null })
    await saveAnswers(client, 'abc', { relation: 'parent' })
    const updateCall = calls.find(([m]) => m === 'update')
    expect((updateCall?.[1][0] as Record<string, unknown>).answers).toEqual({ relation: 'parent' })
    expect((updateCall?.[1][0] as Record<string, unknown>).updated_at).toBeDefined()
  })
  it('propage les erreurs Supabase en exceptions lisibles', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } })
    await expect(saveAnswers(client, 'abc', {})).rejects.toThrow(/boom/)
    await expect(createSession(client, 'u1')).rejects.toThrow()
  })
  it('deleteSession supprime par id et propage les erreurs', async () => {
    const { client, calls } = fakeClient({ data: null, error: null })
    await deleteSession(client, 'abc')
    expect(calls.find(([m]) => m === 'delete')).toBeDefined()
    expect(calls).toContainEqual(['eq', ['id', 'abc']])
    const { client: failing } = fakeClient({ data: null, error: { message: 'boom' } })
    await expect(deleteSession(failing, 'abc')).rejects.toThrow(/boom/)
  })
})
