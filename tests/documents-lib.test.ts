import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import {
  logStepAction,
  markStepSent,
  fetchSentStepIds,
  fetchUserDocuments,
  deleteDocument,
  saveLetterDocument,
} from '@/lib/documents'

// ── Colonnes réelles extraites de la baseline (source canonique vivante) ─
// Le bug d'origine : le client interrogeait des colonnes fantômes
// (action_type, action_date, document_type). Ces tests garantissent que
// tout payload/filtre envoyé à Supabase référence des colonnes du schéma.

const SCHEMA = readFileSync(path.resolve(__dirname, '../supabase/migrations/20260701000000_baseline_v1.sql'), 'utf8')

function tableColumns(table: string): Set<string> {
  const m = SCHEMA.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\);`))
  if (!m) throw new Error(`table ${table} introuvable dans la baseline (supabase/migrations/20260701000000_baseline_v1.sql)`)
  const cols = new Set<string>()
  for (const line of m[1].split('\n')) {
    // les colonnes commencent par un identifiant minuscule ; les contraintes (CHECK, …) par un mot-clé majuscule
    const word = line.trim().match(/^([a-z_]+)\s/)?.[1]
    if (word) cols.add(word)
  }
  return cols
}

const STEP_ACTION_COLS = tableColumns('step_actions')
const DOCUMENT_COLS = tableColumns('documents')

// ── Faux client Supabase : enregistre les appels, rejoue des réponses ───

interface RecordedCall {
  table: string
  op: 'select' | 'insert' | 'update' | 'delete' | null
  payload?: Record<string, unknown>
  select?: string
  filters: Array<{ method: string; column: string; value: unknown }>
}

function makeFakeClient(responses: Array<{ data?: unknown; error?: unknown }> = []) {
  const calls: RecordedCall[] = []
  const client = {
    from(table: string) {
      const rec: RecordedCall = { table, op: null, filters: [] }
      calls.push(rec)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        insert(payload: Record<string, unknown>) { rec.op = 'insert'; rec.payload = payload; return builder },
        update(payload: Record<string, unknown>) { rec.op = 'update'; rec.payload = payload; return builder },
        select(cols?: string) { rec.op = rec.op ?? 'select'; rec.select = cols; return builder },
        delete() { rec.op = 'delete'; return builder },
        eq(column: string, value: unknown) { rec.filters.push({ method: 'eq', column, value }); return builder },
        in(column: string, value: unknown) { rec.filters.push({ method: 'in', column, value }); return builder },
        order() { return builder },
        maybeSingle() { return builder },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          const res = responses.shift() ?? {}
          return Promise.resolve({ data: res.data ?? null, error: res.error ?? null }).then(resolve, reject)
        },
      }
      return builder
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, calls }
}

function expectColumnsExist(keys: string[], cols: Set<string>) {
  for (const key of keys) {
    expect(cols.has(key), `colonne « ${key} » absente du schéma`).toBe(true)
  }
}

// ── step_actions ─────────────────────────────────────────────────────────

describe('logStepAction', () => {
  it('insère dans step_actions avec uniquement des colonnes du schéma', async () => {
    const { client, calls } = makeFakeClient()
    await logStepAction(client, 'step-1', 'user-1', 'copied')
    expect(calls).toHaveLength(1)
    expect(calls[0].table).toBe('step_actions')
    expect(calls[0].op).toBe('insert')
    expectColumnsExist(Object.keys(calls[0].payload!), STEP_ACTION_COLS)
    expect(calls[0].payload).toMatchObject({ step_id: 'step-1', user_id: 'user-1', type: 'copied' })
  })

  it("n'échoue pas si l'insert échoue (non bloquant)", async () => {
    const { client } = makeFakeClient([{ error: { message: 'boom' } }])
    await expect(logStepAction(client, 'step-1', 'user-1', 'downloaded')).resolves.toBeUndefined()
  })
})

describe('markStepSent', () => {
  it('insère type=sent et sent_date (colonnes du schéma uniquement)', async () => {
    const { client, calls } = makeFakeClient()
    const { error } = await markStepSent(client, {
      stepId: 'step-1',
      userId: 'user-1',
      sentDate: '2026-07-16',
      note: 'envoyé par LRAR',
    })
    expect(error).toBeNull()
    expect(calls[0].table).toBe('step_actions')
    expect(calls[0].op).toBe('insert')
    expectColumnsExist(Object.keys(calls[0].payload!), STEP_ACTION_COLS)
    expect(calls[0].payload).toMatchObject({
      step_id: 'step-1',
      user_id: 'user-1',
      type: 'sent',
      sent_date: '2026-07-16',
      note: 'envoyé par LRAR',
    })
  })

  it('remonte l’erreur Supabase au composant', async () => {
    const { client } = makeFakeClient([{ error: { message: 'boom' } }])
    const { error } = await markStepSent(client, { stepId: 's', userId: 'u', sentDate: '2026-07-16', note: null })
    expect(error).toBeTruthy()
  })
})

describe('fetchSentStepIds', () => {
  it('filtre sur la colonne type (pas action_type) et renvoie un Set', async () => {
    const { client, calls } = makeFakeClient([{ data: [{ step_id: 'a' }, { step_id: 'b' }] }])
    const sent = await fetchSentStepIds(client, 'user-1', ['a', 'b', 'c'])
    expect(sent).toEqual(new Set(['a', 'b']))
    expect(calls[0].table).toBe('step_actions')
    expectColumnsExist(calls[0].filters.map((f) => f.column), STEP_ACTION_COLS)
    expect(calls[0].filters).toContainEqual({ method: 'eq', column: 'type', value: 'sent' })
  })

  it('ne requête pas si la liste des steps est vide', async () => {
    const { client, calls } = makeFakeClient()
    const sent = await fetchSentStepIds(client, 'user-1', [])
    expect(sent.size).toBe(0)
    expect(calls).toHaveLength(0)
  })
})

// ── documents ────────────────────────────────────────────────────────────

describe('fetchUserDocuments', () => {
  it('ne référence aucune colonne fantôme et filtre sur user_id', async () => {
    const rows = [{ id: 'd1', title: 'T', content: 'C', step_id: 's1', created_at: '2026-07-16', steps: null }]
    const { client, calls } = makeFakeClient([{ data: rows }])
    const docs = await fetchUserDocuments(client, 'user-1')
    expect(docs).toEqual(rows)
    expect(calls[0].table).toBe('documents')
    expect(calls[0].select).not.toContain('document_type')
    expectColumnsExist(calls[0].filters.map((f) => f.column), DOCUMENT_COLS)
  })

  it('jette en cas d’erreur Supabase', async () => {
    const { client } = makeFakeClient([{ error: { message: 'boom' } }])
    await expect(fetchUserDocuments(client, 'user-1')).rejects.toBeTruthy()
  })
})

describe('deleteDocument', () => {
  it('supprime par id et jette en cas d’erreur', async () => {
    const { client, calls } = makeFakeClient()
    await deleteDocument(client, 'doc-1')
    expect(calls[0]).toMatchObject({ table: 'documents', op: 'delete' })
    expect(calls[0].filters).toContainEqual({ method: 'eq', column: 'id', value: 'doc-1' })

    const { client: failing } = makeFakeClient([{ error: { message: 'boom' } }])
    await expect(deleteDocument(failing, 'doc-1')).rejects.toBeTruthy()
  })
})

describe('saveLetterDocument', () => {
  const doc = {
    userId: 'user-1',
    stepId: 'step-1',
    letterTemplateId: 'banque-declaration-deces',
    title: 'Déclaration de décès — Banque',
    content: 'Madame, Monsieur, …',
  }

  it('insère un nouveau document quand aucun n’existe pour (step, template)', async () => {
    const { client, calls } = makeFakeClient([{ data: null }, {}])
    await saveLetterDocument(client, doc)
    expect(calls).toHaveLength(2)
    expect(calls[1].op).toBe('insert')
    expectColumnsExist(Object.keys(calls[1].payload!), DOCUMENT_COLS)
    expect(calls[1].payload).toMatchObject({
      user_id: 'user-1',
      step_id: 'step-1',
      letter_template_id: 'banque-declaration-deces',
      title: doc.title,
      content: doc.content,
    })
  })

  it('met à jour le document existant (pas de doublon à chaque copie)', async () => {
    const { client, calls } = makeFakeClient([{ data: { id: 'doc-9' } }, {}])
    await saveLetterDocument(client, doc)
    expect(calls).toHaveLength(2)
    expect(calls[1].op).toBe('update')
    expectColumnsExist(Object.keys(calls[1].payload!), DOCUMENT_COLS)
    expect(calls[1].payload).toMatchObject({ title: doc.title, content: doc.content })
    expect(calls[1].filters).toContainEqual({ method: 'eq', column: 'id', value: 'doc-9' })
  })
})

// ── Invariant : plus jamais de drift silencieux ──────────────────────────
// Tout accès aux tables documents/step_actions passe par src/lib/documents.ts,
// et aucune colonne fantôme ne subsiste dans src/.

describe('invariant anti-drift', () => {
  const srcDir = path.resolve(__dirname, '../src')
  const sources = readdirSync(srcDir, { recursive: true })
    .map(String)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => ({ file: f, text: readFileSync(path.join(srcDir, f), 'utf8') }))

  it("from('documents') et from('step_actions') n'apparaissent que dans lib/documents.ts", () => {
    for (const { file, text } of sources) {
      if (file === path.join('lib', 'documents.ts')) continue
      expect(/from\(['"](documents|step_actions)['"]\)/.test(text), `accès direct dans ${file}`).toBe(false)
    }
  })

  it('aucune colonne fantôme (action_type, action_date, document_type) dans src/', () => {
    for (const { file, text } of sources) {
      const match = text.match(/\b(action_type|action_date|document_type)\b/)
      expect(match, `colonne fantôme « ${match?.[0]} » dans ${file}`).toBeNull()
    }
  })
})
