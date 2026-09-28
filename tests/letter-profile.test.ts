import { describe, it, expect } from 'vitest'
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
  type LetterProfileInput,
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

interface Call { table?: string; rpc?: string; op?: string; payload?: unknown; options?: unknown; filters: Array<[string, unknown]> }

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
        select(cols: string) { call.op = call.op ?? 'select'; call.payload = cols; return b },
        upsert(payload: unknown, options: unknown) { call.op = 'upsert'; call.payload = payload; call.options = options; return b },
        update(payload: unknown) { call.op = 'update'; call.payload = payload; return b },
        eq(col: string, val: unknown) { call.filters.push([col, val]); return b },
        order() { return b },
        limit() { return b },
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
    expect(validateLetterProfile({ ...VALID, first_name: 'x'.repeat(23), last_name: 'y'.repeat(23) }).last_name).toBe('fullNameTooLong')
  })
  it('date de naissance facultative, réelle, antérieure au décès', () => {
    expect(validateLetterProfile(VALID, { value: '', max: '2026-09-12' })).toEqual({})
    expect(validateLetterProfile(VALID, { value: '1941-03-14', max: '2026-09-12' })).toEqual({})
    expect(validateLetterProfile(VALID, { value: '1941-02-30', max: '2026-09-12' }).deceased_dob).toBe('dobInvalid')
    expect(validateLetterProfile(VALID, { value: '2026-09-13', max: '2026-09-12' }).deceased_dob).toBe('dobOutOfRange')
    expect(validateLetterProfile(VALID, { value: '1899-12-31', max: null }).deceased_dob).toBe('dobOutOfRange')
  })
})

describe('accès Supabase du profil courrier', () => {
  it('saveLetterProfile : upsert sur user_id, colonnes du schéma seulement, full_name calculé', async () => {
    const { client, calls } = fakeClient()
    const row = await saveLetterProfile(client, 'user-1', { ...VALID, address_line2: '  ' })
    expect(calls[0].table).toBe('sender_profiles')
    expect(calls[0].op).toBe('upsert')
    expect(calls[0].options).toEqual({ onConflict: 'user_id' })
    const payload = calls[0].payload as Record<string, unknown>
    for (const key of Object.keys(payload)) expect(SENDER_COLUMNS.has(key), `colonne « ${key} » absente`).toBe(true)
    expect(payload).toMatchObject({ user_id: 'user-1', full_name: 'Camille Roussel', address_line2: null })
    expect(row.full_name).toBe('Camille Roussel')
  })
  it('saveLetterProfile : une erreur Supabase remonte', async () => {
    const { client } = fakeClient([{ error: { message: 'rls' } }])
    await expect(saveLetterProfile(client, 'user-1', VALID)).rejects.toThrow('rls')
  })
  it('fetchLetterProfile : lecture par user_id, colonnes du schéma', async () => {
    const { client, calls } = fakeClient([{ data: { full_name: 'Camille Roussel' } }])
    const row = await fetchLetterProfile(client, 'user-1')
    expect(calls[0].filters).toEqual([['user_id', 'user-1']])
    for (const col of String(calls[0].payload).split(',').map((c) => c.trim())) expect(SENDER_COLUMNS.has(col), col).toBe(true)
    expect(row).toEqual({ full_name: 'Camille Roussel' })
  })
  it('fetchDossierIdentity : RPC my_dossier_identity, null si aucun dossier', async () => {
    const { client, calls } = fakeClient([{ data: null }])
    expect(await fetchDossierIdentity(client)).toBeNull()
    expect(calls[0].rpc).toBe('my_dossier_identity')
  })
  it('fetchLatestQuestionnaire : dernière roadmap puis son questionnaire', async () => {
    const { client, calls } = fakeClient([{ data: { questionnaire_id: 'q-1' } }, { data: { id: 'q-1', answers: { relation: 'parent' } } }])
    expect(await fetchLatestQuestionnaire(client, 'user-1')).toEqual({ id: 'q-1', answers: { relation: 'parent' } })
    expect(calls.map((c) => c.table)).toEqual(['roadmaps', 'questionnaires'])
  })
  it('saveDeceasedDob : fusionne ou retire deceased_dob sans toucher au reste', async () => {
    const { client, calls } = fakeClient()
    const next = await saveDeceasedDob(client, 'q-1', { relation: 'parent' }, '1941-03-14')
    expect(next).toEqual({ relation: 'parent', deceased_dob: '1941-03-14' })
    expect(calls[0]).toMatchObject({ table: 'questionnaires', op: 'update', filters: [['id', 'q-1']] })
    const cleared = await saveDeceasedDob(client, 'q-1', next, null)
    expect(cleared).toEqual({ relation: 'parent' })
  })
})
