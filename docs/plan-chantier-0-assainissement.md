# Chantier 0 — Assainissement · Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Exécuter le chantier 0 de la roadmap technique — gel de la démo transmission, purge des routes mortes et des logs PII, noindex de l'app, CI GitHub Actions, Sentry, README à jour, baseline des migrations Supabase + push des 2 migrations en attente, correctifs landing, runbook staging.

**Architecture :** Spec validée dans `docs/design-chantier-0-assainissement.md` (état des lieux vérifié le 24/07 : drifts schéma↔code déjà résolus — rien à migrer côté colonnes). Travail sur branche `feature/chantier-0-assainissement`, merge fast-forward dans `main` à la fin (Arnaud pushe lui-même). La task 7 opère dans le repo **landing** (`../landing`, commits sur `main` local).

**Tech stack :** Express/Node 26 (serveur JS), React 18 + Vite + TS, Vitest (157 tests / 15 fichiers), Supabase CLI v2.109.1, @sentry/node + @sentry/react, GitHub Actions, Next 16 (landing).

**Référence état initial :** `server/server.js` = 701 lignes (numéros de lignes cités d'après cet état). 157 tests verts (15 fichiers). `supabase/schema_full.sql` = 289 lignes.

**USER STEP à faire dès le début de la session d'exécution** (débloque la task 6, ~5 min, terminal d'Arnaud) :

```bash
supabase login        # ouvre le navigateur
supabase link --project-ref oltwzvfjazwjvghpzhia   # demande le mot de passe BDD (Dashboard → Settings → Database)
```

---

## Task 0 : Branche de travail

**Files:** aucun.

- [x] **Step 0.1 :** `git -C /Users/arnaudgay/Documents/git/Seren/Application checkout -b feature/chantier-0-assainissement` (depuis `main` propre). Vérifier : `git status` → clean, branche créée.

---

## Task 1 : Gel démo + suppression des routes auth mortes (serveur + front)

Réalise A1 + A2 de la spec. Les routes `/api/auth/*` ne sont appelées par aucun code front (vérifié : zéro occurrence de `api/auth` dans `src/`). La démo (`DemoPage`) est cassée en prod (fetch sans token → 401) ; décision produit actée : gel. Les logs PII (emails, réponses Mistral, codes d'accès) vivent tous dans les blocs supprimés.

**Files:**
- Modify: `server/server.js`
- Modify: `src/App.tsx`
- Delete: `src/pages/DemoPage.tsx`

- [x] **Step 1.1 : Supprimer les blocs dans `server/server.js`** (lignes d'après l'état initial 701 lignes) :

1. Ligne 7 : supprimer `import crypto from 'crypto';` (seul usager : `generateAccessCode`, supprimé ci-dessous).
2. Ligne 120 : supprimer `const AGENT_ID = process.env.MISTRAL_AGENT_ID; // utilisé UNIQUEMENT par le produit transmission (/api/demo/*)`.
3. Lignes 157–190 : supprimer le bloc des helpers démo — du commentaire `// Stockage temporaire des réponses par session` (avec `const sessions = new Map();`) jusqu'à la fin de `buildContextPrompt` inclus (`generateSessionId`, `generateAccessCode`, `buildContextPrompt` n'ont aucun autre usager).
4. Lignes 192–361 : supprimer le bloc entier `// ==================== ROUTES AUTHENTIFICATION ====================` (5 routes : signup, login, logout, me, refresh) et le **remplacer** par le header de section :

```js
// ==================== PRODUIT TRANSMISSION (lecture seule) ====================
// La création (page de démo et ses trois routes serveur) a été retirée au chantier 0 —
// produit gelé. Restent : lecture par le propriétaire et lecture par code d'accès (AccessPage).
```

5. Lignes 426–680 : supprimer le bloc entier `// ==================== ROUTES MODE DÉMO ====================` (3 routes : start, answer, save). Le bloc suivant conservé commence à `// ==================== ROUTES UTILITAIRES ====================`.
6. Ligne 699 : remplacer

```js
  console.log(`📝 Rédacteur questionnaire v2 : ${MISTRAL_MODEL} | Agent transmission : ${AGENT_ID ? 'configuré' : 'absent'}`);
```

par

```js
  console.log(`📝 Rédacteur questionnaire v2 : ${MISTRAL_MODEL}`);
```

7. SPA fallback (lignes 690–694) : les GET `/api/*` inconnus restaient sans réponse (la requête pendait). Après suppression des routes, `GET /api/demo/start` pendrait au lieu de répondre 404 — corriger :

```js
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(staticDir, 'index.html'));
  } else {
    res.status(404).json({ success: false, error: 'Not found' });
  }
});
```

Restent intacts : `requireAuth`, `getSupabaseClient`, `/api/user/transmission`, `/api/transmission/:code`, `/api/health`, routers questionnaire + letters, client Mistral (`client`, utilisé par le questionnaire v2).

- [x] **Step 1.2 : Vérifier la syntaxe** — Run : `node --check server/server.js` → exit 0, aucune sortie.

- [x] **Step 1.3 : Front** — dans `src/App.tsx` : supprimer la ligne `import { DemoPage } from '@/pages/DemoPage'` et la ligne `<Route path="/demo" element={<ProtectedRoute><DemoPage /></ProtectedRoute>} />` (seules références au fichier, vérifié). Puis : `git rm src/pages/DemoPage.tsx`.

- [x] **Step 1.4 : Type-check + tests** — Run : `npx tsc --noEmit` → 0 erreur. `npx vitest run` → **15 fichiers / 157 tests verts** (aucun test ne référence demo ni /api/auth — vérifié).

- [x] **Step 1.5 : Boot check** — Run :

```bash
PORT=3999 node server/server.js & sleep 1
curl -s http://localhost:3999/api/health                                            # → {"status":"ok",...}
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3999/api/demo/start   # → 404
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3999/api/auth/login   # → 404
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3999/api/nimporte             # → 404 (fix SPA fallback)
kill %1
```

- [x] **Step 1.6 : Vérif zéro PII dans les logs** — Run : `grep -rn "console\." server/` → plus AUCUNE occurrence loggant email, réponse IA, code d'accès, token ou payload utilisateur. Attendu restant : logs de démarrage (l.697–700), erreurs techniques préfixées `❌`/`⚠️` (auth middleware, transmission, letters, questionnaire — objets d'erreur uniquement), warning `letters-store` (config). `grep -rn "api/demo\|api/auth\|MISTRAL_AGENT_ID\|DemoPage" src/ server/` → zéro occurrence.

- [x] **Step 1.7 : Commit** —

```bash
git add -A
git commit -m "feat(chantier-0): gel démo transmission + suppression routes auth mortes — zéro PII loggée"
```

> **Note post-revue (Task 1, 2026-07-24) :** (1) La suite compte **157 tests** (pas 140 — chiffre issu d'un run sans `.env` où 2 fichiers échouaient à la collecte ; décomptes corrigés dans tout le plan). (2) Le grep « zéro occurrence » du Step 1.6 était incompatible avec 3 commentaires : deux commentaires pré-existants devenus obsolètes (`AppHeader.tsx`, `strings.fr.ts` — ils citaient la DemoPage supprimée) et le header de section que le plan imposait avec le chemin littéral. Correctif : les deux commentaires mis à jour (AccessPage seule), le header reformulé sans chemin littéral (texte ci-dessus corrigé), grep vert ensuite.

---

## Task 2 : Robots / noindex de l'app

Espace privé (données sensibles) : politique inverse de la landing. Réalise A3.

**Files:**
- Create: `public/robots.txt`
- Modify: `server/server.js`

- [x] **Step 2.1 :** Créer `public/robots.txt` (le dossier `public/` n'existe pas encore — Vite le copiera dans `dist/` au build) :

```
User-agent: *
Disallow: /
```

- [x] **Step 2.2 :** Dans `server/server.js`, insérer APRÈS le bloc `app.use(cors({...}))` et AVANT le montage du webhook (`app.use('/api/letters/webhook', ...)`) — l'ordre garantit le header sur TOUTES les réponses, y compris statiques :

```js
// Espace privé : interdire l'indexation par les moteurs (politique inverse de la
// landing publique). Complété par public/robots.txt (Disallow: /).
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});
```

- [x] **Step 2.3 : Vérifier** — Run :

```bash
node --check server/server.js
npm run build          # tsc -b && vite build ; vérifie aussi que public/ est copié
ls dist/robots.txt     # → présent
PORT=3999 node server/server.js & sleep 1
curl -sI http://localhost:3999/api/health | grep -i x-robots-tag    # → X-Robots-Tag: noindex, nofollow
curl -s http://localhost:3999/robots.txt                            # → User-agent: * / Disallow: /
kill %1
```

- [x] **Step 2.4 : Commit** —

```bash
git add public/robots.txt server/server.js
git commit -m "feat(chantier-0): noindex app — X-Robots-Tag global + robots.txt Disallow"
```

---

## Task 3 : CI GitHub Actions

Réalise A4. Vérifié le 24/07 : sans `.env`, 13/15 fichiers passent ; `tests/invariants.test.ts` et `tests/roadmap-generator.test.ts` échouent à l'import car `src/lib/supabase.ts` jette si `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` manquent. Remède CI : variables factices (aucun test ne fait de réseau — le client Supabase est créé mais jamais appelé dans ces suites).

**Files:**
- Create: `.github/workflows/ci.yml`

- [x] **Step 3.1 :** Créer `.github/workflows/ci.yml` :

```yaml
name: CI

on: [push, pull_request]

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    env:
      # Factices : src/lib/supabase.ts jette à l'import si absentes.
      # Aucun test ne fait d'appel réseau — jamais de secrets réels ici.
      VITE_SUPABASE_URL: http://localhost:54321
      VITE_SUPABASE_PUBLISHABLE_KEY: sb_publishable_ci_dummy
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npx vitest run
```

- [x] **Step 3.2 : Simuler la CI localement** (mêmes conditions : pas de `.env`, variables factices) — Run :

```bash
mv .env .env.chantier0.bak
VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_dummy npx vitest run
npx tsc --noEmit
mv .env.chantier0.bak .env
ls .env   # → .env restauré (OBLIGATOIRE avant de continuer)
```

Attendu : **15 fichiers / 157 tests verts**, tsc 0 erreur.

- [x] **Step 3.3 : Commit** —

```bash
git add .github/workflows/ci.yml
git commit -m "feat(chantier-0): CI GitHub Actions — tsc + vitest sur push et PR"
```

(La CI verte sur GitHub se vérifie après le push d'Arnaud — user step de clôture.)

> **Note post-revue (Task 3, 2026-07-24) :** revue qualité — ajout de `permissions: contents: read` (top-level) et `timeout-minutes: 10` (job) au workflow ; bloc du Step 3.1 aligné. Notés pour plus tard (hors scope) : champ `engines` dans package.json (Task 5/9 si pertinent), groupe `concurrency` si les runs dupliqués push+PR deviennent gênants.

---

## Task 4 : Sentry front + serveur (no-op sans DSN)

Réalise A5. Pattern Resend : env absente → feature inerte, aucun crash. Config minimale RGPD : erreurs uniquement, `tracesSampleRate: 0`, `sendDefaultPii: false`, pas de replay, pas de user context. API Sentry v8+ vérifiée : `Sentry.init()` + `Sentry.setupExpressErrorHandler(app)` (l'error-only ne requiert pas le preload `--import`).

**Files:**
- Modify: `package.json` (+ lockfile, via npm install)
- Modify: `server/server.js`
- Create: `src/lib/sentry.ts`
- Modify: `src/main.tsx`
- Modify: `src/components/layout/ErrorBoundary.tsx`

- [x] **Step 4.1 :** Run : `npm install @sentry/node @sentry/react` → exit 0.

- [x] **Step 4.2 : Serveur** — dans `server/server.js` :

1. Ajouter aux imports (en tête, avec les autres imports) : `import * as Sentry from '@sentry/node';`
2. Juste APRÈS la ligne `dotenv.config({ ... })`, ajouter :

```js
// Sentry serveur : erreurs uniquement (pas de tracing, pas de PII), inerte sans SENTRY_DSN.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}
```

3. Juste AVANT `app.listen(PORT, ...)` (et après toutes les routes) :

```js
// Après toutes les routes : capture les erreurs Express non gérées vers Sentry.
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}
```

- [x] **Step 4.3 : Front** — créer `src/lib/sentry.ts` :

```ts
import * as Sentry from '@sentry/react'

// Sentry front : erreurs uniquement, inerte sans VITE_SENTRY_DSN (pattern Resend).
// RGPD : pas de tracing, pas de replay, pas de user context, pas de PII par défaut.
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return
  Sentry.init({ dsn, sendDefaultPii: false })
}
```

Dans `src/main.tsx`, ajouter l'import et l'appel AVANT `initPosthog()` :

```ts
import { initSentry } from '@/lib/sentry'
```

```ts
// Initialiser Sentry (no-op sans VITE_SENTRY_DSN)
initSentry()
```

Si `src/vite-env.d.ts` déclare une interface `ImportMetaEnv` explicite, y ajouter `readonly VITE_SENTRY_DSN?: string` ; sinon ne rien faire.

- [x] **Step 4.4 : ErrorBoundary** — dans `src/components/layout/ErrorBoundary.tsx` : ajouter `import * as Sentry from '@sentry/react'` et remplacer le bloc TODO de `componentDidCatch` :

```ts
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo)
    // No-op si Sentry non initialisé (VITE_SENTRY_DSN absente)
    Sentry.captureException(error)
  }
```

Mettre à jour le commentaire de classe (« En production, reporterait vers Sentry » → « Reporte vers Sentry quand `VITE_SENTRY_DSN` est configurée »).

- [x] **Step 4.5 : Vérifier** — Run : `npx tsc --noEmit` → 0 erreur ; `npx vitest run` → 15 fichiers / 157 tests verts ; boot no-op :

```bash
PORT=3999 node server/server.js & sleep 1
curl -s http://localhost:3999/api/health    # → ok, démarrage sans erreur ni mention Sentry
kill %1
```

- [x] **Step 4.6 : Commit** —

```bash
git add -A
git commit -m "feat(chantier-0): Sentry front + serveur — erreurs uniquement, inerte sans DSN"
```

> **Note post-revue (Task 4, 2026-07-24) :** revue qualité — les routes gèrent leurs erreurs en try/catch + 500 JSON sans jamais `next(err)`, rendant `setupExpressErrorHandler` quasi inatteignable ; ajout de `Sentry.captureException(error)` dans les catch des chemins de requête (questionnaire ×5, letters ×3, transmission ×2) pour rendre les 500 applicatifs visibles. Restent volontairement hors capture : middleware auth (tokens invalides = flux attendu) et warns webhook. Notes mineures actées sans action : init après import express (suffisant en error-only), componentStack non attaché (choix minimal RGPD).

---

## Task 5 : README réécrit

Réalise A6. L'actuel décrit la v1 périmée (agent 20 questions, Cormorant Garamond, 30 étapes, pas d'i18n) et induirait en erreur tout contributeur. Le nouveau : concis, exact, en français accentué ; CLAUDE.md reste la référence agent détaillée.

**Files:**
- Modify: `README.md` (remplacement intégral)

- [x] **Step 5.1 :** Remplacer intégralement `README.md` par :

````markdown
# Seren — Plateforme d'accompagnement post-décès

Application web qui accompagne les proches d'une personne décédée dans leurs démarches administratives : questionnaire guidé (≤ 15 questions, rédaction adaptée par IA), roadmap personnalisée des démarches, courriers pré-remplis (envoi email en 1 clic) et suivi.

## Fonctionnalités

- **Questionnaire v2** : moteur de logique pure côté serveur (questions conditionnelles, récap confirmable), rédaction des libellés par Mistral AI avec fallback statique garanti (timeout 3 s). Minimisation stricte des données envoyées à l'IA : prénom du défunt, relation, dernière réponse fermée — jamais l'historique ni le nom.
- **Roadmap personnalisée** : génération des démarches depuis un catalogue de ~50 étapes sourcées, classées par urgence (48 h / semaine / mois / long terme).
- **Courriers pré-remplis** : modèles avec variables auto-remplies, export PDF, envoi par email (Resend) avec suivi de statut (webhook signé). Les courriers restent en français (destinés aux organismes français).
- **i18n FR/EN** : détection de la langue du device + toggle persistant ; catalogues d'étapes jumeaux avec invariant de parité testé.
- **Auth Supabase** (RLS active sur toutes les tables) · **Monitoring Sentry** (optionnel, inerte sans DSN).

## Stack

React 18 + TypeScript + Vite + Tailwind CSS v4 + Shadcn/ui · Express.js · Supabase (PostgreSQL, Auth, RLS) · Mistral AI · Resend · Vitest.

## Démarrage

```bash
npm install
# créer .env à la racine — voir « Variables d'environnement » dans CLAUDE.md
npm run dev:all        # Vite (5173) + API Express (3000)
```

Autres commandes : `npm run build` (production dans `dist/`), `npm start` (Express sert `dist/`), `npm test` (Vitest), `npx tsc --noEmit` (type-check).

## Architecture

```
src/            React (pages, components par domaine, hooks, i18n, catalogues)
server/         Express — moteur questionnaire v2, rédacteur Mistral, envoi courriers
supabase/       Migrations versionnées (baseline incluse) — `supabase db push`
tests/          Vitest : moteur, catalogues, invariants croisés, routes (supertest)
docs/           Specs (design-*.md), plans (plan-*.md), runbooks
```

Flux principal : questionnaire v2 → `QuestionnaireAnswersV2` → `generateRoadmap()` → sauvegarde Supabase → dashboard.

Le schéma BDD vit dans `supabase/migrations/` (CLI Supabase — voir `docs/runbook-supabase-cli.md`). Les fichiers SQL à la racine sont l'état historique v1, conservés pour référence.

## Tests & CI

`npm test` — 157 tests (moteur, invariants anti-question-morte, parité FR/EN des catalogues, routes). CI GitHub Actions sur chaque push/PR : type-check + tests.

## Déploiement

Render (build : `npm ci && npm run build`, run : `npm start`). Les variables `VITE_*` sont figées au build : tout changement côté client exige un redéploiement. Définir `CORS_ORIGIN` en production.

## Documentation

- `CLAUDE.md` — référence détaillée (conventions, variables d'environnement, état du projet)
- `docs/` — specs de conception, plans d'implémentation, runbooks (Supabase CLI, staging)
````

(`.env.example` n'existe pas dans le repo — vérifié — d'où le commentaire « créer .env » ; ne pas créer de `.env.example` dans cette task, hors scope.)

- [x] **Step 5.2 : Vérifier** — relire le rendu (`head -40 README.md`), s'assurer qu'aucune mention v1 ne subsiste : `grep -in "cormorant\|20 questions\|30 etapes\|30 étapes\|conversationnel" README.md` → zéro occurrence.

- [x] **Step 5.3 : Commit** —

```bash
git add README.md
git commit -m "docs(chantier-0): README réécrit — aligné sur l'état v2 réel"
```

> **Note post-revue (Task 5, 2026-07-24) :** fact-check de revue entièrement vert (15 questions, timeout 3 s, minimisation PII vérifiée structurellement, urgences, i18n, Sentry, commandes). Le README annonce par anticipation la baseline (Task 6) et le runbook staging (Task 8) — voulu sur une même branche ; garde-fou ajouté au Step 9.2 (`ls` des 2 artefacts avant merge). Note éditoriale sans action : « étapes sourcées » = 23/51 avec `source_url` (champ obligatoire pour les nouvelles entrées seulement) — la relecture éditoriale des étapes reste un USER STEP existant.

---

## Task 6 : Baseline migrations Supabase + push des 2 migrations en attente

Réalise le lot B (clôture T7 + T8). **Pré-requis : le USER STEP `supabase login` + `supabase link` (en tête de plan) doit être fait.** Si `supabase migration list` échoue avec une erreur d'authentification → s'arrêter et demander à Arnaud.

**Files:**
- Create: `supabase/migrations/20260701000000_baseline_v1.sql`
- Move: `supabase/schema_full.sql` → `supabase/archive/schema_full_2026-07-16.sql`
- Modify: `docs/runbook-supabase-cli.md`

- [x] **Step 6.1 : Créer la baseline** — extraction VERBATIM des sections 1–5 de `supabase/schema_full.sql` (lignes 17–188 : tables `questionnaires`, `roadmaps`, `steps`, `step_actions`, `documents` + index + RLS + policies ; les sections 6–8 — transmissions, sessions, pg_cron — sont déjà portées par leurs migrations propres). Run :

```bash
{ cat <<'EOF'
-- ====================================================================
-- BASELINE v1 — les 5 tables du produit initial
-- ====================================================================
-- Extraction verbatim des sections 1–5 de l'état réel consolidé le
-- 2026-07-16 (supabase/archive/schema_full_2026-07-16.sql).
-- Les tables v2 (transmissions, questionnaire_sessions, purge pg_cron,
-- letter_sends) restent portées par leurs migrations propres.
-- Sur les projets EXISTANTS, cette migration est marquée appliquée via
-- `supabase migration repair` (cf. docs/runbook-supabase-cli.md) ; elle
-- ne s'exécute réellement que sur un projet NEUF (ex. staging).
-- ====================================================================

EOF
sed -n '17,188p' supabase/schema_full.sql; } > supabase/migrations/20260701000000_baseline_v1.sql
```

Vérifier l'extraction : `grep -c "CREATE TABLE" supabase/migrations/20260701000000_baseline_v1.sql` → **5** ; `tail -2` → se termine par `USING (auth.uid() = user_id);` (policy delete de `documents`) ; aucune mention de `transmissions` ni `questionnaire_sessions` : `grep -c "transmissions\|questionnaire_sessions" supabase/migrations/20260701000000_baseline_v1.sql` → 0.

- [x] **Step 6.2 : Baseline sur le projet existant** — marquer comme appliquées les migrations déjà en base (la baseline + les 3 posées à la main), Run :

```bash
supabase migration repair --status applied 20260701000000
supabase migration repair --status applied 20260708120000
supabase migration repair --status applied 20260709090000
supabase migration repair --status applied 20260713120000
supabase migration list
```

Attendu à la fin : `20260701000000`, `20260708120000`, `20260709090000`, `20260713120000` = applied côté Remote ; `20260711100000` (pg_cron) et `20260716120000` (letter_sends) = Local uniquement. Si l'état Remote diffère (une des deux « en attente » déjà appliquée à la main), l'ajouter au repair au lieu de la pousser, et le documenter en note post-revue.

- [x] **Step 6.3 : Push** — Run : `yes | supabase db push` (le `yes` répond au prompt de confirmation ; si un mot de passe BDD est demandé → USER STEP, demander à Arnaud de le saisir). Attendu : applique `20260711100000` puis `20260716120000` sans erreur. Si `create extension pg_cron` échoue : USER STEP — activer l'extension dans Dashboard → Database → Extensions → pg_cron, puis relancer le push.

- [x] **Step 6.4 : Vérifier** — Run : `supabase migration list` → les 6 migrations applied Local ET Remote. Puis probe REST (token du compte test E2E, cf. CLAUDE.md) :

```bash
URL=$(grep "^VITE_SUPABASE_URL" .env | cut -d= -f2)
KEY=$(grep "^VITE_SUPABASE_PUBLISHABLE_KEY" .env | cut -d= -f2)
TOKEN=$(curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $KEY" -H "Content-Type: application/json" -d '{"email":"test.e2e.claude@seren-test.fr","password":"TestSeren2026!"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")
curl -s "$URL/rest/v1/letter_sends?select=id&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN"
```

Attendu : `[]` (200, table existe) — plus l'erreur `PGRST205`. Vérification cron (optionnelle, si Docker tourne : `supabase db diff --linked` → aucune différence ; sinon USER STEP 1 min : Dashboard → SQL Editor → `select jobname, schedule from cron.job;` → `purge-questionnaire-sessions | 17 3 * * *`).

- [x] **Step 6.5 : Archiver `schema_full.sql`** (redondant dès que la baseline existe — un projet neuf se monte par `supabase db push` seul) — Run :

```bash
mkdir -p supabase/archive
git mv supabase/schema_full.sql supabase/archive/schema_full_2026-07-16.sql
```

- [x] **Step 6.6 : Mettre à jour `docs/runbook-supabase-cli.md`** — remplacer la section « ⚠️ Baseline obligatoire avant le premier push » et la section « Pour préprod et prod » par :

```markdown
## ⚠️ Baseline (fait le 2026-07-24 sur le projet principal)

Les migrations posées à la main avant la CLI sont marquées `applied` une fois pour
toutes (`supabase migration repair`). Depuis le chantier 0, la baseline v1
(`20260701000000_baseline_v1.sql`) versionne aussi les 5 tables historiques :
**un projet NEUF se monte par `supabase link` + `supabase db push`, sans SQL Editor.**

État de référence du projet principal (`oltwzvfjazwjvghpzhia`) : les 6 migrations
applied Local + Remote (`supabase migration list` pour contrôler).

## Pour un nouveau projet (ex. staging)

```bash
supabase link --project-ref <ref-du-projet>
supabase db push          # déroule tout : baseline v1 + migrations v2
```

Si `create extension pg_cron` échoue : Dashboard → Database → Extensions → activer
pg_cron, puis relancer. Voir `docs/runbook-staging.md` pour le parcours complet.

Astuce multi-projets : `supabase link` ne retient qu'un projet à la fois — relancer
`link` pour basculer.
```

(Conserver le reste du runbook : préambule « Pourquoi », « Mise en place », « Workflow courant » s'il existe.)

- [x] **Step 6.7 : Commit** —

```bash
git add -A
git commit -m "feat(chantier-0): baseline migrations v1 + push pg_cron et letter_sends — schéma 100 % versionné"
```

> **Note post-revue (Task 6, 2026-07-24) :** (1) Le grep « 0 attendu » du Step 6.1 ne tenait pas compte du header de la baseline qui nomme les tables exclues en prose — critère corrigé : 1 occurrence (header), 0 dans le corps SQL extrait (vérifié par diff exact contre l'archive, lignes 17–188). (2) Le push a exigé `--include-all` (pg_cron `…11100000` chronologiquement antérieure à `sessions_lang` `…13120000` déjà appliquée à la main) ; le classificateur de permissions a bloqué l'exécution par le subagent — **push exécuté par Arnaud** (USER STEP, cohérent avec la frontière CLAUDE.md), vérification 6.4 faite par le contrôleur : 6/6 migrations applied Local+Remote, probe REST `letter_sends` → `[]`. (3) `git add -A` du Step 6.7 remplacé par un staging explicite pour ne pas embarquer le fichier de la Task 8 concurrente.

---

## Task 7 : Landing — robots.ts + archivage du plan périmé

Réalise le lot C, dans le repo **landing** (`/Users/arnaudgay/Documents/git/Seren/landing`, branche `main`, `node_modules` présents, Next 16.2.1). Contexte : `src/app/robots.txt` contient du code TypeScript Next **valide** (règles `allow: '/'` + sitemap) mais sous le mauvais nom de fichier — servi verbatim en prod. Seul le renommage manque. Style de commit du repo : minuscules `fix:` / `feature:`.

**Files (repo landing):**
- Rename: `src/app/robots.txt` → `src/app/robots.ts`
- Move: `docs/superpowers/plans/2026-05-11-design-system-migration.md` → `docs/superpowers/plans/archive/`

- [x] **Step 7.1 :** Run :

```bash
cd /Users/arnaudgay/Documents/git/Seren/landing
git status --short   # → doit être clean ; sinon s'arrêter et demander à Arnaud
git mv src/app/robots.txt src/app/robots.ts
```

- [x] **Step 7.2 : Vérifier le build** — Run : `npm run build` (dans la landing) → exit 0 ET la liste des routes générées contient `/robots.txt`. En cas d'échec de build, vérifier s'il est PRÉ-EXISTANT (non lié au renommage) : `git stash` → `npm run build` → `git stash pop` ; s'il échouait déjà avant, s'arrêter et le signaler sans rien committer.

- [x] **Step 7.3 : Commit du fix** —

```bash
git add -A && git commit -m "fix: robots.txt contenait du code typescript servi verbatim — renommé en robots.ts (route next)"
```

- [x] **Step 7.4 : Archiver le plan périmé** — Run :

```bash
mkdir -p docs/superpowers/plans/archive
git mv docs/superpowers/plans/2026-05-11-design-system-migration.md docs/superpowers/plans/archive/
git commit -am "chore: archivage du plan design 2026-05-11 (next 14 + palette teal, contredit l'état livré)"
```

(Arnaud pushera la landing lui-même — user step de clôture.)

---

## Task 8 : Runbook staging

Réalise le lot D (préparation ; les créations de comptes sont des user steps guidés en clôture).

**Files:**
- Create: `docs/runbook-staging.md`

- [x] **Step 8.1 :** Créer `docs/runbook-staging.md` :

````markdown
# Runbook — Environnement de staging (Supabase + Render)

> Chantier 0, lot D. Objectif : un projet Supabase et un service Render de staging,
> séparés de la prod — indispensable avant de manipuler paiements (chantier 1) et
> envois réels (chantier 2). Durée totale : ~30 min, majoritairement des clics.

## 1. Projet Supabase de staging (user step, ~10 min)

1. https://supabase.com/dashboard → New project : nom `seren-staging`, région `eu-west`
   (même région que la prod), mot de passe BDD généré → **le noter** (gestionnaire de
   mots de passe).
2. Noter le `project-ref` (dans l'URL du dashboard : `https://supabase.com/dashboard/project/<ref>`).
3. Authentication → Sign In / Providers → activer **Email** (mot de passe). Pour les
   tests E2E : désactiver « Confirm email ».
4. Authentication → URL Configuration : Site URL = l'URL Render staging (étape 3),
   à compléter après sa création.

## 2. Schéma : un seul push (CLI)

```bash
supabase link --project-ref <ref-staging>    # demande le mot de passe BDD noté en 1.
supabase db push                             # déroule TOUT : baseline v1 + migrations v2
supabase migration list                      # → 6 migrations applied Local + Remote
```

Si `create extension pg_cron` échoue : le premier push s'arrête là (état transitoire
normal : baseline + 2 migrations appliquées, `migration list` incomplet). Dashboard →
Database → Extensions → activer pg_cron → relancer `supabase db push` : les migrations
restantes s'appliquent et `migration list` passe à 6/6.

⚠️ `link` ne retient qu'un projet à la fois : relancer `supabase link --project-ref
oltwzvfjazwjvghpzhia` pour revenir au projet principal ensuite.

## 3. Service Render de staging (user step, ~10 min)

1. Dashboard Render → New → Web Service → même repo GitHub, branche `main` (ou une
   branche `staging` dédiée si souhaité plus tard).
2. Build : `npm ci && npm run build` · Start : `npm start` (mêmes valeurs que la prod).
3. Variables d'environnement (Settings → Environment) :
   - `SUPABASE_URL` / `VITE_SUPABASE_URL` = `https://<ref-staging>.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` = clé publishable du
     projet staging (Dashboard Supabase → Settings → API Keys)
   - `MISTRAL_API_KEY` = la même clé qu'en prod (ou une clé dédiée si créée)
   - `MISTRAL_MODEL` = `mistral-small-latest`
   - `CORS_ORIGIN` = l'URL du service staging (ex. `https://seren-staging.onrender.com`)
   - `SENTRY_DSN` / `VITE_SENTRY_DSN` : facultatif (projet Sentry séparé recommandé si activé)
   - Resend (`RESEND_*`, `WEBHOOK_RPC_SECRET`) : NE PAS configurer en staging pour
     l'instant (la feature reste inerte → 503 propre) — sauf test dédié du canal email.
4. Reporter l'URL du service dans Supabase → Authentication → URL Configuration (étape 1.4).

## 4. Vérification

- `https://<staging>.onrender.com/api/health` → `{"status":"ok","timestamp":…}`
- Créer un compte jetable sur le staging → dérouler le questionnaire → roadmap OK.
- Le compte test E2E (`test.e2e.claude@seren-test.fr`) peut être recréé sur le projet
  staging si besoin (il n'existe que sur le projet principal).

## Rappels

- Les `VITE_*` sont figées au build → tout changement d'env front = redéploiement.
- La prod reste sur le projet Supabase `oltwzvfjazwjvghpzhia` — ne jamais pousser de
  migration de test dessus : staging d'abord, prod ensuite (`supabase link` + `db push`).
````

- [x] **Step 8.2 : Commit** —

```bash
git add docs/runbook-staging.md
git commit -m "docs(chantier-0): runbook staging — Supabase + Render pas à pas"
```

> **Note post-revue (Tasks 6+8, revue qualité conjointe, 2026-07-24) :** approuvée — rejouabilité sur base neuve validée par lecture des 6 migrations dans l'ordre (FK, extensions, idempotence), baseline conforme au schéma prod réel, env vars du runbook staging exactes vs code. Correctifs mineurs appliqués par le contrôleur : statut périmé du frontmatter de `runbook-supabase-cli.md` (login/link faits), précision de l'état transitoire si le premier push s'arrête à pg_cron (fichier + bloc du plan synchronisés), corps exact de `/api/health`.

---

## Task 9 : CLAUDE.md + vérification globale + merge

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/plan-chantier-0-assainissement.md` (cases cochées + notes post-revue)

- [x] **Step 9.1 : Mettre à jour `CLAUDE.md`** :

1. **Section Architecture**, ligne `server.js` : remplacer `# Express : auth proxy, produit transmission (/api/demo/*), static serving` par `# Express : transmission (lecture seule), health, static serving + SPA fallback`.
2. **Variables d'environnement** : supprimer la ligne `MISTRAL_AGENT_ID` ; ajouter : `- \`SENTRY_DSN\`, \`VITE_SENTRY_DSN\` — monitoring erreurs (facultatif : absents → Sentry inerte). \`VITE_SENTRY_DSN\` figée au build (redéploiement requis).`
3. **Section « Produit transmission »** : remplacer le paragraphe par : `- **Produit transmission** (\`AccessPage\`, routes GET \`/api/user/transmission\` + \`/api/transmission/:code\`, table \`transmissions\`) : produit DISTINCT du questionnaire, **gelé et réduit à la lecture seule au chantier 0** (la page de démo et ses trois routes serveur ont été supprimées, l'agent Mistral legacy débranché) — réactivation = décision produit explicite.` (⚠️ ne pas écrire les chemins littéraux des routes supprimées : le grep de vérification 9.2 exige zéro occurrence dans CLAUDE.md.)
4. **Section « Fait (suite) »** : ajouter : `Chantier 0 assainissement (\`docs/design-chantier-0-assainissement.md\`) livré : gel démo + routes auth mortes supprimées (zéro PII loggée), noindex app, CI GitHub Actions, Sentry no-op sans DSN, README v2, baseline migrations + pg_cron/letter_sends poussées, landing robots.ts + plan périmé archivé, runbook staging.`
5. **Section « En attente (USER STEPS) »** : retirer la partie `supabase login + link + baseline` (faite) ; ajouter : `compte Sentry + DSN sur Render puis redéploiement ; uptime check /api/health ; push GitHub (Application + landing) et vérif CI verte ; création staging (docs/runbook-staging.md).`
6. **Points d'attention → Tests** : remplacer « (npm test) » par « (npm test, 157 tests) — exécutés en CI (.github/workflows/ci.yml) sur chaque push/PR ».
7. **Points d'attention → Schema SQL** : remplacer la phrase par : `migrations versionnées dans \`supabase/migrations/\` (baseline v1 incluse — TOUTE évolution passe par migration + \`supabase db push\`, plus jamais de SQL Editor manuel) ; fichiers racine v1 et \`supabase/archive/\` = historique.`
8. **Section Stack → IA** : remplacer `; agent conversationnel conservé pour le produit transmission` par `(l'agent conversationnel du produit transmission a été débranché au chantier 0)`.
9. **Points d'attention → Sessions** : supprimer la phrase `Le produit transmission (\`/api/demo/*\`) reste sur une \`Map()\` en mémoire — perdu au redémarrage` (la Map et les routes n'existent plus).
10. **Section Stack → Backend** : remplacer `— questionnaire v2 (moteur + rédacteur), produit transmission, auth proxy, static serving` par `— questionnaire v2 (moteur + rédacteur), courriers (envoi email), transmission (lecture seule), static serving`.

- [x] **Step 9.2 : Vérification globale** — Run et confirmer :

```bash
npx tsc --noEmit                          # 0 erreur
npx vitest run                            # 15 fichiers / 157 tests verts
grep -rn "api/demo\|api/auth\|MISTRAL_AGENT_ID\|DemoPage" src/ server/ CLAUDE.md README.md   # zéro occurrence
node --check server/server.js
supabase migration list                   # 6/6 applied Local + Remote
ls supabase/migrations/20260701000000_baseline_v1.sql docs/runbook-staging.md   # les 2 artefacts annoncés par le README existent
```

- [ ] **Step 9.3 : Commit final + merge fast-forward** —

```bash
git add -A
git commit -m "docs(chantier-0): CLAUDE.md à jour (état, env, transmission lecture seule) + plan coché"
git checkout main
git merge --ff-only feature/chantier-0-assainissement
git log --oneline -8
```

(Arnaud pushe lui-même — ne PAS pousser.)

> **Note post-revue (Task 9, 2026-07-24) :** merge du Step 9.3 déplacé APRÈS la revue finale de branche (décision contrôleur — revue avant merge) ; `supabase migration list` du Step 9.2 vérifié par le contrôleur (classificateur de permissions côté subagents) : 6/6 applied Local+Remote. Ajout `engines.node >= 22` à package.json (recommandation revue Task 3).

---

## User steps de clôture (Arnaud, après le merge)

1. **Sentry** (~10 min) : créer un compte https://sentry.io (plan gratuit) → 2 projets (`seren-app` type React, `seren-server` type Node/Express) → copier les 2 DSN → Render : ajouter `SENTRY_DSN` + `VITE_SENTRY_DSN` → **redéployer** (VITE figée au build). Ajouter aussi au `.env` local si souhaité. Test : déclencher une erreur volontaire et la voir dans Sentry.
2. **Uptime check** (~5 min) : https://uptimerobot.com (gratuit) → monitor HTTP(s) sur `https://application-0vxw.onrender.com/api/health`, intervalle 5 min, alerte email.
3. **Push GitHub** : `git push` sur Application ET landing → vérifier la CI verte (onglet Actions) au premier push.
4. **Nettoyage env** : supprimer `MISTRAL_AGENT_ID` du `.env` local et des variables Render (obsolète).
5. **Staging** : dérouler `docs/runbook-staging.md` (avec moi en guide si tu veux).

## Hors scope (rappel spec §6)

Chantier T (RLS transmissions F1, AIPD, DPA, pseudonymisation périphérie), activation Resend (secrets), chantiers 1+ (Stripe, LRAR, coffre, affiliation), rate limiter multi-instances.
