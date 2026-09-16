# Seren

Plateforme d'accompagnement post-décès : questionnaire guidé (rédaction IA), roadmap personnalisée de démarches administratives, courriers pré-remplis et suivi.

## Stack

- **Frontend** : React 18, TypeScript, Vite, Tailwind CSS v4 (CSS-first `@theme`), Shadcn/ui, Radix UI, Lucide icons
- **Backend** : Express.js (`server/server.js` + `server/routes/`) — questionnaire v2 (moteur + rédacteur), courriers (envoi email et papier), espace partenaire PF et activation famille par jeton (v2), gate dossier actif, mini-paiement « envoi supplémentaire » (fermé par flag), transmission (lecture seule), static serving
- **BDD** : Supabase (PostgreSQL + Auth + RLS)
- **IA** : Mistral AI — rédacteur stateless du questionnaire v2 (textes uniquement, jamais de données ; l'agent conversationnel du produit transmission a été débranché au chantier 0). **Coupée par défaut** (`FEATURE_LLM`) : sans le flag, le client Mistral n'est même pas instancié et les libellés viennent du catalogue statique
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
└── routes/           # Routers Express (questionnaire v2, letters — envoi email v1, payments — forfait Stripe)
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
- `WEBHOOK_RPC_SECRET` — secret partagé avec la base (table `webhook_config`) pour les RPC `security definer` appelées sans token utilisateur : statuts d'envoi **et** écritures de `purchases` (chantier 1) ; ⚠️ doit AUSSI être inséré en base : `insert into webhook_config (id, rpc_secret) values (1, '<valeur>');`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_EXTRA_SEND` — **mini-paiement « envoi supplémentaire » uniquement**, inerte sans `EXTRA_SENDS_ENABLED`. Les variables `PAYMENTS_ENABLED`, `STRIPE_PRICE_ID` et `FORFAIT_INCLUDED_SENDS` du forfait famille **ne sont plus lues** (à retirer de Render) : en v2 le quota vient du snapshot `dossiers.included_sends` via le pont `purchases`. Aucune clé Stripe côté client, donc aucune variable `VITE_STRIPE_*`
- **Flags v2** (seule la valeur exacte `'true'` ouvre ; relus à **chaque requête**, sauf `FEATURE_LLM` lu au démarrage) : `FEATURE_LLM`, `EMAIL_SENDS_ENABLED`, `EXTRA_SENDS_ENABLED`, `PAPER_SENDS_ENABLED` (canal papier **ET** dépôt de PJ), `PARTNER_ACTIVATIONS_ENABLED`, `SHOW_ACTIVATION_LINK` (**jamais en prod**), `PARTNER_BILLING_PREVIEW` (préprod seulement) — tableau préprod/prod : `docs/design-v2-demonstrateur.md` §5 et §11.2
- `SUPPORT_EMAIL` — contact affiché aux familles (défaut `support@seren-app.fr`)
- `MYSENDINGBOX_API_KEY`, `MSB_WEBHOOK_URL_SECRET` — envoi papier (chantier 2a) ; inertes sans `PAPER_SENDS_ENABLED`
- `APP_URL` — base des URL de retour Stripe (défaut : `http://localhost:5173` ; en prod `https://app.seren-app.fr`)
- `CORS_ORIGIN` — origines autorisées, séparées par des virgules (défaut : `http://localhost:5173,http://localhost:3000`). À définir en production (ex. `https://app.seren.fr`)
- `SENTRY_DSN`, `VITE_SENTRY_DSN` — monitoring erreurs (facultatif : absents → Sentry inerte). `VITE_SENTRY_DSN` figée au build (redéploiement requis).

## Workflow & état du projet (source de vérité — survit aux réinitialisations de mémoire)

- **Process établi** : brainstorming → spec (`docs/design-*.md`) → plan (`docs/plan-*.md`) → exécution **subagent-driven** (1 subagent frais par task + revue spec + revue qualité, correctifs systématiques, chaque déviation documentée par une « note post-revue » dans le plan). Merge **local** dans `main` (fast-forward) ; Arnaud pushe lui-même sur GitHub — en session **cloud**, remplacer par branche + PR qu'Arnaud merge. Décisions produit → lui demander ; correctifs techniques des revues → appliquer sans re-consulter. **Écritures BDD distantes (`supabase db push`/`reset`, secrets) = toujours USER STEP d'Arnaud** (appris au chantier 0 : le classificateur de permissions les bloque côté agents — planifier la répartition dès le plan) ; l'agent fait les vérifications en lecture (probes REST avec le compte de test, `supabase migration list` si CLI liée).
- **Fait** : Plans 1, 2 & 3 (refonte questionnaire v2 : moteur serveur + rédacteur Mistral à fallback + sessions Supabase + frontend récap ; puis lot éditorial 13 étapes sourcées, rédacteur options-aware, rate limiting /start+/resume, reprise de session, invariant par valeur) livrés, mergés, validés E2E réel. Plan 4 (i18n FR/EN : détection device + toggle, dictionnaires typés, catalogues jumeaux, serveur bilingue — spec `docs/design-i18n.md`) livré, mergé, validé E2E réel. Plan 5 (refonte UI : concordance avec le design system de la landing `DESIGN.md` — spec `docs/design-refonte-ui.md`) livré, mergé, validé E2E visuel. Motion de présentation (chantier hors-app : `motion/seren-motion.html` — 30 s en boucle invisible, FR/EN via touche L, Espace/F, autonome/offline, régénérable par `node motion/build.mjs` + `verify.mjs` ; spec `docs/design-motion-presentation.md`) livré, mergé, 10/10 critères — reste le visionnage final humain sur écran réel (fluidité perçue, vraie touche F, `file://`).
- **En attente (USER STEPS)** : relecture juridique/éditoriale des 14 étapes éditoriales (13 du Plan 3 + pension d'orphelin/ASF) — **bloquante avant d'ouvrir la vente** (P1 de la roadmap produit). Le **forfait famille du chantier 1 est abandonné en v2** (la pompe funèbre paie, la famille ne paie rien) : `POST /api/payments/checkout` répond toujours 503, et la table `purchases` sert désormais de pont pour les 10 envois inclus. — Clôture chantier 0 FAITE le 2026-07-25 : push ×2 + CI verte, Sentry actif (test front validé), uptime, env nettoyées, cron vérifié, préprod alignée (reset + 6/6 migrations).
- **Décisions produit ouvertes** : effacement RGPD **automatisé** (la procédure manuelle de la bêta est livrée : `scripts/erase-family.sql` + `docs/runbook-beta-prod.md` §13) ; personas non couvertes du questionnaire (élargir ou non) ; unicité **globale** de l'e-mail famille (un proche = un dossier, hypothèse H17). Le correctif RLS `transmissions` (audit F1) est **livré** au lot L1b du démonstrateur v2.
- **Fait (suite)** : envoi de courriers v1 canal email (`docs/plan-envoi-courriers.md` — Resend, letter_sends, webhook signé + secret RPC en base, panneau d'envoi FR/EN) livré et mergé ; E2E live et activation = USER STEPS (compte Resend, migration, secrets). v2 (LRE Maileva) au backlog avec le modèle économique à trancher. Chantier 0 assainissement (`docs/design-chantier-0-assainissement.md`) livré : gel démo + routes auth mortes supprimées (zéro PII loggée), noindex app, CI GitHub Actions, Sentry no-op sans DSN (500 gérés capturés), README v2, baseline migrations + pg_cron/letter_sends poussées (schéma 100 % versionné), landing robots.ts + plan périmé archivé, runbook staging.
- **Fait (suite)** : **chantier 1 — paiement forfait Stripe** (spec `docs/design-chantier-1-paiement.md`, plan `docs/plan-chantier-1-paiement.md`) livré : Checkout one-shot, webhook signé idempotent, table `purchases` **sans aucune policy d'écriture** (toutes les mutations passent par RPC `security definer` — c'est ce qui rend T1 irreproductible), gating serveur réutilisable par les chantiers 2 et 3, paywall FR/EN. **T1 clos.** Constat d'audit : le paiement contournable (`?payment=success` + lien test en dur) vivait dans `DemoPage.tsx`, déjà supprimée au chantier 0 — il n'y avait rien à démonter. Décisions actées : paywall sur l'action seule (D1), vente fermée par défaut (D2), prix piloté par Stripe (D3), remboursement via Dashboard + webhook (D4). E2E réel et activation = USER STEPS (compte Stripe, migration, secrets Render).
- **Fait (suite) — chantier 2a, envoi PAPIER (lot 1 du chantier 2)** : **CODE-COMPLET sur la branche `feature/chantier-2a` (467 tests / 28 fichiers), PAS ENCORE MERGÉ** (spec `docs/design-chantier-2a-envoi-papier.md`, plan `docs/plan-chantier-2a-envoi-papier.md`). Provider **MySendingBox** (adaptateur isolé `server/lib/paper-sender.js`, bascule Maileva possible), courrier simple + coffre PJ minimal (bucket privé, magic bytes) + annuaire organismes (321 adresses open-data DILA) + quota `included_sends` consommé atomiquement + facturation à l'acte + webhook-ping (secret d'URL, vérif par GET) + resync timer + kill switch `PAPER_SENDS_ENABLED`. 6 migrations `20260914*`. Durcissement RLS `letter_sends` (mutations par RPC uniquement). 5 cycles de revue adversariale (6 défauts critiques attrapés). **Nouvelles env vars** : `MYSENDINGBOX_API_KEY`, `MSB_WEBHOOK_URL_SECRET`, `PAPER_SENDS_ENABLED`, `STRIPE_PRICE_ID_EXTRA_SEND`. Reste : Task 12 (merge post-gel) + user steps E2E (clé test MSB, tarif Stripe envoi-sup, `db push` préprod). Cadrage du **lot 2b** (moment magique + relances J+15 + unification des statuts) prêt : `docs/draft-cadrage-lot2b.md` (branche `feature/rls-probes`).
- **Fait (suite) — dashboard partenaire PF v0-démo** : sur `pre-prod` (migration `20260913200000_pf_dashboard_demo.sql` : tables `partners`/`partner_users`/`attributions` **deny-all**, RPC `partner_dashboard` = 4 agrégats sans PII, route `/partenaire`). Confiné préprod pour la démo investisseurs — le chantier 4 complet le remplace (l'architecture de sécurité, elle, est déjà la définitive). Seed : `scripts/seed-demo-pf.sql`.
- **Fait (suite) — chantier T (sécurité), prio 1** : `scripts/rls-probes.mjs` + `docs/runbook-rls-probes.md` (probes isolation RLS rejouables, 24/24 vertes sur dev — familles A↔B, partenaire↔familles, deny-all, anonyme). Sur branche `feature/rls-probes`. À intégrer en CI (projet Supabase dédié).
- **Fait (suite) — démonstrateur v2** (spec `docs/design-v2-demonstrateur.md`, plans `docs/plan-v2-app.md` et `docs/plan-v2-sql.md`) : modèle PF — la pompe funèbre ouvre le dossier, la famille l'active par un **jeton valable 7 jours**, 10 envois inclus via le pont `purchases` `partner_dossier:<id>` ; hook Auth « Before User Created » (inscription libre fermée), gate `requireActiveDossier` **fail-closed**, consentements versionnés (`consents`, `CONSENT_VERSION`), vue admin Seren, correctif F1 `transmissions`. Tags : `preprod-plancher`, `preprod-v2-rc1..3`, `demo-2026-09-18`. Bêta pilote prod : `docs/runbook-beta-prod.md` (conditions GNG6). Scripts de données : `scripts/seed-demo-v2.sql`, `scripts/backfill-prod-beta.sql`, `scripts/erase-family.sql`. Textes bêta : `docs/textes-beta-v2.md`.
- **⚠️ CONTEXTE ACTIF (2026-09-15)** : **rendu/démo investisseurs le JEUDI 2026-09-18** + ouverture bêta. Voir le fichier mémoire `seren-chantier-state-2026-09` (chargé auto) pour l'inventaire complet des branches non mergées, la branche d'intégration `integration/2a-preprod` (2a+PF prêt pour la préprod, conflits i18n résolus), et les user steps en cours. **La prod (`main`) reste stable/intouchée pendant la démo** ; tout tourne sur la préprod.
- **À exécuter** : **chantiers restants de la roadmap technique — la roadmap a CHANGÉ, la relire via le connecteur Google Drive** (doc « Roadmap Technique - Seren », source de vérité unique ; pas de copie dans le repo ; si le connecteur est indisponible, demander à Arnaud). Ordre initial (à confirmer contre la nouvelle roadmap) : lot 2b, lot 2c (LRAR), chantier 3 (coffre complet : antivirus/rétention), chantier 4 (affiliation PF), chantier 5 (données défunt), fil rouge sécurité. Backlog : décès à l'étranger, rate limiter multi-instances (inutile en mono-instance), tunnel Sentry front.
- **Compte de test E2E** (jetable, projet de dev) : `test.e2e.claude@seren-test.fr` / `TestSeren2026!` — confirmation email désactivée sur le projet Supabase.
- **Produit transmission** (`AccessPage`, routes GET `/api/user/transmission` + `/api/transmission/:code`, table `transmissions`) : produit DISTINCT du questionnaire, **gelé et réduit à la lecture seule au chantier 0** (la page de démo et ses trois routes serveur ont été supprimées, l'agent Mistral legacy débranché) — réactivation = décision produit explicite.
- **Architecture branches/environnements (ACTÉE 2026-09-13 — 2 branches, 2 bases, 2 services)** : `main` → service prod (`app.seren-app.fr`) → base Supabase prod (`oltwzvfjazwjvghpzhia`) ; `pre-prod` → service préprod (`preprod-app.seren-app.fr`, protégé par Basic Auth) → base Supabase préprod (`kvtzhyxlqouvpwasedbe`). AUCUNE autre branche durable : les branches de travail (`feature/*`, `claude/*`) sont éphémères et supprimées au merge (activer « Automatically delete head branches » sur GitHub). Besoin « tester le code de main contre la base préprod » = variables d'environnement (pointer les 4 variables Supabase vers la préprod en local), JAMAIS une branche dédiée (l'ex-branche `staging` a été supprimée pour cette raison). Le flux : feature → PR/merge dans `pre-prod` (validation sur préprod) → merge dans `main` (prod).
- **Déploiement** : Render — domaine de prod `https://app.seren-app.fr` (rattaché au service `https://application-0vxw.onrender.com`). Les variables `VITE_*` sont figées au build → tout changement de `.env` côté client exige un redéploiement. `CORS_ORIGIN` recommandé sur Render (`https://app.seren-app.fr`). Uptime check UptimeRobot actif ; Sentry actif (2 projets EU : seren-app, seren-server). Préprod : projet Supabase `Seren_app_preprod` (`kvtzhyxlqouvpwasedbe`, eu-west-1, schéma aligné 6/6 par reset+migrations le 2026-07-25) + service Render préprod.

## Points d'attention

- **Tests** : Vitest (`npm test`) — exécutés en CI (`.github/workflows/ci.yml`) sur chaque push/PR — moteur, catalogues, invariants croisés, routes (supertest). **199 sur `main`, 467 sur `feature/chantier-2a`, 484 sur `integration/v2-demo` après les stubs L0bis** (valeur définitive du démonstrateur v2 consignée par L8 au tag `preprod-v2-rc1`). Les invariants interdisent toute question sans étape et tout drift entre catalogues. **Sans `.env`** (session cloud, CI) : exporter les 2 variables factices `VITE_SUPABASE_URL=http://localhost:54321` et `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_dummy` (sinon 2 fichiers échouent à l'import — aucun test ne fait de réseau, cf. `ci.yml`)
- **Sessions** : questionnaire v2 persisté dans `questionnaire_sessions` (Supabase, RLS, TTL 24 h).
- **PII vers Mistral** : le rédacteur ne reçoit que le prénom du défunt, la relation et la dernière réponse fermée (valeurs enum) — jamais l'historique, le nom de famille ni la date de décès
- **Schema SQL** : migrations versionnées dans `supabase/migrations/` (baseline v1 incluse — TOUTE évolution passe par migration + `supabase db push`, plus jamais de SQL Editor manuel) ; fichiers racine v1 et `supabase/archive/` = historique.
- **RLS** : les policies Supabase Row Level Security sont actives — les requêtes côté serveur utilisent le token utilisateur via `getSupabaseClient(token)`
- **Dette pont `purchases`** : les lignes `stripe_session_id = 'partner_dossier:<id>'` ont `amount_total` à null (10 envois offerts par le dossier, aucun paiement). **Toute requête de chiffre d'affaires sur `purchases` doit exclure ce préfixe.** Retrait prévu au lot 2c.
- **Agents : Supabase LOCAL uniquement** (`supabase start` puis `--local`), jamais `link`, `--linked` ni `db push` ; `psql` est absent de l'hôte → `docker exec -i supabase_db_Application psql -U postgres -d postgres`. Le `.env` du dépôt principal visait la PROD et a été renommé `.env.prod-NE-PAS-UTILISER`.
- **Gel de `main` jusqu'à U4 (jeudi 18/09 16h30)** : aucun commit, aucun merge local sur `main`. La promotion prod est un **fast-forward** du tag `demo-2026-09-18` — un simple commit de documentation le ferait échouer une heure après la démo. Les correctifs de la semaine vont sur `pre-prod` ou sur une branche de travail.
