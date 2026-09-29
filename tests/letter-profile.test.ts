import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import {
  fullNameOf,
  validateLetterProfile,
  saveLetterProfile,
  fetchLetterProfile,
  fetchDossierIdentity,
  fetchLatestQuestionnaire,
  saveDeceasedDob,
  patchQuestionnaireAnswers,
  initialLetterProfileInput,
  formatDobForDisplay,
  dobNeedsSave,
  type LetterProfileInput,
  type LetterProfileRow,
} from '@/lib/letter-profile'

// Colonnes réelles de sender_profiles : table du chantier 2a + colonnes de la personnalisation v2.
const MIGRATIONS = path.resolve(__dirname, '../supabase/migrations')
const CREATE = readFileSync(path.join(MIGRATIONS, '20260914100000_sender_profiles_organisations.sql'), 'utf8')
const ADD = readFileSync(path.join(MIGRATIONS, '20260928120000_sender_profiles_names.sql'), 'utf8')
const SENDER_COLUMNS = new Set<string>([
  ...[...CREATE.match(/create table if not exists sender_profiles \(([\s\S]*?)\n\);/)![1].matchAll(/^\s+([a-z_0-9]+)\s/gm)].map((m) => m[1]),
  ...[...ADD.matchAll(/add column if not exists ([a-z_0-9]+)/g)].map((m) => m[1]),
])

const VALID: LetterProfileInput = {
  first_name: 'Camille',
  last_name: 'Roussel',
  address_line1: '12 rue des Lilas',
  address_line2: '',
  postal_code: '33000',
  city: 'Bordeaux',
  relationship: 'fille',
}

interface Call {
  table?: string
  rpc?: string
  op?: string
  payload?: unknown
  options?: unknown
  selectedColumns?: string
  order?: [string, unknown]
  limit?: number
  filters: Array<[string, unknown]>
}

function fakeClient(responses: Array<{ data?: unknown; error?: unknown }> = []) {
  const calls: Call[] = []
  const settle = () => {
    const r = responses.shift() ?? {}
    return Promise.resolve({ data: r.data ?? null, error: r.error ?? null })
  }
  const client = {
    from(table: string) {
      const call: Call = { table, filters: [] }
      calls.push(call)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        // select() ne doit pas écraser payload : .update(...).select('id') doit garder les deux
        // (les colonnes lues vont dans un champ séparé, comme les filtres ou les tris).
        select(cols: string) { call.op = call.op ?? 'select'; call.selectedColumns = cols; return b },
        upsert(payload: unknown, options: unknown) { call.op = 'upsert'; call.payload = payload; call.options = options; return b },
        update(payload: unknown) { call.op = 'update'; call.payload = payload; return b },
        eq(col: string, val: unknown) { call.filters.push([col, val]); return b },
        order(col: string, opts: unknown) { call.order = [col, opts]; return b },
        limit(n: number) { call.limit = n; return b },
        maybeSingle() { return b },
        then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return settle().then(res, rej) },
      }
      return b
    },
    rpc(fn: string) {
      calls.push({ rpc: fn, filters: [] })
      return settle()
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, calls }
}

describe('fullNameOf', () => {
  it('« prénom nom », espaces superflus retirés', () => {
    expect(fullNameOf({ first_name: ' Camille ', last_name: 'Roussel ' })).toBe('Camille Roussel')
  })
})

describe('validateLetterProfile', () => {
  it('profil complet : aucune erreur', () => {
    expect(validateLetterProfile(VALID)).toEqual({})
  })
  it('champs obligatoires', () => {
    const errors = validateLetterProfile({ ...VALID, first_name: ' ', last_name: '', address_line1: '', city: '', relationship: '' })
    expect(errors).toMatchObject({
      first_name: 'firstNameRequired',
      last_name: 'lastNameRequired',
      address_line1: 'addressRequired',
      city: 'cityRequired',
      relationship: 'relationshipRequired',
    })
  })
  it('code postal à 5 chiffres', () => {
    expect(validateLetterProfile({ ...VALID, postal_code: '3300' }).postal_code).toBe('postalCodeInvalid')
    expect(validateLetterProfile({ ...VALID, postal_code: '2A004' }).postal_code).toBe('postalCodeInvalid')
  })
  it('45 caractères par ligne, et « prénom nom » tient sur l’enveloppe', () => {
    expect(validateLetterProfile({ ...VALID, address_line1: 'x'.repeat(46) }).address_line1).toBe('lineTooLong')
    expect(validateLetterProfile({ ...VALID, address_line2: 'x'.repeat(46) }).address_line2).toBe('lineTooLong')
    expect(validateLetterProfile({ ...VALID, city: 'x'.repeat(46) }).city).toBe('lineTooLong')
    expect(validateLetterProfile({ ...VALID, first_name: 'x'.repeat(46) }).first_name).toBe('lineTooLong')
    expect(validateLetterProfile({ ...VALID, first_name: 'x'.repeat(23), last_name: 'y'.repeat(23) }).last_name).toBe('fullNameTooLong')
  })
  it('lien avec la personne décédée : 45 caractères au maximum (M2)', () => {
    expect(validateLetterProfile({ ...VALID, relationship: 'x'.repeat(46) }).relationship).toBe('lineTooLong')
  })
  it('date de naissance facultative, réelle, antérieure au décès', () => {
    expect(validateLetterProfile(VALID, { value: '', max: '2026-09-12' })).toEqual({})
    expect(validateLetterProfile(VALID, { value: '1941-03-14', max: '2026-09-12' })).toEqual({})
    expect(validateLetterProfile(VALID, { value: '1941-02-30', max: '2026-09-12' }).deceased_dob).toBe('dobInvalid')
    expect(validateLetterProfile(VALID, { value: '2026-09-13', max: '2026-09-12' }).deceased_dob).toBe('dobAfterDeath')
    // Égale à la date du décès : valide (borne inclusive).
    expect(validateLetterProfile(VALID, { value: '2026-09-12', max: '2026-09-12' }).deceased_dob).toBeUndefined()
  })
  it('bornes (M3) : 1900-01-01 valide, avant → dobTooEarly ; après aujourd’hui sans décès connu → dobAfterDeath', () => {
    expect(validateLetterProfile(VALID, { value: '1900-01-01', max: null })).toEqual({})
    expect(validateLetterProfile(VALID, { value: '1899-12-31', max: null }).deceased_dob).toBe('dobTooEarly')
    expect(validateLetterProfile(VALID, { value: '2099-01-01', max: null }).deceased_dob).toBe('dobAfterDeath')
  })
  it('max vide (réponses anciennes, date de décès non renseignée) : traité comme aucun décès connu', () => {
    expect(validateLetterProfile(VALID, { value: '1941-03-14', max: '' }).deceased_dob).toBeUndefined()
  })
})

describe('borne « aujourd’hui » en date LOCALE (M3)', () => {
  const tz = process.env.TZ
  afterEach(() => { vi.useRealTimers(); if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz })
  it('28/09 à 22 h en Martinique (déjà le 29 en UTC) : le 29 est dans le futur, le 28 est valide', () => {
    process.env.TZ = 'America/Martinique'
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-29T02:00:00Z'))
    expect(validateLetterProfile(VALID, { value: '2026-09-29', max: null }).deceased_dob).toBe('dobAfterDeath')
    expect(validateLetterProfile(VALID, { value: '2026-09-28', max: null }).deceased_dob).toBeUndefined()
  })
})

describe('initialLetterProfileInput — valeurs de départ du formulaire (montage et « Modifier »)', () => {
  const V2_PROFILE: LetterProfileRow = {
    first_name: 'Camille',
    last_name: 'Roussel',
    full_name: 'Camille Roussel',
    address_line1: '12 rue des Lilas',
    address_line2: 'Bât. B',
    postal_code: '33000',
    city: 'Bordeaux',
    relationship: 'fille',
  }
  // Noms saisis par la PF (my_dossier_identity), volontairement différents du profil.
  const DOSSIER_DEFAULTS = { firstName: 'Camille-Anne', lastName: 'Martin' }

  it('profil v2 complet : ses valeurs priment sur les noms du dossier', () => {
    expect(initialLetterProfileInput(V2_PROFILE, DOSSIER_DEFAULTS, 'parent')).toEqual({
      first_name: 'Camille',
      last_name: 'Roussel',
      address_line1: '12 rue des Lilas',
      address_line2: 'Bât. B',
      postal_code: '33000',
      city: 'Bordeaux',
      relationship: 'fille',
    })
  })
  it('profil 2a (ni prénom ni nom séparés, lien « Fille ») : noms du dossier, lien ramené à « fille »', () => {
    const legacy: LetterProfileRow = {
      ...V2_PROFILE,
      first_name: null,
      last_name: null,
      full_name: 'Camille Roussel',
      address_line2: null,
      relationship: 'Fille',
    }
    expect(initialLetterProfileInput(legacy, DOSSIER_DEFAULTS, 'parent')).toEqual({
      first_name: 'Camille-Anne',
      last_name: 'Martin',
      address_line1: '12 rue des Lilas',
      address_line2: '',
      postal_code: '33000',
      city: 'Bordeaux',
      relationship: 'fille',
    })
  })
  it('aucun profil, relation « pacse » : « partenaire de PACS » choisi d’office, le reste vide', () => {
    expect(initialLetterProfileInput(null, undefined, 'pacse')).toEqual({
      first_name: '',
      last_name: '',
      address_line1: '',
      address_line2: '',
      postal_code: '',
      city: '',
      relationship: 'partenaire de PACS',
    })
  })
  it('relation « pacse » : la forme par défaut n’écrase jamais un lien déjà enregistré', () => {
    expect(initialLetterProfileInput({ ...V2_PROFILE, relationship: 'compagne' }, undefined, 'pacse').relationship).toBe('compagne')
  })
})

describe('dobNeedsSave — date de naissance à réécrire ?', () => {
  it('date inchangée : non', () => {
    expect(dobNeedsSave('1941-03-14', '1941-03-14')).toBe(false)
  })
  it('vide, null et absent se valent : non', () => {
    expect(dobNeedsSave('', null)).toBe(false)
    expect(dobNeedsSave('', undefined)).toBe(false)
    expect(dobNeedsSave('', '')).toBe(false)
  })
  it('date effacée (enregistrée, nouvelle vide) : oui', () => {
    expect(dobNeedsSave('', '1941-03-14')).toBe(true)
  })
  it('date saisie ou modifiée : oui', () => {
    expect(dobNeedsSave('1941-03-14', null)).toBe(true)
    expect(dobNeedsSave('1941-03-15', '1941-03-14')).toBe(true)
  })
})

describe('formatDobForDisplay — date de naissance affichée dans l’interface', () => {
  const originalTz = process.env.TZ
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ
    else process.env.TZ = originalTz
  })

  it('dans la langue de l’interface : jour et année en chiffres, mois en toutes lettres', () => {
    expect(formatDobForDisplay('1941-03-14', 'fr')).toBe('14 mars 1941')
    expect(formatDobForDisplay('1941-03-14', 'en')).toBe('14 March 1941')
  })
  it('date seule formatée en UTC : jamais la veille sous un fuseau négatif (Martinique)', () => {
    process.env.TZ = 'America/Martinique'
    expect(formatDobForDisplay('1941-03-14', 'fr')).toBe('14 mars 1941')
    expect(formatDobForDisplay('1941-03-14', 'en')).toBe('14 March 1941')
  })
  it('premier du mois : « 1er mars 1941 » en français (ordinal), « 1 March 1941 » en anglais, Martinique comprise', () => {
    expect(formatDobForDisplay('1941-03-01', 'fr')).toBe('1er mars 1941')
    expect(formatDobForDisplay('1941-03-01', 'en')).toBe('1 March 1941')
    process.env.TZ = 'America/Martinique'
    expect(new Date('1941-03-01').getDate()).toBe(28) // sentinelle : le processus est bien à UTC−4
    expect(formatDobForDisplay('1941-03-01', 'fr')).toBe('1er mars 1941')
    expect(formatDobForDisplay('1941-03-01', 'en')).toBe('1 March 1941')
  })
  it('valeur vide, impossible ou hors format AAAA-MM-JJ : chaîne vide, jamais « Invalid Date »', () => {
    expect(formatDobForDisplay('', 'fr')).toBe('')
    expect(formatDobForDisplay('1941-02-30', 'fr')).toBe('')
    expect(formatDobForDisplay('14/03/1941', 'en')).toBe('')
  })
})

describe('accès Supabase du profil courrier', () => {
  it('saveLetterProfile : upsert sur user_id, colonnes du schéma seulement, full_name calculé, updated_at posé', async () => {
    const { client, calls } = fakeClient()
    const row = await saveLetterProfile(client, 'user-1', { ...VALID, address_line2: '  ' })
    expect(calls[0].table).toBe('sender_profiles')
    expect(calls[0].op).toBe('upsert')
    expect(calls[0].options).toEqual({ onConflict: 'user_id' })
    const payload = calls[0].payload as Record<string, unknown>
    for (const key of Object.keys(payload)) expect(SENDER_COLUMNS.has(key), `colonne « ${key} » absente`).toBe(true)
    expect(payload).toMatchObject({ user_id: 'user-1', full_name: 'Camille Roussel', address_line2: null })
    expect(typeof payload.updated_at).toBe('string') // posé sur la ligne écrite, pas sur la ligne renvoyée
    expect(row.full_name).toBe('Camille Roussel')
    expect('updated_at' in row).toBe(false)
  })
  it('saveLetterProfile : une erreur Supabase remonte', async () => {
    const { client } = fakeClient([{ error: { message: 'rls' } }])
    await expect(saveLetterProfile(client, 'user-1', VALID)).rejects.toThrow('rls')
  })
  it('fetchLetterProfile : lecture par user_id, colonnes du schéma', async () => {
    const { client, calls } = fakeClient([{ data: { full_name: 'Camille Roussel' } }])
    const row = await fetchLetterProfile(client, 'user-1')
    expect(calls[0].filters).toEqual([['user_id', 'user-1']])
    for (const col of String(calls[0].selectedColumns).split(',').map((c) => c.trim())) expect(SENDER_COLUMNS.has(col), col).toBe(true)
    expect(row).toEqual({ full_name: 'Camille Roussel' })
  })
  it('fetchDossierIdentity : RPC my_dossier_identity, null si aucun dossier', async () => {
    const { client, calls } = fakeClient([{ data: null }])
    expect(await fetchDossierIdentity(client)).toBeNull()
    expect(calls[0].rpc).toBe('my_dossier_identity')
  })
  it('fetchDossierIdentity : dossier existant renvoyé tel quel', async () => {
    const dossier = {
      family_first_name: 'Camille',
      family_last_name: 'Martin',
      deceased_first_name: 'Bernard',
      deceased_last_name: 'Roussel',
      deceased_death_date: '2026-09-12',
    }
    const { client } = fakeClient([{ data: dossier }])
    expect(await fetchDossierIdentity(client)).toEqual(dossier)
  })
  it('fetchDossierIdentity : une erreur RPC remonte', async () => {
    const { client } = fakeClient([{ error: { message: 'rpc-boom' } }])
    await expect(fetchDossierIdentity(client)).rejects.toThrow('rpc-boom')
  })
  it('fetchLatestQuestionnaire : dernière roadmap (triée, limitée à 1) puis son questionnaire', async () => {
    const { client, calls } = fakeClient([{ data: { questionnaire_id: 'q-1' } }, { data: { id: 'q-1', answers: { relation: 'parent' } } }])
    expect(await fetchLatestQuestionnaire(client, 'user-1')).toEqual({ id: 'q-1', answers: { relation: 'parent' } })
    expect(calls.map((c) => c.table)).toEqual(['roadmaps', 'questionnaires'])
    expect(calls[0].order).toEqual(['created_at', { ascending: false }])
    expect(calls[0].limit).toBe(1)
  })
  it('fetchLatestQuestionnaire : aucune roadmap → null', async () => {
    const { client } = fakeClient([{ data: null }])
    expect(await fetchLatestQuestionnaire(client, 'user-1')).toBeNull()
  })
  it('fetchLatestQuestionnaire : roadmap sans questionnaire_id → null', async () => {
    const { client } = fakeClient([{ data: { questionnaire_id: null } }])
    expect(await fetchLatestQuestionnaire(client, 'user-1')).toBeNull()
  })
  it('fetchLatestQuestionnaire : erreur sur la lecture de la roadmap', async () => {
    const { client } = fakeClient([{ error: { message: 'boom-roadmap' } }])
    await expect(fetchLatestQuestionnaire(client, 'user-1')).rejects.toThrow('boom-roadmap')
  })
  it('fetchLatestQuestionnaire : erreur sur la lecture du questionnaire', async () => {
    const { client } = fakeClient([{ data: { questionnaire_id: 'q-1' } }, { error: { message: 'boom-q' } }])
    await expect(fetchLatestQuestionnaire(client, 'user-1')).rejects.toThrow('boom-q')
  })

  describe('saveDeceasedDob (M1 : relit les réponses, ne les reçoit plus en paramètre)', () => {
    it('fusionne deceased_dob dans les réponses RELUES, sans muter l’objet lu, écrit avec select(id)', async () => {
      const originalAnswers = { relation: 'parent' }
      const { client, calls } = fakeClient([{ data: { answers: originalAnswers } }, { data: [{ id: 'q-1' }] }])
      const next = await saveDeceasedDob(client, 'q-1', '1941-03-14')
      expect(next).toEqual({ relation: 'parent', deceased_dob: '1941-03-14' })
      expect(originalAnswers).toEqual({ relation: 'parent' }) // non muté
      expect(calls[0]).toMatchObject({ table: 'questionnaires', op: 'select', filters: [['id', 'q-1']] })
      expect(calls[1]).toMatchObject({ table: 'questionnaires', op: 'update', filters: [['id', 'q-1']], selectedColumns: 'id' })
      expect(calls[1].payload).toEqual({ answers: { relation: 'parent', deceased_dob: '1941-03-14' } })
    })
    it('dob null retire la clé sans toucher au reste', async () => {
      const { client, calls } = fakeClient([{ data: { answers: { relation: 'parent', deceased_dob: '1941-03-14' } } }, { data: [{ id: 'q-1' }] }])
      const next = await saveDeceasedDob(client, 'q-1', null)
      expect(next).toEqual({ relation: 'parent' })
      expect(calls[1].payload).toEqual({ answers: { relation: 'parent' } })
    })
    it('erreur à la lecture des réponses : remonte, aucune écriture tentée', async () => {
      const { client, calls } = fakeClient([{ error: { message: 'read-boom' } }])
      await expect(saveDeceasedDob(client, 'q-1', '1941-03-14')).rejects.toThrow('read-boom')
      expect(calls).toHaveLength(1)
    })
    it('questionnaire introuvable à la lecture : questionnaire_not_found', async () => {
      const { client } = fakeClient([{ data: null }])
      await expect(saveDeceasedDob(client, 'q-1', '1941-03-14')).rejects.toThrow('questionnaire_not_found')
    })
    it('erreur à l’écriture : remonte', async () => {
      const { client } = fakeClient([{ data: { answers: {} } }, { error: { message: 'write-boom' } }])
      await expect(saveDeceasedDob(client, 'q-1', '1941-03-14')).rejects.toThrow('write-boom')
    })
    it('écriture qui ne touche aucune ligne (RLS, id disparu entre-temps) : questionnaire_not_updated', async () => {
      const { client } = fakeClient([{ data: { answers: {} } }, { data: [] }])
      await expect(saveDeceasedDob(client, 'q-1', '1941-03-14')).rejects.toThrow('questionnaire_not_updated')
    })
    it('date inchangée : aucune écriture (une seule requête, la lecture)', async () => {
      const { client, calls } = fakeClient([{ data: { answers: { deceased_dob: '1941-03-14' } } }])
      const next = await saveDeceasedDob(client, 'q-1', '1941-03-14')
      expect(next).toEqual({ deceased_dob: '1941-03-14' })
      expect(calls).toHaveLength(1)
      expect(calls[0].op).toBe('select')
    })
    it('null sur une clé déjà absente : aucune écriture', async () => {
      const { client, calls } = fakeClient([{ data: { answers: { relation: 'parent' } } }])
      const next = await saveDeceasedDob(client, 'q-1', null)
      expect(next).toEqual({ relation: 'parent' })
      expect(calls).toHaveLength(1)
    })
  })

  describe('patchQuestionnaireAnswers (M4 : patron générique derrière saveDeceasedDob)', () => {
    it('plusieurs clés à la fois : les deux appliquées, le reste des réponses relues est conservé', async () => {
      const { client, calls } = fakeClient([
        { data: { answers: { relation: 'parent', deceased_department: '33' } } },
        { data: [{ id: 'q-1' }] },
      ])
      const next = await patchQuestionnaireAnswers(client, 'q-1', { deceased_department: '75', deceased_dob: '1941-03-14' })
      expect(next).toEqual({ relation: 'parent', deceased_department: '75', deceased_dob: '1941-03-14' })
      expect(calls[1].payload).toEqual({ answers: { relation: 'parent', deceased_department: '75', deceased_dob: '1941-03-14' } })
    })
    it('une clé déjà présente mais avec une autre valeur : écriture', async () => {
      const { client, calls } = fakeClient([{ data: { answers: { deceased_department: '33' } } }, { data: [{ id: 'q-1' }] }])
      const next = await patchQuestionnaireAnswers(client, 'q-1', { deceased_department: '75' })
      expect(next).toEqual({ deceased_department: '75' })
      expect(calls).toHaveLength(2)
      expect(calls[1].op).toBe('update')
    })
  })
})
