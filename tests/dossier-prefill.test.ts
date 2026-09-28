import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@sentry/node', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

// @ts-expect-error — module JS serveur
import { prefillFromDossier } from '../server/lib/dossier-prefill.js'
import * as Sentry from '@sentry/node'

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

  afterEach(() => {
    // restoreAllMocks restaure la spy console.error (vi.spyOn) mais ne touche pas le vi.fn() de
    // Sentry créé par le factory vi.mock ci-dessus (patron tests/active-dossier-gate.test.ts) :
    // sans ce clear explicite, ses appels s'accumulent d'un test à l'autre dans ce même fichier.
    vi.restoreAllMocks()
    vi.mocked(Sentry.captureException).mockClear()
    vi.useRealTimers()
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

  it('les 5 champs du dossier à null : réponses inchangées, même référence', async () => {
    const answers = {}
    const client = fakeClient({
      data: {
        family_first_name: null,
        family_last_name: null,
        deceased_first_name: null,
        deceased_last_name: null,
        deceased_death_date: null,
      },
    })
    expect(await prefillFromDossier(client, answers)).toBe(answers)
  })

  it('erreur Supabase ou exception : réponses inchangées, jamais de throw', async () => {
    const answers = { relation: 'parent' }
    expect(await prefillFromDossier(fakeClient({ error: { message: 'boom' } }), answers)).toBe(answers)
    expect(await prefillFromDossier(fakeClient(new Error('réseau')), answers)).toBe(answers)
  })

  it('erreur RPC : Sentry et console.error ne reçoivent qu’un code, jamais le texte Postgres brut', async () => {
    // Message Postgres réaliste (DETAIL) qui porterait les valeurs littérales de la ligne en
    // cause — exactement ce qui ne doit JAMAIS sortir vers les journaux/Sentry.
    const client = fakeClient({
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "dossiers_pkey" DETAIL: Key (deceased_first_name, deceased_last_name)=(Bernard, Roussel) already exists.',
      },
    })
    const answers = {}
    expect(await prefillFromDossier(client, answers)).toBe(answers)

    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    const sentError = vi.mocked(Sentry.captureException).mock.calls[0][0] as Error
    expect(sentError.message).toBe('my_dossier_identity_failed:23505')
    expect(sentError.message).not.toContain('Bernard')
    expect(sentError.message).not.toContain('Roussel')
    expect(sentError.message).not.toContain('DETAIL')

    const logged = vi.mocked(console.error).mock.calls.flat().join(' ')
    expect(logged).toContain('23505')
    expect(logged).not.toContain('Bernard')
    expect(logged).not.toContain('Roussel')
    expect(logged).not.toContain('DETAIL')
  })

  it('dépassement du délai de lecture (2 s) : réponses inchangées, dégradation silencieuse', async () => {
    vi.useFakeTimers()
    const answers = {}
    const client = { rpc: vi.fn(() => new Promise(() => {})) } // ne résout jamais
    const promise = prefillFromDossier(client, answers)
    await vi.advanceTimersByTimeAsync(2000)
    expect(await promise).toBe(answers)
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    const sentError = vi.mocked(Sentry.captureException).mock.calls[0][0] as Error
    expect(sentError.message).toBe('my_dossier_identity_timeout')
  })
})
