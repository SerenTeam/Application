# Seren

Plateforme d'accompagnement post-décès : questionnaire guidé (rédaction IA), roadmap personnalisée de démarches administratives, courriers pré-remplis et suivi.

## Stack

- **Frontend** : React 18, TypeScript, Vite, Tailwind CSS v4 (CSS-first `@theme`), Shadcn/ui, Radix UI, Lucide icons
- **Backend** : Express.js (`server/server.js` + `server/routes/`) — questionnaire v2 (moteur + rédacteur), courriers (envoi email), transmission (lecture seule), static serving
- **BDD** : Supabase (PostgreSQL + Auth + RLS)
- **IA** : Mistral AI — rédacteur stateless du questionnaire v2 (textes uniquement, jamais de données ; l'agent conversationnel du produit transmission a été débranché au chantier 0)
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
├── server.js         # Express : transmission (lecture seule), health, static serving + SPA fallback
├── lib/              # Moteur questionnaire v2, catalogue questions, rédacteur LLM, sessions
└── routes/           # Routers Express (questionnaire v2, letters — envoi email v1)
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
- `RESEND_API_KEY`, `RESEND_FROM` — envoi des courriers par email (canal v1) ; absents → 503 propre, la feature est inerte
- `RESEND_WEBHOOK_SECRET` — vérification de signature svix du webhook `/api/letters/webhook`
- `WEBHOOK_RPC_SECRET` — secret partagé avec la base (table `webhook_config`) pour la RPC de mise à jour des statuts ; ⚠️ doit AUSSI être inséré en base : `insert into webhook_config (id, rpc_secret) values (1, '<valeur>');`
- `CORS_ORIGIN` — origines autorisées, séparées par des virgules (défaut : `http://localhost:5173,http://localhost:3000`). À définir en production (ex. `https://app.seren.fr`)
- `SENTRY_DSN`, `VITE_SENTRY_DSN` — monitoring erreurs (facultatif : absents → Sentry inerte). `VITE_SENTRY_DSN` figée au build (redéploiement requis).

## Workflow & état du projet (source de vérité — survit aux réinitialisations de mémoire)

- **Process établi** : brainstorming → spec (`docs/design-*.md`) → plan (`docs/plan-*.md`) → exécution **subagent-driven** (1 subagent frais par task + revue spec + revue qualité, correctifs systématiques, chaque déviation documentée par une « note post-revue » dans le plan). Merge **local** dans `main` (fast-forward) ; Arnaud pushe lui-même sur GitHub — en session **cloud**, remplacer par branche + PR qu'Arnaud merge. Décisions produit → lui demander ; correctifs techniques des revues → appliquer sans re-consulter. **Écritures BDD distantes (`supabase db push`/`reset`, secrets) = toujours USER STEP d'Arnaud** (appris au chantier 0 : le classificateur de permissions les bloque côté agents — planifier la répartition dès le plan) ; l'agent fait les vérifications en lecture (probes REST avec le compte de test, `supabase migration list` si CLI liée).
- **Fait** : Plans 1, 2 & 3 (refonte questionnaire v2 : moteur serveur + rédacteur Mistral à fallback + sessions Supabase + frontend récap ; puis lot éditorial 13 étapes sourcées, rédacteur options-aware, rate limiting /start+/resume, reprise de session, invariant par valeur) livrés, mergés, validés E2E réel. Plan 4 (i18n FR/EN : détection device + toggle, dictionnaires typés, catalogues jumeaux, serveur bilingue — spec `docs/design-i18n.md`) livré, mergé, validé E2E réel. Plan 5 (refonte UI : concordance avec le design system de la landing `DESIGN.md` — spec `docs/design-refonte-ui.md`) livré, mergé, validé E2E visuel. Motion de présentation (chantier hors-app : `motion/seren-motion.html` — 30 s en boucle invisible, FR/EN via touche L, Espace/F, autonome/offline, régénérable par `node motion/build.mjs` + `verify.mjs` ; spec `docs/design-motion-presentation.md`) livré, mergé, 10/10 critères — reste le visionnage final humain sur écran réel (fluidité perçue, vraie touche F, `file://`).
- **En attente (USER STEPS)** : relecture juridique/éditoriale des 14 étapes éditoriales (13 du Plan 3 + pension d'orphelin/ASF). — Clôture chantier 0 FAITE le 2026-07-25 : push ×2 + CI verte, Sentry actif (test front validé), uptime, env nettoyées, cron vérifié, préprod alignée (reset + 6/6 migrations).
- **Décisions produit ouvertes** : correctif RLS `transmissions` (exposition aux authentifiés — proposition dans `docs/audit-rls.md` F1, produit gelé) ; droit à l'effacement RGPD (audit F2) ; personas non couvertes du questionnaire (élargir ou non).
- **Fait (suite)** : envoi de courriers v1 canal email (`docs/plan-envoi-courriers.md` — Resend, letter_sends, webhook signé + secret RPC en base, panneau d'envoi FR/EN) livré et mergé ; E2E live et activation = USER STEPS (compte Resend, migration, secrets). v2 (LRE Maileva) au backlog avec le modèle économique à trancher. Chantier 0 assainissement (`docs/design-chantier-0-assainissement.md`) livré : gel démo + routes auth mortes supprimées (zéro PII loggée), noindex app, CI GitHub Actions, Sentry no-op sans DSN (500 gérés capturés), README v2, baseline migrations + pg_cron/letter_sends poussées (schéma 100 % versionné), landing robots.ts + plan périmé archivé, runbook staging.
- **À exécuter** : **chantiers 1 à 5 de `docs/roadmap-technique.md`** (référence des specs à venir — prochain : **chantier 1, paiement Stripe** : Checkout one-shot + webhook signé idempotent + table `purchases` + gating serveur ; l'implémentation actuelle `?payment=success` + lien test en dur est à remplacer intégralement, cf. T1). Aussi : v2/v3 de `docs/design-envoi-courriers.md` (LRE/papier, portails). Points-attention §1 (CLI + runbook) et §4 (audit RLS) clos ; pension d'orphelin livrée (étape ASF). Reste au backlog : décès à l'étranger (exclu v2), rate limiter multi-instances (inutile en mono-instance).
- **Compte de test E2E** (jetable, projet de dev) : `test.e2e.claude@seren-test.fr` / `TestSeren2026!` — confirmation email désactivée sur le projet Supabase.
- **Produit transmission** (`AccessPage`, routes GET `/api/user/transmission` + `/api/transmission/:code`, table `transmissions`) : produit DISTINCT du questionnaire, **gelé et réduit à la lecture seule au chantier 0** (la page de démo et ses trois routes serveur ont été supprimées, l'agent Mistral legacy débranché) — réactivation = décision produit explicite.
- **Déploiement** : Render — domaine de prod `https://app.seren-app.fr` (rattaché au service `https://application-0vxw.onrender.com`). Les variables `VITE_*` sont figées au build → tout changement de `.env` côté client exige un redéploiement. `CORS_ORIGIN` recommandé sur Render (`https://app.seren-app.fr`). Uptime check UptimeRobot actif ; Sentry actif (2 projets EU : seren-app, seren-server). Préprod : projet Supabase `Seren_app_preprod` (`kvtzhyxlqouvpwasedbe`, eu-west-1, schéma aligné 6/6 par reset+migrations le 2026-07-25) + service Render préprod.

## Points d'attention

- **Tests** : Vitest (`npm test`, 157 tests) — exécutés en CI (`.github/workflows/ci.yml`) sur chaque push/PR — moteur, catalogues, invariants croisés, routes (supertest). Les invariants interdisent toute question sans étape et tout drift entre catalogues. **Sans `.env`** (session cloud, CI) : exporter les 2 variables factices `VITE_SUPABASE_URL=http://localhost:54321` et `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_dummy` (sinon 2 fichiers échouent à l'import — aucun test ne fait de réseau, cf. `ci.yml`)
- **Sessions** : questionnaire v2 persisté dans `questionnaire_sessions` (Supabase, RLS, TTL 24 h).
- **PII vers Mistral** : le rédacteur ne reçoit que le prénom du défunt, la relation et la dernière réponse fermée (valeurs enum) — jamais l'historique, le nom de famille ni la date de décès
- **Schema SQL** : migrations versionnées dans `supabase/migrations/` (baseline v1 incluse — TOUTE évolution passe par migration + `supabase db push`, plus jamais de SQL Editor manuel) ; fichiers racine v1 et `supabase/archive/` = historique.
- **RLS** : les policies Supabase Row Level Security sont actives — les requêtes côté serveur utilisent le token utilisateur via `getSupabaseClient(token)`
