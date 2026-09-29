import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateRoadmap, saveRoadmapToDb } from '@/lib/roadmap-generator'
import { STRINGS_FR } from '@/i18n/strings.fr'
import { STRINGS_EN } from '@/i18n/strings.en'
import type { QuestionnaireAnswersV2 } from '@/types/questionnaire'

// ── Faux Supabase en mémoire ────────────────────────────────────────────
// Le bug : si l'insert des étapes échouait après celui de la roadmap, « Réessayer »
// recréait une roadmap et laissait la première orpheline. Le fake reproduit ce dont
// dépend l'idempotence, sans quoi les tests valideraient une sémantique inexistante
// en base (supabase/migrations/20260701000000_baseline_v1.sql) :
//   - RLS : lecture et insertion limitées à auth.uid() = user_id. Aucune policy
//     UPDATE/DELETE sur roadmaps ni DELETE sur steps : le fake n'offre ni l'un ni
//     l'autre (un nettoyage côté client serait un no-op silencieux en base) ;
//   - clé étrangère steps.roadmap_id → roadmaps(id) ;
//   - un INSERT PostgREST, même multi-lignes, est atomique : tout ou rien ;
//   - maybeSingle() échoue au-delà d'une ligne (PGRST116) ;
//   - pannes injectables : erreur franche (rien n'est écrit) ou réponse perdue
//     (l'écriture est validée en base mais le client reçoit une erreur réseau).

type Row = Record<string, unknown>
type Table = 'roadmaps' | 'steps'
type Op = 'select' | 'insert'
type FailureMode = 'error' | 'lost-response'
type Result = { data: unknown; error: { message: string; code?: string } | null }

const AUTH_UID = 'user-1'

function makeFakeSupabase() {
  const tables: Record<Table, Row[]> = { roadmaps: [], steps: [] }
  const failures: Array<{ table: Table; op: Op; mode: FailureMode }> = []
  let seq = 0

  // id et created_at générés par la base. created_at strictement croissant pour que
  // « la plus récente » soit déterministe ; id décroissant car, comme un UUID aléatoire, il
  // ne suit pas l'ordre d'insertion (un tri par id au lieu de created_at serait détecté).
  function store(table: Table, row: Row): Row {
    seq += 1
    const stored = { id: `${table}-${1_000_000 - seq}`, created_at: new Date(Date.UTC(2026, 8, 29, 0, 0, seq)).toISOString(), ...row }
    tables[table].push(stored)
    return stored
  }

  function takeFailure(table: Table, op: Op) {
    const i = failures.findIndex((f) => f.table === table && f.op === op)
    return i === -1 ? undefined : failures.splice(i, 1)[0]
  }

  function query(table: Table) {
    let op: Op = 'select'
    let payload: Row[] = []
    let columns: string | undefined
    let returning = false
    let cardinality: 'many' | 'single' | 'maybeSingle' = 'many'
    let orderBy: { column: string; ascending: boolean } | undefined
    let max: number | undefined
    const filters: Array<[string, unknown]> = []

    function project(rows: Row[]): Row[] {
      if (!columns || columns === '*') return rows.map((r) => ({ ...r }))
      const cols = columns.split(',').map((c) => c.trim())
      return rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])))
    }

    function shape(rows: Row[]): Result {
      if (cardinality === 'many') return { data: rows, error: null }
      if (rows.length > 1 || (rows.length === 0 && cardinality === 'single')) {
        return { data: null, error: { code: 'PGRST116', message: `JSON object requested, ${rows.length} rows returned` } }
      }
      return { data: rows[0] ?? null, error: null }
    }

    function execute(): Result {
      const failure = takeFailure(table, op)
      if (failure?.mode === 'error') return { data: null, error: { message: 'network error' } }

      if (op === 'insert') {
        // WITH CHECK (auth.uid() = user_id) et clé étrangère, vérifiés sur tout le lot
        if (payload.some((r) => r.user_id !== AUTH_UID)) {
          return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } }
        }
        if (table === 'steps' && payload.some((r) => !tables.roadmaps.some((rm) => rm.id === r.roadmap_id))) {
          return { data: null, error: { code: '23503', message: 'violates foreign key constraint "steps_roadmap_id_fkey"' } }
        }
        const inserted = payload.map((r) => store(table, r))
        if (failure) return { data: null, error: { message: 'network error (écriture validée, réponse perdue)' } }
        return returning ? shape(project(inserted)) : { data: null, error: null }
      }

      let rows = tables[table].filter((r) => r.user_id === AUTH_UID) // USING (auth.uid() = user_id)
      for (const [column, value] of filters) rows = rows.filter((r) => r[column] === value)
      if (orderBy) {
        const { column, ascending } = orderBy
        rows = [...rows].sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1))
      }
      if (max !== undefined) rows = rows.slice(0, max)
      return shape(project(rows))
    }

    const builder = {
      insert(values: Row | Row[]) { op = 'insert'; payload = Array.isArray(values) ? values : [values]; return builder },
      select(cols?: string) { if (op === 'insert') returning = true; columns = cols; return builder },
      eq(column: string, value: unknown) { filters.push([column, value]); return builder },
      order(column: string, opts?: { ascending?: boolean }) { orderBy = { column, ascending: opts?.ascending ?? true }; return builder },
      limit(n: number) { max = n; return builder },
      single() { cardinality = 'single'; return builder },
      maybeSingle() { cardinality = 'maybeSingle'; return builder },
      then(onFulfilled: (v: Result) => unknown, onRejected?: (e: unknown) => unknown) {
        return Promise.resolve().then(execute).then(onFulfilled, onRejected)
      },
    }
    return builder
  }

  return {
    client: { from: (table: Table) => query(table) } as unknown as SupabaseClient,
    /** Programme une panne sur le prochain appel (table, opération). */
    failNext(table: Table, op: Op, mode: FailureMode = 'error') { failures.push({ table, op, mode }) },
    /** Pose une ligne directement en base (état hérité, hors RLS). */
    seed: store,
    /** Contenu d'une table vu côté base (hors RLS). */
    rows: (table: Table) => tables[table],
  }
}

const base: QuestionnaireAnswersV2 = {
  relation: 'parent', deceased_firstname: 'Pierre', deceased_lastname: 'Dupont',
  deceased_dod: '2026-04-10', statut_professionnel: 'sans_activite', logement: ['heberge_ou_autre'],
  enfants: 'aucun', has_notary: true, has_life_insurance: 'non',
  has_vehicle: false, has_credits: false, employait_aide_domicile: false,
  contrat_obseques: 'non', organismes_contactes: [],
  aides_percues: [], abonnements: [],
}
const STEPS = generateRoadmap(base)

describe('saveRoadmapToDb — sauvegarde', () => {
  it('crée une roadmap et ses étapes, rattachées au questionnaire et à l’utilisateur', async () => {
    const db = makeFakeSupabase()
    const id = await saveRoadmapToDb(db.client, 'user-1', 'q-1', STEPS)

    expect(db.rows('roadmaps')).toEqual([
      expect.objectContaining({ id, user_id: 'user-1', questionnaire_id: 'q-1', total_steps: STEPS.length }),
    ])
    const steps = db.rows('steps')
    expect(steps.map((s) => s.template_id)).toEqual(STEPS.map((s) => s.id))
    expect(steps.map((s) => s.display_order)).toEqual(STEPS.map((_, i) => i))
    expect(steps.every((s) => s.roadmap_id === id && s.user_id === 'user-1')).toBe(true)
  })

  it('une roadmap d’un autre questionnaire n’est jamais réutilisée', async () => {
    const db = makeFakeSupabase()
    const previous = await saveRoadmapToDb(db.client, 'user-1', 'q-0', STEPS)
    const id = await saveRoadmapToDb(db.client, 'user-1', 'q-1', STEPS)

    expect(id).not.toBe(previous)
    expect(db.rows('roadmaps').map((r) => r.questionnaire_id)).toEqual(['q-0', 'q-1'])
    expect(db.rows('steps').filter((s) => s.roadmap_id === id)).toHaveLength(STEPS.length)
  })
})

describe('saveRoadmapToDb — idempotence au retry (« Réessayer »)', () => {
  it('échec de l’insert des étapes : le retry complète la même roadmap au lieu d’en créer une seconde', async () => {
    const db = makeFakeSupabase()
    db.failNext('steps', 'insert')
    await expect(saveRoadmapToDb(db.client, 'user-1', 'q-1', STEPS)).rejects.toThrow(STRINGS_FR.errors.saveStepsFailed)
    const [first] = db.rows('roadmaps')
    expect(db.rows('steps')).toHaveLength(0)

    const id = await saveRoadmapToDb(db.client, 'user-1', 'q-1', STEPS)

    expect(id).toBe(first.id)
    expect(db.rows('roadmaps')).toHaveLength(1)
    expect(db.rows('steps')).toHaveLength(STEPS.length)
    expect(db.rows('steps').every((s) => s.roadmap_id === first.id)).toBe(true)
  })

  it('réponse perdue après l’insert des étapes : le retry ne les duplique pas', async () => {
    const db = makeFakeSupabase()
    db.failNext('steps', 'insert', 'lost-response')
    await expect(saveRoadmapToDb(db.client, 'user-1', 'q-1', STEPS)).rejects.toThrow(STRINGS_FR.errors.saveStepsFailed)

    const id = await saveRoadmapToDb(db.client, 'user-1', 'q-1', STEPS)

    expect(db.rows('roadmaps')).toEqual([expect.objectContaining({ id })])
    expect(db.rows('steps')).toHaveLength(STEPS.length)
  })

  it('réponse perdue après l’insert de la roadmap : le retry la retrouve et y rattache les étapes', async () => {
    const db = makeFakeSupabase()
    db.failNext('roadmaps', 'insert', 'lost-response')
    await expect(saveRoadmapToDb(db.client, 'user-1', 'q-1', STEPS)).rejects.toThrow(STRINGS_FR.errors.saveRoadmapFailed)

    const id = await saveRoadmapToDb(db.client, 'user-1', 'q-1', STEPS)

    expect(db.rows('roadmaps')).toEqual([expect.objectContaining({ id })])
    expect(db.rows('steps')).toHaveLength(STEPS.length)
    expect(db.rows('steps').every((s) => s.roadmap_id === id)).toBe(true)
  })

  it('recherche de la roadmap existante en échec : rien n’est créé à l’aveugle', async () => {
    const db = makeFakeSupabase()
    db.failNext('roadmaps', 'select')

    await expect(saveRoadmapToDb(db.client, 'user-1', 'q-1', STEPS, 'en')).rejects.toThrow(STRINGS_EN.errors.saveRoadmapFailed)
    expect(db.rows('roadmaps')).toHaveLength(0)
    expect(db.rows('steps')).toHaveLength(0)
  })

  it('vérification des étapes déjà sauvegardées en échec : aucune étape insérée à l’aveugle', async () => {
    const db = makeFakeSupabase()
    db.failNext('steps', 'insert')
    await expect(saveRoadmapToDb(db.client, 'user-1', 'q-1', STEPS)).rejects.toThrow(STRINGS_FR.errors.saveStepsFailed)
    db.failNext('steps', 'select')

    await expect(saveRoadmapToDb(db.client, 'user-1', 'q-1', STEPS)).rejects.toThrow(STRINGS_FR.errors.saveStepsFailed)
    expect(db.rows('roadmaps')).toHaveLength(1)
    expect(db.rows('steps')).toHaveLength(0)
  })

  it('étapes d’une roadmap précédente : le retry d’un nouveau questionnaire insère quand même les siennes', async () => {
    const db = makeFakeSupabase()
    await saveRoadmapToDb(db.client, 'user-1', 'q-0', STEPS) // questionnaire refait depuis l'accueil
    db.failNext('steps', 'insert')
    await expect(saveRoadmapToDb(db.client, 'user-1', 'q-1', STEPS)).rejects.toThrow(STRINGS_FR.errors.saveStepsFailed)

    const id = await saveRoadmapToDb(db.client, 'user-1', 'q-1', STEPS)

    expect(db.rows('steps').filter((s) => s.roadmap_id === id)).toHaveLength(STEPS.length)
  })

  it('deux roadmaps pour le même questionnaire (course au retry) : réutilise la plus récente, comme le dashboard', async () => {
    const db = makeFakeSupabase()
    // 1er essai validé après le lancement du retry : resté sans étapes
    db.seed('roadmaps', { user_id: 'user-1', questionnaire_id: 'q-1', total_steps: STEPS.length })
    const latest = db.seed('roadmaps', { user_id: 'user-1', questionnaire_id: 'q-1', total_steps: STEPS.length })
    STEPS.forEach((s, i) => db.seed('steps', { roadmap_id: latest.id, user_id: 'user-1', template_id: s.id, display_order: i }))

    const id = await saveRoadmapToDb(db.client, 'user-1', 'q-1', STEPS)

    expect(id).toBe(latest.id)
    expect(db.rows('roadmaps')).toHaveLength(2)
    expect(db.rows('steps')).toHaveLength(STEPS.length)
  })
})
