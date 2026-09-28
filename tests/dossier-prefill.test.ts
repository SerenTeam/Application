import { describe, it, expect, vi, beforeEach } from 'vitest'
// @ts-expect-error — module JS serveur
import { prefillFromDossier } from '../server/lib/dossier-prefill.js'

const IDENTITY = {
  family_first_name: 'Camille',
  family_last_name: 'Roussel',
  deceased_first_name: 'Bernard',
  deceased_last_name: 'Roussel',
  deceased_death_date: '2026-09-12',
}

function fakeClient(result: { data?: unknown; error?: unknown } | Error) {
  return {
    rpc: vi.fn(async () => {
      if (result instanceof Error) throw result
      return { data: result.data ?? null, error: result.error ?? null }
    }),
  }
}

describe('prefillFromDossier', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('appelle my_dossier_identity et remplit les 3 questions d’identité du défunt', async () => {
    const client = fakeClient({ data: IDENTITY })
    const out = await prefillFromDossier(client, {})
    expect(client.rpc).toHaveBeenCalledWith('my_dossier_identity')
    expect(out).toEqual({ deceased_firstname: 'Bernard', deceased_lastname: 'Roussel', deceased_dod: '2026-09-12' })
  })

  it('ne reprend jamais les noms de la famille : ce ne sont pas des questions', async () => {
    const out = await prefillFromDossier(fakeClient({ data: IDENTITY }), {})
    expect(Object.keys(out)).not.toContain('family_first_name')
    expect(Object.keys(out)).not.toContain('family_last_name')
  })

  it('n’écrase jamais une réponse déjà présente', async () => {
    const out = await prefillFromDossier(fakeClient({ data: IDENTITY }), { deceased_firstname: 'Bernie' })
    expect(out.deceased_firstname).toBe('Bernie')
    expect(out.deceased_lastname).toBe('Roussel')
  })

  it('ignore une valeur invalide (date future, texte blanc) : la question sera posée', async () => {
    const out = await prefillFromDossier(
      fakeClient({ data: { ...IDENTITY, deceased_death_date: '2999-01-01', deceased_last_name: '   ' } }),
      {}
    )
    expect(out).toEqual({ deceased_firstname: 'Bernard' })
  })

  it('trime les textes comme une vraie réponse', async () => {
    const out = await prefillFromDossier(fakeClient({ data: { ...IDENTITY, deceased_first_name: '  Bernard ' } }), {})
    expect(out.deceased_firstname).toBe('Bernard')
  })

  it('aucun dossier (null) : réponses inchangées, même référence', async () => {
    const answers = {}
    expect(await prefillFromDossier(fakeClient({ data: null }), answers)).toBe(answers)
  })

  it('erreur Supabase ou exception : réponses inchangées, jamais de throw', async () => {
    const answers = { relation: 'parent' }
    expect(await prefillFromDossier(fakeClient({ error: { message: 'boom' } }), answers)).toBe(answers)
    expect(await prefillFromDossier(fakeClient(new Error('réseau')), answers)).toBe(answers)
  })
})
