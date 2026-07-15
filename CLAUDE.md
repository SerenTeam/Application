# Seren

Plateforme d'accompagnement post-décès : questionnaire guidé (rédaction IA), roadmap personnalisée de démarches administratives, courriers pré-remplis et suivi.

## Stack

- **Frontend** : React 18, TypeScript, Vite, Tailwind CSS v4 (CSS-first `@theme`), Shadcn/ui, Radix UI, Lucide icons
- **Backend** : Express.js (`server/server.js` + `server/routes/`) — questionnaire v2 (moteur + rédacteur), produit transmission, auth proxy, static serving
- **BDD** : Supabase (PostgreSQL + Auth + RLS)
- **IA** : Mistral AI — rédacteur stateless du questionnaire v2 (textes uniquement, jamais de données) ; agent conversationnel conservé pour le produit transmission
- **PDF** : jsPDF (export courriers)
- **Analytics** : PostHog

## Commandes

```bash
npm run dev          # Vite dev server (port 5173)
npm run dev:server   # Express API (port 3000, --watch)
npm run dev:all      # Les deux en parallèle (concurrently)
npm run build        # tsc -b && vite build → dist/
npm start            # Express sert dist/ en production
npx tsc --noEmit     # Type-check sans build
```

## Architecture

```
src/
├── components/       # Composants React organisés par domaine
│   ├── ui/           # Shadcn/ui primitives
│   ├── auth/         # ProtectedRoute, formulaires auth
│   ├── questionnaire/# WelcomeScreen, QuestionCard, RecapScreen, CompletionScreen, QuestionnaireProgress
│   ├── dashboard/    # Sidebar, ProgressHero, RoadmapView
│   ├── letter/       # LetterPreview, LetterVariablesForm, LetterActions
│   ├── documents/    # DocumentCard
│   ├── layout/       # ErrorBoundary, OfflineBanner, CookieBanner
│   └── profile/
├── pages/            # Pages routées (React Router v7)
├── hooks/            # useAuth, useLetterGenerator...
├── lib/              # Clients et utilitaires (supabase, api, roadmap-generator)
├── data/             # Catalogues statiques (steps-catalog, letter-templates)
└── types/            # Types TypeScript partagés
server/
├── server.js         # Express : auth proxy, produit transmission (/api/demo/*), static serving
├── lib/              # Moteur questionnaire v2, catalogue questions, rédacteur LLM, sessions
└── routes/           # Routers Express (questionnaire v2)
```

### Flux principal

Questionnaire v2 (moteur serveur + rédacteur Mistral, ≤15 questions, récap confirmable) → `QuestionnaireAnswersV2` → `generateRoadmap()` → `saveRoadmapToDb()` → Dashboard

### Contrat de données clé

`QuestionnaireAnswersV2` dans `src/types/questionnaire.ts` — contrat entre questionnaire et roadmap-generator. Règle d'or : toute question conditionne ≥ 1 étape (invariants testés dans `tests/invariants.test.ts`)

## Conventions

- **Langue du code** : noms de variables/fonctions en anglais, commentaires en français ; l'UI est bilingue FR/EN (voir i18n)
- **i18n** : détection device + toggle FR/EN persistant (`src/i18n/` — `useLang`/`useT`). Chaînes UI dans les dictionnaires typés `strings.{fr,en}.ts` (parité des clés garantie par tsc — jamais de chaîne UI en dur dans les composants), catalogues d'étapes jumeaux `steps-catalog.{fr,en}.ts` (invariant de parité structurelle testé), textes du catalogue de questions serveur en `{ fr, en }` résolus par `textIn()`, langue de session figée au `/start` (colonne `lang`), messages d'erreur par clés (`server/lib/messages.js`). Les **courriers restent toujours en français** (destinés aux organismes français) ; le produit transmission reste FR
- **Imports** : alias `@/` → `src/` (configuré dans tsconfig + vite)
- **Styling** : Tailwind utility-first, pas de CSS modules. Design system de la landing (`DESIGN.md`, transposition `docs/design-refonte-ui.md`) : bleu #006BFA seule couleur d'action, violet #6B5CE7 réservé à l'état « en cours », Inter (titres, graisse normale) / Inter Tight (corps, medium), pilules, cartes très arrondies, ombres douces. Toujours passer par les tokens du `@theme` (`src/index.css`), jamais de hex en dur
- **Composants UI** : Shadcn/ui via `components/ui/` — ne pas réinventer les primitives
- **État** : React hooks locaux + Supabase comme source de vérité. Pas de state manager global
- **Auth** : Supabase Auth côté client (`useAuth` hook), middleware `requireAuth` côté serveur avec Bearer token
- **API** : `apiFetch()` dans `lib/api.ts` gère automatiquement le token Bearer et les 401

## Variables d'environnement

Fichier `.env` à la racine (gitignored). Variables requises :
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` — client Supabase frontend (clé nouvelle génération `sb_publishable_…`)
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` — client Supabase backend (jamais la clé secrète `sb_secret_…` : la RLS doit s'appliquer via le token utilisateur)
- `MISTRAL_API_KEY` — clé API Mistral
- `MISTRAL_MODEL` — modèle du rédacteur questionnaire v2 (défaut : `mistral-small-latest`)
- `MISTRAL_AGENT_ID` — agent du produit transmission uniquement (`/api/demo/*`)
- `CORS_ORIGIN` — origines autorisées, séparées par des virgules (défaut : `http://localhost:5173,http://localhost:3000`). À définir en production (ex. `https://app.seren.fr`)

## Workflow & état du projet (source de vérité — survit aux réinitialisations de mémoire)

- **Process établi** : brainstorming → spec (`docs/design-*.md`) → plan (`docs/plan-*.md`) → exécution **subagent-driven** (1 subagent frais par task + revue spec + revue qualité, correctifs systématiques, chaque déviation documentée par une « note post-revue » dans le plan). Merge **local** dans `main` (fast-forward) ; Arnaud pushe lui-même sur GitHub. Décisions produit → lui demander ; correctifs techniques des revues → appliquer sans re-consulter.
- **Fait** : Plans 1, 2 & 3 (refonte questionnaire v2 : moteur serveur + rédacteur Mistral à fallback + sessions Supabase + frontend récap ; puis lot éditorial 13 étapes sourcées, rédacteur options-aware, rate limiting /start+/resume, reprise de session, invariant par valeur) livrés, mergés, validés E2E réel. Plan 4 (i18n FR/EN : détection device + toggle, dictionnaires typés, catalogues jumeaux, serveur bilingue — spec `docs/design-i18n.md`) livré, mergé, validé E2E réel.
- **En attente (USER STEPS)** : appliquer `supabase/migrations/20260711100000_purge_sessions_cron.sql` (vérif : `select jobname from cron.job;`) ; relecture juridique/éditoriale des 13 étapes du Plan 3 (montants/délais + checklist de `docs/design-questionnaire-v2.md`).
- **À exécuter** : en réserve — `docs/design-envoi-courriers.md` (feature envoi), `docs/plan-points-attention.md` (§1 CLI Supabase et §4 audit RLS restants), backlog fin de `docs/plan-questionnaire-v3.md` (pension d'orphelin, personas non couvertes, multi-instances rate limiter).
- **Compte de test E2E** (jetable, projet de dev) : `test.e2e.claude@seren-test.fr` / `TestSeren2026!` — confirmation email désactivée sur le projet Supabase.
- **Produit transmission** (`/api/demo/*`, `DemoPage`, `AccessPage`, table `transmissions`) : produit DISTINCT du questionnaire, toujours sur l'ancien agent Mistral (`MISTRAL_AGENT_ID`) et une `Map()` mémoire — **ne pas toucher sans décision explicite**.
- **Déploiement** : Render (`https://application-0vxw.onrender.com`). Les variables `VITE_*` sont figées au build → tout changement de `.env` côté client exige un redéploiement. `CORS_ORIGIN` recommandé sur Render.

## Points d'attention

- **Tests** : Vitest (`npm test`) — moteur, catalogues, invariants croisés, routes (supertest). Les invariants interdisent toute question sans étape et tout drift entre catalogues
- **Sessions** : questionnaire v2 persisté dans `questionnaire_sessions` (Supabase, RLS, TTL 24 h). Le produit transmission (`/api/demo/*`) reste sur une `Map()` en mémoire — perdu au redémarrage
- **PII vers Mistral** : le rédacteur ne reçoit que le prénom du défunt, la relation et la dernière réponse fermée (valeurs enum) — jamais l'historique, le nom de famille ni la date de décès
- **Schema SQL** : migrations versionnées dans `supabase/migrations/` (à appliquer via SQL Editor ou `supabase db push`) ; `supabase_v1_schema.sql` et `supabase_auth_setup.sql` à la racine = état historique v1
- **RLS** : les policies Supabase Row Level Security sont actives — les requêtes côté serveur utilisent le token utilisateur via `getSupabaseClient(token)`
