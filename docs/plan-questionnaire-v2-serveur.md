# Questionnaire v2 — Plan 2 : serveur, rédacteur LLM, frontend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Brancher le moteur v2 (livré au Plan 1) sur de vraies routes Express avec sessions persistées et rédacteur LLM à fallback, puis recâbler le frontend (options `{value,label}`, tri-état, écran récapitulatif) — l'agent Mistral conversationnel du questionnaire disparaît.

**Architecture:** Le serveur possède le flux (`nextQuestion`/`setAnswer`) et les données (table `questionnaire_sessions`, RLS). Le LLM ne fait que rédiger les textes (`question-writer.js`, timeout 3 s → `fallback_text`). Router Express en factory à dépendances injectées (testable via supertest). Frontend : mêmes écrans + `RecapScreen`, `QuestionCard` passe aux options canoniques `{value,label}` et au type `tristate`. Spec : `docs/design-questionnaire-v2.md`.

**Tech Stack:** Express (router factory), Supabase (table sessions + RLS), Mistral `chat.complete` + `responseFormat json_object` (modèle `MISTRAL_MODEL`, défaut `mistral-small-latest`), Vitest + supertest (nouveau devDep), React/TS côté src/.

**Périmètre :** phases 0 (réduite à la table sessions), 3, 4 du spec + premières actions techniques de la revue finale du Plan 1. **Hors périmètre** (décisions du 2026-07-08) : le produit transmission (`DemoPage`/`AccessPage`/routes `/api/demo/*` et `/api/transmission/*` — conserve l'ancien agent `MISTRAL_AGENT_ID`, sa `Map()` de sessions et `buildContextPrompt`) ; le lot éditorial ~13 étapes (Plan 3, données pures) ; l'outillage complet Supabase CLI (chantier 1 de `docs/plan-points-attention.md`, indépendant).

**Fait établi (exploration)** : l'UI actuelle envoie le **label** de l'option comme réponse (options `string[]`). Le v2 impose `{value, label}` : afficher le label, soumettre la value. C'est LE point d'intégration critique frontend.

---

### Task 0 : Branche + commit des documents en attente

**Files:** aucun nouveau.

- [ ] **Step 1 : Créer la branche et commiter les édits de spec en attente**

```bash
cd /Users/arnaudgay/Documents/git/Seren/Application
git checkout -b feat/questionnaire-v2-serveur
git add docs/design-questionnaire-v2.md docs/plan-questionnaire-v2-serveur.md .claude/launch.json
git commit -m "docs: plan 2 (serveur/frontend) + corrections spec (transmission hors périmètre, route /reask)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 2 : Vérifier** — `git status --short` → vide ; `npm test` → 42 passed.

---

### Task 1 : Quick wins de la revue finale (couche pure)

**Files:**
- Modify: `tests/invariants.test.ts` (invariant de parité des valeurs)
- Modify: `server/lib/questionnaire-engine.js` (longueur du texte trimé)
- Modify: `tests/questionnaire-engine.test.ts` (+1 test)

- [ ] **Step 1 : Écrire l'invariant de parité des valeurs (doit passer — c'est un garde-fou)**

Dans `tests/invariants.test.ts`, ajouter à la fin du describe `'invariant : pas de question morte, pas d'étape orpheline'` :

```typescript
  it('chaque valeur de condition en tableau est une option valide de la question du même champ', () => {
    const TRISTATE_VALUES = ['oui', 'non', 'ne_sait_pas']
    const byId = Object.fromEntries(
      QUESTIONS_CATALOG.map((q: { id: string }) => [q.id, q])
    ) as Record<string, { type: string; options?: { value: string }[] }>
    const allSpecs = [
      ...STEPS_CATALOG.map((s) => ({ kind: 'étape', id: s.id, when: s.applicable_when as Record<string, unknown> })),
      ...QUESTIONS_CATALOG.map((q: { id: string; applicable_when: Record<string, unknown> }) => ({ kind: 'question', id: q.id, when: q.applicable_when })),
    ]
    for (const { kind, id, when } of allSpecs) {
      for (const [key, cond] of Object.entries(when ?? {})) {
        if (!Array.isArray(cond)) continue
        const question = byId[key]
        const validValues = question?.options
          ? question.options.map((o) => o.value)
          : question?.type === 'tristate'
            ? TRISTATE_VALUES
            : null
        expect(validValues, `${kind} ${id} : champ "${key}" sans options ni tristate`).not.toBeNull()
        for (const v of cond) {
          expect(validValues, `${kind} ${id} : valeur "${v}" inconnue pour "${key}"`).toContain(v)
        }
      }
    }
  })
```

- [ ] **Step 2 : Vérifier qu'il passe ET qu'il mord**

Run: `npm test` → 43 passed.
Puis mutation : dans `src/data/steps-catalog.ts`, remplacer temporairement `statut_professionnel: ['salarie', 'fonctionnaire']` par `['salarie', 'fonctionnaireX']` → `npm test` doit échouer avec `valeur "fonctionnaireX" inconnue`. Restaurer : `git checkout -- src/data/steps-catalog.ts`. Re-run → 43 passed.

- [ ] **Step 3 : Test rouge — longueur du texte trimé**

Dans `tests/questionnaire-engine.test.ts`, describe `validateAnswer`, ajouter :

```typescript
  it('text : la longueur est vérifiée sur la valeur trimée', () => {
    expect(validateAnswer(spec('deceased_firstname'), 'x'.repeat(195) + '          ').ok).toBe(true)
  })
```

Run: `npm test` → FAIL (205 caractères non trimés > 200).

- [ ] **Step 4 : Corriger le case 'text' dans `server/lib/questionnaire-engine.js`**

Remplacer :
```javascript
    case 'text': {
      if (typeof value !== 'string' || value.trim().length === 0) return fail('Texte requis')
      return value.length <= TEXT_MAX ? { ok: true } : fail(`Maximum ${TEXT_MAX} caractères`)
    }
```
par :
```javascript
    case 'text': {
      if (typeof value !== 'string') return fail('Texte requis')
      const trimmed = value.trim()
      if (trimmed.length === 0) return fail('Texte requis')
      return trimmed.length <= TEXT_MAX ? { ok: true } : fail(`Maximum ${TEXT_MAX} caractères`)
    }
```

- [ ] **Step 5 : Vérifier** — `npm test` → 44 passed ; `node --check server/lib/questionnaire-engine.js` → OK.

- [ ] **Step 6 : Commit**

```bash
git add tests/invariants.test.ts tests/questionnaire-engine.test.ts server/lib/questionnaire-engine.js
git commit -m "test(questionnaire-v2): parité des valeurs inter-catalogues + longueur trimée

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2 : Sessions persistées (migration + store)

**Files:**
- Create: `supabase/migrations/20260708120000_questionnaire_sessions.sql`
- Create: `server/lib/sessions-store.js`
- Test: `tests/sessions-store.test.ts`

- [ ] **Step 1 : Écrire la migration**

`supabase/migrations/20260708120000_questionnaire_sessions.sql` :
```sql
-- Sessions du questionnaire v2 : remplace la Map() en mémoire pour CE flux.
-- Le produit transmission (/api/demo/*) reste sur la Map en mémoire — hors périmètre.
-- État = uniquement { answers } : le moteur (nextQuestion) reconstruit tout le reste.

create table if not exists questionnaire_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  answers     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '24 hours'
);

alter table questionnaire_sessions enable row level security;

create policy "own sessions" on questionnaire_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists questionnaire_sessions_user_idx
  on questionnaire_sessions (user_id);
```

- [ ] **Step 2 : ⚠️ USER STEP — appliquer la migration**

Le propriétaire du projet applique ce SQL dans le **SQL Editor Supabase** (ou `supabase db push` si le CLI est configuré un jour). Si le projet Supabase est en pause (plan gratuit inactif), le réveiller d'abord sur supabase.com. **L'exécuteur signale ce step au contrôleur et continue** : les tests de cette task n'ont pas besoin de la vraie BDD (client fake), seule la Task 8 (vérif navigateur) en dépend.

- [ ] **Step 3 : Tests rouges du store**

`tests/sessions-store.test.ts` :
```typescript
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
  it('createSession insère user_id et retourne la ligne', async () => {
    const row = { id: 'abc', user_id: 'u1', answers: {} }
    const { client, calls } = fakeClient({ data: row, error: null })
    const session = await createSession(client, 'u1')
    expect(session).toEqual(row)
    expect(calls).toContainEqual(['from', ['questionnaire_sessions']])
    expect(calls).toContainEqual(['insert', [{ user_id: 'u1' }]])
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
})
```

Run: `npm test` → FAIL (module inexistant).

- [ ] **Step 4 : Implémenter le store**

`server/lib/sessions-store.js` :
```javascript
// Persistance des sessions du questionnaire v2 (table questionnaire_sessions).
// Toutes les fonctions prennent le client Supabase AUTHENTIFIÉ de la requête
// (req.supabaseClient) : la RLS garantit l'isolation par utilisateur.
// Une session expirée est invisible (filtre expires_at) ; cleanup paresseux côté BDD.

const TABLE = 'questionnaire_sessions'

export async function createSession(client, userId) {
  const { data, error } = await client.from(TABLE).insert({ user_id: userId }).select().single()
  if (error || !data) throw new Error(`Création de session impossible : ${error?.message ?? 'réponse vide'}`)
  return data
}

export async function loadSession(client, sessionId) {
  const { data, error } = await client
    .from(TABLE)
    .select('*')
    .eq('id', sessionId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (error) throw new Error(`Lecture de session impossible : ${error.message}`)
  return data // null si absente, expirée, ou pas à cet utilisateur (RLS)
}

export async function saveAnswers(client, sessionId, answers) {
  const { error } = await client
    .from(TABLE)
    .update({ answers, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
  if (error) throw new Error(`Sauvegarde de session impossible : ${error.message}`)
}

export async function deleteSession(client, sessionId) {
  const { error } = await client.from(TABLE).delete().eq('id', sessionId)
  if (error) throw new Error(`Suppression de session impossible : ${error.message}`)
}
```

- [ ] **Step 5 : Vérifier** — `npm test` → 48 passed ; `node --check server/lib/sessions-store.js` → OK.

- [ ] **Step 6 : Commit**

```bash
git add supabase/migrations/20260708120000_questionnaire_sessions.sql server/lib/sessions-store.js tests/sessions-store.test.ts
git commit -m "feat(questionnaire-v2): sessions persistées Supabase (migration + store RLS)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3 : Rédacteur LLM (prompt versionné + fallback garanti)

**Files:**
- Create: `server/lib/writer-prompt.js`
- Create: `server/lib/question-writer.js`
- Test: `tests/question-writer.test.ts`

- [ ] **Step 1 : Écrire le prompt versionné**

`server/lib/writer-prompt.js` :
```javascript
// Prompt système du rédacteur — versionné dans le repo (remplace l'agent console Mistral).
// Le rédacteur ne produit QUE du texte d'affichage : jamais d'options, jamais de données.

export const WRITER_SYSTEM_PROMPT = `Tu es le rédacteur de Seren, plateforme qui accompagne les proches d'une personne décédée dans leurs démarches administratives.

TON RÔLE : rédiger UNE question de questionnaire, avec empathie et naturel. Tu ne décides RIEN : le champ demandé, son type et ses options te sont imposés par le système. Tu rédiges uniquement le texte affiché.

TON ET POSTURE :
- Empathique et bienveillant : l'utilisateur traverse une épreuve. Chaleureux sans condescendance.
- Professionnel et rassurant : explique brièvement pourquoi la question est utile.
- Naturel : une vraie conversation, pas un formulaire administratif.
- Jamais anxiogène : les démarches sont des étapes normales et gérables.
- Personnalise avec le prénom du défunt quand il est fourni.

CONTRAINTES ABSOLUES :
- UNE seule question, courte.
- Ne JAMAIS lister ni reformuler les options de réponse (l'interface les affiche).
- Ne JAMAIS demander autre chose que le champ imposé.
- Réponds UNIQUEMENT en JSON : {"question": "…", "aide": "…"} — "aide" est optionnelle (1 phrase max).`

/** Construit les messages du rédacteur : contexte court et constant (~400 tokens), jamais d'historique. */
export function buildWriterMessages(spec, context) {
  const parts = [
    `Champ à demander : ${spec.id} (type ${spec.type}).`,
    context.prenom ? `Prénom du défunt : ${context.prenom}.` : 'Prénom du défunt inconnu pour l’instant.',
    context.relation ? `Lien de l’utilisateur avec le défunt : ${context.relation}.` : '',
    context.derniereQuestion !== undefined && context.derniereReponse !== undefined
      ? `Question précédente : « ${context.derniereQuestion} » — réponse donnée : ${JSON.stringify(context.derniereReponse)}. Tu peux ouvrir par une courte transition qui en tient compte.`
      : '',
    spec.writer_hints ? `Contexte métier à glisser si pertinent : ${spec.writer_hints}` : '',
    `Formulation de référence (à améliorer, pas à copier) : « ${spec.fallback_text.question} »`,
  ].filter(Boolean)
  return [
    { role: 'system', content: WRITER_SYSTEM_PROMPT },
    { role: 'user', content: parts.join('\n') },
  ]
}
```

- [ ] **Step 2 : Tests rouges du writer**

`tests/question-writer.test.ts` :
```typescript
import { describe, it, expect } from 'vitest'
// @ts-expect-error — module JS serveur
import { writeQuestionText, interpolateFallback } from '../server/lib/question-writer.js'

const SPEC = {
  id: 'deceased_dod',
  type: 'date',
  fallback_text: {
    question: 'À quelle date {prenom} est-il/elle décédé(e) ?',
    aide: 'Cette date nous permet de calculer les délais légaux.',
  },
}
const CTX = { prenom: 'Pierre', relation: 'conjoint_marie' }

/** Fake client Mistral : renvoie `content` après `delayMs`, ou rejette si content === REJECT. */
const REJECT = Symbol('reject')
function fakeMistral(content: unknown, delayMs = 0) {
  return {
    chat: {
      complete: () =>
        new Promise((resolve, reject) =>
          setTimeout(() => {
            if (content === REJECT) reject(new Error('réseau'))
            else resolve({ choices: [{ message: { content } }] })
          }, delayMs)
        ),
    },
  }
}

describe('interpolateFallback', () => {
  it('remplace {prenom}, avec repli « votre proche »', () => {
    expect(interpolateFallback(SPEC, 'Pierre').question).toContain('Pierre')
    expect(interpolateFallback(SPEC, undefined).question).toContain('votre proche')
  })
})

describe('writeQuestionText', () => {
  it('utilise le texte du LLM quand la sortie est valide', async () => {
    const mistral = fakeMistral(JSON.stringify({ question: 'Quand Pierre vous a-t-il quittés ?', aide: 'Pour les délais.' }))
    const out = await writeQuestionText({ spec: SPEC, context: CTX, mistral, model: 'test' })
    expect(out.source).toBe('llm')
    expect(out.question).toBe('Quand Pierre vous a-t-il quittés ?')
    expect(out.aide).toBe('Pour les délais.')
  })
  it('fallback si timeout dépassé', async () => {
    const mistral = fakeMistral(JSON.stringify({ question: 'Trop tard…………' }), 100)
    const out = await writeQuestionText({ spec: SPEC, context: CTX, mistral, model: 'test', timeoutMs: 10 })
    expect(out.source).toBe('fallback')
    expect(out.question).toContain('Pierre')
  })
  it('fallback si JSON invalide', async () => {
    const out = await writeQuestionText({ spec: SPEC, context: CTX, mistral: fakeMistral('pas du json'), model: 'test' })
    expect(out.source).toBe('fallback')
  })
  it('fallback si champ question manquant ou trop court', async () => {
    expect((await writeQuestionText({ spec: SPEC, context: CTX, mistral: fakeMistral(JSON.stringify({ aide: 'x' })), model: 'test' })).source).toBe('fallback')
    expect((await writeQuestionText({ spec: SPEC, context: CTX, mistral: fakeMistral(JSON.stringify({ question: 'court' })), model: 'test' })).source).toBe('fallback')
  })
  it('fallback si erreur réseau', async () => {
    const out = await writeQuestionText({ spec: SPEC, context: CTX, mistral: fakeMistral(REJECT), model: 'test' })
    expect(out.source).toBe('fallback')
  })
  it('fallback si aucun client fourni', async () => {
    const out = await writeQuestionText({ spec: SPEC, context: CTX, mistral: null, model: 'test' })
    expect(out.source).toBe('fallback')
  })
})
```

Run: `npm test` → FAIL (module inexistant).

- [ ] **Step 3 : Implémenter le writer**

`server/lib/question-writer.js` :
```javascript
// Rédacteur LLM du questionnaire v2 — SEUL point de contact IA de ce flux.
// Garantie structurelle : ne bloque JAMAIS le questionnaire. Timeout, erreur réseau,
// JSON invalide ou champ manquant → fallback_text interpolé du catalogue.
import { buildWriterMessages } from './writer-prompt.js'

const DEFAULT_TIMEOUT_MS = 3000
const MIN_QUESTION_LENGTH = 10

/** Interpole {prenom} dans les textes de secours du catalogue. */
export function interpolateFallback(spec, prenom) {
  const p = prenom || 'votre proche'
  return {
    question: spec.fallback_text.question.replaceAll('{prenom}', p),
    aide: spec.fallback_text.aide?.replaceAll('{prenom}', p),
  }
}

/**
 * Rédige le texte d'une question via Mistral.
 * @returns {Promise<{ question: string, aide?: string, source: 'llm'|'fallback' }>}
 */
export async function writeQuestionText({ spec, context, mistral, model, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const fallback = { ...interpolateFallback(spec, context.prenom), source: 'fallback' }
  if (!mistral) return fallback
  try {
    const completion = await Promise.race([
      mistral.chat.complete({
        model,
        messages: buildWriterMessages(spec, context),
        responseFormat: { type: 'json_object' },
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('writer timeout')), timeoutMs)),
    ])
    const content = completion?.choices?.[0]?.message?.content
    if (typeof content !== 'string') return fallback
    const parsed = JSON.parse(content)
    if (typeof parsed.question !== 'string' || parsed.question.trim().length < MIN_QUESTION_LENGTH) {
      return fallback
    }
    return {
      question: parsed.question.trim(),
      aide: typeof parsed.aide === 'string' && parsed.aide.trim() ? parsed.aide.trim() : undefined,
      source: 'llm',
    }
  } catch {
    return fallback
  }
}
```

- [ ] **Step 4 : Vérifier** — `npm test` → 55 passed ; `node --check` sur les 2 nouveaux fichiers → OK.

- [ ] **Step 5 : Commit**

```bash
git add server/lib/writer-prompt.js server/lib/question-writer.js tests/question-writer.test.ts
git commit -m "feat(questionnaire-v2): rédacteur LLM à fallback garanti + prompt versionné

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> **Note post-revue Task 3 (exécution)** : la revue qualité a fait amender le code ci-dessus dans un
> commit séparé — le timeout passe par l'option **native du SDK Mistral** (`{ timeoutMs }` → AbortSignal,
> annulation réelle de la requête HTTP) au lieu de la Promise.race du plan (qui laissait timer et appel
> en vol) ; **plafonds de sortie** ajoutés (question ≤ 300 chars, aide ≤ 200, sinon fallback — borne
> le risque d'injection via un prénom malicieux) ; tests directs de `buildWriterMessages`. Le fichier
> livré fait foi.

---

### Task 4 : Routes questionnaire (factory injectable + supertest)

**Files:**
- Create: `server/routes/questionnaire.js`
- Test: `tests/questionnaire-routes.test.ts`
- Modify: `package.json` (devDep supertest)

- [ ] **Step 1 : Installer supertest**

```bash
npm install -D supertest @types/supertest
```

- [ ] **Step 2 : Tests rouges des routes**

`tests/questionnaire-routes.test.ts` :
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
// @ts-expect-error — module JS serveur
import { createQuestionnaireRouter } from '../server/routes/questionnaire.js'

// ── Fakes ────────────────────────────────────────────────────────────────
type Session = { id: string; user_id: string; answers: Record<string, unknown> }

function makeApp() {
  const sessions = new Map<string, Session>()
  let seq = 0
  const store = {
    async createSession(_c: unknown, userId: string) {
      const s: Session = { id: `sess-${++seq}`, user_id: userId, answers: {} }
      sessions.set(s.id, s)
      return s
    },
    async loadSession(_c: unknown, id: string) {
      return sessions.get(id) ?? null
    },
    async saveAnswers(_c: unknown, id: string, answers: Record<string, unknown>) {
      const s = sessions.get(id)
      if (s) s.answers = answers
    },
    async deleteSession(_c: unknown, id: string) {
      sessions.delete(id)
    },
  }
  const requireAuth = (req: express.Request & { user?: unknown; supabaseClient?: unknown }, _res: express.Response, next: express.NextFunction) => {
    req.user = { id: 'user-1' }
    req.supabaseClient = {}
    next()
  }
  // writer synchrone déterministe : pas de LLM dans les tests de routes
  const writeText = async ({ spec }: { spec: { fallback_text: { question: string; aide?: string } } }) => ({
    question: spec.fallback_text.question,
    aide: spec.fallback_text.aide,
    source: 'fallback' as const,
  })
  const app = express()
  app.use(express.json())
  app.use('/api/questionnaire', createQuestionnaireRouter({ requireAuth, store, writeText }))
  return { app, sessions }
}

const CANNED: Record<string, unknown> = {
  relation: 'conjoint_marie', deceased_firstname: 'Pierre', deceased_lastname: 'Dupont',
  deceased_dod: '2026-04-10', statut_professionnel: 'salarie', logement: 'locataire',
  enfants: 'aucun', has_notary: false, has_life_insurance: 'oui',
  has_joint_account: true, has_vehicle: false, has_credits: false,
  employait_aide_domicile: false, contrat_obseques: 'non', organismes_contactes: ['banque'],
}

async function runToRecap(app: express.Express) {
  const start = await request(app).post('/api/questionnaire/start')
  const sessionId = start.body.session_id
  let data = start.body.data
  let guard = 0
  while (data.action === 'question') {
    const res = await request(app)
      .post('/api/questionnaire/answer')
      .send({ session_id: sessionId, question_id: data.question_id, value: CANNED[data.question_id] })
    expect(res.status).toBe(200)
    data = res.body.data
    if (++guard > 20) throw new Error('boucle infinie')
  }
  return { sessionId, recap: data }
}

// ── Tests ────────────────────────────────────────────────────────────────
describe('POST /api/questionnaire/start', () => {
  it('crée une session et rend la première question sans champs serveur', async () => {
    const { app } = makeApp()
    const res = await request(app).post('/api/questionnaire/start')
    expect(res.status).toBe(200)
    expect(res.body.session_id).toBeDefined()
    const q = res.body.data
    expect(q.action).toBe('question')
    expect(q.question_id).toBe('relation')
    expect(q.options[0]).toEqual({ value: 'conjoint_marie', label: 'Mon époux / mon épouse' })
    expect(q.fallback_text).toBeUndefined()
    expect(q.writer_hints).toBeUndefined()
    expect(q.progress).toEqual({ current: 0, total: 14 })
  })
})

describe('POST /api/questionnaire/answer', () => {
  let app: express.Express
  let sessionId: string
  beforeEach(async () => {
    const made = makeApp()
    app = made.app
    const start = await request(app).post('/api/questionnaire/start')
    sessionId = start.body.session_id
  })
  it('valeur valide → question suivante, progress avance', async () => {
    const res = await request(app)
      .post('/api/questionnaire/answer')
      .send({ session_id: sessionId, question_id: 'relation', value: 'conjoint_marie' })
    expect(res.status).toBe(200)
    expect(res.body.data.question_id).toBe('deceased_firstname')
    expect(res.body.data.progress).toEqual({ current: 1, total: 15 }) // branche conjoint ouverte
  })
  it('valeur hors options → 400 avec message du moteur', async () => {
    const res = await request(app)
      .post('/api/questionnaire/answer')
      .send({ session_id: sessionId, question_id: 'relation', value: 'cousin' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Option inconnue')
  })
  it('question inapplicable → 400', async () => {
    await request(app).post('/api/questionnaire/answer').send({ session_id: sessionId, question_id: 'relation', value: 'parent' })
    const res = await request(app)
      .post('/api/questionnaire/answer')
      .send({ session_id: sessionId, question_id: 'has_joint_account', value: true })
    expect(res.status).toBe(400)
  })
  it('session inconnue → 404', async () => {
    const res = await request(app)
      .post('/api/questionnaire/answer')
      .send({ session_id: 'sess-inexistante', question_id: 'relation', value: 'parent' })
    expect(res.status).toBe(404)
  })
})

describe('parcours complet → récap → complete', () => {
  it('le récap contient les libellés humains', async () => {
    const { app } = makeApp()
    const { recap } = await runToRecap(app)
    expect(recap.action).toBe('recap')
    const byId = Object.fromEntries(recap.recap.map((e: { question_id: string; display: string }) => [e.question_id, e.display]))
    expect(byId['relation']).toBe('Mon époux / mon épouse')
    expect(byId['has_notary']).toBe('Non')
    expect(byId['has_life_insurance']).toBe('Oui')
    expect(byId['organismes_contactes']).toBe('La banque')
    expect(byId['deceased_firstname']).toBe('Pierre')
  })
  it('reask d’une question répondue → 200 ; non répondue → 400', async () => {
    const { app } = makeApp()
    const { sessionId } = await runToRecap(app)
    const ok = await request(app).post('/api/questionnaire/reask').send({ session_id: sessionId, question_id: 'relation' })
    expect(ok.status).toBe(200)
    expect(ok.body.data.question_id).toBe('relation')
    const start2 = await request(app).post('/api/questionnaire/start')
    const ko = await request(app).post('/api/questionnaire/reask').send({ session_id: start2.body.session_id, question_id: 'has_notary' })
    expect(ko.status).toBe(400)
  })
  it('correction au récap : relation conjoint→parent purge le compte joint et repose la branche', async () => {
    const { app } = makeApp()
    const { sessionId } = await runToRecap(app)
    const res = await request(app)
      .post('/api/questionnaire/answer')
      .send({ session_id: sessionId, question_id: 'relation', value: 'parent' })
    expect(res.status).toBe(200)
    expect(res.body.data.action).toBe('recap') // has_joint_account purgé, plus rien d'applicable à demander
    const complete = await request(app).post('/api/questionnaire/complete').send({ session_id: sessionId })
    expect(complete.body.answers.has_joint_account).toBeUndefined()
    expect(complete.body.answers.relation).toBe('parent')
  })
  it('complete avant la fin → 409 ; après → answers puis session supprimée (404 au 2e appel)', async () => {
    const { app } = makeApp()
    const start = await request(app).post('/api/questionnaire/start')
    const early = await request(app).post('/api/questionnaire/complete').send({ session_id: start.body.session_id })
    expect(early.status).toBe(409)

    const { sessionId } = await runToRecap(app)
    const done = await request(app).post('/api/questionnaire/complete').send({ session_id: sessionId })
    expect(done.status).toBe(200)
    expect(done.body.answers.relation).toBe('conjoint_marie')
    expect(done.body.answers.deceased_firstname).toBe('Pierre')
    const again = await request(app).post('/api/questionnaire/complete').send({ session_id: sessionId })
    expect(again.status).toBe(404)
  })
})
```

Run: `npm test` → FAIL (module inexistant).

- [ ] **Step 3 : Implémenter le router**

`server/routes/questionnaire.js` :
```javascript
// Routes du questionnaire v2 — le serveur possède le flux (moteur) et les données (sessions).
// Factory à dépendances injectées : testable avec supertest sans Mistral ni Supabase.
// Contrat API : docs/design-questionnaire-v2.md, section « Contrat API ».
import { Router } from 'express'
import { QUESTIONS_CATALOG } from '../lib/questions-catalog.js'
import { nextQuestion, validateAnswer, setAnswer, matchesWhen, progress } from '../lib/questionnaire-engine.js'
import * as supabaseStore from '../lib/sessions-store.js'
import { writeQuestionText } from '../lib/question-writer.js'

const SORTED = [...QUESTIONS_CATALOG].sort((a, b) => a.order - b.order)
const TRISTATE_LABELS = { oui: 'Oui', non: 'Non', ne_sait_pas: 'Je ne sais pas' }

/** Contexte court pour le rédacteur — jamais d'historique complet. */
function writerContext(answers, last) {
  return {
    prenom: answers.deceased_firstname,
    relation: answers.relation,
    derniereQuestion: last?.question,
    derniereReponse: last?.value,
  }
}

/** RenderedQuestion : la spec côté client, SANS les champs serveur (fallback_text, writer_hints). */
function toRendered(spec, answers, text) {
  return {
    action: 'question',
    question_id: spec.id,
    question: text.question,
    aide: text.aide,
    type: spec.type,
    options: spec.options,
    obligatoire: spec.obligatoire,
    categorie: spec.categorie,
    progress: progress(answers),
  }
}

/** Libellé humain d'une réponse, pour l'écran récapitulatif. */
export function displayValue(spec, value) {
  switch (spec.type) {
    case 'boolean':
      return value ? 'Oui' : 'Non'
    case 'tristate':
      return TRISTATE_LABELS[value] ?? String(value)
    case 'select':
      return spec.options.find((o) => o.value === value)?.label ?? String(value)
    case 'multiselect': {
      if (!Array.isArray(value) || value.length === 0) return 'Aucun'
      return value.map((v) => spec.options.find((o) => o.value === v)?.label ?? v).join(', ')
    }
    default:
      return String(value)
  }
}

function buildRecap(answers) {
  const prenom = answers.deceased_firstname || 'votre proche'
  return SORTED.filter((spec) => answers[spec.id] !== undefined).map((spec) => ({
    question_id: spec.id,
    question: spec.fallback_text.question.replaceAll('{prenom}', prenom),
    display: displayValue(spec, answers[spec.id]),
  }))
}

export function createQuestionnaireRouter({
  requireAuth,
  store = supabaseStore,
  mistral = null,
  model = 'mistral-small-latest',
  writeText = writeQuestionText,
}) {
  const router = Router()

  async function renderNext(session, last) {
    const spec = nextQuestion(session.answers)
    if (spec === null) return { action: 'recap', recap: buildRecap(session.answers) }
    const text = await writeText({ spec, context: writerContext(session.answers, last), mistral, model })
    return toRendered(spec, session.answers, text)
  }

  router.post('/start', requireAuth, async (req, res) => {
    try {
      const session = await store.createSession(req.supabaseClient, req.user.id)
      const data = await renderNext(session)
      res.json({ success: true, session_id: session.id, data })
    } catch (error) {
      console.error('❌ questionnaire/start :', error)
      res.status(500).json({ success: false, error: 'Impossible de démarrer le questionnaire' })
    }
  })

  router.post('/answer', requireAuth, async (req, res) => {
    try {
      const { session_id, question_id, value } = req.body
      if (!session_id || !question_id) {
        return res.status(400).json({ success: false, error: 'session_id et question_id requis' })
      }
      const session = await store.loadSession(req.supabaseClient, session_id)
      if (!session) return res.status(404).json({ success: false, error: 'Session non trouvée ou expirée' })
      const spec = SORTED.find((q) => q.id === question_id)
      if (!spec) return res.status(400).json({ success: false, error: 'Question inconnue' })
      if (!matchesWhen(spec.applicable_when, session.answers)) {
        return res.status(400).json({ success: false, error: 'Question non applicable à votre situation' })
      }
      const check = validateAnswer(spec, value)
      if (!check.ok) return res.status(400).json({ success: false, error: check.error })
      session.answers = setAnswer(session.answers, spec, value)
      await store.saveAnswers(req.supabaseClient, session_id, session.answers)
      const data = await renderNext(session, { question: spec.fallback_text.question, value })
      res.json({ success: true, data })
    } catch (error) {
      console.error('❌ questionnaire/answer :', error)
      res.status(500).json({ success: false, error: 'Erreur lors de l’enregistrement de la réponse' })
    }
  })

  router.post('/reask', requireAuth, async (req, res) => {
    try {
      const { session_id, question_id } = req.body
      if (!session_id || !question_id) {
        return res.status(400).json({ success: false, error: 'session_id et question_id requis' })
      }
      const session = await store.loadSession(req.supabaseClient, session_id)
      if (!session) return res.status(404).json({ success: false, error: 'Session non trouvée ou expirée' })
      const spec = SORTED.find((q) => q.id === question_id)
      if (!spec || session.answers[spec.id] === undefined || !matchesWhen(spec.applicable_when, session.answers)) {
        return res.status(400).json({ success: false, error: 'Question non modifiable' })
      }
      const text = await writeText({ spec, context: writerContext(session.answers), mistral, model })
      res.json({ success: true, data: toRendered(spec, session.answers, text) })
    } catch (error) {
      console.error('❌ questionnaire/reask :', error)
      res.status(500).json({ success: false, error: 'Erreur lors de la reprise de la question' })
    }
  })

  router.post('/complete', requireAuth, async (req, res) => {
    try {
      const { session_id } = req.body
      if (!session_id) return res.status(400).json({ success: false, error: 'session_id requis' })
      const session = await store.loadSession(req.supabaseClient, session_id)
      if (!session) return res.status(404).json({ success: false, error: 'Session non trouvée ou expirée' })
      if (nextQuestion(session.answers) !== null) {
        return res.status(409).json({ success: false, error: 'Questionnaire incomplet' })
      }
      await store.deleteSession(req.supabaseClient, session_id)
      res.json({ success: true, answers: session.answers })
    } catch (error) {
      console.error('❌ questionnaire/complete :', error)
      res.status(500).json({ success: false, error: 'Erreur lors de la finalisation' })
    }
  })

  return router
}
```

- [ ] **Step 4 : Vérifier** — `npm test` → 64 passed (55 + 9 tests de routes) ; `node --check server/routes/questionnaire.js` → OK ; `npx tsc --noEmit` → exit 0.

- [ ] **Step 5 : Commit**

```bash
git add server/routes/questionnaire.js tests/questionnaire-routes.test.ts package.json package-lock.json
git commit -m "feat(questionnaire-v2): routes start/answer/reask/complete sur le moteur (factory + supertest)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> **Note post-revue Task 4 (exécution)** : la revue qualité a fait amender le design ci-dessus —
> **`/complete` est idempotent** (plus de `deleteSession` : une réponse HTTP perdue n'oblige plus
> un utilisateur endeuillé à refaire 15 questions ; le TTL `expires_at` nettoie) contrairement au
> « 404 au 2ᵉ appel » spécifié plus haut. Autres amendements : le fake store des tests clone les
> sessions (`structuredClone`) pour rendre la persistance observable (une mutation avait prouvé que
> supprimer `saveAnswers` ne cassait aucun test) ; test du chemin 500 sans fuite de détail interne ;
> **PII réduite** : la transition vers le LLM n'inclut la dernière réponse que pour les types fermés
> (le nom de famille et la date de décès ne partent pas chez Mistral) ; devDeps épinglées.
> Les compteurs de tests des tasks suivantes glissent d'autant (+2 vs plan). Le fichier livré fait foi.

---

### Task 5 : Câblage server.js + suppression du legacy questionnaire

**Files:**
- Modify: `server/server.js`

⚠️ **NE PAS TOUCHER** (produit transmission) : `AGENT_ID`, `buildContextPrompt`, la `Map()` `sessions`, `generateSessionId`, `generateAccessCode`, les routes `/api/demo/*`, `/api/transmission/:code`, `/api/user/transmission`.

- [ ] **Step 1 : Monter le router v2**

Dans `server/server.js` :
- Ajouter aux imports : `import { createQuestionnaireRouter } from './routes/questionnaire.js';`
- Remplacer les constantes d'agents (`const AGENT_ID = …`, `const QUESTIONNAIRE_AGENT_ID = …`, `const ROADMAP_AGENT_ID = …`) par :
```javascript
const AGENT_ID = process.env.MISTRAL_AGENT_ID; // utilisé UNIQUEMENT par le produit transmission (/api/demo/*)
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistral-small-latest'; // rédacteur du questionnaire v2
```
- Après la définition de `requireAuth`, monter :
```javascript
// Questionnaire v2 : flux piloté par le moteur (server/lib), IA limitée à la rédaction des textes.
app.use('/api/questionnaire', createQuestionnaireRouter({ requireAuth, mistral: client, model: MISTRAL_MODEL }));
```

- [ ] **Step 2 : Supprimer le legacy du flux questionnaire**

À supprimer intégralement de `server/server.js` (et rien d'autre) :
- Le bloc `ROUTES QUESTIONNAIRE COMPLET (AI avec mémoire)` : `const MAX_QUESTIONS`, les helpers `extractMistralText`, `sanitizeQuestionData` (avec `VARIABLE_LABEL_MAP`), `parseMistralJson`, et les 3 routes `app.post('/api/questionnaire/start'…)`, `…/answer`, `…/complete`
- La route stub `app.get('/api/roadmap/:code'…)` (désactivée, simule 2 s puis `use_default: true`) et son bloc de commentaires
- Vérification : `grep -n "sanitizeQuestionData\|parseMistralJson\|extractMistralText\|MAX_QUESTIONS\|QUESTIONNAIRE_AGENT_ID\|ROADMAP_AGENT_ID\|roadmap/:code" server/server.js` → aucune occurrence.
- Contre-vérification transmission intacte : `grep -c "api/demo\|buildContextPrompt\|AGENT_ID" server/server.js` → > 0.
- Dans le `app.listen`, remplacer la ligne `console.log(\`📝 Agent Mistral ID: ${AGENT_ID}\`)` par :
```javascript
  console.log(`📝 Rédacteur questionnaire v2 : ${MISTRAL_MODEL} | Agent transmission : ${AGENT_ID ? 'configuré' : 'absent'}`);
```

- [ ] **Step 3 : Vérifier**

```bash
node --check server/server.js
npm test
```
Puis smoke test runtime :
```bash
PORT=3000 node server/server.js &
sleep 2
curl -s -X POST http://localhost:3000/api/questionnaire/start | head -c 120   # attendu : {"success":false,"error":"Authentication required"…
curl -s http://localhost:3000/api/health                                       # attendu : {"status":"ok"…}
kill %1
```

- [ ] **Step 4 : Commit**

```bash
git add server/server.js
git commit -m "feat(questionnaire-v2): monte les routes v2, supprime l'agent conversationnel et le legacy questionnaire

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6 : Frontend v2 (QuestionCard, récap, page, suppression adaptateur)

**Files:**
- Modify: `src/components/questionnaire/QuestionCard.tsx` (réécriture complète)
- Modify: `src/components/questionnaire/QuestionnaireProgress.tsx` (réécriture)
- Create: `src/components/questionnaire/RecapScreen.tsx`
- Modify: `src/components/questionnaire/CompletionScreen.tsx`
- Modify: `src/pages/QuestionnairePage.tsx` (réécriture complète)
- Delete: `src/lib/answers-adapter.ts`, `tests/answers-adapter.test.ts`
- Modify: `src/lib/roadmap-generator.ts` (suppression de l'interface v1)

Tout est livré d'un bloc puis validé par `tsc` + tests + build (les fichiers sont interdépendants : pas d'état intermédiaire compilable).

- [ ] **Step 1 : Réécrire `QuestionnaireProgress.tsx`** (progression floue : pourcentage seul, décision validée)

```tsx
interface QuestionnaireProgressProps {
  categoryName: string
  percent: number
}

export function QuestionnaireProgress({ categoryName, percent }: QuestionnaireProgressProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 bg-accent rounded-full animate-pulse" />
          <span className="text-sm font-medium text-accent uppercase tracking-widest">
            {categoryName}
          </span>
        </div>
        <span className="text-sm text-text-muted">{percent} %</span>
      </div>
      <div className="h-[3px] bg-border rounded-sm overflow-hidden">
        <div
          className="h-full bg-accent rounded-sm transition-all duration-500 ease-in-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2 : Réécrire `QuestionCard.tsx`**

Contenu intégral (types v2 seulement, options `{value,label}` — on AFFICHE le label, on SOUMET la value ; nouveau type `tristate` ; multiselect soumis même vide ; skip conservé pour un futur `obligatoire: false`) :

```tsx
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { QuestionnaireProgress } from './QuestionnaireProgress'

// ─── Types ────────────────────────────────────────────────────────────────────
// Miroir du RenderedQuestion serveur (server/routes/questionnaire.js).

export interface QuestionOption {
  value: string
  label: string
}

export interface QuestionData {
  action?: 'question'
  question_id: string
  question: string
  type: 'select' | 'multiselect' | 'boolean' | 'tristate' | 'text' | 'date'
  options?: QuestionOption[]
  aide?: string
  categorie?: string
  obligatoire: boolean
  progress: { current: number; total: number }
}

interface QuestionCardProps {
  question: QuestionData
  onAnswer: (questionId: string, value: unknown) => void
  onSkip?: (questionId: string) => void
  isSubmitting: boolean
  error: string | null
}

// ─── Component ────────────────────────────────────────────────────────────────

export function QuestionCard({ question, onAnswer, onSkip, isSubmitting, error }: QuestionCardProps) {
  const [selectedValue, setSelectedValue] = useState<unknown>(null)
  const [selectedValues, setSelectedValues] = useState<string[]>([])

  useEffect(() => {
    setSelectedValue(null)
    setSelectedValues([])
  }, [question.question_id])

  const isMulti = question.type === 'multiselect'
  const hasValue = selectedValue !== null && selectedValue !== ''
  // Le multiselect est toujours soumissible : une sélection vide est une réponse valide (« aucun »).
  const isNextDisabled = isSubmitting || (!isMulti && question.obligatoire && !hasValue)
  const percent = Math.round((question.progress.current / Math.max(question.progress.total, 1)) * 100)

  function handleSubmit() {
    if (isMulti) {
      onAnswer(question.question_id, selectedValues)
    } else if (selectedValue !== null) {
      onAnswer(question.question_id, selectedValue)
    }
  }

  return (
    <section className="animate-[slideUp_0.5s_ease-out]">
      <QuestionnaireProgress categoryName={question.categorie || 'Question'} percent={percent} />

      <div className="bg-bg-card rounded-radius-lg p-10 shadow-md border border-border-soft max-sm:p-7">
        <h2 className="font-display text-[1.75rem] font-medium leading-[1.35] mb-3 text-text max-sm:text-2xl">
          {question.question}
        </h2>

        {question.aide && (
          <p className="text-[0.95rem] text-text-soft mb-8 pl-4 border-l-2 border-accent-soft">
            {question.aide}
          </p>
        )}

        {error && (
          <div className="bg-[#FEF2F0] border border-[#F5D5D0] text-error py-4 px-5 rounded-radius-sm mb-6 text-[0.95rem]">
            {error}
          </div>
        )}

        <div className="mb-6">
          <FormElement
            question={question}
            selectedValue={selectedValue}
            selectedValues={selectedValues}
            onValueChange={setSelectedValue}
            onValuesChange={setSelectedValues}
          />
        </div>

        <div className="flex justify-between items-center mt-8 pt-6 border-t border-border-soft">
          {!question.obligatoire && onSkip ? (
            <button
              onClick={() => onSkip(question.question_id)}
              disabled={isSubmitting}
              className="bg-transparent border-none text-text-muted text-[0.95rem] font-body cursor-pointer py-2 px-4 transition-colors duration-200 hover:text-text-soft disabled:opacity-50"
            >
              Passer cette question
            </button>
          ) : (
            <div />
          )}

          <button
            onClick={handleSubmit}
            disabled={isNextDisabled}
            className="inline-flex items-center gap-2 bg-accent text-white border-none py-3.5 px-7 text-base font-body font-medium rounded-radius-md cursor-pointer transition-all duration-200 hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Envoi...' : 'Continuer'}
            {!isSubmitting && (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-[18px] h-[18px]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </section>
  )
}

// ─── Form element renderer ───────────────────────────────────────────────────

interface FormElementProps {
  question: QuestionData
  selectedValue: unknown
  selectedValues: string[]
  onValueChange: (value: unknown) => void
  onValuesChange: (values: string[]) => void
}

function FormElement({ question, selectedValue, selectedValues, onValueChange, onValuesChange }: FormElementProps) {
  switch (question.type) {
    case 'select':
      return (
        <OptionList
          options={question.options || []}
          isMulti={false}
          selectedValue={selectedValue as string | null}
          selectedValues={selectedValues}
          onValueChange={onValueChange}
          onValuesChange={onValuesChange}
        />
      )
    case 'multiselect':
      return (
        <OptionList
          options={question.options || []}
          isMulti={true}
          selectedValue={selectedValue as string | null}
          selectedValues={selectedValues}
          onValueChange={onValueChange}
          onValuesChange={onValuesChange}
        />
      )
    case 'boolean':
      return (
        <ChoiceRow
          items={[
            { label: 'Oui', value: true },
            { label: 'Non', value: false },
          ]}
          selectedValue={selectedValue}
          onValueChange={onValueChange}
        />
      )
    case 'tristate':
      return (
        <ChoiceRow
          items={[
            { label: 'Oui', value: 'oui' },
            { label: 'Non', value: 'non' },
            { label: 'Je ne sais pas', value: 'ne_sait_pas' },
          ]}
          selectedValue={selectedValue}
          onValueChange={onValueChange}
        />
      )
    case 'date':
      return (
        <input
          type="date"
          value={(selectedValue as string) ?? ''}
          onChange={(e) => onValueChange(e.target.value || null)}
          className="w-full py-4 px-5 text-base font-body border-2 border-border rounded-radius-md bg-bg text-text transition-all duration-200 focus:outline-none focus:border-accent focus:bg-white"
        />
      )
    default:
      return <TextInput value={(selectedValue as string) ?? ''} onValueChange={onValueChange} />
  }
}

// ─── Option list (select / multiselect) — affiche label, soumet value ─────────

interface OptionListProps {
  options: QuestionOption[]
  isMulti: boolean
  selectedValue: string | null
  selectedValues: string[]
  onValueChange: (value: unknown) => void
  onValuesChange: (values: string[]) => void
}

function OptionList({ options, isMulti, selectedValue, selectedValues, onValueChange, onValuesChange }: OptionListProps) {
  function handleClick(value: string) {
    if (isMulti) {
      const next = selectedValues.includes(value)
        ? selectedValues.filter((v) => v !== value)
        : [...selectedValues, value]
      onValuesChange(next)
    } else {
      onValueChange(value)
    }
  }

  const isSelected = (value: string) => (isMulti ? selectedValues.includes(value) : selectedValue === value)

  return (
    <div className="flex flex-col gap-3">
      {options.map(({ value, label }) => (
        <label
          key={value}
          onClick={(e) => {
            e.preventDefault()
            handleClick(value)
          }}
          className={cn(
            'flex items-center py-4 px-5 bg-bg border-2 border-border rounded-radius-md cursor-pointer transition-all duration-200',
            'hover:border-accent hover:bg-accent-soft',
            isSelected(value) && 'border-accent bg-accent-soft'
          )}
        >
          {isMulti ? (
            <span
              className={cn(
                'w-5 h-5 border-2 border-border rounded mr-4 flex items-center justify-center transition-all duration-200 shrink-0',
                isSelected(value) && 'border-accent bg-accent'
              )}
            >
              {isSelected(value) && <span className="text-white text-xs font-bold">&#10003;</span>}
            </span>
          ) : (
            <span
              className={cn(
                'w-5 h-5 border-2 border-border rounded-full mr-4 flex items-center justify-center transition-all duration-200 shrink-0',
                isSelected(value) && 'border-accent'
              )}
            >
              {isSelected(value) && <span className="w-2.5 h-2.5 bg-accent rounded-full" />}
            </span>
          )}
          <span className="text-base text-text">{label}</span>
        </label>
      ))}
    </div>
  )
}

// ─── Choice row (boolean / tristate) ─────────────────────────────────────────

interface ChoiceRowProps {
  items: Array<{ label: string; value: unknown }>
  selectedValue: unknown
  onValueChange: (value: unknown) => void
}

function ChoiceRow({ items, selectedValue, onValueChange }: ChoiceRowProps) {
  return (
    <div className="flex gap-4 max-sm:flex-col">
      {items.map(({ label, value }) => (
        <label
          key={label}
          onClick={(e) => {
            e.preventDefault()
            onValueChange(value)
          }}
          className={cn(
            'flex-1 flex items-center justify-center py-4 px-5 bg-bg border-2 border-border rounded-radius-md cursor-pointer transition-all duration-200',
            'hover:border-accent hover:bg-accent-soft',
            selectedValue === value && 'border-accent bg-accent-soft'
          )}
        >
          <span
            className={cn(
              'w-5 h-5 border-2 border-border rounded-full mr-4 flex items-center justify-center transition-all duration-200 shrink-0',
              selectedValue === value && 'border-accent'
            )}
          >
            {selectedValue === value && <span className="w-2.5 h-2.5 bg-accent rounded-full" />}
          </span>
          <span className="text-base text-text">{label}</span>
        </label>
      ))}
    </div>
  )
}

// ─── Text input ──────────────────────────────────────────────────────────────

function TextInput({ value, onValueChange }: { value: string; onValueChange: (value: unknown) => void }) {
  const [localValue, setLocalValue] = useState(value)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    setLocalValue(raw)
    onValueChange(raw.trim() || null)
  }

  return (
    <input
      type="text"
      value={localValue}
      onChange={handleChange}
      placeholder="Votre réponse..."
      className="w-full py-4 px-5 text-base font-body border-2 border-border rounded-radius-md bg-bg text-text transition-all duration-200 focus:outline-none focus:border-accent focus:bg-white placeholder:text-text-muted"
    />
  )
}
```

- [ ] **Step 3 : Créer `RecapScreen.tsx`**

```tsx
import { Pencil } from 'lucide-react'

export interface RecapEntry {
  question_id: string
  question: string
  display: string
}

interface RecapScreenProps {
  entries: RecapEntry[]
  onEdit: (questionId: string) => void
  onConfirm: () => void
  isSubmitting: boolean
  error: string | null
}

export function RecapScreen({ entries, onEdit, onConfirm, isSubmitting, error }: RecapScreenProps) {
  return (
    <section className="animate-[slideUp_0.5s_ease-out]">
      <div className="bg-bg-card rounded-radius-lg p-10 shadow-md border border-border-soft max-sm:p-7">
        <h2 className="font-display text-[1.75rem] font-medium leading-[1.35] mb-3 text-text max-sm:text-2xl">
          Vérifions ensemble vos réponses
        </h2>
        <p className="text-[0.95rem] text-text-soft mb-8">
          Votre parcours personnalisé sera construit à partir de ces informations.
          Vous pouvez modifier chaque réponse avant de confirmer.
        </p>

        {error && (
          <div className="bg-[#FEF2F0] border border-[#F5D5D0] text-error py-4 px-5 rounded-radius-sm mb-6 text-[0.95rem]">
            {error}
          </div>
        )}

        <ul className="divide-y divide-border-soft mb-8">
          {entries.map((entry) => (
            <li key={entry.question_id} className="py-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-[0.9rem] text-text-soft">{entry.question}</div>
                <div className="text-base font-medium text-text mt-1">{entry.display}</div>
              </div>
              <button
                onClick={() => onEdit(entry.question_id)}
                disabled={isSubmitting}
                className="shrink-0 inline-flex items-center gap-1.5 bg-transparent border border-border text-text-soft text-[0.85rem] py-1.5 px-3 rounded-radius-sm cursor-pointer transition-all duration-200 hover:border-accent hover:text-accent disabled:opacity-50"
              >
                <Pencil className="w-3.5 h-3.5" />
                Modifier
              </button>
            </li>
          ))}
        </ul>

        <div className="flex justify-end pt-6 border-t border-border-soft">
          <button
            onClick={onConfirm}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 bg-accent text-white border-none py-3.5 px-7 text-base font-body font-medium rounded-radius-md cursor-pointer transition-all duration-200 hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Génération...' : 'Confirmer et générer mon parcours'}
          </button>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4 : Mettre à jour `CompletionScreen.tsx`**

Remplacer l'interface et le paragraphe descriptif :
```tsx
interface CompletionScreenProps {
  stepsCount: number
  doneCount: number
}

export function CompletionScreen({ stepsCount, doneCount }: CompletionScreenProps) {
```
et remplacer le premier `<p>` descriptif par :
```tsx
      <p className="text-text-soft max-w-[440px] mx-auto mb-2">
        Nous avons identifié{' '}
        <strong className="text-text">{stepsCount} démarches</strong>{' '}
        à effectuer en fonction de votre situation
        {doneCount > 0 && (
          <>
            , dont <strong className="text-text">{doneCount} déjà faites</strong>
          </>
        )}
        .
      </p>
```
(Le reste du fichier est inchangé.)

- [ ] **Step 5 : Réécrire `QuestionnairePage.tsx`** — contenu intégral :

```tsx
import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/api'
import { generateRoadmap, saveRoadmapToDb } from '@/lib/roadmap-generator'
import { supabase } from '@/lib/supabase'
import type { QuestionnaireAnswersV2 } from '@/types/questionnaire'
import { WelcomeScreen } from '@/components/questionnaire/WelcomeScreen'
import { QuestionCard, type QuestionData } from '@/components/questionnaire/QuestionCard'
import { RecapScreen, type RecapEntry } from '@/components/questionnaire/RecapScreen'
import { CompletionScreen } from '@/components/questionnaire/CompletionScreen'

type Phase = 'welcome' | 'loading' | 'question' | 'recap' | 'completing' | 'done'

type ServerData = (QuestionData & { action: 'question' }) | { action: 'recap'; recap: RecapEntry[] }

export function QuestionnairePage() {
  const { user, signOut } = useAuth()

  const [phase, setPhase] = useState<Phase>('welcome')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null)
  const [recap, setRecap] = useState<RecapEntry[]>([])
  const [finalAnswers, setFinalAnswers] = useState<QuestionnaireAnswersV2 | null>(null)
  const [stepsCount, setStepsCount] = useState(0)
  const [doneCount, setDoneCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ─── Le serveur renvoie soit une question, soit le récapitulatif ──

  const showServerData = useCallback((data: ServerData) => {
    if (data.action === 'recap') {
      setRecap(data.recap)
      setPhase('recap')
    } else {
      setCurrentQuestion(data)
      setPhase('question')
    }
  }, [])

  // ─── Démarrage ─────────────────────────────────────────────────

  const startQuestionnaire = useCallback(async () => {
    setPhase('loading')
    setError(null)
    try {
      const response = await apiFetch('/api/questionnaire/start', { method: 'POST' })
      const result = await response.json()
      if (result.success) {
        setSessionId(result.session_id)
        showServerData(result.data)
      } else {
        setError(result.error || 'Erreur lors du démarrage')
        setPhase('welcome')
      }
    } catch (err: unknown) {
      setError('Erreur de connexion : ' + (err instanceof Error ? err.message : 'inconnue'))
      setPhase('welcome')
    }
  }, [showServerData])

  // ─── Réponse (valeur canonique, jamais le label) ───────────────

  const handleAnswer = useCallback(
    async (questionId: string, value: unknown) => {
      if (!sessionId) return
      setIsSubmitting(true)
      setError(null)
      try {
        const response = await apiFetch('/api/questionnaire/answer', {
          method: 'POST',
          body: JSON.stringify({ session_id: sessionId, question_id: questionId, value }),
        })
        const result = await response.json()
        if (result.success) {
          showServerData(result.data)
        } else {
          setError(result.error || 'Réponse invalide')
        }
      } catch (err: unknown) {
        setError('Erreur de connexion : ' + (err instanceof Error ? err.message : 'inconnue'))
      } finally {
        setIsSubmitting(false)
      }
    },
    [sessionId, showServerData]
  )

  // ─── Modifier depuis le récap ──────────────────────────────────

  const handleEdit = useCallback(
    async (questionId: string) => {
      if (!sessionId) return
      setPhase('loading')
      setError(null)
      try {
        const response = await apiFetch('/api/questionnaire/reask', {
          method: 'POST',
          body: JSON.stringify({ session_id: sessionId, question_id: questionId }),
        })
        const result = await response.json()
        if (result.success) {
          showServerData(result.data)
        } else {
          setError(result.error || 'Modification impossible')
          setPhase('recap')
        }
      } catch (err: unknown) {
        setError('Erreur de connexion : ' + (err instanceof Error ? err.message : 'inconnue'))
        setPhase('recap')
      }
    },
    [sessionId, showServerData]
  )

  // ─── Confirmation : answers typées → roadmap (aucune extraction IA) ──

  const confirmAndGenerate = useCallback(async () => {
    if (!user) return
    setPhase('completing')
    setError(null)
    try {
      // Idempotent : si /complete a déjà réussi (session supprimée côté serveur),
      // on réutilise les answers en mémoire au lieu de rappeler l'API.
      let answers = finalAnswers
      if (!answers) {
        const response = await apiFetch('/api/questionnaire/complete', {
          method: 'POST',
          body: JSON.stringify({ session_id: sessionId }),
        })
        const result = await response.json()
        if (!result.success) throw new Error(result.error || 'Finalisation impossible')
        answers = result.answers as QuestionnaireAnswersV2
        setFinalAnswers(answers)
      }

      const { data: questionnaire, error: qError } = await supabase
        .from('questionnaires')
        .insert({ user_id: user.id, answers, status: 'completed' })
        .select()
        .single()
      if (qError || !questionnaire) throw new Error('Impossible de sauvegarder vos réponses.')

      const steps = generateRoadmap(answers)
      setStepsCount(steps.length)
      setDoneCount(steps.filter((s) => s.initial_status === 'done').length)
      await saveRoadmapToDb(user.id, questionnaire.id, steps)

      setPhase('done')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue')
      setPhase('completing') // reste sur l'écran pour afficher le bouton Réessayer
    }
  }, [user, sessionId, finalAnswers])

  // ─── Render ───────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-bg">
      <header className="p-8 text-center border-b border-border-soft bg-bg-card">
        <div className="font-display text-[1.75rem] font-medium text-accent tracking-[0.02em]">
          Seren<span className="italic font-normal">.</span>
        </div>
        <nav className="mt-4 flex items-center justify-center gap-8 flex-wrap">
          <span className="text-text-soft text-sm font-medium">{user?.email}</span>
          <Link
            to="/dashboard"
            className="text-text-soft no-underline text-sm font-medium uppercase tracking-widest border-b-2 border-text-soft pb-0.5 transition-all duration-200 hover:text-accent hover:border-accent"
          >
            Tableau de bord
          </Link>
          <button
            onClick={signOut}
            className="bg-transparent border-none border-b-2 border-text-soft text-text-soft text-sm font-medium uppercase tracking-widest cursor-pointer p-0 pb-0.5 transition-all duration-200 hover:text-accent hover:border-accent"
          >
            Déconnexion
          </button>
        </nav>
      </header>

      <main className="max-w-[720px] mx-auto py-12 px-6 pb-24 max-sm:py-8 max-sm:px-4 max-sm:pb-16">
        {phase === 'welcome' && (
          <>
            {error && (
              <div className="bg-[#FEF2F0] border border-[#F5D5D0] text-error py-4 px-5 rounded-radius-sm mb-6 text-[0.95rem] text-center">
                {error}
              </div>
            )}
            <WelcomeScreen onStart={startQuestionnaire} />
          </>
        )}

        {phase === 'loading' && (
          <div className="text-center py-16 px-8">
            <div className="w-12 h-12 border-[3px] border-border border-t-accent rounded-full mx-auto mb-6 animate-spin" />
            <p className="text-text-soft text-base">Préparation de votre questionnaire...</p>
          </div>
        )}

        {phase === 'question' && currentQuestion && (
          <QuestionCard
            key={currentQuestion.question_id}
            question={currentQuestion}
            onAnswer={handleAnswer}
            isSubmitting={isSubmitting}
            error={error}
          />
        )}

        {phase === 'recap' && (
          <RecapScreen
            entries={recap}
            onEdit={handleEdit}
            onConfirm={confirmAndGenerate}
            isSubmitting={isSubmitting}
            error={error}
          />
        )}

        {phase === 'completing' && !error && (
          <div className="text-center py-16 px-8">
            <div className="w-12 h-12 border-[3px] border-border border-t-accent rounded-full mx-auto mb-6 animate-spin" />
            <p className="text-text-soft text-base">Génération de votre parcours personnalisé...</p>
          </div>
        )}

        {phase === 'completing' && error && (
          <div className="text-center py-16 px-8">
            <div className="bg-[#FEF2F0] border border-[#F5D5D0] text-error py-4 px-5 rounded-radius-sm mb-6 text-[0.95rem] max-w-md mx-auto">
              {error}
            </div>
            <button
              onClick={() => {
                setError(null)
                confirmAndGenerate()
              }}
              className="bg-accent text-white border-none py-3 px-6 rounded-radius-md cursor-pointer font-medium transition-all duration-200 hover:bg-accent-hover"
            >
              Réessayer
            </button>
          </div>
        )}

        {phase === 'done' && <CompletionScreen stepsCount={stepsCount} doneCount={doneCount} />}
      </main>
    </div>
  )
}
```

Les helpers `normalizeAnswers`, `normalizeRelation`, `normalizeOrganismes` disparaissent avec la réécriture.

- [ ] **Step 6 : Supprimer l'adaptateur transitoire et l'interface v1**

```bash
git rm src/lib/answers-adapter.ts tests/answers-adapter.test.ts
```
Dans `src/lib/roadmap-generator.ts`, supprimer le bloc `// Ré-export transitoire du contrat v1 …` avec l'interface `export interface QuestionnaireAnswers { … }` (lignes 5-18 environ).
Vérification : `grep -rn "answers-adapter\|adaptAnswersV1toV2\|QuestionnaireAnswers[^V]" src tests` → aucune occurrence.

- [ ] **Step 7 : Vérifier**

```bash
npx tsc --noEmit        # exit 0
npm test                # 56 passed (64 − 8 tests adaptateur supprimés)
npx vite build          # exit 0
grep -rn "from('questionnaires')" src   # attendu : uniquement l'insert de QuestionnairePage
                                        # (si un lecteur existe, il ne doit consommer que deceased_* — noms stables v1/v2)
```

- [ ] **Step 8 : Commit**

```bash
git add -A src/ tests/
git commit -m "feat(questionnaire-v2): frontend v2 (options canoniques, tristate, récap confirmable, % de progression) + suppression adaptateur

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7 : Documentation et environnement

**Files:**
- Modify: `CLAUDE.md`
- Move: `docs/questionnaire-agent-prompt.md` → `docs/legacy/questionnaire-agent-prompt.md`

- [ ] **Step 1 : Archiver le prompt de l'ancien agent**

```bash
mkdir -p docs/legacy
git mv docs/questionnaire-agent-prompt.md docs/legacy/questionnaire-agent-prompt.md
```
Ajouter en tête du fichier déplacé :
```markdown
> **ARCHIVÉ (2026-07-08)** : l'agent conversationnel du questionnaire a été remplacé par le moteur v2
> (`server/lib/questionnaire-engine.js`) + rédacteur (`server/lib/question-writer.js`, prompt versionné
> dans `server/lib/writer-prompt.js`). Voir `docs/design-questionnaire-v2.md`. Conservé pour référence :
> son contenu éditorial a été recyclé dans les fallback_text/writer_hints du catalogue.
```

- [ ] **Step 2 : Mettre à jour `CLAUDE.md`**

- Section **Variables d'environnement**, remplacer :
```markdown
- `MISTRAL_API_KEY`, `MISTRAL_AGENT_ID` — agent questionnaire
- `MISTRAL_QUESTIONNAIRE_AGENT_ID`, `MISTRAL_ROADMAP_AGENT_ID` — agents spécialisés (optionnels)
```
par :
```markdown
- `MISTRAL_API_KEY` — clé API Mistral
- `MISTRAL_MODEL` — modèle du rédacteur questionnaire v2 (défaut : `mistral-small-latest`)
- `MISTRAL_AGENT_ID` — agent du produit transmission uniquement (`/api/demo/*`)
```
- Section **Points d'attention**, remplacer le point `- **Pas de tests** : …` par :
```markdown
- **Tests** : Vitest (`npm test`) — moteur, catalogues, invariants croisés, routes (supertest). Les invariants interdisent toute question sans étape et tout drift entre catalogues
```
- Remplacer le point `- **Sessions en mémoire** : …` par :
```markdown
- **Sessions** : questionnaire v2 persisté dans `questionnaire_sessions` (Supabase, RLS). Le produit transmission (`/api/demo/*`) reste sur une `Map()` en mémoire — perdu au redémarrage
```
- Section **Flux principal**, remplacer la ligne par :
```markdown
Questionnaire v2 (moteur serveur + rédacteur Mistral, ≤15 questions, récap confirmable) → `QuestionnaireAnswersV2` → `generateRoadmap()` → `saveRoadmapToDb()` → Dashboard
```
- Section **Contrat de données clé**, remplacer par :
```markdown
`QuestionnaireAnswersV2` dans `src/types/questionnaire.ts` — contrat entre questionnaire et roadmap-generator. Règle d'or : toute question conditionne ≥ 1 étape (invariants testés dans `tests/invariants.test.ts`)
```
- Architecture : dans le bloc `server/`, remplacer la ligne `└── server.js …` par :
```markdown
├── server.js         # Express : auth proxy, produit transmission (/api/demo/*), static serving
├── lib/              # Moteur questionnaire v2, catalogue questions, rédacteur LLM, sessions
└── routes/           # Routers Express (questionnaire v2)
```

- [ ] **Step 3 : Vérifier et commiter**

```bash
npm test && npx tsc --noEmit
git add CLAUDE.md docs/
git commit -m "docs: CLAUDE.md et archivage du prompt agent (questionnaire v2 serveur)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8 : Vérification finale

- [ ] **Step 1 : Suite complète**

```bash
npx tsc --noEmit && npm test && npx vite build \
  && node --check server/server.js \
  && node --check server/routes/questionnaire.js \
  && node --check server/lib/question-writer.js \
  && node --check server/lib/sessions-store.js
```
Expected: tout passe. Total tests attendu : **56**.

- [ ] **Step 2 : ⚠️ USER STEP — vérification navigateur de bout en bout**

Prérequis : migration Task 2 appliquée, projet Supabase réveillé, `MISTRAL_API_KEY` valide.
`npm run dev:all` puis dérouler dans le navigateur :
1. Profil **conjoint marié** : vérifier les 15 questions (compte joint posé), le tri-état « Je ne sais pas » sur l'assurance vie, le % de progression
2. Écran **récap** : modifier `relation` → parent, vérifier que le compte joint disparaît du récap
3. Confirmer → dashboard : étapes pré-cochées si organismes sélectionnés, étape FCDDV si pas de notaire
4. Couper `MISTRAL_API_KEY` (valeur bidon) et redémarrer : le questionnaire doit fonctionner **intégralement** sur les fallbacks
5. Produit transmission : `/demo` doit fonctionner comme avant (non-régression)

- [ ] **Step 3 : Revue globale** — le contrôleur dispatche la revue finale de branche (comme au Plan 1), puis `superpowers:finishing-a-development-branch`.

---

**Livré à l'issue de ce plan** : le questionnaire v2 est le flux vivant — moteur serveur, sessions persistées RLS, rédacteur LLM incapable de bloquer ou corrompre, récap confirmable, options canoniques de bout en bout. L'ancien agent conversationnel a disparu ; l'adaptateur transitoire aussi. **Plan 3 ensuite** : lot éditorial (~13 étapes sourcées : capital décès CPAM/fonction publique, Ficoba, acte de notoriété, allocation veuvage, réversion Agirc-Arrco, URSSAF indépendant, France Travail, attestation immobilière, warning non-résiliation, congé de deuil, enrichissements CNIL…) + relecture juridique (checklist dans `docs/design-questionnaire-v2.md`).
