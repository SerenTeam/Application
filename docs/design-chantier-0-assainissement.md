# Design — Chantier 0 · Assainissement

> Rédigé le 2026-07-24. Source : « Roadmap Technique — Seren » v1.0 du 18/07/2026 (document hors repo, §Chantier 0), validée partiellement par Arnaud (relecture en cours) avec instruction de démarrer par ce chantier.
> Objectif : corriger les problèmes relevés à l'audit **avant toute nouvelle feature** (paiement, envoi réel). Effort estimé roadmap : ~2 semaines.

## 1. État des lieux vérifié (2026-07-24)

L'exploration a montré un état **plus avancé** que l'audit du 18/07 :

| Item roadmap | État vérifié | Reste à faire |
|---|---|---|
| 1 · Drifts schéma↔code (T2) | ✅ **Déjà résolu.** Probe REST live sur le projet Supabase (`oltwzvfjazwjvghpzhia`, unique projet — dev **et** prod Render, confirmé par Arnaud) : `step_actions.type` existe, `action_type` n'existe pas ; `documents.document_type` n'existe pas et le code n'y réfère plus (`src/lib/documents.ts` utilise `type`, `theme`, `letter_template_id`). Corrigé par les sessions de juillet. | Rien (acté ici). |
| 2 · Baseline migrations (T8) | CLI v2.109.1 installée, `supabase/config.toml` versionné, `docs/runbook-supabase-cli.md` prêt. CLI **non authentifiée**. `letter_sends` absente de la base (vérifié) → 2 migrations en attente : `20260711100000_purge_sessions_cron` (T7) et `20260716120000_letter_sends`. | Baseline + push (lot B). |
| 3 · CI (T4) | Aucun `.github/workflows/`. | Lot A4. |
| 4 · Hygiène sécurité (T3/T5/T6) | PII loggée : emails (`server.js` signup/login), réponses Mistral + codes d'accès (routes démo). Routes `/api/auth/*` (5) jamais appelées par le front (zéro référence dans `src/`). Démo : seule `DemoPage.tsx` est cassée (3 `fetch()` nus → 401) ; `AccessPage` utilise `apiFetch` et fonctionne. | Lot A1–A2. |
| 5 · Monitoring + robots | Pas de Sentry, pas d'uptime check. App : aucun `robots.txt` (pas de `public/`), aucun `X-Robots-Tag`. Landing : **le correctif robots du 21/07 n'est pas appliqué** — `src/app/robots.txt` contient du code TypeScript servi verbatim (le fichier aurait dû s'appeler `robots.ts`). | Lots A3, A5, C, E2. |
| 6 · Docs | README décrit la v1 périmée (agent 20 questions, Cormorant Garamond, 30 étapes). Plan périmé `2026-05-11-design-system-migration.md` présent dans la landing (clonée dans `../landing`). | Lots A6, C. |
| 7 · Staging (T10) | Inexistant. `supabase/schema_full.sql` (consolidation v1+v2) préparé pour amorcer un projet neuf. | Lot D. |

## 2. Décisions actées (Arnaud, 2026-07-24)

1. **Démo transmission : gel.** Suppression des routes `/api/demo/*` et de `DemoPage` (le code reste dans l'historique git). `AccessPage`, `/api/user/transmission`, `/api/transmission/:code` et la table `transmissions` restent intacts — le produit transmission passe en lecture seule.
2. **Monitoring : Sentry + uptime check** intégrés dans ce chantier (comptes = user steps).
3. **Topologie Supabase : un seul projet** aujourd'hui (`oltwzvfjazwjvghpzhia`) partagé dev/prod. Le staging du lot E créera le second.
4. **Structure : plan unique** (~9 tasks ordonnées), exécution subagent-driven habituelle, user steps intercalés.

## 3. Design par lots

### Lot A — Code app (ce repo)

**A1 · Gel démo + suppression des routes auth mortes** (`server/server.js`, `src/App.tsx`, `src/pages/DemoPage.tsx`)
- Supprimer les 3 routes `/api/demo/{start,answer,save}`, la `Map()` `sessions`, l'appel `client.agents.complete` et toute référence à `MISTRAL_AGENT_ID` (y compris le log de démarrage). Le client Mistral reste (utilisé par le questionnaire v2).
- Supprimer les 5 routes `/api/auth/{signup,login,logout,me,refresh}` (~165 lignes). Le middleware `requireAuth` reste (questionnaire, letters, transmission).
- Supprimer `DemoPage.tsx` + son import et sa route `/demo` dans `App.tsx` (seule référence).
- Conserver : `/api/user/transmission`, `/api/transmission/:code`, `AccessPage`, table `transmissions`.
- `MISTRAL_AGENT_ID` retiré de CLAUDE.md et signalé comme supprimable du `.env` et de Render.

**A2 · Zéro PII dans les logs serveur**
- La quasi-totalité des `console.log` PII disparaît avec A1. Purger le reliquat : aucun email, aucune réponse IA, aucun code d'accès, aucun token loggé.
- Critère vérifiable : `grep -rn "console\." server/` ne montre plus que des logs techniques sans donnée utilisateur (démarrage, santé, erreurs sans payload sensible).

**A3 · Robots / noindex app** (espace privé, données sensibles — politique inverse de la landing)
- Créer `public/robots.txt` : `User-agent: *` / `Disallow: /` (copié dans `dist/` par Vite, servi par Express).
- Middleware Express global : header `X-Robots-Tag: noindex, nofollow` sur toutes les réponses.

**A4 · CI GitHub Actions** (`.github/workflows/ci.yml`)
- Déclencheurs : `push` (toutes branches) + `pull_request`.
- Job unique Node 22 : `npm ci` → `npx tsc --noEmit` → `npx vitest run`.
- Pré-requis vérifié pendant l'exécution : la suite passe **sans `.env`** (sinon, variables factices définies dans le workflow — jamais de secrets réels : aucun test ne doit toucher le réseau).
- La CI sera visible verte au premier push d'Arnaud (vérification post-merge, user step).

**A5 · Sentry front + serveur** (pattern Resend : env absente → no-op propre)
- Serveur : `@sentry/node` initialisé dans `server.js` seulement si `SENTRY_DSN` est définie ; handler d'erreurs Express Sentry avant le handler existant.
- Front : `@sentry/react` initialisé dans `main.tsx` seulement si `VITE_SENTRY_DSN` est définie ; capture depuis l'`ErrorBoundary` existante.
- Config minimale RGPD : erreurs uniquement — `tracesSampleRate: 0`, pas de session replay, pas de user context, `sendDefaultPii: false`. Pas de source maps uploadées en v1 (amélioration ultérieure, nécessiterait un auth token au build).
- CLAUDE.md : documenter `SENTRY_DSN` + `VITE_SENTRY_DSN` (rappel : `VITE_*` figée au build → redéploiement Render après ajout). Ajouter Sentry à la liste DPA du chantier transverse.

**A6 · README réécrit**
- Aligné sur l'état réel : pitch, stack (cf. CLAUDE.md), commandes, architecture v2 (moteur serveur + rédacteur Mistral, i18n FR/EN, courriers email Resend), variables d'env, tests, déploiement Render. Concis — CLAUDE.md reste la référence détaillée pour les agents.

### Lot B — BDD : baseline migrations + push (clôture T7 + T8)

- **User step préalable (début d'exécution)** : `supabase login` puis `supabase link --project-ref oltwzvfjazwjvghpzhia` (mot de passe BDD demandé — terminal d'Arnaud, ~5 min, cf. `docs/runbook-supabase-cli.md`).
- Créer `supabase/migrations/20260701000000_baseline_v1.sql` : les 5 tables v1 (`questionnaires`, `roadmaps`, `steps`, `step_actions`, `documents`) + index + RLS + triggers, extraites de `schema_full.sql` (consolidées le 16/07 depuis l'état réel). Timestamp antérieur à toutes les migrations existantes. La table `transmissions` n'y figure pas : sa migration `20260709090000` est déjà complète et autonome.
- Prod : `supabase migration repair --status applied` pour `20260701000000` (baseline), `20260708120000`, `20260709090000`, `20260713120000` ; puis `supabase db push` → applique `20260711100000` (pg_cron, la migration crée l'extension elle-même) et `20260716120000` (letter_sends).
- Vérifications : `supabase migration list` aligné Local/Remote, `supabase db diff` vide (ou écarts expliqués et résorbés), probe REST : `letter_sends` existe ; côté SQL (CLI liée), `select * from cron.job` montre la purge planifiée.
- `schema_full.sql` archivé (`supabase/archive/` avec note) : redondant dès que la baseline existe — un projet neuf se monte par `supabase db push` seul. Les fichiers racine v1 (`supabase_v1_schema.sql`, `supabase_auth_setup.sql`) restent en historique, leurs en-têtes le disent déjà.
- Périmètre : la table `letter_sends` existera mais l'**activation** du canal email (secrets Resend/webhook sur Render + `webhook_config` en base) reste le user step du plan courriers — hors chantier.
- Règle actée : **toute évolution de schéma passe désormais par migration + `db push`** (plus jamais de SQL Editor manuel).

### Lot C — Landing (repo `../landing`, commit local sur main, Arnaud pushe)

- **C1** : `git mv src/app/robots.txt src/app/robots.ts` — le contenu est déjà du TypeScript Next valide ; seul le nom de fichier était faux (servi verbatim en prod aujourd'hui). Vérification : `npm run build` de la landing passe et génère la route robots.
- **C2** : archiver `docs/superpowers/plans/2026-05-11-design-system-migration.md` → `docs/superpowers/plans/archive/` (contredit l'état livré : Next 14 + palette teal).

### Lot D — Staging (préparation + créations guidées)

- Nouveau `docs/runbook-staging.md` : créer le projet Supabase préprod (dashboard — user step), `supabase link` sur sa ref puis `supabase db push` from scratch (toutes migrations, baseline comprise), config Auth dashboard (confirmation email, URLs de redirection), créer le service Render staging (fork de la config prod — user step) avec ses env propres (`VITE_*` staging, `CORS_ORIGIN` staging, clés Supabase staging, `MISTRAL_API_KEY` partagée ou dédiée).
- Créations effectives = user steps guidés en fin d'exécution. **Si Arnaud diffère, le runbook seul est livrable et le chantier n'est pas bloqué** (les items dépendants — paiements, envois réels — sont aux chantiers 1–2).

### Lot E — User steps de clôture

1. Compte Sentry (plan gratuit) → 2 DSN (front, serveur) → env Render + `.env` → redéploiement (VITE figée au build).
2. Uptime check gratuit (UptimeRobot ou BetterStack) sur `https://application-0vxw.onrender.com/api/health`.
3. Push GitHub (Application + landing) → vérifier la CI verte.
4. (Lot D) Créations staging si non faites en séance.

## 4. Ordre d'exécution

A1 (gel démo + routes mortes) → A2 (zéro PII logs) → A3 (robots) → A4 (CI) → A5 (Sentry) → A6 (README) → B (baseline + push ; user step login dès le début de séance) → C (landing) → D (runbook staging) → E (user steps de clôture). Chaque task : tests + type-check verts avant de passer à la suivante.

## 5. Vérification globale (fin de chantier)

- `npx tsc --noEmit` + `npx vitest run` verts (86 tests, dont routes letters/questionnaire inchangées).
- Greps négatifs : plus aucune occurrence de `api/demo`, `api/auth` (hors historique git), aucun log PII.
- Probe REST : schéma complet (letter_sends présente), `cron.job` contient la purge.
- `supabase migration list` propre ; `db diff` vide.
- Landing : build vert, `curl` local de la route robots rend du texte robots (pas du TS).
- App : `curl -I` montre `X-Robots-Tag: noindex, nofollow` ; `/robots.txt` sert `Disallow: /`.
- Sentry : erreur de test capturée (une fois le DSN posé — sinon vérifier le no-op sans DSN).
- CI verte sur GitHub après push (user step).

## 6. Hors scope (explicitement)

- Chantier T (RLS `transmissions` F1 — produit gelé, décision ouverte ; AIPD ; DPA ; pseudonymisation des flux secondaires ; codes d'accès transmission).
- Activation du canal email courriers (secrets Resend — user steps du plan courriers).
- Chantiers 1+ (Stripe, envoi papier/LRAR, coffre, affiliation).
- Rate limiter multi-instances, décès à l'étranger (backlog).
