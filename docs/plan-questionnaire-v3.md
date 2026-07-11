# Questionnaire v2 — Plan 3 : contenu éditorial, réglages rédacteur, robustesse ops — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compléter le questionnaire v2 avec le lot éditorial (~14 étapes sourcées), régler le rédacteur LLM (formulation compatible avec les options), élargir la question compte joint à tous les profils, et livrer la robustesse ops (purge pg_cron, rate limiting, reprise de session).

**Architecture:** Aucun changement de mécanique — le moteur, les routes et les invariants du Plan 1/2 sont le socle. Ce plan est majoritairement des DONNÉES (catalogue d'étapes) protégées par les invariants existants (`tests/invariants.test.ts` : anti-question-morte, parité des valeurs, anti-tableau-vide), plus quelques ajouts chirurgicaux (route `/resume`, middleware rate-limit, ligne d'options dans le prompt rédacteur). Spec : `docs/design-questionnaire-v2.md` (sections « Décisions reportées » et « Points obligatoires pour la relecture »).

**Tech Stack:** identique (Express JS, catalogues TS/JS, Vitest 64 tests actuels, Supabase pg_cron).

**Décisions verrouillées (2026-07-11)** : compte joint élargi à **tous les profils** ; périmètre = **backlog complet**.

**Exécution recommandée** : Tasks 1-5 et 7 sont mécaniques (code complet fourni). La Task 6 (contenu) exige une **recherche web** par étape (fiches service-public.fr spécifiques) — dispatcher un subagent par axe avec accès WebSearch/WebFetch, ou l'exécuter inline. La relecture juridique finale (Task 8) est humaine.

---

### Task 0 : Branche

- [x] **Step 1**
```bash
cd /Users/arnaudgay/Documents/git/Seren/Application
git checkout -b feat/questionnaire-v3
npm test   # 64 passed attendus au départ
```

---

### Task 1 : Compte joint pour tous les profils (décision produit)

**Files:**
- Modify: `server/lib/questions-catalog.js` (question `has_joint_account`)
- Modify: `tests/questionnaire-engine.test.ts`, `tests/questionnaire-routes.test.ts` (compteurs)

- [x] **Step 1 : Retirer la condition**

Dans `server/lib/questions-catalog.js`, question `has_joint_account` : remplacer `applicable_when: { relation: ['conjoint_marie', 'pacse', 'concubin'] },` par :
```javascript
    // Élargi à tous les profils (décision 2026-07-11) : les comptes joints parent/enfant âgé
    // sont fréquents — un enfant co-titulaire doit voir l'étape « débloquer le compte joint ».
    applicable_when: {},
```
Le `fallback_text` existant (« Aviez-vous un compte bancaire joint avec {prenom} ? ») convient à toutes les relations — ne pas y toucher.

- [x] **Step 2 : Adapter les tests (rouges d'abord — lancer `npm test` après chaque édition)**

`tests/questionnaire-engine.test.ts` :
- test `'conjoint marié : 15 questions…'` : inchangé (15).
- test `'enfant du défunt : 14 questions, pas de compte joint'` → renommer `'enfant du défunt : 15 questions, compte joint désormais posé (décision 2026-07-11)'`, `toHaveLength(15)`, `expect(sequence).toContain('has_joint_account')`.
- test `setAnswer — purge…` : la purge conjoint→parent ne purge PLUS has_joint_account (plus de condition). Remplacer les deux dernières assertions par :
```typescript
    answers = setAnswer(answers, spec('relation'), 'parent')
    expect(answers.has_joint_account).toBe(true) // la question est universelle : la réponse survit
    expect(nextQuestion(answers)?.id).toBe('has_vehicle')
```
- test `progress` : `expect(p0.total).toBeGreaterThanOrEqual(14)` → `toBe(15)` ; l'assertion post-conjoint `toBe(15)` inchangée.

`tests/questionnaire-routes.test.ts` :
- test start : `expect(q.progress).toEqual({ current: 0, total: 14 })` → `total: 15`.
- test `'correction au récap : relation conjoint→parent purge le compte joint…'` → la sémantique change : renommer `'correction au récap : relation conjoint→parent conserve le compte joint (question universelle)'` et remplacer les assertions finales par :
```typescript
    expect(res.body.data.action).toBe('recap')
    const complete = await request(app).post('/api/questionnaire/complete').send({ session_id: sessionId })
    expect(complete.body.answers.has_joint_account).toBe(true)
    expect(complete.body.answers.relation).toBe('parent')
```
- test `'correction parent→conjoint … la branche compte joint est posée avant de revenir au récap'` → il n'y a plus de branche à rouvrir : remplacer les assertions après le retour conjoint par :
```typescript
    expect(back.status).toBe(200)
    expect(back.body.data.action).toBe('recap') // aucune question rouverte : has_joint_account déjà répondu
```
(supprimer l'appel/assertions `has_joint_account` qui suivaient).

- [x] **Step 3 : Vérifier** — `npm test` → 64 passed ; `npx tsc --noEmit`.

- [x] **Step 4 : Commit**
```bash
git add server/lib/questions-catalog.js tests/questionnaire-engine.test.ts tests/questionnaire-routes.test.ts
git commit -m "feat(questionnaire-v3): la question compte joint est posée à tous les profils

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

> **Note post-revue Task 1 (exécution)** : `has_joint_account` était **la seule** question du
> catalogue à porter un `applicable_when` non vide. La rendre universelle a supprimé le dernier
> scénario où l'API pouvait déclarer une question « inapplicable » — le test d'intégration
> pré-existant `'question inapplicable → 400'` (tests/questionnaire-routes.test.ts) n'était donc
> plus exerçable avec le catalogue réel. Il a été retiré (net **64 → 63 tests**) et remplacé par
> un commentaire explicatif à son emplacement. Le mécanisme `matchesWhen` sous-jacent (utilisé par
> la route pour renvoyer le 400) reste couvert unitairement par le test de parité
> `isApplicable` ↔ `matchesWhen` dans tests/invariants.test.ts. À réintroduire au niveau route si
> un lot ultérieur (ex. Task 6, éditorial) rétablit des questions conditionnelles. Aussi mis à
> jour : le commentaire désormais faux de `src/types/questionnaire.ts` (le champ n'est plus
> conditionné au couple).

---

### Task 2 : Rédacteur — formulation compatible avec les options

**Files:**
- Modify: `server/lib/writer-prompt.js`
- Modify: `tests/question-writer.test.ts`

Constat E2E (spec, point 8 de la checklist) : le rédacteur formule parfois en oui/non au-dessus d'un select à 6 choix. Fix : lui donner les libellés d'options en contexte, avec interdiction de les lister.

- [x] **Step 1 : Test rouge** — dans le describe `buildWriterMessages` de `tests/question-writer.test.ts` :
```typescript
  it('les libellés des options sont fournis au rédacteur pour une formulation compatible', () => {
    const spec = { ...SPEC, type: 'select', options: [{ value: 'a', label: 'Premier choix' }, { value: 'b', label: 'Second choix' }] }
    const messages = buildWriterMessages(spec, {})
    expect(messages[1].content).toContain('Premier choix')
    expect(messages[1].content).toContain('formulation ouverte')
  })
```
Run → FAIL.

- [x] **Step 2 : Implémenter** — dans `buildWriterMessages` (`server/lib/writer-prompt.js`), ajouter dans `parts`, juste avant la ligne « Formulation de référence » :
```javascript
    spec.options
      ? `Les réponses proposées à l'utilisateur seront : ${spec.options.map((o) => o.label).join(' / ')}. Choisis une formulation ouverte compatible avec TOUS ces choix (jamais une question oui/non au-dessus d'un choix multiple), sans les lister.`
      : '',
```

- [x] **Step 3 : Vérifier** — `npm test` → 65 ; spot-check Mistral réel (3 générations `statut_professionnel`, contexte relation parent) : la question ne doit plus être une tournure oui/non. Commande :
```bash
node --input-type=module -e "
import 'dotenv/config'; import { Mistral } from '@mistralai/mistralai'
import { writeQuestionText } from './server/lib/question-writer.js'
import { QUESTIONS_CATALOG } from './server/lib/questions-catalog.js'
const spec = QUESTIONS_CATALOG.find((q) => q.id === 'statut_professionnel')
const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY })
for (let i = 0; i < 3; i++) console.log((await writeQuestionText({ spec, context: { prenom: 'Pierre', relation: 'parent' }, mistral, model: 'mistral-small-latest' })).question)
"
```

- [x] **Step 4 : Commit**
```bash
git add server/lib/writer-prompt.js tests/question-writer.test.ts
git commit -m "fix(questionnaire-v3): le rédacteur connaît les options et formule des questions ouvertes compatibles

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3 : Purge pg_cron des sessions expirées

**Files:**
- Create: `supabase/migrations/20260711100000_purge_sessions_cron.sql`

- [x] **Step 1 : Écrire la migration**
```sql
-- Purge physique des sessions expirées (l'expiration n'était jusqu'ici qu'une invisibilité
-- à la lecture — la table grossissait sans borne). L'index questionnaire_sessions_expires_idx
-- existe déjà pour ce delete. Tourne chaque nuit à 03:17 UTC.
create extension if not exists pg_cron;

select cron.schedule(
  'purge-questionnaire-sessions',
  '17 3 * * *',
  $$ delete from questionnaire_sessions where expires_at < now() $$
);
```

- [ ] **Step 2 : ⚠️ USER STEP** — appliquer dans le SQL Editor Supabase. Si `pg_cron` n'est pas disponible sur le plan du projet, l'activer d'abord via Dashboard → Database → Extensions. Vérification : `select jobname, schedule from cron.job;` doit lister `purge-questionnaire-sessions`.

- [x] **Step 3 : Commit**
```bash
git add supabase/migrations/20260711100000_purge_sessions_cron.sql
git commit -m "feat(questionnaire-v3): purge nocturne pg_cron des sessions expirées

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4 : Rate limiting sur /start

**Files:**
- Create: `server/lib/rate-limit.js`
- Modify: `server/routes/questionnaire.js` (route /start), `server/server.js` (rien — le router reste autonome)
- Test: `tests/rate-limit.test.ts`

Chaque `/start` = 1 ligne BDD + 1 appel LLM. Limiteur en mémoire par utilisateur (suffisant mono-instance ; si multi-instances un jour, passer à un compteur BDD).

- [x] **Step 1 : Tests rouges** — `tests/rate-limit.test.ts` :
```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
// @ts-expect-error — module JS serveur
import { createUserRateLimiter } from '../server/lib/rate-limit.js'

afterEach(() => vi.useRealTimers())

describe('createUserRateLimiter', () => {
  it('laisse passer jusqu’à la limite puis 429, par utilisateur', () => {
    const limiter = createUserRateLimiter({ max: 2, windowMs: 60_000 })
    const res = { statusCode: 200, body: null as unknown, status(c: number) { this.statusCode = c; return this }, json(b: unknown) { this.body = b; return this } }
    const call = (userId: string) => {
      const r = { ...res, statusCode: 200 }
      let passed = false
      limiter({ user: { id: userId } }, r, () => { passed = true })
      return passed ? 200 : r.statusCode
    }
    expect(call('u1')).toBe(200)
    expect(call('u1')).toBe(200)
    expect(call('u1')).toBe(429)
    expect(call('u2')).toBe(200) // isolation par utilisateur
  })
  it('la fenêtre glissante libère après windowMs', () => {
    vi.useFakeTimers()
    const limiter = createUserRateLimiter({ max: 1, windowMs: 1000 })
    const pass = () => { let ok = false; limiter({ user: { id: 'u' } }, { status: () => ({ json: () => {} }) }, () => { ok = true }); return ok }
    expect(pass()).toBe(true)
    expect(pass()).toBe(false)
    vi.advanceTimersByTime(1100)
    expect(pass()).toBe(true)
  })
})
```
Run → FAIL.

- [x] **Step 2 : Implémenter** — `server/lib/rate-limit.js` :
```javascript
// Limiteur en mémoire par utilisateur (fenêtre glissante). Suffisant en mono-instance ;
// pour du multi-instances, remplacer par un compteur partagé (BDD/Redis).
// À monter APRÈS requireAuth (dépend de req.user.id).

export function createUserRateLimiter({ max, windowMs, message = 'Trop de requêtes, réessayez dans quelques minutes.' }) {
  const hits = new Map() // userId → timestamps[]
  return function rateLimit(req, res, next) {
    const now = Date.now()
    const userId = req.user?.id ?? 'anonyme'
    const stamps = (hits.get(userId) ?? []).filter((t) => now - t < windowMs)
    if (stamps.length >= max) {
      return res.status(429).json({ success: false, error: message })
    }
    stamps.push(now)
    hits.set(userId, stamps)
    next()
  }
}
```

- [x] **Step 3 : Brancher sur /start** — dans `server/routes/questionnaire.js` :
- import : `import { createUserRateLimiter } from '../lib/rate-limit.js'`
- dans `createQuestionnaireRouter`, avant les routes :
```javascript
  // Chaque /start coûte 1 ligne BDD + 1 appel LLM : 10/h par utilisateur suffit largement
  // pour un usage légitime (recommencer quelques fois) et coupe l'abus.
  const startLimiter = createUserRateLimiter({ max: 10, windowMs: 60 * 60 * 1000 })
```
- route start : `router.post('/start', requireAuth, startLimiter, async (req, res) => {`

- [x] **Step 4 : Vérifier** — `npm test` → 67 ; `node --check` sur les 2 fichiers. Test manuel rapide : 11 `curl /start` authentifiés → le 11ᵉ répond 429.

- [x] **Step 5 : Commit**
```bash
git add server/lib/rate-limit.js server/routes/questionnaire.js tests/rate-limit.test.ts
git commit -m "feat(questionnaire-v3): rate limiting par utilisateur sur /start (10/h)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5 : Reprise de session (refresh sans tout perdre)

**Files:**
- Modify: `server/routes/questionnaire.js` (route POST /resume)
- Modify: `src/pages/QuestionnairePage.tsx`
- Test: `tests/questionnaire-routes.test.ts` (+2)

- [x] **Step 1 : Tests rouges** — describe `parcours complet…` :
```typescript
  it('resume : session en cours → prochaine question ; session finie → récap', async () => {
    const { app } = makeApp()
    const start = await request(app).post('/api/questionnaire/start')
    await request(app).post('/api/questionnaire/answer').send({ session_id: start.body.session_id, question_id: 'relation', value: 'parent' })
    const mid = await request(app).post('/api/questionnaire/resume').send({ session_id: start.body.session_id })
    expect(mid.status).toBe(200)
    expect(mid.body.data.question_id).toBe('deceased_firstname')
    const { sessionId } = await runToRecap(app)
    const done = await request(app).post('/api/questionnaire/resume').send({ session_id: sessionId })
    expect(done.body.data.action).toBe('recap')
  })
  it('resume : session inconnue → 404', async () => {
    const { app } = makeApp()
    const res = await request(app).post('/api/questionnaire/resume').send({ session_id: 'sess-inexistante' })
    expect(res.status).toBe(404)
  })
```

- [x] **Step 2 : Route** — dans `createQuestionnaireRouter`, après `/reask` :
```javascript
  router.post('/resume', requireAuth, async (req, res) => {
    try {
      const { session_id } = req.body
      if (!session_id) return res.status(400).json({ success: false, error: 'session_id requis' })
      const session = await store.loadSession(req.supabaseClient, session_id)
      if (!session) return res.status(404).json({ success: false, error: 'Session non trouvée ou expirée' })
      // Reprise par construction : nextQuestion(answers) repart exactement où on en était.
      const data = await renderNext(session)
      res.json({ success: true, data })
    } catch (error) {
      console.error('❌ questionnaire/resume :', error)
      res.status(500).json({ success: false, error: 'Erreur lors de la reprise' })
    }
  })
```

- [x] **Step 3 : Frontend** — `src/pages/QuestionnairePage.tsx` :
- après un `/start` réussi : `sessionStorage.setItem('seren_questionnaire_session', result.session_id)`
- dans `confirmAndGenerate` après `setPhase('done')` ET dans le bouton « Recommencer » de session expirée : `sessionStorage.removeItem('seren_questionnaire_session')`
- au montage (nouveau `useEffect` + callback `resumeSession`) :
```tsx
  useEffect(() => {
    const saved = sessionStorage.getItem('seren_questionnaire_session')
    if (!saved || phase !== 'welcome') return
    ;(async () => {
      setPhase('loading')
      try {
        const response = await apiFetch('/api/questionnaire/resume', {
          method: 'POST',
          body: JSON.stringify({ session_id: saved }),
        })
        if (response.status === 404) {
          sessionStorage.removeItem('seren_questionnaire_session')
          setPhase('welcome')
          return
        }
        const result = await response.json()
        if (result.success) {
          setSessionId(saved)
          showServerData(result.data)
        } else {
          setPhase('welcome')
        }
      } catch {
        setPhase('welcome')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
```

- [x] **Step 4 : Vérifier** — `npm test` → 69 ; `npx tsc --noEmit` ; `npx vite build`. Manuel : démarrer un questionnaire sur 5173, répondre à 3 questions, F5 → on reprend à la question 4.

- [x] **Step 5 : Commit**
```bash
git add server/routes/questionnaire.js src/pages/QuestionnairePage.tsx tests/questionnaire-routes.test.ts
git commit -m "feat(questionnaire-v3): reprise de session après refresh (route /resume + sessionStorage)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6 : Lot éditorial — ~14 étapes sourcées (recherche web requise)

**Files:**
- Modify: `src/data/steps-catalog.ts`
- Modify: `tests/roadmap-generator.test.ts` (atteignabilité)

⚠️ Cette task produit du CONTENU juridique destiné à des personnes en deuil. Règles absolues :
1. **Une fiche source par étape** : chercher la fiche service-public.fr (ou CNIL/URSSAF) SPÉCIFIQUE (WebSearch), la lire (WebFetch), et ne mettre dans l'étape QUE des faits lus sur cette page. `source_url` = cette fiche précise, jamais la F16507 générique.
2. **Aucun montant/délai de mémoire** : chaque chiffre (plafond, délai, âge) doit être vérifié sur la source au moment de la rédaction. En cas de doute → formulation sans chiffre (« un plafond réglementaire », « sous conditions »).
3. **Template obligatoire** (identique aux 30 étapes existantes) : `id`, `title` (infinitif), `description` (2 phrases, ton empathique), `theme`, `urgency`+`urgency_label`, `when_to_do`, `why_to_do`, `what_you_do` (2-4 actions concrètes), `responsable`, `requires_notary`, `applicable_when`, `source_url`, `display_order` (38+ dans l'ordre ci-dessous). `organisme_key` UNIQUEMENT si listé ci-dessous.
4. Les invariants (`npm test`) DOIVENT rester verts après chaque étape ajoutée.

- [x] **Step 1 : Axe banque/succession (toujours applicables)**

| id | condition | organisme_key | à vérifier sur la source |
|---|---|---|---|
| `banque-deblocage-frais-obseques` | `{}` | — | plafond de déblocage pour frais d'obsèques (≈6 000 €, chiffre exact à vérifier), qui peut demander, pièces |
| `banque-recherche-ficoba` | `{}` | — | procédure Ficoba pour les héritiers (qui, comment, gratuit ?) |
| `succession-acte-notoriete` | `{}` | — | seuil au-delà duquel l'acte de notoriété est exigé par les banques, coût approximatif chez le notaire |

- [x] **Step 2 : Axe droits du conjoint** (fiches réversion/veuvage spécifiques)

| id | condition | à vérifier |
|---|---|---|
| `administratif-reversion-agirc-arrco` | `relation: ['conjoint_marie']` | conditions Agirc-Arrco (pas de condition de ressources, remariage, taux 60 %) — distincte de la réversion de base déjà couverte |
| `administratif-allocation-veuvage` | `relation: ['conjoint_marie']` | conditions d'âge (<55 ans), ressources, durée, organisme (Cnav/MSA) |

- [x] **Step 3 : Axe statut professionnel** (ferme les valeurs d'enum encore inertes)

| id | condition | à vérifier |
|---|---|---|
| `administratif-capital-deces-cpam` | `statut_professionnel: ['salarie', 'demandeur_emploi']` | montant forfaitaire du capital décès Sécurité sociale, délais de demande (prioritaire 1 mois), bénéficiaires |
| `administratif-capital-deces-fonction-publique` | `statut_professionnel: ['fonctionnaire']` | régime spécifique fonction publique |
| `administratif-urssaf-independant` | `statut_professionnel: ['independant']` | radiation/cessation d'activité auprès de l'URSSAF, formalités entreprise individuelle, capital décès des indépendants |
| `administratif-france-travail` | `statut_professionnel: ['demandeur_emploi']` | informer France Travail, allocation décès éventuelle aux ayants droit |

- [x] **Step 4 : Axe logement/patrimoine**

| id | condition | à vérifier |
|---|---|---|
| `logement-attestation-immobiliere` | `logement: ['proprietaire']` | attestation de propriété immobilière notariée : délai (~6 mois lié à la déclaration de succession), rôle du notaire (`requires_notary: true`, `responsable: 'partage'`) |
| `logement-ne-pas-resilier-trop-tot` | `{}` | étape « warning » (`warning_badge` renseigné) : ne PAS résilier eau/gaz/électricité/assurance habitation avant l'accord des héritiers — l'assurance habitation doit être MAINTENUE |

- [x] **Step 5 : Axe obsèques/utilisateur**

| id | condition | à vérifier |
|---|---|---|
| `obseques-utiliser-contrat` | `contrat_obseques: ['oui']` | comment activer un contrat obsèques existant (assureur, pompes funèbres, volontés) — ferme la valeur 'oui' encore inerte |
| `administratif-conge-deuil` | `{}` | congé de deuil du PROCHE (l'utilisateur) : 3 jours minimum, 12-14 jours + congé de deuil si enfant, justificatifs |

- [x] **Step 6 : Axe numérique (CNIL)** — enrichir les DEUX étapes existantes `numerique-reseaux-sociaux` et `numerique-boite-email` : ajouter dans `what_you_do` le signalement de décès aux plateformes / compte commémoratif (Facebook, Instagram, LinkedIn) et le droit des héritiers à la clôture (loi République numérique) ; ajouter `source_url` vers la page CNIL « mort numérique ». Ne pas créer de nouvelle étape.

- [x] **Step 7 : Re-sourcing des 7 étapes du Plan 1** — remplacer le `source_url` générique F16507 des étapes `assurance-vie-recherche-agira`, `famille-juge-tutelles`, `patrimoine-carte-grise`, `patrimoine-assurance-emprunteur`, `administratif-aide-domicile`, `obseques-recherche-contrat-agira`, `succession-recherche-testament-fcddv` par leur fiche spécifique, et vérifier au passage chaque fait chiffré (15 j AGIRA, 1 mois assureur, 30 j aide à domicile, ~18 € FCDDV, formulaireagira.fr, adsn.notaires.fr). Corriger `patrimoine-assurance-emprunteur` : « obligatoire pour l'immobilier » → « quasi systématiquement exigée par les banques ».

- [x] **Step 8 : Test d'atteignabilité étendu** — dans `tests/roadmap-generator.test.ts`, étendre les profils du test `'atteignabilité'` pour couvrir les nouvelles conditions (`statut_professionnel: 'fonctionnaire'`, `'independant'`, `'demandeur_emploi'`, `logement: 'proprietaire'`, `contrat_obseques: 'oui'`). Le test existant échouera pour toute étape inatteignable — le faire passer prouve la couverture.

- [x] **Step 9 : Vérifier** — `npm test` (tous verts, invariants inclus) ; `npx tsc --noEmit` ; `npx vite build`.

- [x] **Step 10 : Commit** (un commit par axe est accepté, sinon un seul)
```bash
git add src/data/steps-catalog.ts tests/roadmap-generator.test.ts
git commit -m "feat(questionnaire-v3): lot éditorial — 13 nouvelles étapes sourcées + enrichissement numérique + re-sourcing Plan 1

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

> **Note post-revue Task 6 (exécution)** : 3 des 13 étapes citent la page officielle de
> l'opérateur plutôt que service-public.fr au sens strict (agirc-arrco.fr, inpi.fr,
> francetravail.fr) — l'esprit de la règle (fiche officielle précise, faits vérifiés dessus)
> est respecté.

---

### Task 7 : Invariant d'atteignabilité par VALEUR + passe UX

**Files:**
- Modify: `tests/invariants.test.ts`
- Modify: `src/components/questionnaire/CompletionScreen.tsx`, `src/pages/QuestionnairePage.tsx`

- [x] **Step 1 : Invariant par valeur (avec liste neutre explicite)** — ajouter dans `tests/invariants.test.ts` :
```typescript
  it('chaque valeur d’option d’une question conditionnelle influence ≥ 1 étape, sauf valeurs neutres documentées', () => {
    // Une valeur « neutre » signifie légitimement « rien à faire de plus » — liste exhaustive et volontaire.
    const NEUTRAL: Record<string, string[]> = {
      relation: ['parent', 'enfant', 'frere_soeur', 'autre'], // pacse/concubin pilotent le transfert de contrats ; les autres relations sont neutres par nature
      statut_professionnel: ['retraite', 'sans_activite'], // CARSAT/impôts déjà inconditionnels
      logement: ['heberge_ou_autre'],
      enfants: ['aucun', 'majeurs'], // pension d'orphelin = backlog éditorial futur
      has_life_insurance: ['non'],
      contrat_obseques: ['non'],
    }
    for (const q of QUESTIONS_CATALOG) {
      const values = q.options?.map((o: { value: string }) => o.value)
        ?? (q.type === 'tristate' ? ['oui', 'non', 'ne_sait_pas'] : null)
      if (!values || IDENTITY_FIELDS.includes(q.id) || SPECIAL_FIELDS.includes(q.id)) continue
      for (const v of values) {
        if (NEUTRAL[q.id]?.includes(v)) continue
        const used = STEPS_CATALOG.some((s) => {
          const cond = (s.applicable_when as Record<string, unknown>)[q.id]
          return Array.isArray(cond) && cond.includes(v)
        })
        expect(used, `valeur inerte non documentée : ${q.id}=${v}`).toBe(true)
      }
    }
  })
```
Ce test DOIT passer après la Task 6 (il vérifie que fonctionnaire/independant/demandeur_emploi/proprietaire/contrat 'oui' sont désormais branchés). S'il échoue : soit une étape manque (Task 6 incomplète), soit une valeur doit être ajoutée à `NEUTRAL` avec justification en commentaire.

- [x] **Step 2 : Accents de `CompletionScreen.tsx`** — corriger le texte statique : `pret` → `prêt`, `detaille` → `détaillé`, `pre-remplis` → `pré-remplis`, `a effectuer` → `à effectuer` (title et paragraphes).

- [x] **Step 3 : Message de session expirée** — dans `QuestionnairePage.tsx`, remplacer le texte ambigu (« Vos réponses n'ont pas été perdues côté serveur si vous aviez terminé — sinon, il faudra recommencer. Nous sommes désolés. ») par :
```
Votre session a expiré après 24 heures d'inactivité. Nous sommes désolés — il faudra reprendre le questionnaire depuis le début. Vos réponses ne sont conservées que le temps de la session, par respect de votre vie privée.
```

- [x] **Step 4 : Vérifier** — `npm test` (+1 test) ; `npx tsc --noEmit` ; `npx vite build`.

- [x] **Step 5 : Commit**
```bash
git add tests/invariants.test.ts src/components/questionnaire/CompletionScreen.tsx src/pages/QuestionnairePage.tsx
git commit -m "test(questionnaire-v3): invariant d'atteignabilité par valeur + passe UX (accents, message expiration)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8 : Vérification finale, relecture humaine, revue globale

- [x] **Step 1 : Suite complète**
```bash
npx tsc --noEmit && npm test && npx vite build && node --check server/server.js && node --check server/routes/questionnaire.js && node --check server/lib/rate-limit.js
```

- [x] **Step 2 : E2E navigateur** (compte de test : `test.e2e.claude@seren-test.fr` / `TestSeren2026!`) — profil **enfant du défunt, père indépendant propriétaire, contrat obsèques 'oui'** : vérifier compte joint posé (nouveau), étapes URSSAF/attestation immobilière/contrat obsèques dans la roadmap, reprise après F5 en cours de questionnaire, formulations du rédacteur compatibles avec les options.

- [ ] **Step 3 : ⚠️ USER STEP — relecture juridique/éditoriale** : Arnaud (ou un juriste) relit les ~14 nouvelles étapes + les points de la checklist du spec (`docs/design-questionnaire-v2.md`, section « Points obligatoires pour la relecture ») — en particulier `famille-juge-tutelles` (réforme 2019) et tous les montants/délais.

- [ ] **Step 4 : Revue globale de branche** (contrôleur) puis `superpowers:finishing-a-development-branch` (merge local dans main — Arnaud pushe).

---

**Reste au backlog après ce plan** (non bloquant) : pension d'orphelin (`enfants: ['majeurs'|'mineurs']`), personas non couvertes (enfant répondant pour un parent veuf → réversion, ex-conjoint divorcé), décès à l'étranger, CAS multi-instances du rate limiter, chantiers de `docs/plan-points-attention.md` (§1 CLI Supabase, §4 audit RLS), feature envoi de courriers (`docs/design-envoi-courriers.md`).
