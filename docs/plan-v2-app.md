# Démonstrateur v2 — application (serveur, front, contenu, docs, intégration, promotion) · Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer sur `integration/v2-demo` la partie applicative du contrat figé `docs/design-v2-demonstrateur.md` : gate serveur fail-closed, `/api/me`, flags et route F1 (L2a) ; routes partenaire et activation avec invitation Resend conforme art. 14 (L2b) ; front famille (activation, consentement, garde d'accès, pages bêta) (L3) ; front PF (créer, lister, renvoyer, annuler, compteurs explicites) (L4) ; estimation « N × 220 € TTC » en préprod (L4b) ; vue admin Seren côté app (L4c) ; contenu v2 (L5) ; runbooks, textes bêta et CLAUDE.md (L7) ; puis intégrer et taguer (L8) et préparer la promotion prod de la bêta pilote (L9). Échéances : démo investisseurs jeudi 18/09 15h sur la préprod, bêta pilote PROD jeudi 16h30-18h30 (repli vendredi 9h-11h).

**Architecture:** Le contrat `docs/design-v2-demonstrateur.md` fait foi pour tout nom, signature, code d'erreur, flag et namespace ; ce plan ne fait que l'ordonner en tâches exécutables. Serveur Express ESM à factories injectées : le gate `requireActiveDossier` (lecture `my_account()` au token utilisateur, fail-closed) occupe le slot de l'ancien `requirePurchase` ; toute la sécurité métier (identité, jeton, rôles) est portée par les RPC SQL `security definer` livrées par `docs/plan-v2-sql.md` (L1, L1b, L4c-SQL, L6) — Express n'ajoute que des interrupteurs d'exploitation. Front React : une seule source de vérité de l'accès (`GET /api/me` via `useAccount`) et une fonction pure `resolveAccessRedirect`. Jeton d'activation : 32 octets aléatoires en base64url dans le fragment `#t=`, capturé et effacé avant toute initialisation d'outil tiers ; seul son sha256 hex transite. Un lot = une branche `feature/v2-<lot>` dans son propre worktree, mergée par L8 dans l'ordre §8.3 du contrat.

**Tech Stack:** Node 22, Express 4 (JS ESM), `@supabase/supabase-js` 2.90 (clé publishable + token utilisateur, jamais la clé secrète), Resend, `@sentry/node` et `@sentry/react` 10, React 18 + TypeScript + Vite + Tailwind CSS v4 (`@theme`), Vitest + supertest (aucun appel réseau), Supabase CLI en `--local` uniquement.

---

## Règles d'exécution (valent pour TOUTES les tasks)

**R1 — Source de vérité.** Lire `docs/design-v2-demonstrateur.md` avant chaque lot. Toute divergence découverte (nom, signature, code, fichier hors propriété) → STOP, rédiger une note de contrat au format §12.2 et la remonter à l'orchestrateur ; ne jamais « arranger » en silence. Les notes déjà identifiées par ce plan sont listées en Task 0.

**R2 — Worktrees et branches.** Base : branche `integration/v2-demo` du worktree d'intégration, APRÈS le commit des stubs L0bis (Task 0). Chaque lot travaille dans son worktree :

| Lot | Branche | Worktree (chemin absolu) |
|---|---|---|
| L5 | `feature/v2-l5` | `/private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l5` |
| L2a | `feature/v2-l2a` | `/private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l2a` |
| L2b | `feature/v2-l2b` | `/private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l2b` |
| L3 | `feature/v2-l3` | `/private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l3` |
| L4 | `feature/v2-l4` | `/private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l4` |
| L4b | `feature/v2-l4b` | `/private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l4b` |
| L4c (app) | `feature/v2-l4c-app` | `/private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l4c-app` |
| L7 (app) | `feature/v2-l7-app` | `/private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l7-app` |
| L9 (app) | `feature/v2-l9-app` | `/private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l9-app` |
| L6 (E2E, Task 37) | `feature/v2-l6-e2e` | `/private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l6-e2e` |
| L8 | `integration/v2-demo` et `integration/v2-plancher` | `/private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-integration` |

Création d'un worktree de lot (exemple exact pour L2a ; remplacer `l2a` par l'identifiant du lot de la table) :

```bash
cd /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-integration \
  && git worktree add ../wt-v2-l2a -b feature/v2-l2a integration/v2-demo \
  && ln -s /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-integration/node_modules ../wt-v2-l2a/node_modules
```

⚠️ **Branches scindées (revue du 16/09, SF2.7, contrat §8.2).** Les lots écrits par les **deux** plans ont deux branches et deux worktrees : ce plan utilise `feature/v2-l4c-app`, `feature/v2-l7-app`, `feature/v2-l9-app` et `feature/v2-l6-e2e` ; `docs/plan-v2-sql.md` utilise `feature/v2-l4c-sql`, `feature/v2-l7-sql`, `feature/v2-l9-sql` et `feature/v2-l6`. Ne jamais faire `git worktree add -b` sur une branche de l'autre plan (échec « already exists »), ne jamais travailler à deux subagents dans le même worktree (collision `.git/index.lock` et commits mélangés).

Attendu : `Preparing worktree (new branch 'feature/v2-l2a')`. Si le lien symbolique casse `vite build` ou Vitest : supprimer le lien et lancer `npm ci --prefer-offline` dans le worktree (même convention que `docs/plan-v2-sql.md` Task 0). Le cwd des agents étant réinitialisé à chaque appel, **chaque commande de ce plan est à lancer après `cd <worktree du lot>`** (chemin de la table ci-dessus).

**R3 — Gate local (obligatoire avant de rendre la main, et après chaque task qui touche du code).**

```bash
export VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_dummy \
  && npx tsc --noEmit && npx vitest run && npm run build
```

Attendu : `tsc` sans sortie ; Vitest `Test Files  N passed` et `Tests  M passed` (0 failed) ; build `✓ built in`. Consigner M dans le message de fin de lot (base attendue après L0 : 484 d'après H14, à vérifier et consigner).

**R4 — Commits.** Un commit par task minimum, sur la branche du lot, jamais sur `integration/*` (sauf L8). Sujet `feat(v2-<lot>): …`, `test(v2-<lot>): …`, `docs(v2-<lot>): …`. **Les commits des sous-lots PLANCHER portent le préfixe `feat(v2-<lot>-plancher):`** (L8 les retrouve par `git log --grep`). Chaque message se termine par la ligne :

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

**R5 — Interdits absolus.** Aucun `git push`, aucun `supabase link`, `--linked`, `db push`, aucune écriture SQL distante, aucune lecture de `.env` (le `.env` du dépôt principal vise la PROD `oltwzvfjazwjvghpzhia`), aucune clé secrète Supabase, aucun `console.*` de `req.body`, du jeton, du hash ou d'une URL d'activation, aucun hex de couleur en dur (tokens `@theme` : `bg-bg`, `bg-white`, `text-text`, `text-text-secondary`, `text-text-muted`, `text-primary`, `border-border-card`, `bg-warning-light`, `text-warning`, `bg-error-light`, `text-error`, `rounded-card`, `shadow-card`…). Appels réseau vers la préprod : seulement dans les tasks L8 qui le disent, via l'API publique, comptes `@seren-test.fr`.

**R6 — Niveaux de revue (D5).** *Double revue* (spec puis sécurité/qualité, deux subagents distincts) : tout ce qui touche au gate, au jeton, aux flags d'exposition, aux routes PF/activation, au scrub Sentry, aux scripts SQL de backfill et d'effacement. *Revue unique* : UI, textes, docs. Le niveau est rappelé en tête de chaque task. Correctifs de revue appliqués sans re-consulter Arnaud ; chaque écart documenté dans « Notes post-revue ».

**R7 — Conventions de code.** Commentaires en français, identifiants en anglais. Serveur : réponse `{ success, error?, code? }`, `error = msg(lang, key)`, tout 500 accompagné de `Sentry.captureException`, jamais de message d'erreur brut d'un fournisseur ou de Postgres renvoyé au client (il peut contenir une adresse). Tests : import d'un module JS serveur précédé de `// @ts-expect-error — module JS serveur` (le `tsconfig.json` inclut `tests` en mode strict avec `noUnusedLocals`) ; `vi.mock('@sentry/node', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))` quand un test vérifie Sentry ; fixtures JSON lues par `readFileSync(path.join(process.cwd(), 'tests/fixtures/…'), 'utf8')` (pas de `resolveJsonModule`).

**R8 — Propriété des fichiers et ancres (contrat §8).** Un lot ne crée ou ne modifie que les fichiers de sa ligne §8.2 (et ceux validés par une note de Task 0). Namespaces i18n neufs insérés **juste avant** leur ancre `// v2:ns-<lot>` dans `strings.fr.ts` ET `strings.en.ts` ; namespaces existants modifiés en place. Messages serveur insérés juste avant `// v2:messages-<lot>` dans les objets `fr` et `en` de `server/lib/messages.js`. Montages Express insérés juste avant `// v2:mount-<lot>` ; `import` en tête de `server/server.js`.

**R9 — Base Supabase locale partagée.** Un seul jeu de conteneurs `supabase_*_Application` sert tous les lots. On réutilise l'outillage de `docs/plan-v2-sql.md` Task 0 (scratchpad, non versionné) : `. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh` en tête de bloc ; `psql-local` (psql n'est pas installé sur la machine : `docker exec -i supabase_db_Application psql`) ; `with-db-lock <commande>` pour TOUTE commande qui réinitialise la base ou y écrit (code 75 = verrou tenu : attendre et relancer, ne jamais forcer) ; `run-sql-checks <worktree> <fichiers>` pour un `db reset --local` suivi des grants « comme l'hébergé » (`hosted-grants.sql` — sans eux, `authenticated` n'a aucun droit de table en local et les écritures PostgREST échouent). Seul L1 (plan SQL, Task 5) arrête ou redémarre la stack. Les lots L5, L2a, L2b, L3, L4, L4b, L4c-app et L7 n'utilisent pas la base locale.

**R10 — Pousser un tag vers une branche (revue du 16/09, MF2.1).** Tous les tags de ce plan sont **annotés** (`git tag -a …`). Un tag annoté n'est **pas** un commit : `git push origin <tag>:<branche>` est refusé par le serveur (`remote: error: … trying to write non-commit object … ! [remote rejected]`). Toute commande donnée à Arnaud qui met à jour une branche depuis un tag utilise donc la **forme pelée**, avec la ref complète et des quotes simples (`^{}` est interprété par le shell) :

```bash
git fetch origin
git merge-base --is-ancestor origin/pre-prod 'preprod-v2-rc1^{commit}' && echo "fast-forward possible"
git push origin 'preprod-v2-rc1^{commit}:refs/heads/pre-prod'
git push origin preprod-v2-rc1        # le tag lui-même, séparément, pour l'historique
```

Même forme pour `preprod-v2-rc2`, `preprod-v2-rc3`, `preprod-plancher` (vers `pre-prod`) et `demo-2026-09-18` (vers `main`, U4). Le contrôle `merge-base --is-ancestor` précède **toujours** la commande de push : 🛑 s'il échoue, ne jamais forcer (remèdes : 39.8 pour la préprod, Task 44 §7 pour la prod).

---

## Structure des fichiers

| Lot | Palier | Créés (C) / Modifiés (M) / Supprimés (D) | Tests |
|---|---|---|---|
| **L5** Contenu | PLANCHER | M `server/lib/questions-catalog.js` (FR : l.103, 136, 138, 139, 165, 190, 226, 260, 276, 298, 341), M `src/data/letter-templates.ts` (notes l.83, 123, 165, 283, 357), M `src/components/questionnaire/CompletionScreen.tsx`, M `src/pages/QuestionnairePage.tsx`, M `src/components/dashboard/RoadmapView.tsx` (bandeau), M `src/components/letter/QuotaBadge.tsx`, M `src/components/letter/PaperSendPanel.tsx` (402 + canal fermé), M `src/i18n/strings.{fr,en}.ts` (namespaces `completion`, `roadmap`, `paperSend`, `lettersPage`, C `offer`), M `README.md` | M `tests/questions-catalog.test.ts` |
| **L2a** Serveur gate | PLANCHER (`FEATURE_LLM`) + MINIMUM | C `server/lib/require-active-dossier.js`, C `server/lib/sentry-scrub.js` (note N1), C `server/routes/me.js`, C `server/routes/transmission.js`, M `server/server.js`, M `server/lib/flags.js`, M `server/routes/questionnaire.js`, M `server/routes/letters.js`, M `server/routes/attachments.js`, M `server/routes/payments.js`, M `server/lib/messages.js` (bloc L2a + `quota_exhausted`) | C `tests/active-dossier-gate.test.ts`, C `tests/me-route.test.ts`, C `tests/flags.test.ts`, C `tests/transmission-route.test.ts`, C `tests/server-sentry-scrub.test.ts`, M `tests/questionnaire-routes.test.ts`, M `tests/letters-routes.test.ts`, M `tests/letters-paper-routes.test.ts`, M `tests/letters-webhook.test.ts`, M `tests/attachments-routes.test.ts`, M `tests/payments-routes.test.ts`, M `tests/payments-webhook.test.ts`, M `tests/purchase-gate.test.ts` |
| **L2b** Serveur PF + activation | MINIMUM | C `server/routes/partner.js`, C `server/routes/activation.js`, C `server/lib/invite-token.js`, C `server/lib/invitation-email.js`, M `server/lib/rate-limit.js`, M `server/server.js` (ancres), M `server/lib/messages.js` (bloc L2b), M `tests/fixtures/invite-token-vector.json` (si écart au contrat, sinon inchangé) | C `tests/partner-routes.test.ts`, C `tests/activation-routes.test.ts`, C `tests/invite-token.test.ts`, C `tests/invitation-email.test.ts` |
| **L3** Front famille | PLANCHER (paywall, `/signup`) + MINIMUM | M `src/main.tsx`, M `src/lib/sentry.ts`, C `src/lib/activation-fragment.ts`, C `src/lib/activation-token.ts`, C `src/lib/access-redirect.ts`, C `src/components/auth/RequireAccess.tsx`, C `src/components/auth/AccessNotActivatedScreen.tsx`, C `src/pages/ActivationPage.tsx`, C `src/pages/ConsentPage.tsx`, M `src/App.tsx`, M `src/pages/LoginPage.tsx`, D `src/pages/SignupPage.tsx`, D `src/components/auth/CGUCheckbox.tsx`, M `src/hooks/useAuth.ts`, M `src/components/letter/LetterSendPanel.tsx`, M `src/hooks/usePayments.ts`, M `src/components/payments/CheckoutReturnBanner.tsx`, M `src/lib/auth.ts`, M `src/i18n/strings.{fr,en}.ts` (C `activation`, `consent`, `access`, `legalPages` ; M `auth`, `payments` (supprimé), `layout`) | C `tests/access-redirect.test.ts`, C `tests/activation-fragment.test.ts`, C `tests/activation-token.test.ts` |
| **L4** Front PF | PLANCHER (euros masqués) + MINIMUM | M `src/pages/PartnerDashboardPage.tsx`, M `src/hooks/usePartnerDashboard.ts`, C `src/components/partner/DossierForm.tsx`, C `src/components/partner/DossierCard.tsx`, C `src/components/partner/PartnerCounters.tsx`, C `src/lib/partner-dossier.ts`, M `src/i18n/strings.{fr,en}.ts` (namespace `partner` réécrit) | C `tests/partner-dossier.test.ts` |
| **L4b** Estimation | CIBLE | C `src/components/partner/BillingPreview.tsx`, C `src/lib/billing-preview.ts`, M `src/pages/PartnerDashboardPage.tsx` (1 import + 1 ligne à l'ancre, note N5), C namespace `partnerBilling` | C `tests/billing-preview.test.ts` |
| **L4c** Admin (app) | MINIMUM | C `server/routes/admin.js`, C `src/pages/AdminPage.tsx`, C `src/hooks/useAdminOverview.ts`, M `server/server.js` (ancre `mount-admin`), M `server/lib/messages.js` (bloc L4c), M `src/App.tsx` (ancre `route-admin`), C namespace `admin` | C `tests/admin-routes.test.ts` |
| **L7** Docs et textes | MINIMUM | C `docs/textes-beta-v2.md`, M `docs/runbook-demo-rendu.md`, M `CLAUDE.md`, M valeurs de `legalPages` dans `src/i18n/strings.{fr,en}.ts` (après merge de L3). **`scripts/seed-demo-pf.sql` n'est PAS dans ce plan** : en-tête « obsolète v2 » livré par `docs/plan-v2-sql.md` Task 12 (note N14, SF2.6) | — |
| **L8** Intégration | — | merges, tags, C `scripts/e2e-v2.mjs` (propriété L6 au contrat, délégué à ce plan par `docs/plan-v2-sql.md`, note N8), notes post-revue du plan | exécution E2E, probes, gate |
| **L9** Préparation prod | BÊTA | C `docs/runbook-beta-prod.md` ; contre-épreuves locales (sans fichier versionné) de `scripts/backfill-prod-beta.sql` et `scripts/erase-family.sql`, écrits par `docs/plan-v2-sql.md` (note N16) | rejeu local sur jeu simulé, transaction annulée |

Hors de ce plan (couverts par `docs/plan-v2-sql.md`) : migrations `20260915200000_v2_core.sql`, `20260915201000_v2_partner_rpc.sql`, `20260915202000_v2_admin.sql`, `20260915210000_transmissions_f1.sql`, `supabase/config.toml`, `scripts/sql-scenarios-*.sql`, `scripts/hook-scenarios-v2.mjs`, `scripts/rls-probes.mjs`, `scripts/provision-v2.mjs`, `docs/runbook-rls-probes.md`, `scripts/seed-demo-v2.sql` (parties 1, 2, 3), `scripts/backfill-prod-beta.sql`, `scripts/erase-family.sql`, `tests/migrations-v2-lint.test.ts`, `tests/consent-version.test.ts`.

## Ordre d'exécution (nuit du 15 au 16/09, puis journée du 16) et dépendances

**Recalage du 16/09 (retard réel).** U1 **n'a pas eu lieu mardi soir** : il est déplacé au **mercredi 16/09, au plus tard 11h** (`docs/checklist-push.md`) ; GNG1 est rendu en fin de U1 et **GNG2 passe de 11h à 11h45**. Le reste de la timeline est inchangé : U2 12h30-13h25 (GNG3), GNG4 18h, U3 20h30-21h15 (GNG5), jeudi 9h push final, **gel dur 10h45**, démo 15h, U4 16h30-18h30 (GNG6). Les agents travaillent la **nuit du 15 au 16 et la journée du 16** (contrat §10.3, tableau des créneaux). Conséquence d'ordonnancement (écart E10, must-fix 1) : les Tasks 9-11 de `docs/plan-v2-sql.md` (provisionnement et probes) **ne peuvent plus s'exécuter avant le merge de L2b** — rédigées la nuit, **exécutées mercredi 8h-11h** après 39.1, avec un serveur Express local sur le port 3997.

| Flux parallèle | Tasks | Dépend de |
|---|---|---|
| A — L5 | 1 → 4 | Task 0 |
| B — L2a | 5 → 13 | Task 0 |
| C — L2b | 14 → 19 | Task 0 (n'utilise que `flags.js` stub et le contrat SQL) |
| D — L3 | 20 → 25 | Task 0 |
| E — L4 puis L4b | 26 → 29, puis 32 | Task 0 ; 32 après 29 (ancre posée par L4) |
| F — L4c app | 30 → 31 | Task 0 |
| G — L7 | 33, 35, 36 la nuit ; 34 après merge de L3 (L8) | Task 0 |
| H — L9 | 42 → 44 (mercredi, après merge de L1 dans l'intégration pour le rejeu local) | L1 mergé |
| L8 | 37 (nuit du 15 au 16, avant le rejeu 39.6), 38 (nuit du 15 au 16, dès les 4 sous-lots PLANCHER commités — au plus tard mer. 10h30), 39 (mer. 8h-11h45), 40 (mer. après U2 ; **étape papier juste après GNG3**), 41 (mer. après-midi → jeudi 9h) | tous |

Ordre de coupe si retard (contrat §1.2) : Task 32 (L4b) → UI d'annulation de Task 29 (la route reste) → page `/security` de Task 25 (on garde `/legal`) → vérifications 400 px de Task 41 → UI de Task 31 (la route de Task 30 reste). Jamais L2a.

---

### Task 0 : Préalables orchestrateur (avant toute branche de lot)

**Niveau de revue :** aucune (vérifications).
**Files:** aucun fichier modifié par cette task ; lecture de `server/lib/flags.js`, `src/types/account.ts`, `src/hooks/useAccount.ts`, `src/lib/consent-version.ts`, `tests/fixtures/invite-token-vector.json`, `server/server.js`, `server/lib/messages.js`, `src/i18n/strings.fr.ts`, `src/i18n/strings.en.ts`, `src/App.tsx`.

- [ ] **0.1** Vérifier que le commit des stubs L0bis est présent sur `integration/v2-demo` :

```bash
cd /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-integration \
  && git status --short && ls server/lib/flags.js src/types/account.ts src/hooks/useAccount.ts src/lib/consent-version.ts tests/fixtures/invite-token-vector.json \
  && grep -c "v2:mount-partner\|v2:mount-activation\|v2:mount-admin" server/server.js \
  && grep -c "v2:messages-l2a\|v2:messages-l2b\|v2:messages-l4c" server/lib/messages.js \
  && grep -c "v2:ns-l3\|v2:ns-l4\b\|v2:ns-l4b\|v2:ns-l4c\|v2:ns-l5" src/i18n/strings.fr.ts src/i18n/strings.en.ts \
  && grep -c "v2:route-admin" src/App.tsx
```

Attendu : `git status` vide ; les 5 fichiers listés ; `3` pour server.js ; `6` pour messages.js (3 ancres × fr/en) ; `5` pour chaque fichier strings ; `1` pour App.tsx. 🛑 STOP si un élément manque : aucune branche de lot n'est créée tant que L0bis n'est pas commité.

- [ ] **0.2** Contrôler le vecteur partagé du jeton (déjà vérifié à la rédaction de ce plan : les deux hash du contrat §8.1 sont exacts) :

```bash
node -e 'const c=require("crypto");const v=JSON.parse(require("fs").readFileSync("tests/fixtures/invite-token-vector.json","utf8"));for(const x of v){const t=Buffer.from(x.token_bytes_hex,"hex").toString("base64url");console.log(t===x.token, c.createHash("sha256").update(x.token,"utf8").digest("hex")===x.hash)}'
```

Attendu : deux lignes `true true`.

- [ ] **0.3** Faire valider par l'orchestrateur, et consigner au §12.2 du contrat, les notes de contrat que ce plan applique. Tant qu'une note n'est pas validée, la task qui en dépend s'arrête à l'étape concernée.

| # | Section | Changement | Motif | Task |
|---|---|---|---|---|
| N1 | §4.8, §8.2 L2a | C `server/lib/sentry-scrub.js` (export `scrubSentryEvent`) | `server/server.js` démarre le serveur à l'import : le test `tests/server-sentry-scrub.test.ts` exigé par le contrat n'a rien d'importable sans module dédié | 13 |
| N2 | §7.6, §7.7 | Canal e-mail fermé dans `LetterSendPanel.tsx` (L3) : rendu de la clé EXISTANTE `lettersPage.send.notConfigured`, dont L5 réécrit la valeur | le fichier appartient à L3 et le namespace à L5 ; aucune clé neuve ainsi | 4, 24 |
| N3 | §7.6, §8.2 L5 | `server/lib/letter-templates.js` inchangé | le jumeau serveur ne porte pas de champ `notes` (vérifié : aucun `notes:`) ; la parité testée ne couvre pas les notes | 2 |
| N4 | §1.3 A5 | 10 constructions de routers dans 8 fichiers de tests (et non 8) | `questionnaire-routes.test.ts` en compte 3 | 8-10 |
| N5 | §8.2 L4b | Insertion d'1 `import` + 1 ligne JSX dans `PartnerDashboardPage.tsx` | le composant doit être importé | 32 |
| N6 | §7.1 | La route `/admin` de L4c est câblée `ProtectedRoute` seul ; L8 ajoute `RequireAccess area="admin"` au merge de L3 | L4c merge avant L3 : `RequireAccess` n'existe pas encore ; la page reste gardée côté serveur (403 `NOT_ADMIN`) | 31, 39 |
| N7 | §4.1 | `requireActiveDossier` : `data.consent?.required !== false` → 403 `CONSENT_REQUIRED` | lecture fail-closed d'une réponse `my_account` sans objet `consent` (comportement identique sur toute forme conforme) | 7 |
| N8 | §8.2 L6 | `scripts/e2e-v2.mjs` écrit par ce plan (Task 37, commit au nom de L6) | `docs/plan-v2-sql.md` l'exclut explicitement de son périmètre ; GNG4 en dépend | 37 |
| N9 | §8.2 L7/L9 | `docs/runbook-beta-prod.md` reste en L9 (conforme au contrat) | la demande initiale le rangeait en L7 | 44 |
| N10 | §7.6 notes | Signalement : le texte unique « … joindre l'acte de décès » fait perdre à `assurance-vie-demande` la mention « pièce d'identité, justificatif de qualité de bénéficiaire » | régression éditoriale possible ; décision Arnaud (défaut : texte du contrat) | 2 |
| N11 | §4.2 | `createLettersRouter({ extraSendAvailable })` accepte une fonction (production) ou un booléen (tests) ; défaut `() => false` | le contrat passe une fonction, les tests existants un booléen | 8 |
| N12 | §4.2 | `createPaymentsRouter` ne reçoit plus `paymentsEnabled`, `priceId`, `includedSends`, `getPrice` | `server.js` ne lit plus ces variables | 10 |
| N13 | §4.3 | `server/routes/me.js` importe `readQuota` exporté par `server/routes/letters.js` | « calcul identique à `/quota` » sans dupliquer la règle `BILLABLE_DEBIT_SOURCES` | 8, 11 |
| N14 | §8.2 L7 | `scripts/seed-demo-v2.sql` (parties 1, 2, 3) n'est PAS couvert par ce plan | écrit par `docs/plan-v2-sql.md` (écrit dans `purchases`, double revue SQL) | — |
| N15 | §4.1 | `FAIL_CLOSED_GATE` renvoie `msg(lang,'send_error')` y compris sur le questionnaire et le coffre | texte littéral du contrat, conservé ; libellé impropre hors courriers, sans impact (état de mauvaise configuration) | 7 |
| N16 | §8.2 L9 | `scripts/backfill-prod-beta.sql` et `scripts/erase-family.sql` écrits par `docs/plan-v2-sql.md` ; ce plan ne livre que `docs/runbook-beta-prod.md` et des contre-épreuves locales indépendantes | éviter deux implémentations concurrentes du même fichier SQL | 42, 43, 44 |

**Statut au 16/09 : fait.** Les 16 notes sont consignées au contrat **§12.2.1**, avec leur décision. Toutes **validées** sauf **N10** (mention « pièce d'identité, justificatif de qualité de bénéficiaire » de `assurance-vie-demande`), **à trancher par Arnaud** : défaut appliqué = texte unique du contrat, correctif P1 d'une chaîne si Arnaud tranche autrement. Le contrat §12.2.2 tranche en outre les écarts **E0-E13** de `docs/plan-v2-sql.md` : lire E6 (`included_sends = 0` des dossiers backfillés `direct`, conséquence sur l'offre L5), E9 (`Delete user` bloqué) et E10 (provisionnement par l'API, dépendance au merge de L2b) **avant** de démarrer les Tasks 3, 35 et 44.

---

## Lot L5 — Contenu (PLANCHER)

Revue : **unique** (textes et UI), plus validation du ton par Arnaud en U2. Branche `feature/v2-l5`. Aucune dépendance au serveur v2 : si `/api/me` n'existe pas (palier plancher), `useAccount()` renvoie `error: true` et `me: null`, et chaque rendu conditionné par un flag teste `me?.flags.x === false` (jamais `!me?.flags.x`) pour ne rien masquer à tort.

### Task 1 : Catalogue épicène et test anti-formes genrées

**Niveau de revue :** unique.
**Files:**
- Modify: `server/lib/questions-catalog.js:103,136,138,139,165,190,226,260,276,298,341` (FR uniquement, valeurs enum et textes EN inchangés)
- Test: `tests/questions-catalog.test.ts` (ajout d'un `it`)

- [ ] **1.1** Écrire le test qui échoue, à la fin du `describe('questions-catalog', …)` :

```ts
  it('aucune forme genrée en français (questions, aides, libellés d’options)', () => {
    const GENDERED = /\(e\)|il\/elle|\/elle/i
    const offenders: string[] = []
    for (const q of QUESTIONS_CATALOG) {
      const texts = [
        textIn(q.fallback_text.question, 'fr'),
        q.fallback_text.aide ? textIn(q.fallback_text.aide, 'fr') : '',
        ...(q.options ?? []).map((o: { label: unknown }) => textIn(o.label, 'fr')),
      ]
      for (const text of texts) if (GENDERED.test(text)) offenders.push(`${q.id} → ${text}`)
    }
    expect(offenders).toEqual([])
  })
```

- [ ] **1.2** Vérifier l'échec : `npx vitest run tests/questions-catalog.test.ts` → attendu `1 failed`, liste de 10 textes fautifs (`deceased_dod`, `statut_professionnel` ×3, `logement`, `enfants`, `has_life_insurance`, `has_vehicle`, `has_credits`, `employait_aide_domicile`).

- [ ] **1.3** Remplacer les valeurs `fr` suivantes (et elles seules) :

| Ligne | Avant | Après |
|---|---|---|
| 103 | `À quelle date {prenom} est-il/elle décédé(e) ?` | `Quelle est la date du décès de {prenom} ?` |
| 136 | `Salarié(e)` | `En emploi salarié` |
| 138 | `Indépendant(e) ou chef d\'entreprise` | `À son compte ou chef d\'entreprise` |
| 139 | `Retraité(e)` | `À la retraite` |
| 165 | `Hébergé(e) ou autre situation` | `Hébergement chez un proche ou autre situation` |
| 190 | `{prenom} avait-il/elle des enfants ?` | `Est-ce que {prenom} avait des enfants ?` |
| 226 | `Si vous n\'êtes pas sûr(e), pas d\'inquiétude : une recherche gratuite existe via l\'AGIRA.` | `En cas de doute, pas d\'inquiétude : une recherche gratuite existe via l\'AGIRA.` |
| 260 | `{prenom} possédait-il/elle un véhicule ?` | `Est-ce que {prenom} possédait un véhicule ?` |
| 276 | `{prenom} avait-il/elle des crédits en cours (immobilier ou consommation) ?` | `Est-ce que {prenom} avait des crédits en cours (immobilier ou consommation) ?` |
| 298 | `{prenom} employait-il/elle une aide à domicile (ménage, garde, assistance) ?` | `Est-ce que {prenom} employait une aide à domicile (ménage, garde, assistance) ?` |
| 341 | `Dernière question : avez-vous déjà contacté certains de ces organismes ? (aucun, un ou plusieurs)` | `Dernière question : avez-vous déjà contacté certains de ces organismes ?` |

`tests/question-writer.test.ts` n'est PAS modifié : sa fixture `SPEC` est locale au test.

- [ ] **1.4** Vérifier le succès : `npx vitest run tests/questions-catalog.test.ts tests/invariants.test.ts tests/questionnaire-routes.test.ts tests/question-writer.test.ts` → attendu `0 failed`.
- [ ] **1.5** Commit : `git add server/lib/questions-catalog.js tests/questions-catalog.test.ts && git commit -m "feat(v2-l5-plancher): catalogue de questions épicène (questions, options, aide) + test anti-formes genrées"` (avec le trailer R4).

### Task 2 : Notes des 5 modèles papier, avertissement roadmap, README

**Niveau de revue :** unique.
**Files:**
- Modify: `src/data/letter-templates.ts:83,123,165,283,357`
- Modify: `src/components/dashboard/RoadmapView.tsx:58` (bandeau sous le `SectionHeading`)
- Modify: `src/i18n/strings.fr.ts` et `src/i18n/strings.en.ts` (namespace `roadmap` : clé `legalReviewNotice`)
- Modify: `README.md:11`

- [ ] **2.1** Notes : remplacer la valeur `notes` des modèles `banque-declaration-deces` (l.83), `assurance-declaration-deces` (l.123), `assurance-vie-demande` (l.165), `carsat-notification` (l.283), `bailleur-notification` (l.357) par `'Seren l\'envoie pour vous par courrier ; joindre l\'acte de décès.'` (note N10 : si Arnaud tranche pour conserver les pièces de l'assurance vie, l.165 devient `'Seren l\'envoie pour vous par courrier ; joindre : acte de décès, pièce d\'identité, justificatif de qualité de bénéficiaire.'`). `server/lib/letter-templates.js` n'est pas touché (note N3). Contrôle : `grep -n "recommandé" src/data/letter-templates.ts` → aucune sortie.
- [ ] **2.2** i18n `roadmap` (en place, dernière clé du namespace) :

```ts
// strings.fr.ts — namespace roadmap
    legalReviewNotice:
      'Informations indicatives, en cours de relecture juridique : vérifiez auprès de l’organisme concerné.',
// strings.en.ts — namespace roadmap
    legalReviewNotice:
      'Guidance only, currently under legal review: please check with the organisation concerned.',
```

- [ ] **2.3** `RoadmapView.tsx`, juste après la ligne 58 (`<SectionHeading … />`) :

```tsx
      <p
        role="note"
        className="mb-8 max-w-[900px] rounded-2xl border border-warning/40 bg-warning-light px-4 py-3 text-sm text-text-secondary"
      >
        {t.roadmap.legalReviewNotice}
      </p>
```

- [ ] **2.4** `README.md` l.11 : remplacer la puce « Forfait payant … » par :

```md
- **Modèle v2 (partenaires)** : la pompe funèbre partenaire ouvre le dossier Seren de la famille ; l'accès famille est actif dès l'activation, sans limite de durée, avec 10 envois postaux inclus. Aucun paiement côté famille en bêta (mini-paiement coupé par `EXTRA_SENDS_ENABLED`). Accès vérifié côté serveur (`requireActiveDossier`, RPC `my_account`).
```

- [ ] **2.5** Gate R3 → attendu vert. Commit : `feat(v2-l5-plancher): notes des modèles papier, avertissement de relecture sur la roadmap, README v2`.

### Task 3 : Offre v2 et « N courriers prêts » sur l'écran de fin

**Niveau de revue :** unique.
**Files:**
- Modify: `src/components/questionnaire/CompletionScreen.tsx` (prop `lettersCount`, bloc d'offre)
- Modify: `src/pages/QuestionnairePage.tsx:223-225,325` (calcul et passage de `lettersCount` UNIQUEMENT)
- Modify: `src/i18n/strings.{fr,en}.ts` (namespace `completion` : `lettersReady` ; namespace neuf `offer` avant `// v2:ns-l5`)

- [ ] **3.1** i18n :

```ts
// strings.fr.ts — namespace completion (ajout)
    lettersReady: '{count} courrier{s} prêt{s}',
// strings.en.ts — namespace completion (ajout)
    lettersReady: '{count} letter{s} ready',

// strings.fr.ts — juste avant // v2:ns-l5
  offer: {
    unlimitedAccess: 'Accès sans limite de durée',
    includedSends: '{count} envois postaux inclus',
    providedBy: 'Proposé par {partner}',
    providedByGeneric: 'Votre accompagnement Seren',
  },
// strings.en.ts — juste avant // v2:ns-l5
  offer: {
    unlimitedAccess: 'Access with no time limit',
    includedSends: '{count} postal sends included',
    providedBy: 'Provided by {partner}',
    providedByGeneric: 'Your Seren support',
  },
```

- [ ] **3.2** `QuestionnairePage.tsx` : ajouter `const [lettersCount, setLettersCount] = useState(0)` à côté de `stepsCount` ; après `setDoneCount(…)` (l.225) : `setLettersCount(steps.filter((s) => Boolean(s.letter_template_id)).length)` ; l.325 : `<CompletionScreen stepsCount={stepsCount} doneCount={doneCount} lettersCount={lettersCount} />`.
- [ ] **3.3** `CompletionScreen.tsx` : interface `CompletionScreenProps { stepsCount: number; doneCount: number; lettersCount: number }`. Importer `useAccount` (`@/hooks/useAccount`) et `PillBadge`. Sous le paragraphe `dashboardHint` :

```tsx
        {lettersCount > 0 && (
          <p className="mx-auto mt-4 font-body text-[17px] font-medium text-text">
            {fmt(t.completion.lettersReady, { count: lettersCount, s: lettersCount > 1 ? 's' : '' })}
          </p>
        )}
        {dossier && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <PillBadge tone="neutral">
              {dossier.partner_name ? fmt(t.offer.providedBy, { partner: dossier.partner_name }) : t.offer.providedByGeneric}
            </PillBadge>
            <PillBadge tone="neutral">{t.offer.unlimitedAccess}</PillBadge>
            {dossier.included_sends > 0 && (
              <PillBadge tone="neutral">{fmt(t.offer.includedSends, { count: dossier.included_sends })}</PillBadge>
            )}
          </div>
        )}
```

avec, en tête du composant, `const { me } = useAccount()` et `const dossier = me?.account?.dossier ?? null`. Jamais de prix affiché ; aucune mention LRAR.

- [ ] **3.4** Gate R3 → vert. Vérification manuelle différée à la recette L8 (Task 41, écran « fin de questionnaire »). Commit : `feat(v2-l5-plancher): écran de fin — N courriers prêts et offre v2 (sans prix)`.

### Task 4 : Quota « sur {total} », 402 sans achat, canal fermé

**Niveau de revue :** unique.
**Files:**
- Modify: `src/components/letter/QuotaBadge.tsx:31-33,51`
- Modify: `src/components/letter/PaperSendPanel.tsx` (type `Banner` l.46-54, gestion des codes l.253-330, rendu l.425-507) — textes du 402 et envoi indisponible SEULEMENT
- Modify: `src/i18n/strings.{fr,en}.ts` (namespace `paperSend` : `quotaRemaining` réécrit, `channelClosed` et `quotaExhaustedSupport` ajoutés ; namespace `lettersPage.send.notConfigured` réécrit)

- [ ] **4.1** i18n :

```ts
// strings.fr.ts — paperSend
    quotaRemaining: '{count} envoi{s} inclus restant{s} sur {total}',
    quotaExhaustedSupport:
      'Vous avez utilisé vos envois inclus. Pour tout envoi supplémentaire, contactez le support : {email}.',
    channelClosed:
      'L’envoi par Seren n’est pas encore disponible pour ce courrier : téléchargez-le pour l’envoyer vous-même.',
// strings.fr.ts — lettersPage.send
      notConfigured:
        'L’envoi par Seren n’est pas encore disponible pour ce courrier : téléchargez-le pour l’envoyer vous-même.',
// strings.en.ts — paperSend
    quotaRemaining: '{count} included send{s} left out of {total}',
    quotaExhaustedSupport: 'You have used your included sends. For any additional send, contact support: {email}.',
    channelClosed: 'Sending through Seren is not available for this letter yet: download it to send it yourself.',
// strings.en.ts — lettersPage.send
      notConfigured: 'Sending through Seren is not available for this letter yet: download it to send it yourself.',
```

- [ ] **4.2** `QuotaBadge.tsx` : état `total` (`useState<number | null>(null)`) lu depuis `data.included_total` ; rendu `fmt(t.paperSend.quotaRemaining, { count: balance, s: balance > 1 ? 's' : '', total: total ?? balance })`.
- [ ] **4.3** `PaperSendPanel.tsx` :
  1. `import { useAccount } from '@/hooks/useAccount'` ; dans le composant : `const { me } = useAccount()`.
  2. Type `Banner` : remplacer `{ kind: 'quota_exhausted'; extraSendAvailable: boolean }` par `{ kind: 'quota_exhausted'; extraSendAvailable: boolean; supportEmail: string }` et ajouter `| { kind: 'channel_closed' }`.
  3. Branche `QUOTA_EXHAUSTED` : `setBanner({ kind: 'quota_exhausted', extraSendAvailable: Boolean(data?.extra_send_available), supportEmail: (data?.support_email as string | undefined) ?? me?.support_email ?? 'support@seren-app.fr' })`.
  4. Avant la branche `PAPER_NOT_CONFIGURED` : 
     ```tsx
      if (code === 'PAPER_DISABLED' || code === 'ATTACHMENTS_DISABLED') {
        // Kill switch serveur (avant toute création de ligne) : rien à figer, le panneau bascule en « canal fermé ».
        setBanner({ kind: 'channel_closed' })
        return
      }
     ```
  5. Rendu : `const channelClosed = me?.flags.paper_sends_enabled === false || banner?.kind === 'channel_closed'` ; `SenderProfileForm` rendu seulement si `!channelClosed` ; remplacer `{showComposeForm && (<>…</>)}` par `{channelClosed ? (<p className="text-sm text-text-secondary">{t.paperSend.channelClosed}</p>) : showComposeForm && (<>…</>)}` ; dans le fragment, après `buyError` :
     ```tsx
          {banner?.kind === 'quota_exhausted' && !banner.extraSendAvailable && (
            <p className="text-xs text-warning">{fmt(t.paperSend.quotaExhaustedSupport, { email: banner.supportEmail })}</p>
          )}
     ```
     Le bouton d'achat reste conditionné par `banner.extraSendAvailable` (faux en bêta) : aucune autre modification.
- [ ] **4.4** Gate R3 → vert. Contrôle : `grep -n "channel_closed\|quotaExhaustedSupport" src/components/letter/PaperSendPanel.tsx` → 4 lignes au moins. Commit : `feat(v2-l5-plancher): quota « sur N », 402 sans achat (contact support), canal papier fermé lisible`.

---

## Lot L2a — Serveur : gate dossier actif, `/api/me`, flags, route F1, scrub Sentry

Revue : **double** (fail-closed, routes oubliées, ordre des gardes, scrub). Branche `feature/v2-l2a`. Le sous-lot PLANCHER (Task 5) est commité en premier et doit rester applicable seul sur la base 2a (aucune dépendance aux migrations v2).

Définition commune aux tests de ce lot (à recopier en tête de chaque fichier de test qui construit un router) :

```ts
// Gate passe-plat EXPLICITE (A5 : le défaut des factories est fail-closed).
const PASS = (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()
```

### Task 5 : `FEATURE_LLM` — le client Mistral n'est instancié que sur flag (sous-lot PLANCHER)

**Niveau de revue :** double.
**Files:**
- Modify: `server/server.js:1-3,162-170,372`
- Test: `tests/flags.test.ts` (création, bloc « câblage FEATURE_LLM »)

- [ ] **5.1** Écrire le test qui échoue, `tests/flags.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// server.js démarre le serveur à l'import : son câblage se vérifie sur le source (patron assumé,
// complété par le boot check de la Task 13).
const serverSource = () => readFileSync(path.join(process.cwd(), 'server/server.js'), 'utf8')

describe('server.js — FEATURE_LLM (chantier 5 : LLM coupé par défaut)', () => {
  it('Mistral instancié UNIQUEMENT si flagOn(FEATURE_LLM) ET clé présente', () => {
    const source = serverSource()
    expect(source).toMatch(/const llmEnabled = flagOn\('FEATURE_LLM'\) && Boolean\(process\.env\.MISTRAL_API_KEY\)/)
    expect(source).toMatch(/llmEnabled \? new Mistral\(\{ apiKey: process\.env\.MISTRAL_API_KEY \}\) : null/)
    expect(source.match(/new Mistral\(/g)).toHaveLength(1)
  })
  it('le router questionnaire reçoit le client éventuellement null (jamais le constructeur brut)', () => {
    expect(serverSource()).toMatch(/mistral: mistralClient/)
  })
})
```

Et, dans `tests/questionnaire-routes.test.ts`, ajouter le test du chemin statique (rédacteur RÉEL `writeQuestionText`, sans injection de `writeText`) ; importer en tête `// @ts-expect-error — module JS serveur` puis `import { QUESTIONS_CATALOG } from '../server/lib/questions-catalog.js'` et `// @ts-expect-error — module JS serveur` puis `import { interpolateFallback } from '../server/lib/question-writer.js'` :

```ts
describe('FEATURE_LLM fermé → mistral null : textes relus du catalogue', () => {
  it('/start renvoie exactement le texte de repli interpolé du catalogue', async () => {
    const sessions = new Map<string, { id: string; user_id: string; answers: Record<string, unknown>; lang: 'fr' | 'en' }>()
    const store = {
      async createSession(_c: unknown, userId: string, lang: 'fr' | 'en' = 'fr') {
        const s = { id: 'sess-llm', user_id: userId, answers: {}, lang }
        sessions.set(s.id, s)
        return s
      },
      async loadSession(_c: unknown, id: string) { return sessions.get(id) ?? null },
      async saveAnswers() {},
      async deleteSession() {},
    }
    const app = express()
    app.use(express.json())
    app.use('/api/questionnaire', createQuestionnaireRouter({
      requireAuth: (req: express.Request & { user?: unknown; supabaseClient?: unknown }, _res: express.Response, next: express.NextFunction) => { req.user = { id: 'u' }; req.supabaseClient = {}; next() },
      requireActiveDossier: PASS,
      store,
      mistral: null,
    }))
    const res = await request(app).post('/api/questionnaire/start').send({ lang: 'fr' })
    expect(res.status).toBe(200)
    const spec = QUESTIONS_CATALOG.find((q: { id: string }) => q.id === res.body.data.question_id)
    expect(res.body.data.question).toBe(interpolateFallback(spec, undefined, 'fr').question)
  })
})
```

(`PASS` défini en tête du fichier comme indiqué en préambule de lot ; tant que la Task 9 n'est pas faite, `requireActiveDossier` est ignoré par la factory — le test passe déjà côté router et verrouille la Task 9.)

- [ ] **5.2** Vérifier l'échec : `npx vitest run tests/flags.test.ts` → attendu `2 failed` (regex absentes).
- [ ] **5.3** Implémenter dans `server/server.js` :
  - en tête : `import { flagOn } from './lib/flags.js';`
  - remplacer les lignes 162-170 par :

```js
// Rédacteur LLM du questionnaire (chantier 5) : coupé par défaut. Le client Mistral n'est
// INSTANCIÉ que si FEATURE_LLM === 'true' ET qu'une clé existe — lu une seule fois au démarrage
// (contrat §5, exception documentée). Sans lui, question-writer.js renvoie les textes relus du
// catalogue et aucune donnée ne sort vers Mistral.
const llmEnabled = flagOn('FEATURE_LLM') && Boolean(process.env.MISTRAL_API_KEY)
const mistralClient = llmEnabled ? new Mistral({ apiKey: process.env.MISTRAL_API_KEY }) : null

const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistral-small-latest'; // rédacteur du questionnaire v2

// Questionnaire v2 : flux piloté par le moteur (server/lib), IA limitée à la rédaction des textes.
app.use('/api/questionnaire', createQuestionnaireRouter({ requireAuth, mistral: mistralClient, model: MISTRAL_MODEL }));
```

  - l.372 : `console.log(\`📝 Rédacteur questionnaire v2 : ${mistralClient ? MISTRAL_MODEL : 'statique (FEATURE_LLM fermé)'}\`);`
- [ ] **5.4** Vérifier : `npx vitest run tests/flags.test.ts tests/questionnaire-routes.test.ts` → `0 failed`.
- [ ] **5.5** Commit : `git add server/server.js tests/flags.test.ts tests/questionnaire-routes.test.ts && git commit -m "feat(v2-l2a-plancher): FEATURE_LLM — client Mistral instancié seulement sur flag ('true' exact) + tests"`.

### Task 6 : `flags.js` (tests du stub) et bloc de messages L2a

**Niveau de revue :** double.
**Files:**
- Modify: `server/lib/flags.js` (seulement si le stub L0bis diffère du code ci-dessous)
- Modify: `server/lib/messages.js:57,129` (`quota_exhausted` réécrit) et ancres `// v2:messages-l2a` (fr et en)
- Test: `tests/flags.test.ts` (ajouts)

- [ ] **6.1** Ajouter à `tests/flags.test.ts` (étendre les imports : `afterEach`, `express`, `request`) :

```ts
// @ts-expect-error — module JS serveur
import { FLAG_NAMES, flagOn, publicFlags, killSwitch } from '../server/lib/flags.js'

afterEach(() => {
  for (const name of FLAG_NAMES) delete process.env[name]
})

describe('flagOn — seule la valeur exacte « true » ouvre', () => {
  it('« true » ouvre', () => {
    process.env.PAPER_SENDS_ENABLED = 'true'
    expect(flagOn('PAPER_SENDS_ENABLED')).toBe(true)
  })
  it.each(['TRUE', 'True', '1', 'yes', '', ' true', 'false'])('« %s » ferme', (value) => {
    process.env.FEATURE_LLM = value
    expect(flagOn('FEATURE_LLM')).toBe(false)
  })
  it('absent ferme', () => {
    expect(flagOn('EXTRA_SENDS_ENABLED')).toBe(false)
  })
  it('relu à chaque appel (ouvrir ou fermer sans redémarrer le module)', () => {
    expect(flagOn('EMAIL_SENDS_ENABLED')).toBe(false)
    process.env.EMAIL_SENDS_ENABLED = 'true'
    expect(flagOn('EMAIL_SENDS_ENABLED')).toBe(true)
  })
  it('liste des flags figée par le contrat', () => {
    expect(FLAG_NAMES).toEqual(['FEATURE_LLM', 'EMAIL_SENDS_ENABLED', 'EXTRA_SENDS_ENABLED', 'PAPER_SENDS_ENABLED',
      'PARTNER_ACTIVATIONS_ENABLED', 'SHOW_ACTIVATION_LINK', 'PARTNER_BILLING_PREVIEW'])
  })
})

describe('publicFlags', () => {
  it('forme exacte ; SHOW_ACTIVATION_LINK n’est JAMAIS exposé', () => {
    process.env.SHOW_ACTIVATION_LINK = 'true'
    process.env.PAPER_SENDS_ENABLED = 'true'
    process.env.PARTNER_BILLING_PREVIEW = 'true'
    expect(publicFlags()).toEqual({
      llm_enabled: false, email_sends_enabled: false, extra_sends_enabled: false,
      paper_sends_enabled: true, partner_activations_enabled: false, partner_billing_preview: true,
    })
    expect(JSON.stringify(publicFlags())).not.toMatch(/activation_link/i)
  })
})

describe('killSwitch', () => {
  function makeApp() {
    const app = express()
    app.use(express.json())
    app.post('/x', killSwitch('EMAIL_SENDS_ENABLED', { code: 'EMAIL_SENDS_DISABLED', messageKey: 'email_sends_disabled' }),
      (_req: express.Request, res: express.Response) => res.json({ success: true, reached: true }))
    return app
  }
  it('flag fermé : 503 { success:false, code, error } et handler jamais atteint', async () => {
    const res = await request(makeApp()).post('/x').send({})
    expect(res.status).toBe(503)
    expect(res.body).toEqual({ success: false, code: 'EMAIL_SENDS_DISABLED', error: expect.stringContaining('e-mail') })
    expect(res.body.reached).toBeUndefined()
  })
  it('flag ouvert : passe', async () => {
    process.env.EMAIL_SENDS_ENABLED = 'true'
    expect((await request(makeApp()).post('/x').send({})).body.reached).toBe(true)
  })
  it('lang=en (corps ou query) : message anglais', async () => {
    const res = await request(makeApp()).post('/x?lang=en').send({})
    expect(res.body.error).toMatch(/Email sending is not available yet/)
  })
})
```

- [ ] **6.2** Vérifier l'échec : `npx vitest run tests/flags.test.ts` → échec sur les messages (clé `email_sends_disabled` absente → le message vaut la clé brute).
- [ ] **6.3** Contrôler `server/lib/flags.js` ; il doit être exactement (sinon l'aligner) :

```js
// Flags d'exploitation v2 (contrat §5). Règle unique : SEULE la valeur exacte 'true' ouvre.
// Lecture à CHAQUE appel (jamais figée au démarrage) : ouvrir/fermer = changer la variable Render.
// Ce sont des interrupteurs d'exploitation, PAS des barrières de sécurité (la sécurité est en SQL).
import { msg } from './messages.js'

export const FLAG_NAMES = ['FEATURE_LLM', 'EMAIL_SENDS_ENABLED', 'EXTRA_SENDS_ENABLED', 'PAPER_SENDS_ENABLED',
  'PARTNER_ACTIVATIONS_ENABLED', 'SHOW_ACTIVATION_LINK', 'PARTNER_BILLING_PREVIEW']

export function flagOn(name) {
  return process.env[name] === 'true'
}

// Flags exposés au front par GET /api/me. SHOW_ACTIVATION_LINK n'y figure JAMAIS.
export function publicFlags() {
  return {
    llm_enabled: flagOn('FEATURE_LLM'),
    email_sends_enabled: flagOn('EMAIL_SENDS_ENABLED'),
    extra_sends_enabled: flagOn('EXTRA_SENDS_ENABLED'),
    paper_sends_enabled: flagOn('PAPER_SENDS_ENABLED'),
    partner_activations_enabled: flagOn('PARTNER_ACTIVATIONS_ENABLED'),
    partner_billing_preview: flagOn('PARTNER_BILLING_PREVIEW'),
  }
}

function reqLang(req) {
  return req.body?.lang === 'en' || req.query?.lang === 'en' ? 'en' : 'fr'
}

/** Middleware 503 si le flag n'est pas ouvert. À monter AVANT tout limiteur (un refus
 * d'exploitation ne consomme jamais le quota horaire) et avant tout parseur multipart. */
export function killSwitch(name, { code, messageKey }) {
  return function flagKillSwitch(req, res, next) {
    if (flagOn(name)) return next()
    return res.status(503).json({ success: false, code, error: msg(reqLang(req), messageKey) })
  }
}
```

- [ ] **6.4** `server/lib/messages.js` :
  - FR l.57 : `quota_exhausted: 'Vous avez utilisé les envois inclus dans votre accompagnement. Contactez le support pour tout envoi supplémentaire.',`
  - EN l.129 : `quota_exhausted: 'You have used the sends included in your support plan. Contact support for any additional send.',`
  - Juste avant `// v2:messages-l2a` dans `fr` :

```js
    // v2 — gate dossier actif et flags (lot L2a)
    account_error: 'Erreur lors de la lecture de votre compte',
    dossier_not_active: 'Votre accès Seren n’est pas encore activé. Contactez votre pompe funèbre ou le support.',
    consent_required: 'Merci de valider les conditions d’utilisation avant de continuer',
    email_sends_disabled: 'L’envoi par e-mail n’est pas encore disponible : téléchargez le courrier pour l’envoyer vous-même',
    attachments_disabled: 'Le dépôt de documents n’est pas encore disponible',
```

  - Juste avant `// v2:messages-l2a` dans `en` :

```js
    // v2 — active-case gate and flags (L2a)
    account_error: 'Error while reading your account',
    dossier_not_active: 'Your Seren access is not activated yet. Contact your funeral home or support.',
    consent_required: 'Please accept the terms of use before continuing',
    email_sends_disabled: 'Email sending is not available yet: download the letter to send it yourself',
    attachments_disabled: 'Document upload is not available yet',
```

- [ ] **6.5** Vérifier : `npx vitest run tests/flags.test.ts tests/letters-paper-routes.test.ts` → `0 failed` (si un test existant asserte l'ancien libellé `quota_exhausted`, mettre à jour l'assertion vers le nouveau libellé).
- [ ] **6.6** Commit : `feat(v2-l2a): flags ('true' exact, publicFlags sans SHOW_ACTIVATION_LINK, killSwitch) + messages du gate`.

### Task 7 : `server/lib/require-active-dossier.js` — gate fail-closed

**Niveau de revue :** double.
**Files:**
- Create: `server/lib/require-active-dossier.js`
- Test: `tests/active-dossier-gate.test.ts` (création, partie unitaire)

- [ ] **7.1** Écrire le test qui échoue, `tests/active-dossier-gate.test.ts` (partie unitaire ; la partie « toutes routes » est ajoutée en Task 10) :

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@sentry/node', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import express from 'express'
import request from 'supertest'
import * as Sentry from '@sentry/node'
// @ts-expect-error — module JS serveur
import { createRequireActiveDossier, FAIL_CLOSED_GATE } from '../server/lib/require-active-dossier.js'

type Req = express.Request & { user?: unknown; supabaseClient?: unknown; account?: unknown }

export const ACTIVE_ACCOUNT = {
  user_id: 'user-1', role: 'family', is_admin: false, partner: null,
  dossier: { id: 'd-1', status: 'active', source: 'partner', partner_name: 'Pompes Funèbres Démo',
    deceased_first_name: 'Jean', activated_at: '2026-09-16T10:00:00Z', included_sends: 10 },
  consent: { version: '2026-09-beta-1', required: false, accepted_at: '2026-09-16T10:01:00Z' },
}

const requireAuth = (req: Req, _res: express.Response, next: express.NextFunction) => {
  req.user = { id: 'user-1' }
  req.supabaseClient = { marker: 'user-client' }
  next()
}

function gateWith(result: unknown) {
  const loadAccount = vi.fn(async () => {
    if (result instanceof Error) throw result
    return result
  })
  return { gate: createRequireActiveDossier({ loadAccount }), loadAccount }
}

function mini(gate: express.RequestHandler) {
  const app = express()
  app.use(express.json())
  app.post('/x', requireAuth, gate, (req: Req, res: express.Response) => res.json({ success: true, account: req.account }))
  return app
}

afterEach(() => vi.mocked(Sentry.captureException).mockClear())

describe('createRequireActiveDossier', () => {
  it('dossier actif + consentement à jour : next() et req.account posé', async () => {
    const { gate } = gateWith({ data: ACTIVE_ACCOUNT, error: null })
    const res = await request(mini(gate)).post('/x').send({})
    expect(res.status).toBe(200)
    expect(res.body.account.dossier.id).toBe('d-1')
  })
  it('lit avec le client AU TOKEN utilisateur (req.supabaseClient)', async () => {
    const { gate, loadAccount } = gateWith({ data: ACTIVE_ACCOUNT, error: null })
    await request(mini(gate)).post('/x').send({})
    expect(loadAccount).toHaveBeenCalledWith({ marker: 'user-client' })
  })
  it('RPC en erreur ({ error }) : 500 ACCOUNT_ERROR + Sentry, jamais next()', async () => {
    const { gate } = gateWith({ data: null, error: { message: 'boom', code: 'XX000' } })
    const res = await request(mini(gate)).post('/x').send({})
    expect(res.status).toBe(500)
    expect(res.body).toMatchObject({ success: false, code: 'ACCOUNT_ERROR' })
    expect(res.body.account).toBeUndefined()
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
  })
  it('exception levée : 500 ACCOUNT_ERROR, jamais next()', async () => {
    const { gate } = gateWith(new Error('réseau'))
    const res = await request(mini(gate)).post('/x').send({})
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('ACCOUNT_ERROR')
  })
  it.each([
    ['my_account null', null],
    ['rôle partner', { ...ACTIVE_ACCOUNT, role: 'partner', dossier: null }],
    ['rôle none', { ...ACTIVE_ACCOUNT, role: 'none', dossier: null }],
    ['dossier clos', { ...ACTIVE_ACCOUNT, dossier: { ...ACTIVE_ACCOUNT.dossier, status: 'closed' } }],
    ['famille sans objet dossier', { ...ACTIVE_ACCOUNT, dossier: null }],
  ])('%s : 403 DOSSIER_NOT_ACTIVE', async (_label, data) => {
    const { gate } = gateWith({ data, error: null })
    const res = await request(mini(gate)).post('/x').send({})
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('DOSSIER_NOT_ACTIVE')
  })
  it('consentement requis : 403 CONSENT_REQUIRED', async () => {
    const { gate } = gateWith({ data: { ...ACTIVE_ACCOUNT, consent: { ...ACTIVE_ACCOUNT.consent, required: true } }, error: null })
    const res = await request(mini(gate)).post('/x').send({})
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('CONSENT_REQUIRED')
  })
  it('objet consent absent (forme inattendue) : 403 CONSENT_REQUIRED — lecture fail-closed (note N7)', async () => {
    const { consent: _omit, ...withoutConsent } = ACTIVE_ACCOUNT
    const { gate } = gateWith({ data: withoutConsent, error: null })
    expect((await request(mini(gate)).post('/x').send({})).body.code).toBe('CONSENT_REQUIRED')
  })
  it('lang=en : message anglais', async () => {
    const { gate } = gateWith({ data: null, error: null })
    const res = await request(mini(gate)).post('/x').send({ lang: 'en' })
    expect(res.body.error).toMatch(/not activated yet/)
  })
  it('FAIL_CLOSED_GATE : 500 GATE_NOT_CONFIGURED, jamais un passage', async () => {
    const res = await request(mini(FAIL_CLOSED_GATE)).post('/x').send({})
    expect(res.status).toBe(500)
    expect(res.body).toMatchObject({ success: false, code: 'GATE_NOT_CONFIGURED' })
  })
})
```

(`_omit` : si `noUnusedLocals` le signale, remplacer la déstructuration par `const withoutConsent = { ...ACTIVE_ACCOUNT } as Partial<typeof ACTIVE_ACCOUNT>; delete withoutConsent.consent`.)

- [ ] **7.2** Vérifier l'échec : `npx vitest run tests/active-dossier-gate.test.ts` → attendu échec d'import (`Cannot find module '../server/lib/require-active-dossier.js'`).
- [ ] **7.3** Créer `server/lib/require-active-dossier.js` :

```js
// Gate v2 (contrat §4.1) : toutes les routes métier famille exigent un dossier ACTIF et le
// consentement à la version courante. Remplace le gate forfait (require-purchase.js, code mort
// jusqu'au nettoyage post-bêta) dans le même slot des routers.
//
// À monter APRÈS requireAuth : lit `my_account()` avec req.supabaseClient (token utilisateur) —
// aucune identité n'est jamais passée en paramètre, la RPC la tire de auth.uid().
//
// Fail-closed : une erreur de lecture n'ouvre JAMAIS la route (500 franc), une forme inattendue
// est refusée (403). Mieux vaut une famille qui réessaie qu'un compte non activé qui envoie.
import * as Sentry from '@sentry/node'
import { msg } from './messages.js'

function reqLang(req) {
  return req.body?.lang === 'en' || req.query?.lang === 'en' ? 'en' : 'fr'
}

/** Défaut des factories (arbitrage A5) : un router construit sans gate refuse tout. */
export const FAIL_CLOSED_GATE = (req, res) => {
  Sentry.captureException(new Error('gate_not_configured'))
  return res.status(500).json({ success: false, code: 'GATE_NOT_CONFIGURED', error: msg(reqLang(req), 'send_error') })
}

export function createRequireActiveDossier({ loadAccount = (client) => client.rpc('my_account') } = {}) {
  return async function requireActiveDossier(req, res, next) {
    const lang = reqLang(req)
    let account
    try {
      const result = await loadAccount(req.supabaseClient)
      if (result?.error) {
        // Jamais le message Postgres brut vers le client ; code seul dans les journaux.
        throw new Error(`my_account_failed:${result.error.code ?? 'unknown'}`)
      }
      account = result?.data ?? null
    } catch (error) {
      console.error('❌ requireActiveDossier :', error?.message ?? 'erreur inconnue')
      Sentry.captureException(error)
      return res.status(500).json({ success: false, code: 'ACCOUNT_ERROR', error: msg(lang, 'account_error') })
    }

    if (!account || account.role !== 'family' || account.dossier?.status !== 'active') {
      return res.status(403).json({ success: false, code: 'DOSSIER_NOT_ACTIVE', error: msg(lang, 'dossier_not_active') })
    }
    // Note N7 : `!== false` (et non `=== true`) — un objet consent absent ou malformé est refusé.
    if (account.consent?.required !== false) {
      return res.status(403).json({ success: false, code: 'CONSENT_REQUIRED', error: msg(lang, 'consent_required') })
    }
    req.account = account
    return next()
  }
}
```

- [ ] **7.4** Vérifier : `npx vitest run tests/active-dossier-gate.test.ts` → `0 failed`.
- [ ] **7.5** Commit : `feat(v2-l2a): requireActiveDossier fail-closed (500 sur erreur, 403 DOSSIER_NOT_ACTIVE / CONSENT_REQUIRED) + FAIL_CLOSED_GATE`.

### Task 8 : Router `letters` — gate, kill switch par canal, `readQuota`, 402 sans achat

**Niveau de revue :** double.
**Files:**
- Modify: `server/routes/letters.js:14-15` (imports), `:70-72` (suppression de `NO_GATE`), `:144-162` (signature), `:175-192` (kill switch + route), `:604-615` (402), `:760-786` (`/quota` via `readQuota`), `:799`, `:822`
- Test: `tests/letters-routes.test.ts:98-110`, `tests/letters-webhook.test.ts:71-86`, `tests/letters-paper-routes.test.ts:17-22,355-400,432-449,911-945`, `tests/purchase-gate.test.ts` (réécriture du montage)

- [ ] **8.1** Tests d'abord :
  1. `tests/letters-routes.test.ts` : dans `makeApp`, `createLettersRouter({ requireAuth, requireActiveDossier: PASS, store, emailSender: sender, channels: LETTER_CHANNELS })` ; `beforeEach(() => { process.env.EMAIL_SENDS_ENABLED = 'true' })` et `afterEach(() => { delete process.env.EMAIL_SENDS_ENABLED })` ; ajouter :

```ts
describe('kill switch du canal e-mail (EMAIL_SENDS_ENABLED)', () => {
  it('flag absent : 503 EMAIL_SENDS_DISABLED, aucun envoi créé, sender jamais appelé', async () => {
    delete process.env.EMAIL_SENDS_ENABLED
    const { app, store, sender } = makeApp()
    const res = await request(app).post('/api/letters/send').send(VALID_PAYLOAD)
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('EMAIL_SENDS_DISABLED')
    expect(store.rows).toHaveLength(0)
    expect(sender.calls).toHaveLength(0)
  })
  it('un 503 de coupure ne consomme pas le quota horaire (25 refus, jamais 429)', async () => {
    delete process.env.EMAIL_SENDS_ENABLED
    const { app } = makeApp()
    for (let i = 0; i < 25; i++) expect((await request(app).post('/api/letters/send').send(VALID_PAYLOAD)).status).toBe(503)
  })
})
```

  (adapter les noms `store.rows`/`sender.calls` aux fakes existants du fichier.)
  2. `tests/letters-webhook.test.ts` : ajouter `requireActiveDossier: PASS` à la construction.
  3. `tests/letters-paper-routes.test.ts` :
     - supprimer les imports `createRequirePurchase` et `makePurchasesStore` ; ligne 22 du commentaire : `//   1. requireAuth + requireActiveDossier (gate dossier)      → 403/500` ;
     - `makeApp` : remplacer les options `purchases` et `paymentsEnabled` par `gate?: express.RequestHandler` ; construction `requireActiveDossier: opts.gate ?? PASS` et `extraSendAvailable: opts.extraSendAvailable ?? true` (remplace le spread conditionnel l.398) ;
     - remplacer le `describe` « garde 1 : gate du forfait » (l.432-448) par :

```ts
describe('POST /api/letters/send (papier) — garde 1 : gate dossier actif', () => {
  function gate(account: unknown) {
    // @ts-expect-error — module JS serveur (import dynamique pour garder les imports du fichier inchangés)
    return import('../server/lib/require-active-dossier.js').then(({ createRequireActiveDossier }) =>
      createRequireActiveDossier({ loadAccount: async () => (account instanceof Error ? Promise.reject(account) : { data: account, error: null }) }))
  }
  it('compte sans dossier actif : 403 DOSSIER_NOT_ACTIVE, AUCUN envoi créé, aucun appel provider', async () => {
    process.env.PAPER_SENDS_ENABLED = 'true'
    const { app, store, sender } = makeApp({ backend: readyBackend(), gate: await gate({ role: 'none', dossier: null }) })
    const res = await request(app).post('/api/letters/send').send(basePayload())
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('DOSSIER_NOT_ACTIVE')
    expect(store.rows).toHaveLength(0)
    expect(sender.calls).toHaveLength(0)
  })
  it('lecture du compte en échec : 500 ACCOUNT_ERROR, jamais un passage', async () => {
    process.env.PAPER_SENDS_ENABLED = 'true'
    const { app, store } = makeApp({ backend: readyBackend(), gate: await gate(new Error('base indisponible')) })
    expect((await request(app).post('/api/letters/send').send(basePayload())).status).toBe(500)
    expect(store.rows).toHaveLength(0)
  })
  it('le gate passe AVANT le kill switch (flag fermé, compte refusé → 403, pas 503)', async () => {
    delete process.env.PAPER_SENDS_ENABLED
    const { app } = makeApp({ backend: readyBackend(), gate: await gate({ role: 'none', dossier: null }) })
    expect((await request(app).post('/api/letters/send').send(basePayload())).status).toBe(403)
  })
  it('un refus du gate ne consomme pas le quota horaire (25 refus 403, jamais 429)', async () => {
    process.env.PAPER_SENDS_ENABLED = 'true'
    const { app } = makeApp({ backend: readyBackend(), gate: await gate({ role: 'none', dossier: null }) })
    for (let i = 0; i < 25; i++) expect((await request(app).post('/api/letters/send').send(basePayload())).status).toBe(403)
  })
})
```

       (si le fichier gère déjà `PAPER_SENDS_ENABLED` par `beforeEach`/`afterEach`, réutiliser ce mécanisme au lieu des affectations directes ; si l'import dynamique gêne tsc, importer `createRequireActiveDossier` statiquement en tête avec `// @ts-expect-error — module JS serveur`) ;
     - test « quota épuisé : 402 + extra_send_available » (l.912) : ajouter `expect(res.body.support_email).toBe('support@seren-app.fr')` ;
     - ajouter : `it('402 : extraSendAvailable fonction évaluée à chaque requête', …)` avec `makeApp({ backend: readyBackend(), store, extraSendAvailable: (() => false) as unknown as boolean })` → `extra_send_available === false` (type de l'option élargi à `boolean | (() => boolean)`).
  4. `tests/purchase-gate.test.ts` (code mort gardé vert) : remplacer `makeLettersStore`/`makeApp` par un montage direct du middleware, sans le router `letters` :

```ts
// @ts-expect-error — module JS serveur
import { createUserRateLimiter } from '../server/lib/rate-limit.js'

// Code mort v2 (contrat §1.4) : createRequirePurchase n'est plus monté par server.js. Il est
// conservé, et vérifié ISOLÉMENT, jusqu'au nettoyage post-bêta.
function makeApp({ paymentsEnabled, purchases }: { paymentsEnabled: boolean; purchases: ReturnType<typeof makePurchasesStore> }) {
  const rows: unknown[] = []
  const requireAuth = (req: express.Request & { user?: unknown; supabaseClient?: unknown }, _res: express.Response, next: express.NextFunction) => {
    req.user = { id: 'user-1' }
    req.supabaseClient = {}
    next()
  }
  const app = express()
  app.use(express.json())
  const limiter = createUserRateLimiter({ max: 20, windowMs: 60 * 60 * 1000 })
  app.post('/api/letters/send', requireAuth, createRequirePurchase({ store: purchases, paymentsEnabled }), limiter,
    (req: express.Request, res: express.Response) => { rows.push(req.body); res.json({ success: true }) })
  app.get('/api/letters', requireAuth, (_req: express.Request, res: express.Response) => res.json({ success: true, sends: rows }))
  return { app, lettersStore: { rows } }
}
```

     supprimer les imports `createLettersRouter` et `LETTER_CHANNELS` devenus inutiles ; les 10 tests existants restent inchangés.
- [ ] **8.2** Vérifier l'échec : `npx vitest run tests/letters-routes.test.ts tests/letters-paper-routes.test.ts` → échecs attendus (503 e-mail absent, gate dossier ignoré, `support_email` absent).
- [ ] **8.3** Implémenter dans `server/routes/letters.js` :
  - imports : `import { flagOn } from '../lib/flags.js'` et `import { FAIL_CLOSED_GATE } from '../lib/require-active-dossier.js'` ;
  - constantes : ajouter `const EMAIL_CHANNEL = 'email'` sous `PAPER_CHANNEL` et `const DEFAULT_SUPPORT_EMAIL = 'support@seren-app.fr'` ;
  - supprimer `NO_GATE` (l.70-72) ;
  - ajouter, avant `createLettersRouter` :

```js
/** Solde d'envois de l'utilisateur, lu AU TOKEN (policies SELECT owner de purchases et
 * send_debits). Miroir de send_balance() : Σ included_sends des achats PAYÉS − débits
 * facturables, plancher 0. Partagé avec GET /api/me (note N13) : une seule règle de calcul. */
export async function readQuota(client, userId) {
  const [purchases, debits] = await Promise.all([
    client.from('purchases').select('included_sends').eq('user_id', userId).eq('status', 'paid'),
    client
      .from('send_debits')
      .select('send_id, source, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  ])
  if (purchases.error) throw new Error(`Lecture des achats impossible : ${purchases.error.code ?? 'inconnue'}`)
  if (debits.error) throw new Error(`Lecture des débits impossible : ${debits.error.code ?? 'inconnue'}`)
  const includedTotal = (purchases.data ?? []).reduce((total, row) => total + (row.included_sends ?? 0), 0)
  const debitRows = debits.data ?? []
  const used = debitRows.filter((row) => BILLABLE_DEBIT_SOURCES.has(row.source)).length
  return { balance: Math.max(0, includedTotal - used), included_total: includedTotal, debits: debitRows }
}
```

  - signature :

```js
export function createLettersRouter({
  requireAuth,
  store,
  emailSender,
  channels,
  publicClient,
  // Gate v2 (contrat §4.2) : défaut FAIL-CLOSED (A5) — les tests injectent un passe-plat explicite.
  requireActiveDossier = FAIL_CLOSED_GATE,
  paperSender = null,
  fetchImpl = fetch,
  // Fonction évaluée à CHAQUE 402 en production (flag relu) ; booléen accepté pour les tests (N11).
  extraSendAvailable = () => false,
}) {
  const router = Router()
  const isExtraSendAvailable = () =>
    Boolean(typeof extraSendAvailable === 'function' ? extraSendAvailable() : extraSendAvailable)
```

  - remplacer `paperKillSwitch` (l.180-189) et la ligne de route (l.192) par :

```js
  // Kill switch PAR CANAL (contrat §4.2), en middleware AVANT le limiteur : une coupure
  // d'exploitation ne consomme jamais le quota horaire. Relu à chaque requête. Un canal inconnu
  // ou un modèle inconnu passe : il est tranché (404/400) dans le handler.
  const channelKillSwitch = (req, res, next) => {
    const channel = channels[req.body?.template_id]
    if (channel === PAPER_CHANNEL && !flagOn('PAPER_SENDS_ENABLED')) {
      return res.status(503).json({ success: false, error: msg(bodyLang(req), 'paper_disabled'), code: 'PAPER_DISABLED' })
    }
    if (channel === EMAIL_CHANNEL && !flagOn('EMAIL_SENDS_ENABLED')) {
      return res.status(503).json({ success: false, error: msg(bodyLang(req), 'email_sends_disabled'), code: 'EMAIL_SENDS_DISABLED' })
    }
    return next()
  }

  // Ordre contractuel : requireAuth → requireActiveDossier (ancien slot requirePurchase) →
  // channelKillSwitch → sendLimiter → handler. Un refus 403/500/503 ne consomme pas le quota horaire.
  router.post('/send', requireAuth, requireActiveDossier, channelKillSwitch, sendLimiter, async (req, res) => {
```

  - dans le commentaire de la branche papier (l.328-329 et l.347) : remplacer « requirePurchase » par « requireActiveDossier » et « paperKillSwitch » par « channelKillSwitch » ;
  - 402 (l.604-615) : `extra_send_available: isExtraSendAvailable(),` et ajouter `support_email: process.env.SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL,` ;
  - `/quota` : `router.get('/quota', requireAuth, requireActiveDossier, async (req, res) => {` et corps `const quota = await readQuota(req.supabaseClient, req.user.id); return res.json({ success: true, ...quota })` (catch inchangé) ;
  - `/organisations` : `router.get('/organisations', requireAuth, requireActiveDossier, async (req, res) => {` ;
  - liste : `router.get('/', requireAuth, requireActiveDossier, async (req, res) => {` ;
  - `/webhook` : inchangé (aucun gate).
- [ ] **8.4** Vérifier : `npx vitest run tests/letters-routes.test.ts tests/letters-webhook.test.ts tests/letters-paper-routes.test.ts tests/purchase-gate.test.ts` → `0 failed`. Contrôle : `grep -n "requirePurchase\|NO_GATE\|paperKillSwitch" server/routes/letters.js` → aucune sortie de code (commentaires historiques exclus).
- [ ] **8.5** Commit : `feat(v2-l2a): letters — gate dossier dans le slot du forfait, kill switch par canal (papier/e-mail), readQuota partagé, 402 sans achat + support_email`.

### Task 9 : Routers `questionnaire` et `attachments` gatés, dépôt de PJ sous kill switch

**Niveau de revue :** double.
**Files:**
- Modify: `server/routes/questionnaire.js:90-96,120,138,171,197,214`
- Modify: `server/routes/attachments.js:19-20,88,102,184,200`
- Test: `tests/questionnaire-routes.test.ts:48,161,300`, `tests/attachments-routes.test.ts:182` + nouveaux tests

- [ ] **9.1** Tests d'abord :
  - `questionnaire-routes.test.ts` : ajouter `requireActiveDossier: PASS` aux 3 constructions (l.48, 161, 300) ;
  - `attachments-routes.test.ts` : construction `createAttachmentsRouter({ requireAuth, requireActiveDossier: PASS })` ; `beforeEach(() => { process.env.PAPER_SENDS_ENABLED = 'true' })`, `afterEach(() => { delete process.env.PAPER_SENDS_ENABLED })` ; ajouter :

```ts
describe('kill switch du coffre (PAPER_SENDS_ENABLED)', () => {
  it('flag absent : POST 503 ATTACHMENTS_DISABLED, rien stocké (avant multer : aucun fichier bufferisé)', async () => {
    delete process.env.PAPER_SENDS_ENABLED
    const { app, backend } = makeApp()
    const res = await request(app)
      .post('/api/attachments')
      .set('Authorization', 'Bearer user-1')
      .field('kind', 'acte_deces')
      .attach('file', PDF_BYTES, 'acte.pdf')
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('ATTACHMENTS_DISABLED')
    expect(backend.attachments).toHaveLength(0)
    expect(backend.objects.size).toBe(0)
  })
  it('flag absent : lister et supprimer restent possibles (GET 200)', async () => {
    delete process.env.PAPER_SENDS_ENABLED
    const { app } = makeApp()
    expect((await request(app).get('/api/attachments').set('Authorization', 'Bearer user-1')).status).toBe(200)
  })
})
```

  (adapter `backend.attachments`/`backend.objects` aux noms réels du fake du fichier.)
- [ ] **9.2** Vérifier l'échec : `npx vitest run tests/attachments-routes.test.ts` → le test `503` échoue (201 renvoyé).
- [ ] **9.3** Implémenter :
  - `questionnaire.js` : `import { FAIL_CLOSED_GATE } from '../lib/require-active-dossier.js'` ; signature `createQuestionnaireRouter({ requireAuth, requireActiveDossier = FAIL_CLOSED_GATE, store = supabaseStore, mistral = null, model = 'mistral-small-latest', writeText = writeQuestionText })` ; routes :
    `router.post('/start', requireAuth, requireActiveDossier, startLimiter, …)`, `router.post('/answer', requireAuth, requireActiveDossier, …)`, `router.post('/reask', requireAuth, requireActiveDossier, …)`, `router.post('/resume', requireAuth, requireActiveDossier, resumeLimiter, …)`, `router.post('/complete', requireAuth, requireActiveDossier, …)`.
  - `attachments.js` : `import { FAIL_CLOSED_GATE } from '../lib/require-active-dossier.js'` et `import { killSwitch } from '../lib/flags.js'` ; signature `createAttachmentsRouter({ requireAuth, requireActiveDossier = FAIL_CLOSED_GATE })` ; dans la factory :

```js
  // Coffre ouvert seulement avec le canal papier (contrat §5, D3) : sans antivirus ni rétention
  // (chantier 3), aucun dépôt tant que PAPER_SENDS_ENABLED n'est pas 'true'. Monté AVANT le
  // limiteur et AVANT multer : un refus ne bufferise aucun fichier et ne consomme aucun quota.
  const attachmentsKillSwitch = killSwitch('PAPER_SENDS_ENABLED', { code: 'ATTACHMENTS_DISABLED', messageKey: 'attachments_disabled' })
```

    routes : `router.post('/', requireAuth, requireActiveDossier, attachmentsKillSwitch, uploadLimiter, handleUpload, …)`, `router.get('/', requireAuth, requireActiveDossier, …)`, `router.delete('/:id', requireAuth, requireActiveDossier, …)`.
- [ ] **9.4** Vérifier : `npx vitest run tests/questionnaire-routes.test.ts tests/attachments-routes.test.ts` → `0 failed`.
- [ ] **9.5** Commit : `feat(v2-l2a): questionnaire et coffre gatés (dossier actif), dépôt de PJ fermé sans PAPER_SENDS_ENABLED`.

### Task 10 : Router `payments` — checkout forfait toujours 503, mini-paiement sous `EXTRA_SENDS_ENABLED` + test « toutes routes »

**Niveau de revue :** double.
**Files:**
- Modify: `server/routes/payments.js:10-13,26-63,64-154,193-196`
- Test: `tests/payments-routes.test.ts` (réécriture des `describe` `/checkout` et `/checkout-extra-send`, `makeApp`), `tests/payments-webhook.test.ts:37-50`, `tests/active-dossier-gate.test.ts` (partie « toutes routes »)

- [ ] **10.1** Tests d'abord.
  1. `payments-routes.test.ts` — `makeApp(opts: { store?; stripe?; extraPriceId?; getPrice?; getExtraPrice?; gate?: express.RequestHandler })` construit `createPaymentsRouter({ requireAuth, requireActiveDossier: opts.gate ?? PASS, store, stripe, publicClient: {}, getPrice: opts.getPrice ?? (async () => ({ amount_total: 14900, currency: 'eur' })), getExtraPrice: opts.getExtraPrice ?? (async () => ({ amount_total: 300, currency: 'eur' })), extraPriceId: 'extraPriceId' in opts ? opts.extraPriceId : 'price_extra_456', appUrl: 'https://app.seren-app.fr' })` ; `afterEach` supprime aussi `process.env.EXTRA_SENDS_ENABLED`. Remplacer les deux `describe` par :

```ts
describe('POST /api/payments/checkout — forfait famille abandonné (v2)', () => {
  it('toujours 503 PAYMENTS_DISABLED, même Stripe et tarif configurés, AUCUNE session', async () => {
    process.env.EXTRA_SENDS_ENABLED = 'true'
    const { app, stripe, store } = makeApp()
    const res = await request(app).post('/api/payments/checkout').send({})
    expect(res.status).toBe(503)
    expect(res.body).toMatchObject({ success: false, code: 'PAYMENTS_DISABLED' })
    expect(stripe.created).toHaveLength(0)
    expect(store.rows).toHaveLength(0)
  })
})

describe('POST /api/payments/checkout-extra-send — mini-paiement sous EXTRA_SENDS_ENABLED', () => {
  it('flag absent (défaut bêta) : 503 PAYMENTS_DISABLED, aucune session', async () => {
    const { app, stripe } = makeApp()
    const res = await request(app).post('/api/payments/checkout-extra-send').send({})
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('PAYMENTS_DISABLED')
    expect(stripe.created).toHaveLength(0)
  })
  it('flag « TRUE » (casse) : 503 — seule la valeur exacte ouvre', async () => {
    process.env.EXTRA_SENDS_ENABLED = 'TRUE'
    expect((await request(makeApp().app).post('/api/payments/checkout-extra-send').send({})).status).toBe(503)
  })
  it('flag ouvert mais tarif absent : 503', async () => {
    process.env.EXTRA_SENDS_ENABLED = 'true'
    expect((await request(makeApp({ extraPriceId: undefined }).app).post('/api/payments/checkout-extra-send').send({})).status).toBe(503)
  })
  it('flag ouvert mais SDK absent : 503', async () => {
    process.env.EXTRA_SENDS_ENABLED = 'true'
    expect((await request(makeApp({ stripe: null }).app).post('/api/payments/checkout-extra-send').send({})).status).toBe(503)
  })
  it('flag ouvert, dossier actif : session envoi_sup (1 envoi) SANS exiger de forfait', async () => {
    process.env.EXTRA_SENDS_ENABLED = 'true'
    const { app, stripe, store } = makeApp()
    const res = await request(app).post('/api/payments/checkout-extra-send').send({})
    expect(res.status).toBe(200)
    expect(stripe.created[0]).toMatchObject({ metadata: { kind: 'envoi_sup', included_sends: '1' } })
    expect(store.rows[0]).toMatchObject({ kind: 'envoi_sup', included_sends: 1 })
  })
  it('gate refusé : 403 DOSSIER_NOT_ACTIVE, aucune session', async () => {
    process.env.EXTRA_SENDS_ENABLED = 'true'
    const refuse = (_req: express.Request, res: express.Response) => res.status(403).json({ success: false, code: 'DOSSIER_NOT_ACTIVE' })
    const { app, stripe } = makeApp({ gate: refuse })
    expect((await request(app).post('/api/payments/checkout-extra-send').send({})).status).toBe(403)
    expect(stripe.created).toHaveLength(0)
  })
  it('achetable plusieurs fois', async () => {
    process.env.EXTRA_SENDS_ENABLED = 'true'
    const { app, stripe } = makeApp()
    await request(app).post('/api/payments/checkout-extra-send').send({})
    await request(app).post('/api/payments/checkout-extra-send').send({})
    expect(stripe.created).toHaveLength(2)
  })
  it('échec Stripe : 502', async () => {
    process.env.EXTRA_SENDS_ENABLED = 'true'
    expect((await request(makeApp({ stripe: makeStripe('fail') }).app).post('/api/payments/checkout-extra-send').send({})).status).toBe(502)
  })
  it('le limiteur coupe au 11e appel de l’heure', async () => {
    process.env.EXTRA_SENDS_ENABLED = 'true'
    const { app } = makeApp()
    for (let i = 0; i < 10; i++) await request(app).post('/api/payments/checkout-extra-send').send({})
    expect((await request(app).post('/api/payments/checkout-extra-send').send({})).status).toBe(429)
  })
})
```

  (adapter `store.rows` au nom réel exposé par `tests/helpers/purchases-fake.ts`.) Dans `describe('GET /api/payments/status')`, renommer « vente fermée : payments_enabled false » en « payments_enabled toujours false (forfait abandonné) » et l'exécuter avec `makeApp()` sans option ; les autres tests `/status` restent (le prix vient de `getPrice` injecté).
  2. `payments-webhook.test.ts` : construction `createPaymentsRouter({ requireAuth: …, requireActiveDossier: PASS, store, stripe: makeStripe(), publicClient: {}, appUrl: 'https://app.seren-app.fr' })` (retirer `getPrice`, `paymentsEnabled`, `priceId`, `includedSends`).
  3. `active-dossier-gate.test.ts` — ajouter la partie « toutes routes » (imports en tête : `createQuestionnaireRouter`, `createLettersRouter`, `createAttachmentsRouter`, `createPaymentsRouter`, `LETTER_CHANNELS`, chacun avec `// @ts-expect-error — module JS serveur`) :

```ts
const never = (name: string) => () => { throw new Error(`${name} ne doit jamais être atteint`) }

function makeAllRouters(gate: express.RequestHandler) {
  const app = express()
  app.use(express.json())
  app.use('/api/questionnaire', createQuestionnaireRouter({
    requireAuth, requireActiveDossier: gate,
    store: { createSession: never('createSession'), loadSession: never('loadSession'), saveAnswers: never('saveAnswers'), deleteSession: never('deleteSession') },
    writeText: never('writeText'),
  }))
  app.use('/api/letters', createLettersRouter({
    requireAuth, requireActiveDossier: gate, store: { listSends: never('listSends') },
    emailSender: { send: never('emailSender.send') }, channels: LETTER_CHANNELS, extraSendAvailable: false,
  }))
  app.use('/api/attachments', createAttachmentsRouter({ requireAuth, requireActiveDossier: gate }))
  app.use('/api/payments', createPaymentsRouter({
    requireAuth, requireActiveDossier: gate, store: {}, stripe: null, publicClient: {}, appUrl: 'https://app.seren-app.fr',
  }))
  return app
}

const GATED_ROUTES: Array<['post' | 'get' | 'delete', string, Record<string, unknown>]> = [
  ['post', '/api/questionnaire/start', { lang: 'fr' }],
  ['post', '/api/questionnaire/answer', { session_id: 's', question_id: 'relation', value: 'parent' }],
  ['post', '/api/questionnaire/reask', { session_id: 's', question_id: 'relation' }],
  ['post', '/api/questionnaire/resume', { session_id: 's' }],
  ['post', '/api/questionnaire/complete', { session_id: 's' }],
  ['post', '/api/letters/send', { template_id: 'bailleur-notification' }],
  ['get', '/api/letters/quota', {}],
  ['get', '/api/letters/organisations?network=caf', {}],
  ['get', '/api/letters', {}],
  ['post', '/api/attachments', {}],
  ['get', '/api/attachments', {}],
  ['delete', '/api/attachments/11111111-1111-4111-8111-111111111111', {}],
  ['post', '/api/payments/checkout-extra-send', {}],
]

describe('fail-closed sur CHAQUE route gatée (contrat §4.2)', () => {
  it.each(GATED_ROUTES)('%s %s : compte sans dossier → 403 DOSSIER_NOT_ACTIVE', async (method, url, body) => {
    const { gate } = gateWith({ data: { ...ACTIVE_ACCOUNT, role: 'none', dossier: null }, error: null })
    const res = await request(makeAllRouters(gate))[method](url).send(body)
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('DOSSIER_NOT_ACTIVE')
  })
  it.each(GATED_ROUTES)('%s %s : lecture du compte en échec → 500 ACCOUNT_ERROR', async (method, url, body) => {
    const { gate } = gateWith(new Error('panne'))
    const res = await request(makeAllRouters(gate))[method](url).send(body)
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('ACCOUNT_ERROR')
  })
  it.each(GATED_ROUTES)('%s %s : consentement requis → 403 CONSENT_REQUIRED', async (method, url, body) => {
    const { gate } = gateWith({ data: { ...ACTIVE_ACCOUNT, consent: { ...ACTIVE_ACCOUNT.consent, required: true } }, error: null })
    const res = await request(makeAllRouters(gate))[method](url).send(body)
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('CONSENT_REQUIRED')
  })
  it.each([
    ['questionnaire', () => createQuestionnaireRouter({ requireAuth, store: {}, writeText: never('writeText') }), 'post', '/start'],
    ['letters', () => createLettersRouter({ requireAuth, store: {}, emailSender: {}, channels: LETTER_CHANNELS }), 'get', '/quota'],
    ['attachments', () => createAttachmentsRouter({ requireAuth }), 'get', '/'],
    ['payments', () => createPaymentsRouter({ requireAuth, store: {}, stripe: null, publicClient: {}, appUrl: 'x' }), 'post', '/checkout-extra-send'],
  ] as const)('factory %s construite SANS gate : 500 GATE_NOT_CONFIGURED (A5)', async (_name, build, method, url) => {
    const app = express()
    app.use(express.json())
    app.use('/r', build())
    const res = await request(app)[method](`/r${url}`).send({})
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('GATE_NOT_CONFIGURED')
  })
  it('les webhooks ne sont jamais gatés : my_account jamais lu', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET
    delete process.env.STRIPE_WEBHOOK_SECRET
    const { gate, loadAccount } = gateWith(new Error('ne doit pas être lu'))
    const app = makeAllRouters(gate)
    const letters = await request(app).post('/api/letters/webhook').set('Content-Type', 'application/json').send('{}')
    const payments = await request(app).post('/api/payments/webhook').set('Content-Type', 'application/json').send('{}')
    expect(letters.body.code).not.toBe('ACCOUNT_ERROR')
    expect(payments.body.code).not.toBe('ACCOUNT_ERROR')
    expect(loadAccount).not.toHaveBeenCalled()
  })
  it('un refus du gate ne consomme pas le quota de /start (12 refus, puis ouverture : jamais 429)', async () => {
    let current: unknown = { ...ACTIVE_ACCOUNT, role: 'none', dossier: null }
    const gate = createRequireActiveDossier({ loadAccount: async () => ({ data: current, error: null }) })
    const app = express()
    app.use(express.json())
    app.use('/api/questionnaire', createQuestionnaireRouter({
      requireAuth, requireActiveDossier: gate,
      store: {
        async createSession(_c: unknown, userId: string) { return { id: 'sess-1', user_id: userId, answers: {}, lang: 'fr' } },
        async loadSession() { return null }, async saveAnswers() {}, async deleteSession() {},
      },
      writeText: async () => ({ question: 'Question de repli suffisamment longue ?', source: 'fallback' as const }),
    }))
    for (let i = 0; i < 12; i++) expect((await request(app).post('/api/questionnaire/start').send({ lang: 'fr' })).status).toBe(403)
    current = ACTIVE_ACCOUNT
    expect((await request(app).post('/api/questionnaire/start').send({ lang: 'fr' })).status).toBe(200)
  })
})
```

- [ ] **10.2** Vérifier l'échec : `npx vitest run tests/payments-routes.test.ts tests/active-dossier-gate.test.ts` → échecs attendus (checkout 200/503 sans code, factories sans gate qui laissent passer, routes non gatées).
- [ ] **10.3** Implémenter dans `server/routes/payments.js` :
  - imports : `import { flagOn } from '../lib/flags.js'` et `import { FAIL_CLOSED_GATE } from '../lib/require-active-dossier.js'` ;
  - signature :

```js
export function createPaymentsRouter({
  requireAuth,
  // Gate v2 : seul checkout-extra-send est gaté (contrat §4.2) ; défaut fail-closed (A5).
  requireActiveDossier = FAIL_CLOSED_GATE,
  store,
  stripe,
  publicClient,
  // Lecteur de prix optionnel (plus passé par server.js en v2, note N12) : absent → price null.
  getPrice,
  extraPriceId,
  getExtraPrice,
  appUrl,
}) {
```

  - remplacer `saleOpen`/`extraSaleOpen` (l.56-62) par :

```js
  // Mini-paiement « envoi supplémentaire » : ouvert seulement si EXTRA_SENDS_ENABLED === 'true'
  // (relu à chaque requête) ET SDK ET tarif. Absent en préprod ET en prod pendant la bêta.
  const extraSaleOpen = () => Boolean(flagOn('EXTRA_SENDS_ENABLED') && stripe && extraPriceId)
  const paymentsDisabled = (req, res) =>
    res.status(503).json({ success: false, code: 'PAYMENTS_DISABLED', error: msg(reqLang(req), 'payments_disabled') })
```

  - remplacer toute la route `/checkout` (l.64-105) par :

```js
  // Forfait famille ABANDONNÉ (v2 : la PF paie Seren, la famille ne paie rien). Route gardée pour
  // qu'un client ancien reçoive une réponse franche ; code Stripe du forfait retiré.
  router.post('/checkout', requireAuth, paymentsDisabled)
```

  - `/checkout-extra-send` : `router.post('/checkout-extra-send', requireAuth, requireActiveDossier, checkoutLimiter, async (req, res) => {` ; premier bloc `if (!extraSaleOpen()) return paymentsDisabled(req, res)` ; SUPPRIMER le bloc `getPaidPurchase` / 403 `FORFAIT_REQUIRED` (l.122-129) ; le reste (session Stripe, `createPending`, 502) inchangé ; mettre à jour le commentaire d'en-tête de la route (le gate dossier remplace l'exigence de forfait) ;
  - `/status` : `payments_enabled: false,` (commentaire : forfait abandonné) ; supprimer la fonction `saleOpen`.
- [ ] **10.4** Vérifier : `npx vitest run tests/payments-routes.test.ts tests/payments-webhook.test.ts tests/active-dossier-gate.test.ts` → `0 failed`. Contrôle : `grep -n "FORFAIT_REQUIRED\|paymentsEnabled\|priceId\b\|includedSends" server/routes/payments.js` → aucune ligne de code.
- [ ] **10.5** Commit : `feat(v2-l2a): payments — checkout forfait toujours 503, mini-paiement sous EXTRA_SENDS_ENABLED et gate dossier ; test fail-closed de toutes les routes`.

### Task 11 : `GET /api/me`

**Niveau de revue :** double.
**Files:**
- Create: `server/routes/me.js`
- Test: `tests/me-route.test.ts`

- [ ] **11.1** Écrire le test qui échoue, `tests/me-route.test.ts` :

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@sentry/node', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import express from 'express'
import request from 'supertest'
import * as Sentry from '@sentry/node'
// @ts-expect-error — module JS serveur
import { createMeRouter } from '../server/routes/me.js'

const FAMILY = {
  user_id: 'user-1', role: 'family', is_admin: false, partner: null,
  dossier: { id: 'd-1', status: 'active', source: 'partner', partner_name: 'Pompes Funèbres Démo',
    deceased_first_name: 'Jean', activated_at: '2026-09-16T10:00:00Z', included_sends: 10 },
  consent: { version: '2026-09-beta-1', required: true, accepted_at: null },
}
const PARTNER = { ...FAMILY, role: 'partner', dossier: null,
  partner: { id: 'p-1', name: 'Pompes Funèbres Démo', status: 'active', user_role: 'manager' },
  consent: { version: '2026-09-beta-1', required: false, accepted_at: null } }

type Rows = Record<string, unknown>[]
function makeClient(opts: { account: unknown; accountError?: unknown; purchases?: Rows; debits?: Rows; failTable?: string }) {
  const from = vi.fn((table: string) => {
    const rows = table === 'purchases' ? opts.purchases ?? [] : table === 'send_debits' ? opts.debits ?? [] : null
    if (!rows) throw new Error(`table inattendue : ${table}`)
    const result = opts.failTable === table ? { data: null, error: { code: 'XX000', message: 'boom' } } : { data: rows, error: null }
    const builder = {
      select: () => builder, eq: () => builder, order: () => builder,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
    }
    return builder
  })
  return {
    rpc: vi.fn(async (name: string) => {
      if (name !== 'my_account') throw new Error(`rpc inattendue : ${name}`)
      return { data: opts.account, error: opts.accountError ?? null }
    }),
    from,
  }
}

function makeApp(client: ReturnType<typeof makeClient>) {
  const app = express()
  app.use(express.json())
  app.use('/api/me', createMeRouter({
    requireAuth: (req: express.Request & { user?: unknown; supabaseClient?: unknown }, _res: express.Response, next: express.NextFunction) => {
      req.user = { id: 'user-1' }
      req.supabaseClient = client
      next()
    },
  }))
  return app
}

afterEach(() => {
  delete process.env.SUPPORT_EMAIL
  delete process.env.PAPER_SENDS_ENABLED
  delete process.env.SHOW_ACTIVATION_LINK
  vi.mocked(Sentry.captureException).mockClear()
})

describe('GET /api/me', () => {
  it('famille active : 200 forme exacte (account, quota, flags, support_email) — non gatée par le consentement', async () => {
    process.env.PAPER_SENDS_ENABLED = 'true'
    const client = makeClient({ account: FAMILY, purchases: [{ included_sends: 10 }], debits: [{ source: 'included' }, { source: 'offert' }] })
    const res = await request(makeApp(client)).get('/api/me')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: true,
      account: FAMILY,
      quota: { balance: 9, included_total: 10 },
      flags: { llm_enabled: false, email_sends_enabled: false, extra_sends_enabled: false, paper_sends_enabled: true,
        partner_activations_enabled: false, partner_billing_preview: false },
      support_email: 'support@seren-app.fr',
    })
    expect(client.rpc).toHaveBeenCalledWith('my_account')
  })
  it('quota plancher 0 (débits > inclus)', async () => {
    const client = makeClient({ account: FAMILY, purchases: [{ included_sends: 1 }], debits: [{ source: 'included' }, { source: 'extra' }] })
    expect((await request(makeApp(client)).get('/api/me')).body.quota).toEqual({ balance: 0, included_total: 1 })
  })
  it('partenaire : quota null, aucune lecture purchases/send_debits', async () => {
    const client = makeClient({ account: PARTNER })
    const res = await request(makeApp(client)).get('/api/me')
    expect(res.body.quota).toBeNull()
    expect(client.from).not.toHaveBeenCalled()
  })
  it('compte sans dossier (role none) : quota null', async () => {
    const client = makeClient({ account: { ...FAMILY, role: 'none', dossier: null } })
    expect((await request(makeApp(client)).get('/api/me')).body.quota).toBeNull()
  })
  it('my_account null : 200 account null, quota null', async () => {
    const res = await request(makeApp(makeClient({ account: null }))).get('/api/me')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ success: true, account: null, quota: null })
  })
  it('RPC en erreur : 500 ACCOUNT_ERROR + Sentry', async () => {
    const res = await request(makeApp(makeClient({ account: null, accountError: { code: 'XX000', message: 'boom' } }))).get('/api/me')
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('ACCOUNT_ERROR')
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
  })
  it('lecture du quota en erreur : 500 ACCOUNT_ERROR', async () => {
    const res = await request(makeApp(makeClient({ account: FAMILY, failTable: 'send_debits' }))).get('/api/me')
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('ACCOUNT_ERROR')
  })
  it('SHOW_ACTIVATION_LINK jamais exposé ; SUPPORT_EMAIL surchargeable', async () => {
    process.env.SHOW_ACTIVATION_LINK = 'true'
    process.env.SUPPORT_EMAIL = 'aide@seren-app.fr'
    const res = await request(makeApp(makeClient({ account: PARTNER }))).get('/api/me')
    expect(JSON.stringify(res.body)).not.toMatch(/activation_link/i)
    expect(res.body.support_email).toBe('aide@seren-app.fr')
  })
})
```

- [ ] **11.2** Vérifier l'échec : `npx vitest run tests/me-route.test.ts` → échec d'import.
- [ ] **11.3** Créer `server/routes/me.js` :

```js
// GET /api/me (contrat §4.3) : unique source de vérité de l'accès côté front — rôle, dossier,
// consentement, quota, flags publics. requireAuth SEUL : pas de gate (sinon /bienvenue et l'écran
// « accès non activé » seraient inatteignables). Aucune donnée d'autrui : my_account() lit auth.uid().
import { Router } from 'express'
import * as Sentry from '@sentry/node'
import { msg } from '../lib/messages.js'
import { publicFlags } from '../lib/flags.js'
import { readQuota } from './letters.js'

const DEFAULT_SUPPORT_EMAIL = 'support@seren-app.fr'

export function createMeRouter({ requireAuth }) {
  const router = Router()

  router.get('/', requireAuth, async (req, res) => {
    const lang = req.query?.lang === 'en' ? 'en' : 'fr'
    try {
      const { data, error } = await req.supabaseClient.rpc('my_account')
      if (error) throw new Error(`my_account_failed:${error.code ?? 'unknown'}`)
      const account = data ?? null

      let quota = null
      if (account?.role === 'family' && account?.dossier?.status === 'active') {
        const { balance, included_total } = await readQuota(req.supabaseClient, req.user.id)
        quota = { balance, included_total }
      }

      return res.json({
        success: true,
        account,
        quota,
        flags: publicFlags(),
        support_email: process.env.SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL,
      })
    } catch (error) {
      console.error('❌ me :', error?.message ?? 'erreur inconnue')
      Sentry.captureException(error)
      return res.status(500).json({ success: false, code: 'ACCOUNT_ERROR', error: msg(lang, 'account_error') })
    }
  })

  return router
}
```

- [ ] **11.4** Vérifier : `npx vitest run tests/me-route.test.ts` → `0 failed`.
- [ ] **11.5** Commit : `feat(v2-l2a): GET /api/me — compte, quota (règle de /quota), flags publics, contact support`.

### Task 12 : Router `transmission` extrait, lecture par code via la RPC F1

**Niveau de revue :** double.
**Files:**
- Create: `server/routes/transmission.js`
- Test: `tests/transmission-route.test.ts`

- [ ] **12.1** Écrire le test qui échoue, `tests/transmission-route.test.ts` :

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@sentry/node', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import express from 'express'
import request from 'supertest'
// @ts-expect-error — module JS serveur
import { createTransmissionRouter } from '../server/routes/transmission.js'

function makeApp(client: Record<string, unknown>) {
  const app = express()
  app.use('/api', createTransmissionRouter({
    requireAuth: (req: express.Request & { user?: unknown; supabaseClient?: unknown }, _res: express.Response, next: express.NextFunction) => {
      req.user = { id: 'user-1' }
      req.supabaseClient = client
      next()
    },
  }))
  return app
}

describe('GET /api/transmission/:code (correctif F1)', () => {
  it('code valide : RPC get_transmission_by_code, 200 { data parsé, created_at }', async () => {
    const rpc = vi.fn(async () => ({ data: [{ data: '{"a":1}', created_at: '2026-07-10T10:00:00Z' }], error: null }))
    const from = vi.fn()
    const res = await request(makeApp({ rpc, from })).get('/api/transmission/abcd1234')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, data: { a: 1 }, created_at: '2026-07-10T10:00:00Z' })
    expect(rpc).toHaveBeenCalledWith('get_transmission_by_code', { p_code: 'abcd1234' })
    expect(from).not.toHaveBeenCalled() // plus JAMAIS de lecture directe de la table
  })
  it('aucune ligne : 404, texte actuel conservé', async () => {
    const res = await request(makeApp({ rpc: async () => ({ data: [], error: null }), from: vi.fn() })).get('/api/transmission/ZZZZ')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ success: false, error: 'Code invalide ou données non trouvées' })
  })
  it('RPC en erreur : 500', async () => {
    const res = await request(makeApp({ rpc: async () => ({ data: null, error: { code: '42883', message: 'function does not exist' } }), from: vi.fn() })).get('/api/transmission/ABCD')
    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
  })
  it('/api/user/transmission : lecture owner inchangée', async () => {
    const builder = {
      select: () => builder, eq: () => builder, order: () => builder, limit: () => builder,
      maybeSingle: async () => ({ data: { id: 't-1' }, error: null }),
    }
    const res = await request(makeApp({ from: () => builder, rpc: vi.fn() })).get('/api/user/transmission')
    expect(res.body).toEqual({ success: true, transmission: { id: 't-1' }, has_transmission: true })
  })
})
```

- [ ] **12.2** Vérifier l'échec : `npx vitest run tests/transmission-route.test.ts` → échec d'import.
- [ ] **12.3** Créer `server/routes/transmission.js` (extraction des deux routes de `server.js` l.283-346 ; produit gelé, lecture seule) :

```js
// Produit transmission (GELÉ, lecture seule — chantier 0). Extrait de server.js au lot L2a.
// Correctif F1 : la lecture par code ne passe plus par un SELECT sous policy « authentifié » (qui
// exposait toute la table) mais par la RPC security definer get_transmission_by_code.
import { Router } from 'express'
import * as Sentry from '@sentry/node'

export function createTransmissionRouter({ requireAuth }) {
  const router = Router()

  // Transmission du compte connecté (policy owner inchangée).
  router.get('/user/transmission', requireAuth, async (req, res) => {
    try {
      const { data, error } = await req.supabaseClient
        .from('transmissions')
        .select('*')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return res.json({ success: true, transmission: data, has_transmission: !!data })
    } catch (error) {
      console.error('❌ Get user transmission error:', error?.code ?? 'inconnue')
      Sentry.captureException(error)
      return res.status(500).json({ success: false, error: error.message })
    }
  })

  // Lecture par code d'accès (AccessPage).
  router.get('/transmission/:code', requireAuth, async (req, res) => {
    try {
      const { data, error } = await req.supabaseClient.rpc('get_transmission_by_code', { p_code: String(req.params.code) })
      if (error) throw new Error(`get_transmission_by_code_failed:${error.code ?? 'unknown'}`)
      const row = Array.isArray(data) ? data[0] : null
      if (!row) {
        return res.status(404).json({ success: false, error: 'Code invalide ou données non trouvées' })
      }
      return res.json({ success: true, data: JSON.parse(row.data), created_at: row.created_at })
    } catch (error) {
      console.error('❌ transmission/:code :', error?.message ?? 'erreur inconnue')
      Sentry.captureException(error)
      return res.status(500).json({ success: false, error: error.message })
    }
  })

  return router
}
```

- [ ] **12.4** Vérifier : `npx vitest run tests/transmission-route.test.ts` → `0 failed`.
- [ ] **12.5** Commit : `feat(v2-l2a): router transmission extrait — lecture par code via RPC get_transmission_by_code (F1)`.

### Task 13 : Scrub Sentry serveur et câblage complet de `server.js` + boot check

**Niveau de revue :** double.
**Prérequis :** note N1 validée (Task 0.3). Sans validation : STOP à l'étape 13.1 et remonter.
**Files:**
- Create: `server/lib/sentry-scrub.js`
- Modify: `server/server.js` (imports, `trust proxy`, Sentry, montages `/api/me`, `/api/questionnaire`, `/api/payments`, `/api/letters`, `/api/attachments`, transmission)
- Test: `tests/server-sentry-scrub.test.ts`, `tests/flags.test.ts` (bloc « câblage server.js »)

- [ ] **13.1** Écrire les tests qui échouent. `tests/server-sentry-scrub.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
// @ts-expect-error — module JS serveur
import { scrubSentryEvent } from '../server/lib/sentry-scrub.js'

const TOKEN = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'
const HASH = 'ea866a757e4c38babfa8127cbe9a409d3e1f93a00ff1488ff735fcf917afffd0'

describe('scrubSentryEvent', () => {
  it('fragment #t= remplacé dans message, exception.values[].value et request.url', () => {
    const event = scrubSentryEvent({
      message: `échec https://app.seren-app.fr/activation#t=${TOKEN}`,
      exception: { values: [{ type: 'Error', value: `lien #t=${TOKEN} refusé` }] },
      request: { url: `https://app.seren-app.fr/activation#t=${TOKEN}` },
    })
    const json = JSON.stringify(event)
    expect(json).not.toContain(TOKEN)
    expect(event.message).toContain('#t=[scrubbed]')
    expect(event.exception.values[0].value).toContain('#t=[scrubbed]')
    expect(event.request.url).toBe('https://app.seren-app.fr/activation#t=[scrubbed]')
  })
  it.each(['/api/activation/check', '/api/activation/claim', '/api/partner/dossiers', '/api/partner/dossiers/xyz/resend'])(
    '%s : request.data, query_string, cookies et authorization supprimés',
    (route) => {
      const event = scrubSentryEvent({
        request: { url: `https://app.seren-app.fr${route}`, data: { token_hash: HASH, family_email: 'claire@exemple.fr' },
          query_string: 'lang=fr', cookies: { a: 'b' }, headers: { Authorization: 'Bearer eyJ', 'user-agent': 'x' } },
      })
      expect(event.request.data).toBeUndefined()
      expect(event.request.query_string).toBeUndefined()
      expect(event.request.cookies).toBeUndefined()
      expect(event.request.headers.Authorization).toBeUndefined()
      expect(event.request.headers['user-agent']).toBe('x')
    },
  )
  it('autres routes : corps conservé, mais clés sensibles masquées à toute profondeur', () => {
    const event = scrubSentryEvent({
      request: { url: 'https://app.seren-app.fr/api/letters/send', data: { template_id: 'x', nested: { invite_token_hash: HASH } } },
      extra: { activation_url: `https://app.seren-app.fr/activation#t=${TOKEN}`, list: [{ token_hash: HASH }] },
      breadcrumbs: [{ data: { url: `/activation#t=${TOKEN}` } }],
    })
    expect(event.request.data.template_id).toBe('x')
    expect(event.request.data.nested.invite_token_hash).toBe('[scrubbed]')
    expect(event.extra.activation_url).toBe('[scrubbed]')
    expect(event.extra.list[0].token_hash).toBe('[scrubbed]')
    expect(JSON.stringify(event)).not.toContain(TOKEN)
    expect(JSON.stringify(event)).not.toContain(HASH)
  })
  it('renvoie toujours l’événement (on masque, on ne jette pas)', () => {
    const event = { message: 'ok' }
    expect(scrubSentryEvent(event)).toBe(event)
  })
})

describe('server.js — Sentry.init branché sur scrubSentryEvent', () => {
  it('beforeSend appelle scrubSentryEvent', () => {
    const source = readFileSync(path.join(process.cwd(), 'server/server.js'), 'utf8')
    expect(source).toMatch(/beforeSend:\s*\(event\)\s*=>\s*scrubSentryEvent\(event\)/)
  })
})
```

Ajouter à `tests/flags.test.ts` :

```ts
describe('server.js — câblage v2', () => {
  it('variables obsolètes plus lues, gate forfait plus importé', () => {
    const source = serverSource()
    expect(source).not.toMatch(/PAYMENTS_ENABLED/)
    expect(source).not.toMatch(/process\.env\.STRIPE_PRICE_ID\b/)
    expect(source).not.toMatch(/FORFAIT_INCLUDED_SENDS/)
    expect(source).not.toMatch(/createRequirePurchase/)
  })
  it("trust proxy posé (limiteur par IP derrière le proxy Render)", () => {
    expect(serverSource()).toContain("app.set('trust proxy', 1)")
  })
  it('chaque router métier reçoit requireActiveDossier ; me et transmission montés', () => {
    const source = serverSource()
    for (const factory of ['createQuestionnaireRouter', 'createPaymentsRouter', 'createLettersRouter', 'createAttachmentsRouter']) {
      expect(source).toMatch(new RegExp(`${factory}\\(\\{[\\s\\S]*?requireActiveDossier`))
    }
    expect(source).toContain("app.use('/api/me', createMeRouter({ requireAuth }))")
    expect(source).toContain("app.use('/api', createTransmissionRouter({ requireAuth }))")
    expect(source).not.toMatch(/app\.get\('\/api\/transmission\/:code'/)
  })
  it('ancres v2 conservées après le montage du coffre', () => {
    const source = serverSource()
    expect(source.indexOf("app.use('/api/attachments'")).toBeLessThan(source.indexOf('// v2:mount-partner'))
  })
})
```

- [ ] **13.2** Vérifier l'échec : `npx vitest run tests/server-sentry-scrub.test.ts tests/flags.test.ts` → échecs attendus.
- [ ] **13.3** Créer `server/lib/sentry-scrub.js` :

```js
// Scrub Sentry serveur (contrat §4.8, §6) : aucun jeton d'activation, hash, URL d'activation, corps
// des routes d'activation/partenaire ni en-tête Authorization ne doit quitter le serveur. Module
// dédié (note N1) : server.js démarre le serveur à l'import et ne peut pas être testé directement.
const TOKEN_FRAGMENT_RE = /#t=[A-Za-z0-9_-]+/g
const SENSITIVE_KEYS = new Set(['token_hash', 'invite_token_hash', 'activation_url'])
const SENSITIVE_ROUTES = ['/api/activation/', '/api/partner/dossiers']
const MAX_DEPTH = 12

function scrubString(value) {
  return typeof value === 'string' ? value.replace(TOKEN_FRAGMENT_RE, '#t=[scrubbed]') : value
}

// Parcours EN PLACE : masque les clés sensibles et le fragment dans toute chaîne.
function scrubDeep(node, depth) {
  if (depth > MAX_DEPTH || node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      if (typeof node[i] === 'string') node[i] = scrubString(node[i])
      else scrubDeep(node[i], depth + 1)
    }
    return
  }
  for (const key of Object.keys(node)) {
    if (SENSITIVE_KEYS.has(key)) {
      node[key] = '[scrubbed]'
    } else if (typeof node[key] === 'string') {
      node[key] = scrubString(node[key])
    } else {
      scrubDeep(node[key], depth + 1)
    }
  }
}

export function scrubSentryEvent(event) {
  if (!event || typeof event !== 'object') return event
  const request = event.request
  if (request && typeof request === 'object') {
    const url = typeof request.url === 'string' ? request.url : ''
    if (SENSITIVE_ROUTES.some((route) => url.includes(route))) {
      delete request.data
      delete request.query_string
      delete request.cookies
      if (request.headers && typeof request.headers === 'object') {
        for (const header of Object.keys(request.headers)) {
          if (header.toLowerCase() === 'authorization') delete request.headers[header]
        }
      }
    }
  }
  scrubDeep(event, 0)
  return event
}
```

- [ ] **13.4** Câbler `server/server.js` :
  - imports ajoutés en tête : `import { createRequireActiveDossier } from './lib/require-active-dossier.js';`, `import { scrubSentryEvent } from './lib/sentry-scrub.js';`, `import { createMeRouter } from './routes/me.js';`, `import { createTransmissionRouter } from './routes/transmission.js';` ; supprimer `import { createRequirePurchase } …` ;
  - `Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0, sendDefaultPii: false, beforeSend: (event) => scrubSentryEvent(event) })` ;
  - juste après `const app = express();` : `app.set('trust proxy', 1); // Render est derrière un proxy : req.ip = IP cliente (limiteur par IP, L2b)` ;
  - juste avant le montage du questionnaire : 

```js
// Gate v2 (contrat §4.1) : UNE instance partagée par les routers métier famille.
const requireActiveDossier = createRequireActiveDossier()

// Compte courant (rôle, dossier, consentement, quota, flags) — requireAuth seul, jamais gaté.
app.use('/api/me', createMeRouter({ requireAuth }))
```

  - questionnaire : `app.use('/api/questionnaire', createQuestionnaireRouter({ requireAuth, requireActiveDossier, mistral: mistralClient, model: MISTRAL_MODEL }));`
  - remplacer le bloc paiements (l.172-203) par :

```js
// ==================== PAIEMENTS (v2) ====================
// Forfait famille abandonné (la PF paie Seren) : PAYMENTS_ENABLED, STRIPE_PRICE_ID et
// FORFAIT_INCLUDED_SENDS ne sont plus lus. Reste le mini-paiement « envoi supplémentaire »,
// fermé tant que EXTRA_SENDS_ENABLED n'est pas 'true' (absent en bêta).
const stripeClient = createStripeClient();
const stripeExtraSendPriceId = process.env.STRIPE_PRICE_ID_EXTRA_SEND;

app.use('/api/payments', createPaymentsRouter({
  requireAuth,
  requireActiveDossier,
  store: purchasesStore,
  stripe: stripeClient,
  publicClient: supabase,
  getExtraPrice: createPriceReader({ stripe: stripeClient, priceId: stripeExtraSendPriceId }),
  extraPriceId: stripeExtraSendPriceId,
  appUrl: process.env.APP_URL || 'http://localhost:5173',
}));
```

  - letters : dans `createLettersRouter({…})`, remplacer `requirePurchase: createRequirePurchase(…)` par `requireActiveDossier,` et `extraSendAvailable: Boolean(paymentsEnabled && stripeClient && stripeExtraSendPriceId),` par `extraSendAvailable: () => flagOn('EXTRA_SENDS_ENABLED') && Boolean(stripeClient) && Boolean(stripeExtraSendPriceId),` (commentaires mis à jour : kill switch par canal, flag relu à chaque 402) ;
  - attachments : `app.use('/api/attachments', createAttachmentsRouter({ requireAuth, requireActiveDossier }));` — les trois ancres L0bis restent immédiatement après, inchangées ;
  - remplacer les deux routes inline transmission (l.278-346) par :

```js
// ==================== PRODUIT TRANSMISSION (gelé, lecture seule) ====================
// Routes extraites dans server/routes/transmission.js (lecture par code via RPC F1).
app.use('/api', createTransmissionRouter({ requireAuth }));
```

  (monté AVANT le fallback SPA `app.get('*')`).
- [ ] **13.5** Vérifier : gate complet R3 → vert.
- [ ] **13.6** Boot check (aucun `.env` n'est lu dans le worktree ; variables factices locales) :

```bash
(PORT=3999 SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_dummy node server/server.js > "${TMPDIR:-/tmp}/seren-boot-l2a.log" 2>&1 &) \
  && curl -s --retry 15 --retry-connrefused --retry-delay 1 http://127.0.0.1:3999/api/health \
  && echo && curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3999/api/me \
  && curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3999/api/payments/checkout \
  && grep "Rédacteur" "${TMPDIR:-/tmp}/seren-boot-l2a.log"; lsof -ti tcp:3999 | xargs kill
```

Attendu : `{"status":"ok",…}`, puis `401`, puis `401`, puis `📝 Rédacteur questionnaire v2 : statique (FEATURE_LLM fermé)`.
- [ ] **13.7** Commit : `feat(v2-l2a): server.js v2 — gate partagé, /api/me, transmission extraite, trust proxy, Sentry scrubé, variables forfait retirées`.

---

## Lot L2b — Serveur : routes partenaire et activation, invitation Resend (art. 14)

Revue : **double** (entropie du jeton, rejeu, énumération, limites, non-fuite dans journaux et Sentry). Branche `feature/v2-l2b`. Les RPC appelées (§3.3.4, 3.3.5, 3.3.9-3.3.13) n'existent qu'après L1 : ce lot se teste exclusivement avec des clients simulés.

### Task 14 : `server/lib/invite-token.js`

**Niveau de revue :** double.
**Files:**
- Create: `server/lib/invite-token.js`
- Test: `tests/invite-token.test.ts`

- [ ] **14.1** Test qui échoue, `tests/invite-token.test.ts` :

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
// @ts-expect-error — module JS serveur
import { generateInviteToken, hashInviteToken, isInviteToken, isTokenHash } from '../server/lib/invite-token.js'

type Vector = { token: string; token_bytes_hex: string; hash: string }
const VECTORS: Vector[] = JSON.parse(readFileSync(path.join(process.cwd(), 'tests/fixtures/invite-token-vector.json'), 'utf8'))

afterEach(() => vi.restoreAllMocks())

describe('jeton d’activation (contrat §6)', () => {
  it.each(VECTORS)('hash sha256 hex des octets UTF-8 de la chaîne base64url ($token)', ({ token, hash }) => {
    expect(hashInviteToken(token)).toBe(hash)
  })
  it.each(VECTORS)('generateInviteToken = base64url de randomBytes(32) ($token)', ({ token, token_bytes_hex }) => {
    vi.spyOn(crypto, 'randomBytes').mockImplementation((() => Buffer.from(token_bytes_hex, 'hex')) as never)
    expect(generateInviteToken()).toBe(token)
    expect(crypto.randomBytes).toHaveBeenCalledWith(32)
  })
  it('1 000 jetons réels : 43 caractères base64url, tous distincts', () => {
    const tokens = Array.from({ length: 1000 }, () => generateInviteToken())
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(new Set(tokens).size).toBe(1000)
  })
  it('isInviteToken / isTokenHash : motifs exacts, types refusés', () => {
    expect(isInviteToken(VECTORS[0].token)).toBe(true)
    expect(isInviteToken(VECTORS[0].token + 'A')).toBe(false)
    expect(isInviteToken('+'.repeat(43))).toBe(false)
    expect(isInviteToken(undefined)).toBe(false)
    expect(isTokenHash(VECTORS[0].hash)).toBe(true)
    expect(isTokenHash(VECTORS[0].hash.toUpperCase())).toBe(false)
    expect(isTokenHash(VECTORS[0].hash.slice(1))).toBe(false)
    expect(isTokenHash(42)).toBe(false)
  })
})
```

- [ ] **14.2** Vérifier l'échec : `npx vitest run tests/invite-token.test.ts` → échec d'import.
- [ ] **14.3** Créer `server/lib/invite-token.js` :

```js
// Jeton d'activation famille (contrat §6) : 32 octets aléatoires (256 bits) encodés en base64url.
// Le jeton ne vit QUE dans l'e-mail d'invitation (fragment #t=) ; l'API et la base ne voient que
// son sha256 hexadécimal, calculé sur les octets UTF-8 de la CHAÎNE base64url (identique à
// WebCrypto côté front : vecteurs partagés tests/fixtures/invite-token-vector.json).
import crypto from 'node:crypto'

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
const HASH_RE = /^[0-9a-f]{64}$/

export function generateInviteToken() {
  return crypto.randomBytes(32).toString('base64url')
}

export function hashInviteToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex')
}

export function isInviteToken(value) {
  return typeof value === 'string' && TOKEN_RE.test(value)
}

export function isTokenHash(value) {
  return typeof value === 'string' && HASH_RE.test(value)
}
```

- [ ] **14.4** Vérifier : `npx vitest run tests/invite-token.test.ts` → `0 failed`.
- [ ] **14.5** Commit : `feat(v2-l2b): jeton d'activation — 256 bits base64url, sha256 hex, vecteurs partagés`.

### Task 15 : `server/lib/invitation-email.js` — gabarits FR/EN conformes art. 14

**Niveau de revue :** double (contenu RGPD relu par Arnaud en U2 via `docs/textes-beta-v2.md`, qui recopie ces gabarits).
**Files:**
- Create: `server/lib/invitation-email.js`
- Test: `tests/invitation-email.test.ts`

- [ ] **15.1** Test qui échoue, `tests/invitation-email.test.ts` :

```ts
import { describe, it, expect, vi } from 'vitest'
// @ts-expect-error — module JS serveur
import { renderInvitationEmail, createInvitationSender } from '../server/lib/invitation-email.js'

const TOKEN = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'
const OPTS = {
  to: 'claire.martin@exemple.fr', lang: 'fr', partnerName: 'Pompes Funèbres Démo', familyFirstName: 'Claire',
  activationUrl: `https://preprod-app.seren-app.fr/activation#t=${TOKEN}`, expiresAt: '2026-09-23T08:00:00Z',
  supportEmail: 'support@seren-app.fr',
}

describe('renderInvitationEmail', () => {
  it('FR : sujet contractuel', () => {
    expect(renderInvitationEmail(OPTS).subject).toBe('Pompes Funèbres Démo vous ouvre votre accompagnement Seren')
  })
  it('FR : mentions art. 14 (émetteur, finalité, catégories reçues, base, droits, contact, confidentialité, validité)', () => {
    const { text } = renderInvitationEmail(OPTS)
    expect(text).toContain('Bonjour Claire,')
    expect(text).toContain('Pompes Funèbres Démo vous ouvre un accompagnement Seren')
    expect(text).toContain(OPTS.activationUrl)
    expect(text).toContain('valable 7 jours')
    expect(text).toContain('23 septembre 2026')
    expect(text).toContain('Pourquoi recevez-vous ce message ?')
    expect(text).toMatch(/prénom, votre nom, votre adresse e-mail/)
    expect(text).toMatch(/prénom, le nom et la date de décès de votre proche/)
    expect(text).toMatch(/base : exécution du service proposé par Pompes Funèbres Démo/)
    for (const right of ['accès', 'rectification', 'effacement', 'vous opposer']) expect(text).toContain(right)
    expect(text).toContain('support@seren-app.fr')
    expect(text).toContain('https://preprod-app.seren-app.fr/security')
    expect(text).toContain('cnil.fr')
  })
  it('EN : sujet et mentions équivalentes', () => {
    const { subject, text } = renderInvitationEmail({ ...OPTS, lang: 'en' })
    expect(subject).toBe('Pompes Funèbres Démo opens your Seren support')
    expect(text).toContain('Why are you receiving this message?')
    expect(text).toContain('valid for 7 days')
    for (const right of ['access', 'rectification', 'erasure', 'object']) expect(text).toContain(right)
    expect(text).toContain('https://preprod-app.seren-app.fr/security')
  })
  it('aucune valeur relative au défunt, même si un appelant en passait', () => {
    const { text } = renderInvitationEmail({ ...OPTS, deceased_last_name: 'Dupont', deceased_death_date: '2026-09-10', deceasedFirstName: 'Jean' })
    expect(text).not.toContain('Dupont')
    expect(text).not.toContain('2026-09-10')
    expect(text).not.toContain('Jean')
  })
  it('PF absente : libellé générique ; prénom absent : « Bonjour, »', () => {
    const { subject, text } = renderInvitationEmail({ ...OPTS, partnerName: null, familyFirstName: null })
    expect(subject).toBe('Votre pompe funèbre vous ouvre votre accompagnement Seren')
    expect(text.startsWith('Bonjour,')).toBe(true)
  })
})

describe('createInvitationSender', () => {
  it('Resend appelé avec { from, to, subject, text } — aucune pièce jointe', async () => {
    const send = vi.fn(async () => ({ data: { id: 'em_1' }, error: null }))
    const sender = createInvitationSender({ resendClient: { emails: { send } }, from: 'Seren <noreply@seren-app.fr>' })
    await expect(sender.send(OPTS)).resolves.toEqual({ providerRef: 'em_1' })
    const payload = send.mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual(['from', 'subject', 'text', 'to'])
    expect(payload.to).toBe('claire.martin@exemple.fr')
  })
  it('non configuré (client ou expéditeur absent) : lève email_not_configured', async () => {
    await expect(createInvitationSender({ resendClient: null, from: 'x' }).send(OPTS)).rejects.toThrow('email_not_configured')
    await expect(createInvitationSender({ resendClient: { emails: { send: vi.fn() } }, from: undefined }).send(OPTS)).rejects.toThrow('email_not_configured')
  })
  it('erreur Resend : lève invitation_provider_error, jamais le message du fournisseur (il peut contenir l’adresse)', async () => {
    const send = vi.fn(async () => ({ data: null, error: { message: 'invalid recipient claire.martin@exemple.fr' } }))
    const promise = createInvitationSender({ resendClient: { emails: { send } }, from: 'x' }).send(OPTS)
    await expect(promise).rejects.toThrow(/^invitation_provider_error$/)
  })
})
```

- [ ] **15.2** Vérifier l'échec : `npx vitest run tests/invitation-email.test.ts` → échec d'import.
- [ ] **15.3** Créer `server/lib/invitation-email.js` :

```js
// E-mail d'invitation famille (contrat §4.4) — PREMIER contact avec une personne dont les données
// ont été saisies par un tiers (la PF) : information RGPD art. 14 obligatoire. Texte brut, sans
// pièce jointe, sans aucune valeur relative au défunt. Ne dépend PAS d'EMAIL_SENDS_ENABLED (qui ne
// gouverne que les courriers aux organismes). Toute modification de ces textes est reportée à
// l'identique dans docs/textes-beta-v2.md (§ art. 14), relu par Arnaud.
const FALLBACK_PARTNER = { fr: 'Votre pompe funèbre', en: 'Your funeral home' }

function formatDate(iso, lang) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris',
  }).format(date)
}

function securityUrlFrom(activationUrl) {
  try {
    return `${new URL(activationUrl).origin}/security`
  } catch {
    return null
  }
}

export function renderInvitationEmail({ lang = 'fr', partnerName, familyFirstName, activationUrl, expiresAt, supportEmail }) {
  const l = lang === 'en' ? 'en' : 'fr'
  const partner = partnerName || FALLBACK_PARTNER[l]
  const until = formatDate(expiresAt, l)
  const securityUrl = securityUrlFrom(activationUrl)

  if (l === 'en') {
    const lines = [
      familyFirstName ? `Hello ${familyFirstName},` : 'Hello,',
      '',
      `${partner} is opening a Seren support account for you, to help with the administrative steps after the death of your loved one. This support is included in ${partner}'s services: you have nothing to pay to Seren.`,
      '',
      `To activate your access, choose your password by opening this personal link, valid for 7 days${until ? ` (until ${until})` : ''}:`,
      activationUrl,
      '',
      'This link is personal: please do not forward it.',
      '',
      'Why are you receiving this message?',
      `To open this service, ${partner} shared with Seren your first name, last name, email address and, where applicable, your phone number, as well as the first name, last name and date of death of your loved one. Seren uses this information only to create and prepare your support (basis: performance of the service offered by ${partner}). The retention period is set out in our privacy policy.`,
      '',
      `Your rights: you can request access to this information, its rectification or erasure, and object to its use, by writing to ${supportEmail}. You can also lodge a complaint with the CNIL (cnil.fr).`,
      securityUrl ? `Privacy policy: ${securityUrl}` : null,
      '',
      `If you do not wish to use Seren, simply ignore this message: without activation, the invitation expires${until ? ` on ${until}` : ' after 7 days'}.`,
      '',
      'The Seren team',
    ]
    return { subject: `${partner} opens your Seren support`, text: lines.filter((line) => line !== null).join('\n') }
  }

  const lines = [
    familyFirstName ? `Bonjour ${familyFirstName},` : 'Bonjour,',
    '',
    `${partner} vous ouvre un accompagnement Seren pour vous aider dans les démarches administratives après le décès de votre proche. Cet accompagnement est compris dans les prestations de ${partner} : vous n'avez rien à payer à Seren.`,
    '',
    `Pour activer votre accès, choisissez votre mot de passe en ouvrant ce lien personnel, valable 7 jours${until ? ` (jusqu'au ${until})` : ''} :`,
    activationUrl,
    '',
    'Ce lien est personnel : ne le transférez pas.',
    '',
    'Pourquoi recevez-vous ce message ?',
    `Pour ouvrir ce service, ${partner} a transmis à Seren votre prénom, votre nom, votre adresse e-mail et, le cas échéant, votre numéro de téléphone, ainsi que le prénom, le nom et la date de décès de votre proche. Seren utilise ces informations uniquement pour créer et préparer votre accompagnement (base : exécution du service proposé par ${partner}). La durée de conservation est précisée dans notre politique de confidentialité.`,
    '',
    `Vos droits : vous pouvez demander l'accès à ces informations, leur rectification ou leur effacement, et vous opposer à leur utilisation, en écrivant à ${supportEmail}. Vous pouvez aussi adresser une réclamation à la CNIL (cnil.fr).`,
    securityUrl ? `Politique de confidentialité : ${securityUrl}` : null,
    '',
    `Si vous ne souhaitez pas utiliser Seren, ignorez simplement ce message : sans activation, l'invitation expire${until ? ` le ${until}` : ' au bout de 7 jours'}.`,
    '',
    "L'équipe Seren",
  ]
  return { subject: `${partner} vous ouvre votre accompagnement Seren`, text: lines.filter((line) => line !== null).join('\n') }
}

export function createInvitationSender({ resendClient, from }) {
  return {
    async send(opts) {
      if (!resendClient || !from) throw new Error('email_not_configured')
      const { subject, text } = renderInvitationEmail(opts)
      const { data, error } = await resendClient.emails.send({ from, to: opts.to, subject, text })
      // Jamais le message du fournisseur : il peut contenir l'adresse du destinataire.
      if (error) throw new Error('invitation_provider_error')
      return { providerRef: data?.id ?? null }
    },
  }
}
```

- [ ] **15.4** Vérifier : `npx vitest run tests/invitation-email.test.ts` → `0 failed` (le test « 23 septembre 2026 » suppose l'ICU complète de Node 22 ; si l'environnement renvoie un autre format, remplacer l'assertion par `expect(text).toMatch(/23 septembre 2026|2026-09-23/)` et consigner en note post-revue).
- [ ] **15.5** Commit : `feat(v2-l2b): e-mail d'invitation FR/EN — information art. 14, sans données du défunt, erreurs fournisseur neutralisées`.

### Task 16 : `createIpRateLimiter` et bloc de messages L2b

**Niveau de revue :** double.
**Files:**
- Modify: `server/lib/rate-limit.js` (ajout d'un export)
- Modify: `server/lib/messages.js` (juste avant `// v2:messages-l2b`, fr et en)

- [ ] **16.1** Ajouter à `server/lib/rate-limit.js` :

```js
// Limiteur en mémoire par IP (routes publiques sans compte : POST /api/activation/check).
// Suppose `app.set('trust proxy', 1)` (server.js) : derrière Render, req.ip est l'IP cliente.
// Purge opportuniste pour qu'une rafale d'IP distinctes ne fasse pas grossir la Map sans fin.
export function createIpRateLimiter({ max, windowMs, message = 'Trop de requêtes, réessayez dans quelques minutes.' }) {
  const hits = new Map() // ip → timestamps[]
  return function ipRateLimit(req, res, next) {
    const now = Date.now()
    const key = req.ip || req.socket?.remoteAddress || 'inconnue'
    const stamps = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
    if (stamps.length >= max) {
      const error = typeof message === 'function' ? message(req) : message
      return res.status(429).json({ success: false, error })
    }
    stamps.push(now)
    hits.set(key, stamps)
    if (hits.size > 10000) {
      for (const [ip, list] of hits) if (!list.some((t) => now - t < windowMs)) hits.delete(ip)
    }
    next()
  }
}
```

- [ ] **16.2** Messages : insérer juste avant `// v2:messages-l2b`, dans `fr` puis dans `en`, les 22 clés du lot L2b du tableau §4.9 du contrat (valeurs FR et EN **verbatim** de ce tableau, avec l'apostrophe typographique `’` du fichier), dans cet ordre : `partner_error`, `not_a_partner`, `partner_inactive`, `partner_activations_disabled`, `duplicate_deceased`, `email_unavailable`, `invalid_input`, `partner_daily_limit`, `dossier_not_found`, `dossier_not_invitable`, `rotation_too_soon`, `rotation_limit`, `dossier_already_active`, `cancel_window_elapsed`, `activation_error`, `invalid_token`, `invitation_invalid`, `invitation_expired`, `email_mismatch`, `account_role_forbidden`, `account_already_linked`. Commentaire d'en-tête du bloc : `// v2 — espace partenaire et activation famille (lot L2b)`. Contrôle : `node -e "import('./server/lib/messages.js').then(({MESSAGES})=>{const k=['partner_error','not_a_partner','partner_inactive','partner_activations_disabled','duplicate_deceased','email_unavailable','invalid_input','partner_daily_limit','dossier_not_found','dossier_not_invitable','rotation_too_soon','rotation_limit','dossier_already_active','cancel_window_elapsed','activation_error','invalid_token','invitation_invalid','invitation_expired','email_mismatch','account_role_forbidden','account_already_linked'];console.log(k.filter(x=>!MESSAGES.fr[x]||!MESSAGES.en[x]))})"` → attendu `[]`.
- [ ] **16.3** Gate R3 → vert. Commit : `feat(v2-l2b): limiteur par IP + messages espace partenaire et activation (FR/EN)`.

(`createIpRateLimiter` est testé par `tests/activation-routes.test.ts`, Task 18.)

### Task 17 : `server/routes/partner.js`

**Niveau de revue :** double.
**Files:**
- Create: `server/routes/partner.js`
- Test: `tests/partner-routes.test.ts`

- [ ] **17.1** Test qui échoue, `tests/partner-routes.test.ts` :

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@sentry/node', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import express from 'express'
import request from 'supertest'
import * as Sentry from '@sentry/node'
// @ts-expect-error — module JS serveur
import { createPartnerRouter } from '../server/routes/partner.js'
// @ts-expect-error — module JS serveur
import { hashInviteToken } from '../server/lib/invite-token.js'

const TOKEN = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'
const HASH = 'ea866a757e4c38babfa8127cbe9a409d3e1f93a00ff1488ff735fcf917afffd0'
// Secret partagé webhook_config (contrat §3.4, §4.4) : le serveur l'ajoute en p_secret aux 2 RPC où
// l'appelant choisit le hash du jeton. Jamais journalisé, jamais renvoyé au client.
const RPC_SECRET = 'test-rpc-secret'
const DOSSIER_ID = '0b4e8d2a-6a1f-4c1e-9d3b-2f5a7c9e1b3d'
const DOSSIER = {
  id: DOSSIER_ID, status: 'invited', created_at: '2026-09-16T08:00:00Z', invite_expires_at: '2026-09-23T08:00:00Z',
  family_first_name: 'Claire', family_last_name: 'Martin', family_email: 'claire.martin@exemple.fr',
  deceased_first_name: 'Jean', deceased_last_name: 'Dupont', deceased_death_date: '2026-09-10',
}
const BODY = {
  family_first_name: 'Claire', family_last_name: 'Martin', family_email: 'claire.martin@exemple.fr', family_phone: '06 12 34 56 78',
  deceased_first_name: 'Jean', deceased_last_name: 'Dupont', deceased_death_date: '2026-09-10',
}

type RpcResult = { data?: unknown; error?: { message: string; code?: string } | null }
function makeClient(handlers: Record<string, (args: Record<string, unknown>) => RpcResult>) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  return {
    calls,
    rpc: vi.fn(async (name: string, args: Record<string, unknown> = {}) => {
      calls.push({ name, args })
      const handler = handlers[name]
      if (!handler) throw new Error(`rpc inattendue : ${name}`)
      return handler(args)
    }),
  }
}
function makeSender(behavior: 'ok' | 'not_configured' | 'fail' = 'ok') {
  const sent: Record<string, unknown>[] = []
  return {
    sent,
    async send(opts: Record<string, unknown>) {
      if (behavior === 'not_configured') throw new Error('email_not_configured')
      if (behavior === 'fail') throw new Error('Resend: invalid recipient claire.martin@exemple.fr')
      sent.push(opts)
      return { providerRef: 'em_1' }
    },
  }
}
function makeApp(client: ReturnType<typeof makeClient>, sender = makeSender()) {
  const app = express()
  app.use(express.json())
  app.use('/api/partner', createPartnerRouter({
    requireAuth: (req: express.Request & { user?: unknown; supabaseClient?: unknown }, _res: express.Response, next: express.NextFunction) => {
      req.user = { id: 'pf-user-1' }
      req.supabaseClient = client
      next()
    },
    invitationSender: sender,
    appUrl: 'https://preprod-app.seren-app.fr',
    supportEmail: 'support@seren-app.fr',
    rpcSecret: RPC_SECRET,
    generateInviteToken: () => TOKEN,
    hashInviteToken,
  }))
  return app
}
const created = () => ({ data: { created: true, duplicate_warning: false, partner_name: 'Pompes Funèbres Démo', dossier: DOSSIER }, error: null })
const sqlError = (message: string) => () => ({ data: null, error: { message, code: 'P0001' } })

afterEach(() => {
  for (const name of ['PARTNER_ACTIVATIONS_ENABLED', 'SHOW_ACTIVATION_LINK', 'PARTNER_BILLING_PREVIEW']) delete process.env[name]
  vi.mocked(Sentry.captureException).mockClear()
  vi.restoreAllMocks()
})

describe('POST /api/partner/dossiers', () => {
  it('flag fermé : 503 PARTNER_ACTIVATIONS_DISABLED, aucun appel base, aucun e-mail', async () => {
    const client = makeClient({ partner_create_dossier: created })
    const sender = makeSender()
    const res = await request(makeApp(client, sender)).post('/api/partner/dossiers').send(BODY)
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('PARTNER_ACTIVATIONS_DISABLED')
    expect(client.calls).toHaveLength(0)
    expect(sender.sent).toHaveLength(0)
  })
  it('création : la RPC reçoit le HASH (jamais le jeton) ; 201 ; e-mail avec #t=<jeton> ; pas d’activation_url par défaut', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const client = makeClient({ partner_create_dossier: created })
    const sender = makeSender()
    const res = await request(makeApp(client, sender)).post('/api/partner/dossiers').send(BODY)
    expect(res.status).toBe(201)
    expect(client.calls[0]).toEqual({ name: 'partner_create_dossier', args: {
      p_secret: RPC_SECRET,
      p_family_first_name: 'Claire', p_family_last_name: 'Martin', p_family_email: 'claire.martin@exemple.fr', p_family_phone: '06 12 34 56 78',
      p_deceased_first_name: 'Jean', p_deceased_last_name: 'Dupont', p_deceased_death_date: '2026-09-10',
      p_token_hash: HASH, p_confirm_duplicate: false,
    } })
    expect(JSON.stringify(client.calls)).not.toContain(TOKEN)
    expect(JSON.stringify(res.body)).not.toContain(RPC_SECRET)
    expect(res.body).toEqual({ success: true, dossier: DOSSIER, partner_name: 'Pompes Funèbres Démo', email_sent: true })
    expect(JSON.stringify(res.body)).not.toContain(TOKEN)
    expect(sender.sent[0]).toEqual({
      to: 'claire.martin@exemple.fr', lang: 'fr', partnerName: 'Pompes Funèbres Démo', familyFirstName: 'Claire',
      activationUrl: `https://preprod-app.seren-app.fr/activation#t=${TOKEN}`, expiresAt: '2026-09-23T08:00:00Z',
      supportEmail: 'support@seren-app.fr',
    })
  })
  it('les valeurs du défunt ne sont jamais transmises à l’e-mail', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const sender = makeSender()
    await request(makeApp(makeClient({ partner_create_dossier: created }), sender)).post('/api/partner/dossiers').send(BODY)
    const sent = JSON.stringify(sender.sent)
    expect(sent).not.toContain('Dupont')
    expect(sent).not.toContain('2026-09-10')
  })
  it('SHOW_ACTIVATION_LINK=true : activation_url présent ; « TRUE » : absent', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    process.env.SHOW_ACTIVATION_LINK = 'true'
    const res = await request(makeApp(makeClient({ partner_create_dossier: created }))).post('/api/partner/dossiers').send(BODY)
    expect(res.body.activation_url).toBe(`https://preprod-app.seren-app.fr/activation#t=${TOKEN}`)
    process.env.SHOW_ACTIVATION_LINK = 'TRUE'
    const res2 = await request(makeApp(makeClient({ partner_create_dossier: created }))).post('/api/partner/dossiers').send(BODY)
    expect(res2.body.activation_url).toBeUndefined()
  })
  it('doublon de défunt : 409 DUPLICATE_DECEASED + duplicate_count, aucun e-mail', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const sender = makeSender()
    const client = makeClient({ partner_create_dossier: () => ({ data: { created: false, duplicate_warning: true, duplicate_count: 2 }, error: null }) })
    const res = await request(makeApp(client, sender)).post('/api/partner/dossiers').send(BODY)
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ success: false, code: 'DUPLICATE_DECEASED', duplicate_count: 2 })
    expect(sender.sent).toHaveLength(0)
  })
  it('confirm_duplicate: true est transmis (p_confirm_duplicate) ; toute autre valeur vaut false', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const client = makeClient({ partner_create_dossier: created })
    await request(makeApp(client)).post('/api/partner/dossiers').send({ ...BODY, confirm_duplicate: true })
    await request(makeApp(client)).post('/api/partner/dossiers').send({ ...BODY, confirm_duplicate: 'true' })
    expect(client.calls[0].args.p_confirm_duplicate).toBe(true)
    expect(client.calls[1].args.p_confirm_duplicate).toBe(false)
  })
  it.each([
    ['invalid_family_name', 400, 'INVALID_INPUT', 'family_name'],
    ['invalid_email', 400, 'INVALID_INPUT', 'email'],
    ['invalid_phone', 400, 'INVALID_INPUT', 'phone'],
    ['invalid_deceased_name', 400, 'INVALID_INPUT', 'deceased_name'],
    ['invalid_death_date', 400, 'INVALID_INPUT', 'death_date'],
    ['not_a_partner', 403, 'NOT_A_PARTNER', undefined],
    ['partner_inactive', 403, 'PARTNER_INACTIVE', undefined],
    ['email_unavailable', 409, 'EMAIL_UNAVAILABLE', undefined],
    ['partner_daily_limit', 429, 'PARTNER_DAILY_LIMIT', undefined],
  ])('erreur SQL %s → %i %s', async (sqlCode, status, code, field) => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const sender = makeSender()
    const res = await request(makeApp(makeClient({ partner_create_dossier: sqlError(sqlCode) }), sender)).post('/api/partner/dossiers').send(BODY)
    expect(res.status).toBe(status)
    expect(res.body.code).toBe(code)
    expect(res.body.field).toBe(field)
    expect(sender.sent).toHaveLength(0)
  })
  it('code SQL inconnu (ex. invalid_token_hash) : 500 PARTNER_ERROR + Sentry, message brut jamais renvoyé', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const res = await request(makeApp(makeClient({ partner_create_dossier: sqlError('invalid_token_hash') }))).post('/api/partner/dossiers').send(BODY)
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('PARTNER_ERROR')
    expect(JSON.stringify(res.body)).not.toContain('invalid_token_hash')
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
  })
  it('date de décès mal formée : 400 INVALID_INPUT death_date, SANS appel base', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const client = makeClient({ partner_create_dossier: created })
    const res = await request(makeApp(client)).post('/api/partner/dossiers').send({ ...BODY, deceased_death_date: '10/09/2026' })
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'INVALID_INPUT', field: 'death_date' })
    expect(client.calls).toHaveLength(0)
  })
  it('Resend non configuré : dossier créé, 201 email_sent false', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const res = await request(makeApp(makeClient({ partner_create_dossier: created }), makeSender('not_configured'))).post('/api/partner/dossiers').send(BODY)
    expect(res.status).toBe(201)
    expect(res.body.email_sent).toBe(false)
  })
  it('échec Resend : 201 email_sent false ; Sentry et journaux sans jeton, URL ni adresse', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const logs: string[] = []
    for (const level of ['log', 'info', 'warn', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { logs.push(args.map((a) => (a instanceof Error ? a.message : JSON.stringify(a))).join(' ')) })
    }
    const res = await request(makeApp(makeClient({ partner_create_dossier: created }), makeSender('fail'))).post('/api/partner/dossiers').send(BODY)
    expect(res.body.email_sent).toBe(false)
    const captured = JSON.stringify(vi.mocked(Sentry.captureException).mock.calls.map(([err, ctx]) => [(err as Error).message, ctx]))
    for (const secret of [TOKEN, HASH, 'activation#t', 'claire.martin']) {
      expect(captured).not.toContain(secret)
      expect(logs.join('\n')).not.toContain(secret)
    }
  })
  it('secret absent : 500 PARTNER_ERROR, AUCUN appel base, aucun e-mail (fail-closed)', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const client = makeClient({ partner_create_dossier: created })
    const sender = makeSender()
    const app = express()
    app.use(express.json())
    app.use('/api/partner', createPartnerRouter({
      requireAuth: (req: express.Request & { user?: unknown; supabaseClient?: unknown }, _res: express.Response, next: express.NextFunction) => {
        req.user = { id: 'pf-user-1' }; req.supabaseClient = client; next()
      },
      invitationSender: sender, appUrl: 'https://preprod-app.seren-app.fr', supportEmail: 'support@seren-app.fr',
      rpcSecret: '', generateInviteToken: () => TOKEN, hashInviteToken,
    }))
    const res = await request(app).post('/api/partner/dossiers').send(BODY)
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('PARTNER_ERROR')
    expect(client.calls).toHaveLength(0)
    expect(sender.sent).toHaveLength(0)
    const resend = await request(app).post(`/api/partner/dossiers/${DOSSIER_ID}/resend`).send({})
    expect(resend.status).toBe(500)
    expect(client.calls).toHaveLength(0)
  })
  it('code SQL invalid_secret (serveur et base désaccordés) : 500 PARTNER_ERROR, jamais exposé', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const sender = makeSender()
    const res = await request(makeApp(makeClient({ partner_create_dossier: sqlError('invalid_secret') }), sender)).post('/api/partner/dossiers').send(BODY)
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('PARTNER_ERROR')
    expect(JSON.stringify(res.body)).not.toContain('invalid_secret')
    expect(JSON.stringify(res.body)).not.toContain(RPC_SECRET)
    expect(sender.sent).toHaveLength(0)
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
  })
  it('le secret n’apparaît ni dans les journaux ni dans Sentry', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const logs: string[] = []
    for (const level of ['log', 'info', 'warn', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { logs.push(args.map((a) => (a instanceof Error ? a.message : JSON.stringify(a))).join(' ')) })
    }
    await request(makeApp(makeClient({ partner_create_dossier: sqlError('invalid_secret') }))).post('/api/partner/dossiers').send(BODY)
    const captured = JSON.stringify(vi.mocked(Sentry.captureException).mock.calls.map(([err, ctx]) => [(err as Error).message, ctx]))
    expect(captured).not.toContain(RPC_SECRET)
    expect(logs.join('\n')).not.toContain(RPC_SECRET)
  })
  it('limiteur : la 31e création de l’heure pour ce compte → 429', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const app = makeApp(makeClient({ partner_create_dossier: created }))
    for (let i = 0; i < 30; i++) expect((await request(app).post('/api/partner/dossiers').send(BODY)).status).toBe(201)
    expect((await request(app).post('/api/partner/dossiers').send(BODY)).status).toBe(429)
  })
})

describe('POST /api/partner/dossiers/:id/resend', () => {
  const rotated = () => ({ data: { rotated: true, partner_name: 'Pompes Funèbres Démo', dossier: DOSSIER }, error: null })
  it('flag fermé : 503', async () => {
    const client = makeClient({ partner_rotate_invitation: rotated })
    expect((await request(makeApp(client)).post(`/api/partner/dossiers/${DOSSIER_ID}/resend`).send({})).status).toBe(503)
    expect(client.calls).toHaveLength(0)
  })
  it('id non UUID : 404 DOSSIER_NOT_FOUND sans appel base', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const client = makeClient({ partner_rotate_invitation: rotated })
    const res = await request(makeApp(client)).post('/api/partner/dossiers/pas-un-uuid/resend').send({})
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('DOSSIER_NOT_FOUND')
    expect(client.calls).toHaveLength(0)
  })
  it('renvoi : RPC { p_dossier_id, p_token_hash }, nouvel e-mail, 200', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const client = makeClient({ partner_rotate_invitation: rotated })
    const sender = makeSender()
    const res = await request(makeApp(client, sender)).post(`/api/partner/dossiers/${DOSSIER_ID}/resend`).send({ lang: 'en' })
    expect(res.status).toBe(200)
    expect(client.calls[0]).toEqual({ name: 'partner_rotate_invitation', args: { p_secret: RPC_SECRET, p_dossier_id: DOSSIER_ID, p_token_hash: HASH } })
    expect(res.body).toEqual({ success: true, dossier: DOSSIER, partner_name: 'Pompes Funèbres Démo', email_sent: true })
    expect(sender.sent[0]).toMatchObject({ lang: 'en', to: 'claire.martin@exemple.fr' })
  })
  it.each([
    ['dossier_not_found', 404, 'DOSSIER_NOT_FOUND'],
    ['dossier_not_invitable', 409, 'DOSSIER_NOT_INVITABLE'],
    ['rotation_too_soon', 429, 'ROTATION_TOO_SOON'],
    ['rotation_limit', 429, 'ROTATION_LIMIT'],
    ['not_a_partner', 403, 'NOT_A_PARTNER'],
  ])('erreur SQL %s → %i %s', async (sqlCode, status, code) => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const res = await request(makeApp(makeClient({ partner_rotate_invitation: sqlError(sqlCode) }))).post(`/api/partner/dossiers/${DOSSIER_ID}/resend`).send({})
    expect(res.status).toBe(status)
    expect(res.body.code).toBe(code)
  })
})

describe('POST /api/partner/dossiers/:id/cancel', () => {
  it('annulation : 200 { dossier, already_cancelled:false } — disponible même flag fermé', async () => {
    const cancelled = { id: DOSSIER_ID, status: 'cancelled', cancelled_at: '2026-09-16T09:00:00Z' }
    const client = makeClient({ partner_cancel_dossier: () => ({ data: { cancelled: true, already_cancelled: false, dossier: cancelled }, error: null }) })
    const res = await request(makeApp(client)).post(`/api/partner/dossiers/${DOSSIER_ID}/cancel`).send({})
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, dossier: cancelled, already_cancelled: false })
    expect(client.calls[0]).toEqual({ name: 'partner_cancel_dossier', args: { p_dossier_id: DOSSIER_ID } })
  })
  it('déjà annulé : 200 already_cancelled true', async () => {
    const client = makeClient({ partner_cancel_dossier: () => ({ data: { cancelled: false, already_cancelled: true, dossier: { id: DOSSIER_ID, status: 'cancelled', cancelled_at: 'x' } }, error: null }) })
    expect((await request(makeApp(client)).post(`/api/partner/dossiers/${DOSSIER_ID}/cancel`).send({})).body.already_cancelled).toBe(true)
  })
  it('id non UUID : 404 sans appel base', async () => {
    const client = makeClient({})
    expect((await request(makeApp(client)).post('/api/partner/dossiers/42/cancel').send({})).status).toBe(404)
    expect(client.calls).toHaveLength(0)
  })
  it.each([
    ['dossier_already_active', 409, 'DOSSIER_ALREADY_ACTIVE'],
    ['cancel_window_elapsed', 409, 'CANCEL_WINDOW_ELAPSED'],
    ['dossier_not_found', 404, 'DOSSIER_NOT_FOUND'],
    ['not_a_partner', 403, 'NOT_A_PARTNER'],
  ])('erreur SQL %s → %i %s', async (sqlCode, status, code) => {
    const res = await request(makeApp(makeClient({ partner_cancel_dossier: sqlError(sqlCode) }))).post(`/api/partner/dossiers/${DOSSIER_ID}/cancel`).send({})
    expect(res.status).toBe(status)
    expect(res.body.code).toBe(code)
  })
})

describe('GET /api/partner/dossiers et /counters', () => {
  it('liste : RPC null → 403 NOT_A_PARTNER', async () => {
    const res = await request(makeApp(makeClient({ partner_list_dossiers: () => ({ data: null, error: null }) }))).get('/api/partner/dossiers')
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('NOT_A_PARTNER')
  })
  it('liste : 200 { partner, dossiers } (flag fermé compris)', async () => {
    const payload = { partner: { id: 'p-1', name: 'PF', status: 'active', user_role: 'manager' }, dossiers: [DOSSIER] }
    const res = await request(makeApp(makeClient({ partner_list_dossiers: () => ({ data: payload, error: null }) }))).get('/api/partner/dossiers')
    expect(res.body).toEqual({ success: true, ...payload })
  })
  const COUNTERS = { month: '2026-09', created_this_month: 3, created_total: 7, activated_total: 4, pending_activation: 2,
    expired_invitations: 1, cancelled_total: 1, activated_this_month: 2,
    billing_preview: { billable_count: 2, seren_due_ttc_cents: 44000, unit_due_ttc_cents: 22000, currency: 'EUR' } }
  it('compteurs : billing_preview forcé à null sans PARTNER_BILLING_PREVIEW', async () => {
    const res = await request(makeApp(makeClient({ partner_month_counters: () => ({ data: COUNTERS, error: null }) }))).get('/api/partner/counters')
    expect(res.body).toEqual({ success: true, counters: { ...COUNTERS, billing_preview: null } })
  })
  it('compteurs : PARTNER_BILLING_PREVIEW=true transmet billing_preview', async () => {
    process.env.PARTNER_BILLING_PREVIEW = 'true'
    const res = await request(makeApp(makeClient({ partner_month_counters: () => ({ data: COUNTERS, error: null }) }))).get('/api/partner/counters')
    expect(res.body.counters.billing_preview).toEqual(COUNTERS.billing_preview)
  })
  it('compteurs : RPC null → 403', async () => {
    expect((await request(makeApp(makeClient({ partner_month_counters: () => ({ data: null, error: null }) }))).get('/api/partner/counters')).status).toBe(403)
  })
})
```

- [ ] **17.2** Vérifier l'échec : `npx vitest run tests/partner-routes.test.ts` → échec d'import.
- [ ] **17.3** Créer `server/routes/partner.js` :

```js
// Espace partenaire PF (contrat §4.4). La sécurité est ENTIÈREMENT dans les RPC SQL (partner_id tiré
// de auth.uid(), aucune jointure vers le contenu famille) ; Express ne fait que : générer le jeton,
// n'envoyer QUE son hash à la base, envoyer l'invitation, traduire les codes SQL en HTTP.
// PARTNER_ACTIVATIONS_ENABLED est un interrupteur d'exploitation (création et renvoi), pas une barrière.
// Règle absolue : le jeton, son hash et l'URL d'activation ne sont JAMAIS journalisés ni envoyés à Sentry.
import { Router } from 'express'
import * as Sentry from '@sentry/node'
import { msg } from '../lib/messages.js'
import { flagOn, killSwitch } from '../lib/flags.js'
import { createUserRateLimiter } from '../lib/rate-limit.js'
import {
  generateInviteToken as defaultGenerateInviteToken,
  hashInviteToken as defaultHashInviteToken,
} from '../lib/invite-token.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function reqLang(req) {
  return req.body?.lang === 'en' || req.query?.lang === 'en' ? 'en' : 'fr'
}

// Codes d'exception SQL (contrat §3.5) → réponse HTTP. Égalité stricte sur error.message.
const RPC_ERRORS = {
  not_a_partner: { status: 403, code: 'NOT_A_PARTNER', key: 'not_a_partner' },
  partner_inactive: { status: 403, code: 'PARTNER_INACTIVE', key: 'partner_inactive' },
  invalid_family_name: { status: 400, code: 'INVALID_INPUT', key: 'invalid_input', field: 'family_name' },
  invalid_email: { status: 400, code: 'INVALID_INPUT', key: 'invalid_input', field: 'email' },
  invalid_phone: { status: 400, code: 'INVALID_INPUT', key: 'invalid_input', field: 'phone' },
  invalid_deceased_name: { status: 400, code: 'INVALID_INPUT', key: 'invalid_input', field: 'deceased_name' },
  invalid_death_date: { status: 400, code: 'INVALID_INPUT', key: 'invalid_input', field: 'death_date' },
  partner_daily_limit: { status: 429, code: 'PARTNER_DAILY_LIMIT', key: 'partner_daily_limit' },
  email_unavailable: { status: 409, code: 'EMAIL_UNAVAILABLE', key: 'email_unavailable' },
  dossier_not_found: { status: 404, code: 'DOSSIER_NOT_FOUND', key: 'dossier_not_found' },
  dossier_not_invitable: { status: 409, code: 'DOSSIER_NOT_INVITABLE', key: 'dossier_not_invitable' },
  rotation_too_soon: { status: 429, code: 'ROTATION_TOO_SOON', key: 'rotation_too_soon' },
  rotation_limit: { status: 429, code: 'ROTATION_LIMIT', key: 'rotation_limit' },
  dossier_already_active: { status: 409, code: 'DOSSIER_ALREADY_ACTIVE', key: 'dossier_already_active' },
  cancel_window_elapsed: { status: 409, code: 'CANCEL_WINDOW_ELAPSED', key: 'cancel_window_elapsed' },
}

function partnerError(res, lang, reason, pgCode) {
  // Jamais error.message brut : un message Postgres imprévu peut contenir des valeurs saisies.
  console.error(`❌ partner : ${reason} (${pgCode ?? 'sans code'})`)
  Sentry.captureException(new Error(`partner_${reason}`), { tags: { pg_code: pgCode ?? 'unknown' } })
  return res.status(500).json({ success: false, code: 'PARTNER_ERROR', error: msg(lang, 'partner_error') })
}

function sendRpcError(res, lang, error, context) {
  const mapped = RPC_ERRORS[error?.message]
  if (!mapped) return partnerError(res, lang, `${context}_rpc_failed`, error?.code)
  const body = { success: false, code: mapped.code, error: msg(lang, mapped.key) }
  if (mapped.field) body.field = mapped.field
  return res.status(mapped.status).json(body)
}

function notFound(res, lang) {
  return res.status(404).json({ success: false, code: 'DOSSIER_NOT_FOUND', error: msg(lang, 'dossier_not_found') })
}

export function createPartnerRouter({
  requireAuth,
  invitationSender,
  appUrl,
  supportEmail,
  rpcSecret,
  generateInviteToken = defaultGenerateInviteToken,
  hashInviteToken = defaultHashInviteToken,
}) {
  const router = Router()
  const baseUrl = String(appUrl ?? '').replace(/\/+$/, '')
  const activationUrlFor = (token) => `${baseUrl}/activation#t=${token}`

  const activationsSwitch = killSwitch('PARTNER_ACTIVATIONS_ENABLED', {
    code: 'PARTNER_ACTIVATIONS_DISABLED',
    messageKey: 'partner_activations_disabled',
  })

  // Contrat §3.4 / §4.4 : création et renvoi sont les 2 seules RPC où l'APPELANT choisit le hash du
  // jeton d'activation. Elles exigent le secret partagé webhook_config, que seul ce serveur détient —
  // sans quoi une PF les appellerait en direct via PostgREST, choisirait un jeton qu'elle connaît et
  // prendrait le compte de la famille. Absent → fail-closed 500, AVANT tout appel base et tout e-mail.
  function requireRpcSecret(req, res, next) {
    if (typeof rpcSecret === 'string' && rpcSecret.length > 0) return next()
    return partnerError(res, reqLang(req), 'rpc_secret_missing', null)
  }
  const createLimiter = createUserRateLimiter({ max: 30, windowMs: 60 * 60 * 1000, message: (req) => msg(reqLang(req), 'too_many_requests') })
  const resendLimiter = createUserRateLimiter({ max: 20, windowMs: 60 * 60 * 1000, message: (req) => msg(reqLang(req), 'too_many_requests') })

  /** Envoi best effort : le dossier existe déjà, un échec d'e-mail ne l'annule pas (email_sent:false). */
  async function deliverInvitation({ dossier, partnerName, token, lang }) {
    try {
      await invitationSender.send({
        to: dossier.family_email,
        lang,
        partnerName,
        familyFirstName: dossier.family_first_name,
        activationUrl: activationUrlFor(token),
        expiresAt: dossier.invite_expires_at,
        supportEmail,
      })
      return true
    } catch (error) {
      const reason = error?.message === 'email_not_configured' ? 'email_not_configured' : 'invitation_send_failed'
      console.error(`❌ partner/invitation : ${reason}`)
      // Erreur NEUVE : l'originale peut porter l'adresse ou l'URL (message du fournisseur).
      Sentry.captureException(new Error(reason))
      return false
    }
  }

  function successPayload({ dossier, partnerName, emailSent, token }) {
    const payload = { success: true, dossier, partner_name: partnerName, email_sent: emailSent }
    if (flagOn('SHOW_ACTIVATION_LINK')) payload.activation_url = activationUrlFor(token)
    return payload
  }

  router.get('/dossiers', requireAuth, async (req, res) => {
    const lang = reqLang(req)
    try {
      const { data, error } = await req.supabaseClient.rpc('partner_list_dossiers')
      if (error) return sendRpcError(res, lang, error, 'list')
      if (!data) return res.status(403).json({ success: false, code: 'NOT_A_PARTNER', error: msg(lang, 'not_a_partner') })
      return res.json({ success: true, partner: data.partner, dossiers: data.dossiers ?? [] })
    } catch (error) {
      return partnerError(res, lang, 'list_exception', error?.code)
    }
  })

  router.post('/dossiers', requireAuth, activationsSwitch, requireRpcSecret, createLimiter, async (req, res) => {
    const lang = reqLang(req)
    const body = req.body ?? {}
    const text = (value) => (typeof value === 'string' ? value : null)
    if (typeof body.deceased_death_date !== 'string' || !DATE_RE.test(body.deceased_death_date)) {
      return res.status(400).json({ success: false, code: 'INVALID_INPUT', field: 'death_date', error: msg(lang, 'invalid_input') })
    }

    const token = generateInviteToken()
    let result
    try {
      const { data, error } = await req.supabaseClient.rpc('partner_create_dossier', {
        p_secret: rpcSecret,
        p_family_first_name: text(body.family_first_name),
        p_family_last_name: text(body.family_last_name),
        p_family_email: text(body.family_email),
        p_family_phone: text(body.family_phone),
        p_deceased_first_name: text(body.deceased_first_name),
        p_deceased_last_name: text(body.deceased_last_name),
        p_deceased_death_date: body.deceased_death_date,
        p_token_hash: hashInviteToken(token),
        p_confirm_duplicate: body.confirm_duplicate === true,
      })
      if (error) return sendRpcError(res, lang, error, 'create')
      result = data
    } catch (error) {
      return partnerError(res, lang, 'create_exception', error?.code)
    }

    if (result?.duplicate_warning) {
      return res.status(409).json({
        success: false, code: 'DUPLICATE_DECEASED', error: msg(lang, 'duplicate_deceased'),
        duplicate_count: result.duplicate_count ?? 1,
      })
    }
    if (!result?.created || !result.dossier) return partnerError(res, lang, 'create_unexpected_result', null)

    const emailSent = await deliverInvitation({ dossier: result.dossier, partnerName: result.partner_name, token, lang })
    return res.status(201).json(successPayload({ dossier: result.dossier, partnerName: result.partner_name, emailSent, token }))
  })

  router.post('/dossiers/:id/resend', requireAuth, activationsSwitch, requireRpcSecret, resendLimiter, async (req, res) => {
    const lang = reqLang(req)
    if (!UUID_RE.test(req.params.id)) return notFound(res, lang)
    const token = generateInviteToken()
    let result
    try {
      const { data, error } = await req.supabaseClient.rpc('partner_rotate_invitation', {
        p_secret: rpcSecret,
        p_dossier_id: req.params.id,
        p_token_hash: hashInviteToken(token),
      })
      if (error) return sendRpcError(res, lang, error, 'resend')
      result = data
    } catch (error) {
      return partnerError(res, lang, 'resend_exception', error?.code)
    }
    if (!result?.rotated || !result.dossier) return partnerError(res, lang, 'resend_unexpected_result', null)

    const emailSent = await deliverInvitation({ dossier: result.dossier, partnerName: result.partner_name, token, lang })
    return res.json(successPayload({ dossier: result.dossier, partnerName: result.partner_name, emailSent, token }))
  })

  router.post('/dossiers/:id/cancel', requireAuth, async (req, res) => {
    const lang = reqLang(req)
    if (!UUID_RE.test(req.params.id)) return notFound(res, lang)
    try {
      const { data, error } = await req.supabaseClient.rpc('partner_cancel_dossier', { p_dossier_id: req.params.id })
      if (error) return sendRpcError(res, lang, error, 'cancel')
      if (!data?.dossier) return partnerError(res, lang, 'cancel_unexpected_result', null)
      return res.json({ success: true, dossier: data.dossier, already_cancelled: Boolean(data.already_cancelled) })
    } catch (error) {
      return partnerError(res, lang, 'cancel_exception', error?.code)
    }
  })

  router.get('/counters', requireAuth, async (req, res) => {
    const lang = reqLang(req)
    try {
      const { data, error } = await req.supabaseClient.rpc('partner_month_counters')
      if (error) return sendRpcError(res, lang, error, 'counters')
      if (!data) return res.status(403).json({ success: false, code: 'NOT_A_PARTNER', error: msg(lang, 'not_a_partner') })
      const counters = flagOn('PARTNER_BILLING_PREVIEW') ? data : { ...data, billing_preview: null }
      return res.json({ success: true, counters })
    } catch (error) {
      return partnerError(res, lang, 'counters_exception', error?.code)
    }
  })

  return router
}
```

- [ ] **17.4** Vérifier : `npx vitest run tests/partner-routes.test.ts` → `0 failed`.
- [ ] **17.5** Commit : `feat(v2-l2b): routes partenaire — créer/renvoyer (hash seul en base, invitation best effort), annuler, lister, compteurs (billing_preview sous flag)`.

### Task 18 : `server/routes/activation.js`

**Niveau de revue :** double.
**Files:**
- Create: `server/routes/activation.js`
- Test: `tests/activation-routes.test.ts`

- [ ] **18.1** Test qui échoue, `tests/activation-routes.test.ts` :

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@sentry/node', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import express from 'express'
import request from 'supertest'
// @ts-expect-error — module JS serveur
import { createActivationRouter } from '../server/routes/activation.js'

const HASH = 'ea866a757e4c38babfa8127cbe9a409d3e1f93a00ff1488ff735fcf917afffd0'
const TOKEN = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'
const PREVIEW = { valid: true, email: 'claire.martin@exemple.fr', partner_name: 'Pompes Funèbres Démo',
  family_first_name: 'Claire', deceased_first_name: 'Jean', expires_at: '2026-09-23T08:00:00Z' }

type RpcResult = { data?: unknown; error?: { message: string; code?: string } | null }
function client(result: RpcResult) {
  return { rpc: vi.fn(async () => result) }
}
function makeApp({ publicClient = client({ data: PREVIEW, error: null }), userClient = client({ data: null, error: null }) } = {}) {
  const app = express()
  app.set('trust proxy', 1)
  app.use(express.json())
  app.use('/api/activation', createActivationRouter({
    requireAuth: (req: express.Request & { user?: unknown; supabaseClient?: unknown }, res: express.Response, next: express.NextFunction) => {
      if (!req.headers.authorization) return res.status(401).json({ success: false, code: 'AUTH_REQUIRED' })
      req.user = { id: 'famille-1' }
      req.supabaseClient = userClient
      next()
    },
    publicClient,
    supportEmail: 'support@seren-app.fr',
  }))
  return { app, publicClient, userClient }
}

afterEach(() => {
  delete process.env.PARTNER_ACTIVATIONS_ENABLED
  vi.restoreAllMocks()
})

describe('POST /api/activation/check (public)', () => {
  it('flag fermé : 503 PARTNER_ACTIVATIONS_DISABLED sans appel base', async () => {
    const { app, publicClient } = makeApp()
    const res = await request(app).post('/api/activation/check').send({ token_hash: HASH })
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('PARTNER_ACTIVATIONS_DISABLED')
    expect(publicClient.rpc).not.toHaveBeenCalled()
  })
  it.each([[TOKEN], [HASH.toUpperCase()], [HASH.slice(1)], [undefined], [42]])('hash hors motif (%s) : 400 INVALID_TOKEN sans appel base', async (value) => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const { app, publicClient } = makeApp()
    const res = await request(app).post('/api/activation/check').send({ token_hash: value })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_TOKEN')
    expect(publicClient.rpc).not.toHaveBeenCalled()
  })
  it('valide : invitation_preview via le client PUBLIC, 200 forme exacte, jamais le hash en retour', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const { app, publicClient } = makeApp()
    const res = await request(app).post('/api/activation/check').send({ token_hash: HASH, lang: 'fr' })
    expect(res.status).toBe(200)
    expect(publicClient.rpc).toHaveBeenCalledWith('invitation_preview', { p_token_hash: HASH })
    expect(res.body).toEqual({
      success: true,
      invitation: { email: 'claire.martin@exemple.fr', partner_name: 'Pompes Funèbres Démo', family_first_name: 'Claire',
        deceased_first_name: 'Jean', expires_at: '2026-09-23T08:00:00Z' },
      support_email: 'support@seren-app.fr',
    })
    expect(JSON.stringify(res.body)).not.toContain(HASH)
  })
  it('expirée : 410 INVITATION_EXPIRED + partner_name + support_email', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const { app } = makeApp({ publicClient: client({ data: { valid: false, reason: 'expired', partner_name: 'PF Démo' }, error: null }) })
    const res = await request(app).post('/api/activation/check').send({ token_hash: HASH })
    expect(res.status).toBe(410)
    expect(res.body).toMatchObject({ success: false, code: 'INVITATION_EXPIRED', partner_name: 'PF Démo', support_email: 'support@seren-app.fr' })
  })
  it('invalide : 404 INVITATION_INVALID', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const { app } = makeApp({ publicClient: client({ data: { valid: false, reason: 'invalid' }, error: null }) })
    expect((await request(app).post('/api/activation/check').send({ token_hash: HASH })).body.code).toBe('INVITATION_INVALID')
  })
  it('RPC en erreur : 500 ACTIVATION_ERROR', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const { app } = makeApp({ publicClient: client({ data: null, error: { message: 'boom', code: 'XX000' } }) })
    expect((await request(app).post('/api/activation/check').send({ token_hash: HASH })).status).toBe(500)
  })
  it('limite par IP : 31e appel en 10 min → 429 ; une autre IP (X-Forwarded-For) passe', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const { app } = makeApp()
    for (let i = 0; i < 30; i++) {
      expect((await request(app).post('/api/activation/check').set('X-Forwarded-For', '203.0.113.7').send({ token_hash: HASH })).status).toBe(200)
    }
    expect((await request(app).post('/api/activation/check').set('X-Forwarded-For', '203.0.113.7').send({ token_hash: HASH })).status).toBe(429)
    expect((await request(app).post('/api/activation/check').set('X-Forwarded-For', '198.51.100.9').send({ token_hash: HASH })).status).toBe(200)
  })
  it('aucun console.* n’émet le hash, même en erreur', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const logs: string[] = []
    for (const level of ['log', 'info', 'warn', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { logs.push(args.map((a) => String(a instanceof Error ? a.message : JSON.stringify(a))).join(' ')) })
    }
    const { app } = makeApp({ publicClient: client({ data: null, error: { message: `boom ${HASH}`, code: 'XX000' } }) })
    await request(app).post('/api/activation/check').send({ token_hash: HASH })
    expect(logs.join('\n')).not.toContain(HASH)
  })
})

describe('POST /api/activation/claim', () => {
  it('sans Bearer : 401 avant toute chose', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    expect((await request(makeApp().app).post('/api/activation/claim').send({ token_hash: HASH })).status).toBe(401)
  })
  it('flag fermé : 503', async () => {
    const { app, userClient } = makeApp()
    expect((await request(app).post('/api/activation/claim').set('Authorization', 'Bearer x').send({ token_hash: HASH })).status).toBe(503)
    expect(userClient.rpc).not.toHaveBeenCalled()
  })
  it('hash invalide : 400 INVALID_TOKEN sans appel base', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const { app, userClient } = makeApp()
    expect((await request(app).post('/api/activation/claim').set('Authorization', 'Bearer x').send({ token_hash: TOKEN })).status).toBe(400)
    expect(userClient.rpc).not.toHaveBeenCalled()
  })
  it('claim : claim_dossier via le client UTILISATEUR, 200 forme exacte', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const userClient = client({ data: { claimed: true, already_active: false, dossier_id: 'd-1', partner_name: 'PF Démo' }, error: null })
    const { app, publicClient } = makeApp({ userClient })
    const res = await request(app).post('/api/activation/claim').set('Authorization', 'Bearer x').send({ token_hash: HASH })
    expect(res.status).toBe(200)
    expect(userClient.rpc).toHaveBeenCalledWith('claim_dossier', { p_token_hash: HASH })
    expect(publicClient.rpc).not.toHaveBeenCalled()
    expect(res.body).toEqual({ success: true, claimed: true, already_active: false, dossier_id: 'd-1', partner_name: 'PF Démo' })
  })
  it('rejeu idempotent : 200 already_active true, sans partner_name', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const { app } = makeApp({ userClient: client({ data: { claimed: false, already_active: true, dossier_id: 'd-1' }, error: null }) })
    const res = await request(app).post('/api/activation/claim').set('Authorization', 'Bearer x').send({ token_hash: HASH })
    expect(res.body).toEqual({ success: true, claimed: false, already_active: true, dossier_id: 'd-1' })
  })
  it.each([
    ['invalid_token', 404, 'INVITATION_INVALID'],
    ['invitation_expired', 410, 'INVITATION_EXPIRED'],
    ['email_mismatch', 403, 'EMAIL_MISMATCH'],
    ['account_role_forbidden', 403, 'ACCOUNT_ROLE_FORBIDDEN'],
    ['account_already_linked', 409, 'ACCOUNT_ALREADY_LINKED'],
    ['not_authenticated', 500, 'ACTIVATION_ERROR'],
  ])('erreur SQL %s → %i %s', async (sqlCode, status, code) => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const { app } = makeApp({ userClient: client({ data: null, error: { message: sqlCode, code: 'P0001' } }) })
    const res = await request(app).post('/api/activation/claim').set('Authorization', 'Bearer x').send({ token_hash: HASH })
    expect(res.status).toBe(status)
    expect(res.body.code).toBe(code)
  })
})
```

- [ ] **18.2** Vérifier l'échec : `npx vitest run tests/activation-routes.test.ts` → échec d'import.
- [ ] **18.3** Créer `server/routes/activation.js` :

```js
// Activation famille (contrat §4.5, §7.3). Le navigateur n'envoie JAMAIS le jeton : seulement son
// sha256 hex (le fragment #t= ne quitte pas le poste). `check` est PUBLIC (client publishable, rôle
// anon → RPC invitation_preview, limite par IP) ; `claim` exige la session créée par signUp (client
// au token → RPC claim_dossier, qui écrit le pont purchases). Corps jamais journalisé.
import { Router } from 'express'
import * as Sentry from '@sentry/node'
import { msg } from '../lib/messages.js'
import { killSwitch } from '../lib/flags.js'
import { createIpRateLimiter } from '../lib/rate-limit.js'
import { isTokenHash } from '../lib/invite-token.js'

function reqLang(req) {
  return req.body?.lang === 'en' || req.query?.lang === 'en' ? 'en' : 'fr'
}

const CLAIM_ERRORS = {
  invalid_token: { status: 404, code: 'INVITATION_INVALID', key: 'invitation_invalid' },
  invitation_expired: { status: 410, code: 'INVITATION_EXPIRED', key: 'invitation_expired' },
  email_mismatch: { status: 403, code: 'EMAIL_MISMATCH', key: 'email_mismatch' },
  account_role_forbidden: { status: 403, code: 'ACCOUNT_ROLE_FORBIDDEN', key: 'account_role_forbidden' },
  account_already_linked: { status: 409, code: 'ACCOUNT_ALREADY_LINKED', key: 'account_already_linked' },
}

function activationError(res, lang, reason, pgCode) {
  console.error(`❌ activation : ${reason} (${pgCode ?? 'sans code'})`)
  Sentry.captureException(new Error(`activation_${reason}`), { tags: { pg_code: pgCode ?? 'unknown' } })
  return res.status(500).json({ success: false, code: 'ACTIVATION_ERROR', error: msg(lang, 'activation_error') })
}

function invalidToken(res, lang) {
  return res.status(400).json({ success: false, code: 'INVALID_TOKEN', error: msg(lang, 'invalid_token') })
}

export function createActivationRouter({ requireAuth, publicClient, supportEmail }) {
  const router = Router()
  const activationsSwitch = killSwitch('PARTNER_ACTIVATIONS_ENABLED', {
    code: 'PARTNER_ACTIVATIONS_DISABLED',
    messageKey: 'partner_activations_disabled',
  })
  const ipLimiter = createIpRateLimiter({ max: 30, windowMs: 10 * 60 * 1000, message: (req) => msg(reqLang(req), 'too_many_requests') })

  router.post('/check', activationsSwitch, ipLimiter, async (req, res) => {
    const lang = reqLang(req)
    const tokenHash = req.body?.token_hash
    if (!isTokenHash(tokenHash)) return invalidToken(res, lang)
    try {
      const { data, error } = await publicClient.rpc('invitation_preview', { p_token_hash: tokenHash })
      if (error) return activationError(res, lang, 'check_rpc_failed', error.code)
      if (data?.valid === true) {
        return res.json({
          success: true,
          invitation: {
            email: data.email,
            partner_name: data.partner_name ?? null,
            family_first_name: data.family_first_name ?? null,
            deceased_first_name: data.deceased_first_name ?? null,
            expires_at: data.expires_at,
          },
          support_email: supportEmail,
        })
      }
      if (data?.reason === 'expired') {
        return res.status(410).json({
          success: false, code: 'INVITATION_EXPIRED', error: msg(lang, 'invitation_expired'),
          partner_name: data.partner_name ?? null, support_email: supportEmail,
        })
      }
      return res.status(404).json({ success: false, code: 'INVITATION_INVALID', error: msg(lang, 'invitation_invalid') })
    } catch (error) {
      return activationError(res, lang, 'check_exception', error?.code)
    }
  })

  router.post('/claim', requireAuth, activationsSwitch, async (req, res) => {
    const lang = reqLang(req)
    const tokenHash = req.body?.token_hash
    if (!isTokenHash(tokenHash)) return invalidToken(res, lang)
    try {
      const { data, error } = await req.supabaseClient.rpc('claim_dossier', { p_token_hash: tokenHash })
      if (error) {
        const mapped = CLAIM_ERRORS[error.message]
        if (!mapped) return activationError(res, lang, 'claim_rpc_failed', error.code)
        return res.status(mapped.status).json({ success: false, code: mapped.code, error: msg(lang, mapped.key) })
      }
      const payload = {
        success: true,
        claimed: Boolean(data?.claimed),
        already_active: Boolean(data?.already_active),
        dossier_id: data?.dossier_id ?? null,
      }
      if (data && Object.prototype.hasOwnProperty.call(data, 'partner_name')) payload.partner_name = data.partner_name
      return res.json(payload)
    } catch (error) {
      return activationError(res, lang, 'claim_exception', error?.code)
    }
  })

  return router
}
```

- [ ] **18.4** Vérifier : `npx vitest run tests/activation-routes.test.ts` → `0 failed`.
- [ ] **18.5** Commit : `feat(v2-l2b): routes d'activation — check public (hash seul, limite par IP), claim au token (codes SQL mappés)`.

### Task 19 : Montage aux ancres de `server.js` + boot check

**Niveau de revue :** double.
**Files:**
- Modify: `server/server.js` (imports en tête ; `app.use` juste avant `// v2:mount-partner` et `// v2:mount-activation`)

- [ ] **19.1** Imports en tête de `server/server.js` :

```js
import { createPartnerRouter } from './routes/partner.js';
import { createActivationRouter } from './routes/activation.js';
import { createInvitationSender } from './lib/invitation-email.js';
import { generateInviteToken, hashInviteToken } from './lib/invite-token.js';
```

- [ ] **19.2** Juste avant `// v2:mount-partner` :

```js
// Espace partenaire PF (lot L2b) : comptes PF uniquement (la RPC refuse tout autre compte), non gaté
// par le dossier famille. Invitation Resend indépendante d'EMAIL_SENDS_ENABLED.
app.use('/api/partner', createPartnerRouter({
  requireAuth,
  invitationSender: createInvitationSender({ resendClient, from: process.env.RESEND_FROM }),
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  supportEmail: process.env.SUPPORT_EMAIL || 'support@seren-app.fr',
  // Secret partagé webhook_config : sans lui, création et renvoi répondent 500 (contrat §3.4, §4.4).
  // Aucune valeur par défaut : mieux vaut une création fermée qu'une création contournable.
  rpcSecret: process.env.WEBHOOK_RPC_SECRET,
  generateInviteToken,
  hashInviteToken,
}));
```

Juste avant `// v2:mount-activation` :

```js
// Activation famille (lot L2b) : check public (client publishable), claim au token utilisateur.
app.use('/api/activation', createActivationRouter({
  requireAuth,
  publicClient: supabase,
  supportEmail: process.env.SUPPORT_EMAIL || 'support@seren-app.fr',
}));
```

- [ ] **19.3** Gate R3 → vert.
- [ ] **19.4** Boot check :

```bash
(PORT=3998 SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_dummy node server/server.js > "${TMPDIR:-/tmp}/seren-boot-l2b.log" 2>&1 &) \
  && curl -s --retry 15 --retry-connrefused --retry-delay 1 -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3998/api/health \
  && curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' -d '{"token_hash":"x"}' http://127.0.0.1:3998/api/activation/check \
  && curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3998/api/partner/dossiers; lsof -ti tcp:3998 | xargs kill
```

Attendu : `200`, `503` (flag absent), `401`.
- [ ] **19.5** Commit : `feat(v2-l2b): montage des routes partenaire et activation aux ancres v2`.

---

## Lot L3 — Front famille : activation, consentement, garde d'accès, pages bêta

Revue : sous-lot plancher et pages en **revue unique** ; jeton (Tasks 21, 23) et garde (Task 22) en **double revue** (ordre dans `main.tsx`, scrub, fail-closed de la garde). Branche `feature/v2-l3`. Pas de harnais de rendu React : les parties logiques sont extraites en fonctions pures testées ; le rendu se vérifie par `tsc`, `build` et la recette L8 (Task 41).

### Task 20 : Retrait du paywall forfait et fermeture de `/signup` (sous-lot PLANCHER)

**Niveau de revue :** unique.
**Files:**
- Modify: `src/components/letter/LetterSendPanel.tsx:6,8,39-43,73-77,103-118,157-182`
- Modify: `src/hooks/usePayments.ts:118-141,165-170`
- Modify: `src/components/payments/CheckoutReturnBanner.tsx` (réduit au nettoyage d'URL)
- Modify: `src/App.tsx:1,11,59`
- Modify: `src/pages/LoginPage.tsx:129-135`
- Modify: `src/lib/auth.ts:3-12` (suppression de `signUp`)
- Delete: `src/pages/SignupPage.tsx`, `src/components/auth/CGUCheckbox.tsx`
- Modify: `src/i18n/strings.fr.ts`, `src/i18n/strings.en.ts` (namespace `payments` supprimé ; `auth.login.noAccount`, `auth.login.createAccount`, `auth.signup`, `auth.cgu` supprimés ; namespace neuf `access` avant `// v2:ns-l3`)

- [ ] **20.1** État de départ à constater (échec attendu du contrôle final) :

```bash
grep -rn "paywallTitle\|startCheckout\|SignupPage\|CGUCheckbox\|to=\"/signup\"\|t\.payments\." src
```

Attendu AVANT : plusieurs lignes (LetterSendPanel, usePayments, App, LoginPage, CheckoutReturnBanner).

- [ ] **20.2** `LetterSendPanel.tsx` : supprimer l'import `Lock` et `usePayments, formatPrice` ; supprimer `const { loading: paymentsLoading, … } = usePayments()`, les états `opening`/`checkoutError`, `handleUnlock` et le bloc `if (paymentsEnabled && !hasPaid) { … }` ; `const canSend = isComplete && emailValid && !sending` ; commentaire des props (l.39-43) : « Canal du template : 'email' rend le bloc historique 1 clic ; 'papier' délègue à PaperSendPanel. Aucun paywall en v2 : l'accès est vérifié côté serveur (gate dossier actif). ».
- [ ] **20.3** `usePayments.ts` : supprimer `startCheckout` (l.118-141) et sa présence dans l'objet retourné ; mettre à jour le commentaire d'en-tête (« État du mini-paiement « envoi supplémentaire » ; forfait famille abandonné en v2 »).
- [ ] **20.4** `CheckoutReturnBanner.tsx` devient :

```tsx
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { clearPendingPaperSend } from '@/lib/paper-send-resume'

// Retour de Stripe Checkout (v2) : le forfait famille est abandonné, il ne reste que le retour du
// mini-paiement `extra_success`, consommé par PaperSendPanel. Ce composant toujours monté ne fait
// plus que nettoyer l'URL (et purger une reprise papier devenue stale hors `extra_success`).
export function CheckoutReturnBanner() {
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    const checkoutParam = searchParams.get('checkout')
    if (!checkoutParam) return
    if (checkoutParam !== 'extra_success') clearPendingPaperSend()
    const next = new URLSearchParams(searchParams)
    next.delete('checkout')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  return null
}
```

- [ ] **20.5** `App.tsx` : `import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'` ; supprimer `import { SignupPage } …` ; l.59 : `<Route path="/signup" element={<Navigate to="/login" replace />} />`.
- [ ] **20.6** `LoginPage.tsx` l.129-135 : remplacer le paragraphe « Pas encore de compte ? Créer un compte » par `<p>{t.access.loginNoAccount}</p>`.
- [ ] **20.7** `src/lib/auth.ts` : supprimer la fonction `signUp` (seule consommatrice : `SignupPage`, supprimée) ; `git rm src/pages/SignupPage.tsx src/components/auth/CGUCheckbox.tsx`.
- [ ] **20.8** i18n (FR puis EN, même forme) : supprimer le namespace `payments` entier ; dans `auth.login`, supprimer `noAccount` et `createAccount` ; supprimer `auth.signup` et `auth.cgu` ; insérer juste avant `// v2:ns-l3` :

```ts
// strings.fr.ts
  access: {
    loginNoAccount: 'Votre accès vous est ouvert par votre pompe funèbre.',
    notActivatedTitle: 'Votre accès n’est pas encore activé',
    notActivatedBody:
      'Seren est proposé par les pompes funèbres partenaires. Si vous avez reçu une invitation, ouvrez le lien de l’e-mail. Sinon, contactez votre pompe funèbre ou le support.',
    supportLine: 'Support : {email}',
    signOut: 'Se déconnecter',
    backToLogin: 'Retour à la connexion',
  },
// strings.en.ts
  access: {
    loginNoAccount: 'Your access is opened for you by your funeral home.',
    notActivatedTitle: 'Your access is not activated yet',
    notActivatedBody:
      'Seren is offered by partner funeral homes. If you received an invitation, open the link in the email. Otherwise, contact your funeral home or support.',
    supportLine: 'Support: {email}',
    signOut: 'Sign out',
    backToLogin: 'Back to sign in',
  },
```

- [ ] **20.9** Vérifier : la commande de 20.1 ne renvoie plus rien ; gate R3 vert (tsc confirme qu'aucune clé supprimée n'est encore lue).
- [ ] **20.10** Commit : `feat(v2-l3-plancher): paywall forfait retiré, /signup redirigé vers /login, lien d'inscription remplacé`.

### Task 21 : Capture du jeton avant toute initialisation, hash WebCrypto, scrub Sentry front

**Niveau de revue :** double.
**Files:**
- Create: `src/lib/activation-fragment.ts`, `src/lib/activation-token.ts`
- Modify: `src/main.tsx:1-12`, `src/lib/sentry.ts`
- Test: `tests/activation-fragment.test.ts`, `tests/activation-token.test.ts`

- [ ] **21.1** Tests qui échouent.

`tests/activation-fragment.test.ts` :

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  captureActivationFragment, getActivationToken, clearActivationToken, scrubActivationFragment,
} from '@/lib/activation-fragment'

const TOKEN = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'

function stubWindow(hash: string, pathname = '/activation', search = '') {
  const replaceState = vi.fn()
  vi.stubGlobal('window', { location: { hash, pathname, search }, history: { state: { key: 'k' }, replaceState } })
  return replaceState
}

beforeEach(() => clearActivationToken())
afterEach(() => vi.unstubAllGlobals())

describe('captureActivationFragment', () => {
  it('jeton valide : mémorisé, fragment effacé (state conservé, chemin + query conservés)', () => {
    const replaceState = stubWindow(`#t=${TOKEN}`, '/activation', '?lang=fr')
    captureActivationFragment()
    expect(getActivationToken()).toBe(TOKEN)
    expect(replaceState).toHaveBeenCalledWith({ key: 'k' }, '', '/activation?lang=fr')
  })
  it.each([['#t=trop-court'], ['#t=' + TOKEN + 'X'], ['#t=' + '+'.repeat(43)], ['#t=']])('fragment #t= invalide (%s) : rien mémorisé, MAIS toujours effacé', (hash) => {
    const replaceState = stubWindow(hash)
    captureActivationFragment()
    expect(getActivationToken()).toBeNull()
    expect(replaceState).toHaveBeenCalledTimes(1)
  })
  it('autre fragment (#section) : ni mémorisé ni effacé', () => {
    const replaceState = stubWindow('#section')
    captureActivationFragment()
    expect(getActivationToken()).toBeNull()
    expect(replaceState).not.toHaveBeenCalled()
  })
  it('lecture non destructive (StrictMode) puis clearActivationToken', () => {
    stubWindow(`#t=${TOKEN}`)
    captureActivationFragment()
    expect(getActivationToken()).toBe(TOKEN)
    expect(getActivationToken()).toBe(TOKEN)
    clearActivationToken()
    expect(getActivationToken()).toBeNull()
  })
  it('sans window (SSR/tests) : aucune exception', () => {
    vi.stubGlobal('window', undefined)
    expect(() => captureActivationFragment()).not.toThrow()
  })
})

describe('scrubActivationFragment', () => {
  it('remplace tout #t=… par #t=[scrubbed]', () => {
    expect(scrubActivationFragment(`https://app.seren-app.fr/activation#t=${TOKEN} puis #t=abc`))
      .toBe('https://app.seren-app.fr/activation#t=[scrubbed] puis #t=[scrubbed]')
  })
})

describe('src/main.tsx — ordre contractuel (§6)', () => {
  const source = readFileSync(path.join(process.cwd(), 'src/main.tsx'), 'utf8')
  it('captureActivationFragment() est la PREMIÈRE instruction, avant initSentry() et initPosthog()', () => {
    const body = source.split('\n').filter((line) => line.trim() && !line.trim().startsWith('import') && !line.trim().startsWith('//'))
    expect(body[0].trim()).toBe('captureActivationFragment()')
    expect(source.indexOf('captureActivationFragment()')).toBeLessThan(source.indexOf('initSentry()'))
    expect(source.indexOf('initSentry()')).toBeLessThan(source.indexOf('initPosthog()'))
  })
})

describe('src/lib/sentry.ts — scrub branché', () => {
  it('beforeSend et beforeBreadcrumb utilisent scrubActivationFragment', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/lib/sentry.ts'), 'utf8')
    expect(source).toMatch(/beforeSend\(/)
    expect(source).toMatch(/beforeBreadcrumb\(/)
    expect(source.match(/scrubActivationFragment\(/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
  })
})
```

`tests/activation-token.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { sha256Hex } from '@/lib/activation-token'

type Vector = { token: string; hash: string }
const VECTORS: Vector[] = JSON.parse(readFileSync(path.join(process.cwd(), 'tests/fixtures/invite-token-vector.json'), 'utf8'))

describe('sha256Hex (WebCrypto) — identique au hash Node du serveur', () => {
  it.each(VECTORS)('$token → $hash', async ({ token, hash }) => {
    await expect(sha256Hex(token)).resolves.toBe(hash)
  })
  it('hexadécimal minuscule de 64 caractères', async () => {
    expect(await sha256Hex('x')).toMatch(/^[0-9a-f]{64}$/)
  })
})
```

- [ ] **21.2** Vérifier l'échec : `npx vitest run tests/activation-fragment.test.ts tests/activation-token.test.ts` → échecs d'import.
- [ ] **21.3** Créer `src/lib/activation-fragment.ts` :

```ts
// Jeton d'activation famille (contrat §6). Transporté dans le FRAGMENT (#t=…) : jamais envoyé au
// serveur par le navigateur, jamais présent dans un Referer. Capturé et effacé de l'URL par la
// PREMIÈRE instruction de main.tsx, avant Sentry, PostHog et React Router : aucun outil tiers ne
// le voit. Gardé en mémoire de module uniquement (jamais localStorage, sessionStorage ni cookie).
const FRAGMENT_PREFIX = '#t='
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
const SCRUB_RE = /#t=[A-Za-z0-9_-]+/g

let activationToken: string | null = null

export function captureActivationFragment(): void {
  if (typeof window === 'undefined' || !window.location) return
  const { hash, pathname, search } = window.location
  if (!hash.startsWith(FRAGMENT_PREFIX)) return
  const candidate = hash.slice(FRAGMENT_PREFIX.length)
  if (TOKEN_RE.test(candidate)) activationToken = candidate
  // TOUJOURS effacer, même un fragment invalide : il ne doit atteindre aucun outil tiers.
  window.history.replaceState(window.history.state, '', pathname + search)
}

/** Lecture NON destructive (compatible double montage StrictMode). */
export function getActivationToken(): string | null {
  return activationToken
}

export function clearActivationToken(): void {
  activationToken = null
}

/** Masque tout fragment d'activation dans une chaîne (URL, message) — utilisé par Sentry. */
export function scrubActivationFragment(value: string): string {
  return value.replace(SCRUB_RE, '#t=[scrubbed]')
}
```

- [ ] **21.4** Créer `src/lib/activation-token.ts` :

```ts
// Hash du jeton d'activation côté navigateur (contrat §6) : sha256 des octets UTF-8 de la chaîne
// base64url, en hexadécimal minuscule — strictement identique à hashInviteToken (Node).
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
```

- [ ] **21.5** `src/main.tsx` :

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { captureActivationFragment } from '@/lib/activation-fragment'
import App from './App'
import { initSentry } from '@/lib/sentry'
import { initPosthog } from '@/lib/posthog'
import './index.css'

captureActivationFragment()

// Initialiser Sentry (no-op sans VITE_SENTRY_DSN)
initSentry()

// Initialiser PostHog (opt-out par defaut, RGPD-compliant)
initPosthog()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

(le commentaire explicatif de la capture est placé dans `activation-fragment.ts` : la première ligne non-import non-commentaire du corps doit être l'appel, cf. test.)
- [ ] **21.6** `src/lib/sentry.ts` :

```ts
import * as Sentry from '@sentry/react'
import { scrubActivationFragment } from '@/lib/activation-fragment'

// Sentry front : erreurs uniquement, inerte sans VITE_SENTRY_DSN (pattern Resend).
// RGPD : pas de tracing, pas de replay, pas de user context, pas de PII par défaut. Le fragment
// d'activation (#t=…) est masqué dans les URL, messages et breadcrumbs de navigation (§6).
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request?.url) event.request.url = scrubActivationFragment(event.request.url)
      if (typeof event.message === 'string') event.message = scrubActivationFragment(event.message)
      for (const exception of event.exception?.values ?? []) {
        if (typeof exception.value === 'string') exception.value = scrubActivationFragment(exception.value)
      }
      return event
    },
    beforeBreadcrumb(breadcrumb) {
      const data = breadcrumb.data
      if (data) {
        for (const key of ['url', 'to', 'from']) {
          if (typeof data[key] === 'string') data[key] = scrubActivationFragment(data[key])
        }
      }
      if (typeof breadcrumb.message === 'string') breadcrumb.message = scrubActivationFragment(breadcrumb.message)
      return breadcrumb
    },
  })
}
```

- [ ] **21.7** Vérifier : `npx vitest run tests/activation-fragment.test.ts tests/activation-token.test.ts` → `0 failed` ; gate R3 vert.
- [ ] **21.8** Commit : `feat(v2-l3): jeton d'activation capturé et effacé avant Sentry/PostHog, hash WebCrypto (vecteurs partagés), scrub Sentry front`.

### Task 22 : Garde d'accès — `resolveAccessRedirect`, `RequireAccess`, écran « accès non activé »

**Niveau de revue :** double.
**Files:**
- Create: `src/lib/access-redirect.ts`, `src/components/auth/RequireAccess.tsx`, `src/components/auth/AccessNotActivatedScreen.tsx`
- Modify: `src/hooks/useAuth.ts:5,49`, `src/App.tsx:71-77`
- Test: `tests/access-redirect.test.ts`

- [ ] **22.1** Test qui échoue, `tests/access-redirect.test.ts` (table §7.2 exhaustive) :

```ts
import { describe, it, expect } from 'vitest'
import { resolveAccessRedirect, type AccessArea, type AccessDecision } from '@/lib/access-redirect'
import type { Account } from '@/types/account'

const BASE: Account = {
  user_id: 'u-1', role: 'family', is_admin: false, partner: null,
  dossier: { id: 'd-1', status: 'active', source: 'partner', partner_name: 'PF Démo', deceased_first_name: 'Jean', activated_at: '2026-09-16T10:00:00Z', included_sends: 10 },
  consent: { version: '2026-09-beta-1', required: false, accepted_at: '2026-09-16T10:01:00Z' },
}
const ALLOW: AccessDecision = { kind: 'allow' }
const SCREEN: AccessDecision = { kind: 'screen', screen: 'not_activated' }
const to = (path: string): AccessDecision => ({ kind: 'redirect', to: path })

const partner: Account = { ...BASE, role: 'partner', dossier: null, partner: { id: 'p-1', name: 'PF Démo', status: 'active', user_role: 'manager' } }
const familyConsentRequired: Account = { ...BASE, consent: { ...BASE.consent, required: true, accepted_at: null } }
const familyOk: Account = BASE
const familyClosed: Account = { ...BASE, dossier: { ...BASE.dossier!, status: 'closed' } }
const noneAdmin: Account = { ...BASE, role: 'none', dossier: null, is_admin: true }
const none: Account = { ...BASE, role: 'none', dossier: null }

const AREAS: AccessArea[] = ['family', 'consent', 'partner', 'admin']
const TABLE: Array<[string, Account | null, AccessDecision[]]> = [
  ['compte null', null, [SCREEN, SCREEN, SCREEN, SCREEN]],
  ['partner', partner, [to('/partenaire'), to('/partenaire'), ALLOW, to('/partenaire')]],
  ['partner admin', { ...partner, is_admin: true }, [to('/partenaire'), to('/partenaire'), ALLOW, ALLOW]],
  ['famille, consentement requis', familyConsentRequired, [to('/bienvenue'), ALLOW, to('/bienvenue'), to('/bienvenue')]],
  ['famille, consentement requis, admin', { ...familyConsentRequired, is_admin: true }, [to('/bienvenue'), ALLOW, to('/bienvenue'), ALLOW]],
  ['famille, consentement OK', familyOk, [ALLOW, to('/'), to('/'), to('/')]],
  ['famille, consentement OK, admin', { ...familyOk, is_admin: true }, [ALLOW, to('/'), to('/'), ALLOW]],
  ['famille, dossier clos', familyClosed, [SCREEN, SCREEN, SCREEN, SCREEN]],
  ['famille, dossier clos, admin', { ...familyClosed, is_admin: true }, [SCREEN, SCREEN, SCREEN, ALLOW]],
  ['none admin', noneAdmin, [to('/admin'), to('/admin'), to('/admin'), ALLOW]],
  ['none', none, [SCREEN, SCREEN, SCREEN, SCREEN]],
]

describe('resolveAccessRedirect — table §7.2', () => {
  for (const [label, account, expected] of TABLE) {
    AREAS.forEach((area, index) => {
      it(`${label} × ${area}`, () => {
        expect(resolveAccessRedirect(account, area)).toEqual(expected[index])
      })
    })
  }
  it('famille « active » sans objet dossier (forme inattendue) : écran, jamais allow', () => {
    expect(resolveAccessRedirect({ ...BASE, dossier: null }, 'family')).toEqual(SCREEN)
  })
})
```

- [ ] **22.2** Vérifier l'échec : `npx vitest run tests/access-redirect.test.ts` → échec d'import.
- [ ] **22.3** Créer `src/lib/access-redirect.ts` :

```ts
import type { Account } from '@/types/account'

// Garde d'accès front (contrat §7.2) — fonction PURE, testée exhaustivement. Confort d'orientation
// seulement : la sécurité reste côté serveur (gate dossier actif, RPC). Toute forme inattendue
// aboutit à l'écran « accès non activé », jamais à `allow`.
export type AccessArea = 'family' | 'consent' | 'partner' | 'admin'
export type AccessDecision = { kind: 'allow' } | { kind: 'redirect'; to: string } | { kind: 'screen'; screen: 'not_activated' }

const ALLOW: AccessDecision = { kind: 'allow' }
const NOT_ACTIVATED: AccessDecision = { kind: 'screen', screen: 'not_activated' }
const redirectTo = (to: string): AccessDecision => ({ kind: 'redirect', to })

export function resolveAccessRedirect(account: Account | null, area: AccessArea): AccessDecision {
  if (!account) return NOT_ACTIVATED
  // is_admin est orthogonal au rôle : il ouvre /admin quel que soit le rôle.
  if (area === 'admin' && account.is_admin) return ALLOW

  if (account.role === 'partner') return area === 'partner' ? ALLOW : redirectTo('/partenaire')

  if (account.role === 'family') {
    if (account.dossier?.status !== 'active') return NOT_ACTIVATED
    if (account.consent.required) return area === 'consent' ? ALLOW : redirectTo('/bienvenue')
    return area === 'family' ? ALLOW : redirectTo('/')
  }

  return account.is_admin ? redirectTo('/admin') : NOT_ACTIVATED
}
```

- [ ] **22.4** Créer `src/components/auth/AccessNotActivatedScreen.tsx` :

```tsx
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { useT } from '@/i18n/useT'
import { fmt } from '@/i18n'

// Écran rendu par RequireAccess (pas une route) : compte sans dossier actif ni rôle interne.
export function AccessNotActivatedScreen({ supportEmail }: { supportEmail: string }) {
  const t = useT()
  const { signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <AuthLayout>
      <div className="rounded-card border border-border-card bg-white p-10 text-center shadow-card-border max-sm:p-7">
        <h1 className="mb-3 font-display text-[28px] font-normal leading-[1.3] text-text">{t.access.notActivatedTitle}</h1>
        <p className="mb-6 text-text-secondary">{t.access.notActivatedBody}</p>
        <p className="mb-8 text-sm text-text-muted">
          {fmt(t.access.supportLine, { email: supportEmail })}
        </p>
        <div className="flex flex-col items-center gap-3">
          <Button onClick={() => void handleSignOut()}>{t.access.signOut}</Button>
          <Link to="/login" className="text-sm font-medium text-primary underline hover:text-primary-hover">
            {t.access.backToLogin}
          </Link>
        </div>
      </div>
    </AuthLayout>
  )
}
```

- [ ] **22.5** Créer `src/components/auth/RequireAccess.tsx` :

```tsx
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAccount } from '@/hooks/useAccount'
import { resolveAccessRedirect, type AccessArea } from '@/lib/access-redirect'
import { AccessNotActivatedScreen } from '@/components/auth/AccessNotActivatedScreen'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useT'

const DEFAULT_SUPPORT_EMAIL = 'support@seren-app.fr'

// Garde d'accès (contrat §7.2), à placer DANS ProtectedRoute. Erreur de lecture de /api/me :
// écran d'erreur générique, JAMAIS les routes protégées.
export function RequireAccess({ area, children }: { area: AccessArea; children: ReactNode }) {
  const t = useT()
  const { loading, error, me, refresh } = useAccount()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-border border-t-accent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center">
        <h1 className="mb-3 font-display text-2xl font-normal text-text">{t.errors.somethingWrongTitle}</h1>
        <p className="mb-6 max-w-md text-text-secondary">{t.errors.somethingWrongDescription}</p>
        <Button onClick={() => void refresh()}>{t.errors.retry}</Button>
      </div>
    )
  }

  const decision = resolveAccessRedirect(me?.account ?? null, area)
  if (decision.kind === 'redirect') return <Navigate to={decision.to} replace />
  if (decision.kind === 'screen') return <AccessNotActivatedScreen supportEmail={me?.support_email ?? DEFAULT_SUPPORT_EMAIL} />
  return <>{children}</>
}
```

- [ ] **22.6** `useAuth.ts` : `import { resetAccountCache } from '@/hooks/useAccount'` ; l.49 : `if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') { resetPaymentsCache(); resetAccountCache() }` (commentaire : « statut du forfait ET compte v2 en cache de module : purgés à tout changement de session »).
- [ ] **22.7** `App.tsx` : `import { RequireAccess } from '@/components/auth/RequireAccess'` ; envelopper :

```tsx
              <Route path="/" element={<ProtectedRoute><RequireAccess area="family"><QuestionnairePage /></RequireAccess></ProtectedRoute>} />
              <Route path="/access" element={<ProtectedRoute><AccessPage /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><RequireAccess area="family"><DashboardPage /></RequireAccess></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><RequireAccess area="family"><ProfilePage /></RequireAccess></ProtectedRoute>} />
              <Route path="/documents" element={<ProtectedRoute><RequireAccess area="family"><DocumentsPage /></RequireAccess></ProtectedRoute>} />
              {/* Espace partenaire PF : réservé aux comptes partner_users (garde + RPC côté serveur). */}
              <Route path="/partenaire" element={<ProtectedRoute><RequireAccess area="partner"><PartnerDashboardPage /></RequireAccess></ProtectedRoute>} />
              {/* v2:route-admin */}
```

(l'ancre `{/* v2:route-admin */}` reste juste après la route `/partenaire`.)
- [ ] **22.8** Vérifier : `npx vitest run tests/access-redirect.test.ts` → `0 failed` (45 cas : 11 profils × 4 zones + 1) ; gate R3 vert.
- [ ] **22.9** Commit : `feat(v2-l3): garde d'accès pure (table §7.2), RequireAccess fail-closed, écran « accès non activé », cache compte purgé à chaque session`.

### Task 23 : `ActivationPage` — machine d'états §7.3

**Niveau de revue :** double.
**Files:**
- Create: `src/pages/ActivationPage.tsx`
- Modify: `src/App.tsx` (route publique `/activation`)
- Modify: `src/i18n/strings.{fr,en}.ts` (namespace neuf `activation` avant `// v2:ns-l3`)

- [ ] **23.1** i18n :

```ts
// strings.fr.ts
  activation: {
    title: 'Activer votre accès Seren',
    checking: 'Vérification de votre lien...',
    invitedBy: '{partner} vous ouvre un accompagnement Seren.',
    invitedByGeneric: 'Votre accompagnement Seren vous attend.',
    greeting: 'Bonjour {name},',
    emailLabel: 'Votre adresse e-mail',
    emailHint: 'C’est l’adresse à laquelle vous avez reçu l’invitation.',
    passwordLabel: 'Choisissez un mot de passe',
    submit: 'Activer mon accès',
    submitting: 'Activation en cours...',
    claiming: 'Ouverture de votre espace...',
    weakPassword: 'Ce mot de passe est trop faible : choisissez-en un plus long.',
    missingTitle: 'Lien incomplet',
    missingBody: 'Rouvrez le lien reçu par e-mail, sans le modifier.',
    invalidTitle: 'Lien non valide',
    invalidBody: 'Ce lien n’est plus valide ou a déjà été utilisé.',
    alreadyActivated: 'Déjà activé ? Connectez-vous',
    expiredTitle: 'Lien expiré',
    expiredBody: 'Demandez un nouveau lien à {partner}.',
    expiredBodyGeneric: 'Demandez un nouveau lien à votre pompe funèbre.',
    closedTitle: 'Activation momentanément indisponible',
    closedBody: 'Réessayez dans quelques instants.',
    otherSessionTitle: 'Un autre compte est connecté',
    otherSessionBody: 'Ce lien concerne une autre adresse e-mail. Déconnectez-vous pour continuer.',
    otherSessionCta: 'Se déconnecter et continuer',
    existingAccountTitle: 'Un compte existe déjà avec cette adresse',
    existingAccountBody: 'Saisissez le mot de passe de ce compte, ou réinitialisez-le.',
    existingAccountPasswordLabel: 'Mot de passe de votre compte',
    existingAccountSubmit: 'Me connecter et activer',
    resetPassword: 'Réinitialiser mon mot de passe',
    errorTitle: 'Une erreur est survenue',
    errorBody: 'Vous pouvez réessayer dans un instant.',
    retry: 'Réessayer',
    support: 'Besoin d’aide ? Écrivez à {email}',
  },
// strings.en.ts
  activation: {
    title: 'Activate your Seren access',
    checking: 'Checking your link...',
    invitedBy: '{partner} is opening a Seren support account for you.',
    invitedByGeneric: 'Your Seren support is waiting for you.',
    greeting: 'Hello {name},',
    emailLabel: 'Your email address',
    emailHint: 'This is the address the invitation was sent to.',
    passwordLabel: 'Choose a password',
    submit: 'Activate my access',
    submitting: 'Activating...',
    claiming: 'Opening your space...',
    weakPassword: 'This password is too weak: please choose a longer one.',
    missingTitle: 'Incomplete link',
    missingBody: 'Open the link from the email again, without changing it.',
    invalidTitle: 'Invalid link',
    invalidBody: 'This link is no longer valid or has already been used.',
    alreadyActivated: 'Already activated? Sign in',
    expiredTitle: 'Link expired',
    expiredBody: 'Ask {partner} for a new link.',
    expiredBodyGeneric: 'Ask your funeral home for a new link.',
    closedTitle: 'Activation temporarily unavailable',
    closedBody: 'Please try again in a few moments.',
    otherSessionTitle: 'Another account is signed in',
    otherSessionBody: 'This link belongs to another email address. Sign out to continue.',
    otherSessionCta: 'Sign out and continue',
    existingAccountTitle: 'An account already exists with this address',
    existingAccountBody: 'Enter the password of this account, or reset it.',
    existingAccountPasswordLabel: 'Your account password',
    existingAccountSubmit: 'Sign in and activate',
    resetPassword: 'Reset my password',
    errorTitle: 'Something went wrong',
    errorBody: 'You can try again in a moment.',
    retry: 'Try again',
    support: 'Need help? Write to {email}',
  },
```

- [ ] **23.2** Créer `src/pages/ActivationPage.tsx`. Logique (à reprendre telle quelle) :

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as Sentry from '@sentry/react'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { PasswordRules } from '@/components/auth/PasswordRules'
import { PasswordConfirmField } from '@/components/auth/PasswordConfirmField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePasswordValidation } from '@/hooks/usePasswordValidation'
import { useAuth } from '@/hooks/useAuth'
import { resetAccountCache } from '@/hooks/useAccount'
import { supabase } from '@/lib/supabase'
import { apiFetch } from '@/lib/api'
import { getActivationToken, clearActivationToken } from '@/lib/activation-fragment'
import { sha256Hex } from '@/lib/activation-token'
import { makeSchemas, type ResetPasswordConfirmValues } from '@/utils/validation'
import { useT } from '@/i18n/useT'
import { useLang } from '@/i18n/LanguageContext'
import { fmt } from '@/i18n'

interface Invitation {
  email: string
  partner_name: string | null
  family_first_name: string | null
  deceased_first_name: string | null
  expires_at: string
}

type ActivationState =
  | { kind: 'checking' }
  | { kind: 'missing' }
  | { kind: 'ready'; invitation: Invitation }
  | { kind: 'existing_account'; invitation: Invitation }
  | { kind: 'submitting'; invitation: Invitation }
  | { kind: 'claiming' }
  | { kind: 'invalid' }
  | { kind: 'expired'; partnerName: string | null }
  | { kind: 'closed' }
  | { kind: 'other_session' }
  | { kind: 'error'; retry: 'check' | 'claim' | null }

const DEFAULT_SUPPORT_EMAIL = 'support@seren-app.fr'

// Page PUBLIQUE (hors ProtectedRoute). Ne charge aucune ressource tierce. Le jeton n'est lu qu'en
// mémoire (capturé par main.tsx) ; seules ses empreintes sha256 partent vers l'API et vers Auth.
export function ActivationPage() {
  const t = useT()
  const { lang } = useLang()
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const [state, setState] = useState<ActivationState>({ kind: 'checking' })
  const [supportEmail, setSupportEmail] = useState(DEFAULT_SUPPORT_EMAIL)
  const [existingPassword, setExistingPassword] = useState('')
  const tokenHashRef = useRef<string | null>(null)
  const invitationRef = useRef<Invitation | null>(null)
  const langRef = useRef(lang)
  langRef.current = lang

  const { resetPasswordConfirmSchema } = makeSchemas(t)
  const form = useForm<ResetPasswordConfirmValues>({
    resolver: zodResolver(resetPasswordConfirmSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })
  const watchedPassword = form.watch('password')
  const watchedConfirm = form.watch('confirmPassword')
  const { validation } = usePasswordValidation(watchedPassword)

  // Étape 5 (§7.3) : rattachement du compte au dossier.
  const claim = useCallback(async () => {
    const tokenHash = tokenHashRef.current
    if (!tokenHash) {
      setState({ kind: 'missing' })
      return
    }
    setState({ kind: 'claiming' })
    try {
      const res = await apiFetch('/api/activation/claim', {
        method: 'POST',
        body: JSON.stringify({ token_hash: tokenHash, lang: langRef.current }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.success) {
        // Best effort : le hash est déjà invalidé en base par le claim ; on le retire aussi des métadonnées Auth.
        await supabase.auth.updateUser({ data: { invite_token_hash: null } })
        clearActivationToken()
        resetAccountCache()
        navigate('/bienvenue', { replace: true })
        return
      }
      if (data?.code === 'EMAIL_MISMATCH') return setState({ kind: 'other_session' })
      if (res.status === 410) return setState({ kind: 'expired', partnerName: invitationRef.current?.partner_name ?? null })
      if (res.status === 404) return setState({ kind: 'invalid' })
      if (res.status === 503) return setState({ kind: 'closed' })
      setState({ kind: 'error', retry: res.status === 409 ? null : 'claim' })
    } catch {
      setState({ kind: 'error', retry: 'claim' })
    }
  }, [navigate])

  // Étapes 1 à 3 (§7.3) : jeton → hash → check → session éventuelle.
  const check = useCallback(async () => {
    const token = getActivationToken()
    if (!token) {
      setState({ kind: 'missing' })
      return
    }
    setState({ kind: 'checking' })
    try {
      const tokenHash = await sha256Hex(token)
      tokenHashRef.current = tokenHash
      const res = await fetch('/api/activation/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token_hash: tokenHash, lang: langRef.current }),
      })
      const data = await res.json().catch(() => null)
      if (typeof data?.support_email === 'string') setSupportEmail(data.support_email)

      if (res.status === 200 && data?.invitation) {
        const invitation = data.invitation as Invitation
        invitationRef.current = invitation
        const { data: sessionData } = await supabase.auth.getSession()
        const sessionEmail = sessionData.session?.user?.email?.toLowerCase()
        if (sessionEmail) {
          if (sessionEmail === invitation.email.toLowerCase()) {
            await claim()
            return
          }
          setState({ kind: 'other_session' })
          return
        }
        setState({ kind: 'ready', invitation })
        return
      }
      if (res.status === 404 || res.status === 400) return setState({ kind: 'invalid' })
      if (res.status === 410) return setState({ kind: 'expired', partnerName: data?.partner_name ?? null })
      if (res.status === 503) return setState({ kind: 'closed' })
      setState({ kind: 'error', retry: 'check' })
    } catch {
      setState({ kind: 'error', retry: 'check' })
    }
  }, [claim])

  useEffect(() => {
    void check()
  }, [check])

  // Compte existant (ancien compte, compte backfillé) : connexion puis claim.
  const signInThenClaim = useCallback(async (invitation: Invitation, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: invitation.email, password })
    if (error) {
      setState({ kind: 'existing_account', invitation })
      return
    }
    await claim()
  }, [claim])

  // Étape 4 (§7.3) : création du compte, le hash voyage dans user_metadata pour le hook Auth.
  const onSubmit = form.handleSubmit(async ({ password }) => {
    if (state.kind !== 'ready') return
    const invitation = state.invitation
    const tokenHash = tokenHashRef.current
    if (!tokenHash) return setState({ kind: 'missing' })
    setState({ kind: 'submitting', invitation })

    const { data, error } = await supabase.auth.signUp({
      email: invitation.email,
      password,
      options: { data: { invite_token_hash: tokenHash }, emailRedirectTo: `${window.location.origin}/bienvenue` },
    })
    if (error) {
      if (error.status === 403 || error.message?.includes('signup_requires_invitation')) return setState({ kind: 'invalid' })
      if (error.code === 'weak_password') {
        form.setError('password', { message: t.activation.weakPassword })
        return setState({ kind: 'ready', invitation })
      }
      if (error.name === 'AuthRetryableFetchError') return setState({ kind: 'error', retry: 'check' })
      // user_already_exists (422) et, par prudence (H4), toute autre erreur non 403 : tentative de connexion.
      return signInThenClaim(invitation, password)
    }
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return signInThenClaim(invitation, password)
    }
    if (!data.session) {
      // « Confirm email » resté activé sur le projet : jamais d'adresse dans l'événement.
      Sentry.captureMessage('activation_no_session')
      return setState({ kind: 'error', retry: null })
    }
    await claim()
  })

  // useAuth().signOut (et non supabase.auth.signOut) : il neutralise la redirection « session
  // expirée » d'AuthProvider, qui renverrait sinon vers /login en perdant le jeton.
  const handleSignOutAndContinue = async () => {
    await signOut()
    await check()
  }

  // Rendu : voir 23.3.
}
```

- [ ] **23.3** Rendu de `ActivationPage` (dans `AuthLayout`, carte `rounded-card border border-border-card bg-white p-10 shadow-card-border max-sm:p-7`, titre `font-display text-[28px] font-normal text-text`), par état :

| État | Titre | Contenu | Actions |
|---|---|---|---|
| `checking`, `claiming` | `t.activation.title` | spinner (`h-12 w-12 animate-spin rounded-full border-[3px] border-border border-t-primary`) + `t.activation.checking` / `t.activation.claiming` | — |
| `ready`, `submitting` | `t.activation.title` | `invitedBy` (ou `invitedByGeneric` si `partner_name` null) ; `greeting` si `family_first_name` ; `<Label htmlFor="activation-email">` + `<Input id="activation-email" value={invitation.email} readOnly aria-readonly="true" />` + `emailHint` ; `<Label htmlFor="password">{t.activation.passwordLabel}</Label>` + `<PasswordInput id="password" autoComplete="new-password" {...form.register('password')} />` + `<PasswordRules validation={validation} show={watchedPassword.length > 0} />` + erreur `form.formState.errors.password?.message` ; `<PasswordConfirmField password={watchedPassword} confirmPassword={watchedConfirm} onChange={(v) => form.setValue('confirmPassword', v, { shouldValidate: true })} error={form.formState.errors.confirmPassword?.message} />` | `<form onSubmit={onSubmit} noValidate>` ; `<Button type="submit" className="w-full" disabled={state.kind === 'submitting'}>` libellé `submit` / `submitting` |
| `existing_account` | `existingAccountTitle` | `existingAccountBody` ; e-mail en lecture seule ; `<PasswordInput id="existing-password" autoComplete="current-password" value={existingPassword} onChange={(e) => setExistingPassword(e.target.value)} />` | bouton `existingAccountSubmit` → `setState({ kind: 'submitting', invitation }); void signInThenClaim(invitation, existingPassword)` ; lien `<Link to="/reset-password">{t.activation.resetPassword}</Link>` |
| `missing` | `missingTitle` | `missingBody` | — |
| `invalid` | `invalidTitle` | `invalidBody` | `<Link to="/login">{t.activation.alreadyActivated}</Link>` |
| `expired` | `expiredTitle` | `fmt(expiredBody, { partner })` ou `expiredBodyGeneric` | — |
| `closed` | `closedTitle` | `closedBody` | bouton `retry` → `check()` |
| `other_session` | `otherSessionTitle` | `otherSessionBody` | bouton `otherSessionCta` → `handleSignOutAndContinue()` |
| `error` | `errorTitle` | `errorBody` | bouton `retry` si `retry !== null` → `retry === 'claim' ? claim() : check()` |

Sous la carte, pour tous les états : `<p className="mt-6 text-center text-sm text-text-muted">{fmt(t.activation.support, { email: supportEmail })}</p>`. Aucune image ni ressource externe.
- [ ] **23.4** `App.tsx` : `import { ActivationPage } from '@/pages/ActivationPage'` ; route publique `<Route path="/activation" element={<ActivationPage />} />` sous `/signup`.
- [ ] **23.5** Vérifier : gate R3 vert ; `grep -n "localStorage\|sessionStorage\|console\." src/pages/ActivationPage.tsx src/lib/activation-fragment.ts` → aucune sortie.
- [ ] **23.6** Commit : `feat(v2-l3): page d'activation — check par hash, signUp avec invite_token_hash, repli connexion, claim idempotent, redirection /bienvenue`.

### Task 24 : `ConsentPage` (`/bienvenue`) et canal e-mail fermé dans `LetterSendPanel`

**Niveau de revue :** unique (contre-lecture : la version envoyée est `CONSENT_VERSION`, les 3 kinds exacts).
**Prérequis :** note N2 validée pour 24.4.
**Files:**
- Create: `src/pages/ConsentPage.tsx`
- Modify: `src/App.tsx` (route `/bienvenue`), `src/components/letter/LetterSendPanel.tsx`
- Modify: `src/i18n/strings.{fr,en}.ts` (namespace neuf `consent` avant `// v2:ns-l3`)

- [ ] **24.1** i18n :

```ts
// strings.fr.ts
  consent: {
    title: 'Bienvenue',
    providedBy: 'Votre accompagnement Seren vous est proposé par {partner}.',
    providedByGeneric: 'Votre accompagnement Seren.',
    deceasedLine: 'Nous sommes à vos côtés pour les démarches liées au décès de {name}.',
    intro: 'Avant de commencer, merci de prendre connaissance de ces trois points.',
    terms: 'J’accepte les conditions générales d’utilisation (version bêta)',
    termsLink: 'Lire les conditions',
    privacy: 'J’ai pris connaissance de la politique de confidentialité',
    privacyLink: 'Lire la politique',
    sensitiveData:
      'J’accepte que Seren traite les informations sensibles nécessaires à mes démarches (décès, situation familiale, patrimoine)',
    cta: 'Commencer',
    submitting: 'Enregistrement...',
    saveError: 'Impossible d’enregistrer votre accord, réessayez.',
    allRequired: 'Les trois cases sont nécessaires pour utiliser Seren.',
  },
// strings.en.ts
  consent: {
    title: 'Welcome',
    providedBy: 'Your Seren support is provided by {partner}.',
    providedByGeneric: 'Your Seren support.',
    deceasedLine: 'We are by your side for the formalities following the death of {name}.',
    intro: 'Before you start, please read these three points.',
    terms: 'I accept the terms of use (beta version)',
    termsLink: 'Read the terms',
    privacy: 'I have read the privacy policy',
    privacyLink: 'Read the policy',
    sensitiveData:
      'I agree that Seren processes the sensitive information needed for my formalities (death, family situation, assets)',
    cta: 'Start',
    submitting: 'Saving...',
    saveError: 'Unable to save your agreement, please try again.',
    allRequired: 'All three boxes are required to use Seren.',
  },
```

- [ ] **24.2** Créer `src/pages/ConsentPage.tsx` :

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useAccount } from '@/hooks/useAccount'
import { supabase } from '@/lib/supabase'
import { CONSENT_VERSION } from '@/lib/consent-version'
import { useT } from '@/i18n/useT'
import { fmt } from '@/i18n'

type ConsentKind = 'terms' | 'privacy' | 'sensitive_data'
const KINDS: ConsentKind[] = ['terms', 'privacy', 'sensitive_data']

// /bienvenue (contrat §7.4) : preuve de consentement append-only (table consents via RPC
// record_consents, version figée CONSENT_VERSION). Gardée par RequireAccess area="consent".
export function ConsentPage() {
  const t = useT()
  const navigate = useNavigate()
  const { me, refresh } = useAccount()
  const [checked, setChecked] = useState<Record<ConsentKind, boolean>>({ terms: false, privacy: false, sensitive_data: false })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dossier = me?.account?.dossier ?? null
  const allChecked = KINDS.every((kind) => checked[kind])

  const handleStart = async () => {
    if (!allChecked) {
      setError(t.consent.allRequired)
      return
    }
    setSubmitting(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('record_consents', { p_version: CONSENT_VERSION, p_kinds: KINDS })
    if (rpcError) {
      // Version déployée ≠ version en base : on recharge pour récupérer le bundle à jour.
      if (rpcError.message === 'consent_version_mismatch') {
        window.location.reload()
        return
      }
      setError(t.consent.saveError)
      setSubmitting(false)
      return
    }
    await refresh()
    navigate('/', { replace: true })
  }

  const labels: Record<ConsentKind, { text: string; link?: { href: string; label: string } }> = {
    terms: { text: t.consent.terms, link: { href: '/legal', label: t.consent.termsLink } },
    privacy: { text: t.consent.privacy, link: { href: '/security', label: t.consent.privacyLink } },
    sensitive_data: { text: t.consent.sensitiveData },
  }

  return (
    <AuthLayout>
      <div className="rounded-card border border-border-card bg-white p-10 shadow-card-border max-sm:p-7">
        <h1 className="mb-3 text-center font-display text-[28px] font-normal leading-[1.3] text-text">{t.consent.title}</h1>
        <p className="mb-2 text-center text-text-secondary">
          {dossier?.partner_name ? fmt(t.consent.providedBy, { partner: dossier.partner_name }) : t.consent.providedByGeneric}
        </p>
        {dossier?.deceased_first_name && (
          <p className="mb-6 text-center text-text-secondary">{fmt(t.consent.deceasedLine, { name: dossier.deceased_first_name })}</p>
        )}
        <p className="mb-4 text-sm text-text-muted">{t.consent.intro}</p>
        <div className="space-y-4">
          {KINDS.map((kind) => (
            <div key={kind} className="flex items-start gap-3">
              <Checkbox
                id={`consent-${kind}`}
                checked={checked[kind]}
                onCheckedChange={(value) => setChecked((prev) => ({ ...prev, [kind]: value === true }))}
                aria-required="true"
                className="mt-0.5"
              />
              <Label htmlFor={`consent-${kind}`} className="cursor-pointer text-sm font-normal leading-relaxed text-text-secondary">
                {labels[kind].text}
                {labels[kind].link && (
                  <>
                    {' — '}
                    <a href={labels[kind].link!.href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary-hover">
                      {labels[kind].link!.label}
                    </a>
                  </>
                )}
              </Label>
            </div>
          ))}
        </div>
        {error && <p className="mt-4 text-sm text-error" role="alert">{error}</p>}
        <Button className="mt-8 w-full" disabled={!allChecked || submitting} onClick={() => void handleStart()}>
          {submitting ? t.consent.submitting : t.consent.cta}
        </Button>
      </div>
    </AuthLayout>
  )
}
```

- [ ] **24.3** `App.tsx` : `import { ConsentPage } from '@/pages/ConsentPage'` ; `<Route path="/bienvenue" element={<ProtectedRoute><RequireAccess area="consent"><ConsentPage /></RequireAccess></ProtectedRoute>} />` (avant `/`).
- [ ] **24.4** `LetterSendPanel.tsx` (note N2) : `import { useAccount } from '@/hooks/useAccount'` ; `const { me } = useAccount()` avec les autres hooks ; après le dernier hook et AVANT le `if (channel === 'papier')` :

```tsx
  // Canal e-mail fermé (EMAIL_SENDS_ENABLED absent) : le courrier reste consultable et téléchargeable
  // (LetterActions, rendu à côté), seul l'envoi par Seren est remplacé par un message.
  if (channel === 'email' && me?.flags.email_sends_enabled === false) {
    return <p className="text-xs italic text-text-muted">{t.lettersPage.send.notConfigured}</p>
  }
```

- [ ] **24.5** Vérifier : gate R3 vert ; `grep -n "CONSENT_VERSION\|'terms', 'privacy', 'sensitive_data'" src/pages/ConsentPage.tsx` → 2 lignes au moins.
- [ ] **24.6** Commit : `feat(v2-l3): /bienvenue — 3 consentements persistés (record_consents, CONSENT_VERSION) ; canal e-mail fermé lisible`.

### Task 25 : Pages `/legal` et `/security` en version bêta

**Niveau de revue :** unique.
**Files:**
- Modify: `src/App.tsx:25-46,63-64`
- Modify: `src/i18n/strings.{fr,en}.ts` (namespace neuf `legalPages` avant `// v2:ns-l3` ; suppression de `layout.legalTitle`, `layout.legalContent`, `layout.securityTitle`, `layout.securityContent`)

- [ ] **25.1** i18n (valeurs provisoires ; valeurs définitives posées par L7, Task 34) :

```ts
// strings.fr.ts
  legalPages: {
    betaBanner: 'Version bêta — relecture juridique en cours.',
    legal: {
      title: 'Conditions générales d’utilisation (version bêta)',
      blocks: [
        { heading: 'Un service en version bêta', body: 'Seren est ouvert en version bêta à des familles invitées par une pompe funèbre partenaire. Les informations et modèles de courriers sont fournis à titre indicatif et sont en cours de relecture juridique : vérifiez-les auprès des organismes concernés.' },
        { heading: 'Contact', body: 'Pour toute question, écrivez au support : support@seren-app.fr.' },
      ],
    },
    security: {
      title: 'Politique de confidentialité (version bêta)',
      blocks: [
        { heading: 'Vos données', body: 'Seren traite les informations nécessaires à vos démarches, transmises par votre pompe funèbre ou saisies par vous. Le contenu de votre dossier (réponses, démarches, courriers, documents) n’est jamais visible par la pompe funèbre.' },
        { heading: 'Vos droits', body: 'Accès, rectification, effacement, opposition : écrivez à support@seren-app.fr. Vous pouvez aussi adresser une réclamation à la CNIL (cnil.fr).' },
      ],
    },
  },
// strings.en.ts
  legalPages: {
    betaBanner: 'Beta version — legal review in progress.',
    legal: {
      title: 'Terms of use (beta version)',
      blocks: [
        { heading: 'A service in beta', body: 'Seren is open in beta to families invited by a partner funeral home. Information and letter templates are provided as guidance and are under legal review: please check them with the organisations concerned.' },
        { heading: 'Contact', body: 'For any question, write to support: support@seren-app.fr.' },
      ],
    },
    security: {
      title: 'Privacy policy (beta version)',
      blocks: [
        { heading: 'Your data', body: 'Seren processes the information needed for your formalities, provided by your funeral home or entered by you. The content of your file (answers, steps, letters, documents) is never visible to the funeral home.' },
        { heading: 'Your rights', body: 'Access, rectification, erasure, objection: write to support@seren-app.fr. You can also lodge a complaint with the CNIL (cnil.fr).' },
      ],
    },
  },
```

- [ ] **25.2** `App.tsx` : remplacer `LegalPlaceholder` et `SecurityPlaceholder` par :

```tsx
// Pages légales bêta (contenu : t.legalPages, valeurs relues en L7). Publiques.
function LegalContentPage({ page }: { page: 'legal' | 'security' }) {
  const t = useT()
  const content = t.legalPages[page]
  return (
    <div className="min-h-screen bg-bg px-4 py-12">
      <article className="mx-auto max-w-3xl">
        <p role="note" className="mb-6 rounded-2xl border border-warning/40 bg-warning-light px-4 py-3 text-sm text-text-secondary">
          {t.legalPages.betaBanner}
        </p>
        <h1 className="mb-8 font-display text-3xl font-normal text-text">{content.title}</h1>
        {content.blocks.map((block) => (
          <section key={block.heading} className="mb-8">
            <h2 className="mb-2 font-display text-xl font-normal text-text">{block.heading}</h2>
            {block.body.split('\n\n').map((paragraph, index) => (
              <p key={index} className="mb-3 text-text-secondary">{paragraph}</p>
            ))}
          </section>
        ))}
      </article>
    </div>
  )
}
```

routes : `<Route path="/legal" element={<LegalContentPage page="legal" />} />` et `<Route path="/security" element={<LegalContentPage page="security" />} />`. Supprimer les 4 clés `layout.*` devenues inutiles (FR et EN).
- [ ] **25.3** Vérifier : gate R3 vert ; `grep -rn "legalContent\|securityContent\|LegalPlaceholder" src` → aucune sortie.
- [ ] **25.4** Commit : `feat(v2-l3): pages /legal et /security bêta (bandeau, contenu structuré par blocs FR/EN)`.

---

## Lot L4 — Front PF : créer, lister, renvoyer, annuler, compteurs explicites

Revue : **unique** + checklist « aucun champ de contenu » (ni réponses, ni roadmap, ni courriers, ni documents, ni envois). Branche `feature/v2-l4`. Le sous-lot PLANCHER (Task 26) est commité en premier et reste applicable seul sur la base 2a (page v0 conservée, euros masqués).

### Task 26 : Masquage des euros de la page PF v0 (sous-lot PLANCHER)

**Niveau de revue :** unique.
**Files:**
- Modify: `src/pages/PartnerDashboardPage.tsx:1-8,53-87`
- Modify: `src/hooks/usePartnerDashboard.ts:56-63` (suppression de `formatEuroCents`)
- Modify: `src/i18n/strings.{fr,en}.ts` (namespace `partner` : suppression de `rateLabel`, `tiles.paid`, `tiles.revenue`, `tiles.commission`)

- [ ] **26.1** Constat de départ : `grep -n "formatEuroCents\|rateLabel\|revenue\|commission" src/pages/PartnerDashboardPage.tsx` → lignes présentes.
- [ ] **26.2** `PartnerDashboardPage.tsx` : supprimer `formattedRate`, le `PillBadge` du taux et les tuiles `paid`, `revenue`, `commission` ; ne garder qu'une tuile `{ key: 'attributed', label: t.partner.tiles.attributed, value: String(data.attributed_count) }` rendue dans `grid grid-cols-1 gap-4 sm:grid-cols-2` ; supprimer les imports devenus inutiles (`formatEuroCents`, `useLang`, `fmt`, `PillBadge`). `usePartnerDashboard.ts` : supprimer `formatEuroCents` et l'import `Lang`.
- [ ] **26.3** i18n `partner` (FR et EN) : ne conserver que `title`, `tiles.attributed` (FR « Dossiers accompagnés », EN inchangé) et `previewNotice`.
- [ ] **26.4** Vérifier : la commande de 26.1 ne renvoie plus rien ; gate R3 vert.
- [ ] **26.5** Commit : `feat(v2-l4-plancher): page PF v0 sans montants (CA, commission et taux masqués)`.

### Task 27 : `src/lib/partner-dossier.ts` — types API, `canCancel`, `validateDossierForm`

**Niveau de revue :** unique.
**Files:**
- Create: `src/lib/partner-dossier.ts`
- Test: `tests/partner-dossier.test.ts`

- [ ] **27.1** Test qui échoue, `tests/partner-dossier.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { canCancel, cancelDeadline, validateDossierForm, EMPTY_DOSSIER_FORM, type DossierFormValues } from '@/lib/partner-dossier'

const NOW = new Date('2026-09-17T12:00:00Z')
const VALID: DossierFormValues = {
  family_first_name: 'Claire', family_last_name: 'Martin', family_email: 'claire.martin@exemple.fr', family_phone: '',
  deceased_first_name: 'Jean', deceased_last_name: 'Dupont', deceased_death_date: '2026-09-10',
}

describe('canCancel (48 h, invités seulement)', () => {
  it('invité créé il y a 47 h 59 : annulable', () => {
    expect(canCancel({ status: 'invited', created_at: '2026-09-15T12:01:00Z' }, NOW)).toBe(true)
  })
  it('invité créé il y a exactement 48 h : NON annulable (borne SQL « created_at > now() - 48 h »)', () => {
    expect(canCancel({ status: 'invited', created_at: '2026-09-15T12:00:00Z' }, NOW)).toBe(false)
  })
  it.each(['active', 'closed', 'cancelled'] as const)('statut %s : jamais annulable', (status) => {
    expect(canCancel({ status, created_at: '2026-09-17T11:00:00Z' }, NOW)).toBe(false)
  })
  it('date invalide : non annulable', () => {
    expect(canCancel({ status: 'invited', created_at: 'n/a' }, NOW)).toBe(false)
  })
  it('cancelDeadline = created_at + 48 h', () => {
    expect(cancelDeadline('2026-09-15T12:00:00Z').toISOString()).toBe('2026-09-17T12:00:00.000Z')
  })
})

describe('validateDossierForm (miroir des règles SQL)', () => {
  it('formulaire valide : aucune erreur', () => {
    expect(validateDossierForm(VALID, NOW)).toEqual({})
  })
  it('formulaire vide : tous les champs obligatoires signalés, téléphone optionnel', () => {
    expect(validateDossierForm(EMPTY_DOSSIER_FORM, NOW)).toEqual({
      family_first_name: 'required', family_last_name: 'required', family_email: 'required',
      deceased_first_name: 'required', deceased_last_name: 'required', deceased_death_date: 'required',
    })
  })
  it('espaces seuls = vide', () => {
    expect(validateDossierForm({ ...VALID, family_last_name: '   ' }, NOW).family_last_name).toBe('required')
  })
  it('nom de 101 caractères : tooLong', () => {
    expect(validateDossierForm({ ...VALID, deceased_last_name: 'x'.repeat(101) }, NOW).deceased_last_name).toBe('tooLong')
  })
  it.each(['claire', 'claire@', 'claire@exemple', 'cla ire@exemple.fr'])('e-mail « %s » : invalidEmail', (email) => {
    expect(validateDossierForm({ ...VALID, family_email: email }, NOW).family_email).toBe('invalidEmail')
  })
  it.each(['12345', 'abcdefgh'])('téléphone « %s » : invalidPhone', (phone) => {
    expect(validateDossierForm({ ...VALID, family_phone: phone }, NOW).family_phone).toBe('invalidPhone')
  })
  it('téléphone au format libre accepté : +33 (0)6 12-34.56', () => {
    expect(validateDossierForm({ ...VALID, family_phone: '+33 (0)6 12-34.56' }, NOW).family_phone).toBeUndefined()
  })
  it('date future : futureDate', () => {
    expect(validateDossierForm({ ...VALID, deceased_death_date: '2026-09-18' }, NOW).deceased_death_date).toBe('futureDate')
  })
  it('date de plus de 2 ans : tooOld ; exactement 2 ans : acceptée', () => {
    expect(validateDossierForm({ ...VALID, deceased_death_date: '2024-09-16' }, NOW).deceased_death_date).toBe('tooOld')
    expect(validateDossierForm({ ...VALID, deceased_death_date: '2024-09-17' }, NOW).deceased_death_date).toBeUndefined()
  })
})
```

- [ ] **27.2** Vérifier l'échec : `npx vitest run tests/partner-dossier.test.ts` → échec d'import.
- [ ] **27.3** Créer `src/lib/partner-dossier.ts` :

```ts
// Espace PF (contrat §3.3.12, §4.4) : types des réponses /api/partner/* et règles de formulaire.
// Les règles MIROITENT celles de partner_create_dossier (la base reste seule juge) : elles évitent
// un aller-retour pour une faute de frappe, jamais elles n'autorisent quoi que ce soit.
export type DossierStatus = 'invited' | 'active' | 'closed' | 'cancelled'

export interface PartnerInfo { id: string; name: string; status: 'prospect' | 'active' | 'suspended' | 'terminated'; user_role: 'manager' | 'advisor' }

export interface PartnerDossier {
  id: string
  status: DossierStatus
  source: 'partner' | 'demo'
  family_first_name: string | null
  family_last_name: string | null
  family_email: string
  family_phone: string | null
  deceased_first_name: string | null
  deceased_last_name: string | null
  deceased_death_date: string | null
  created_at: string
  activated_at: string | null
  cancelled_at: string | null
  invite_expires_at: string | null
  invite_expired: boolean
  can_resend: boolean
  can_cancel: boolean
  cancel_deadline: string
}

export interface BillingPreviewData { billable_count: number; seren_due_ttc_cents: number; unit_due_ttc_cents: number; currency: 'EUR' }

export interface PartnerCountersData {
  month: string
  created_this_month: number
  created_total: number
  activated_total: number
  pending_activation: number
  expired_invitations: number
  cancelled_total: number
  activated_this_month: number
  billing_preview: BillingPreviewData | null
}

export interface DossierFormValues {
  family_first_name: string
  family_last_name: string
  family_email: string
  family_phone: string
  deceased_first_name: string
  deceased_last_name: string
  deceased_death_date: string
}

export type DossierFormField = keyof DossierFormValues
export type DossierFormErrorKey = 'required' | 'tooLong' | 'invalidEmail' | 'invalidPhone' | 'futureDate' | 'tooOld'

export const EMPTY_DOSSIER_FORM: DossierFormValues = {
  family_first_name: '', family_last_name: '', family_email: '', family_phone: '',
  deceased_first_name: '', deceased_last_name: '', deceased_death_date: '',
}

const CANCEL_WINDOW_MS = 48 * 60 * 60 * 1000
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const PHONE_RE = /^[0-9 +().-]{6,30}$/
const NAME_FIELDS: DossierFormField[] = ['family_first_name', 'family_last_name', 'deceased_first_name', 'deceased_last_name']

export function cancelDeadline(createdAt: string): Date {
  return new Date(new Date(createdAt).getTime() + CANCEL_WINDOW_MS)
}

export function canCancel(dossier: Pick<PartnerDossier, 'status' | 'created_at'>, now: Date = new Date()): boolean {
  const created = new Date(dossier.created_at).getTime()
  if (Number.isNaN(created)) return false
  return dossier.status === 'invited' && now.getTime() < created + CANCEL_WINDOW_MS
}

/** Jour calendaire local au format AAAA-MM-JJ (valeur de <input type="date">). */
export function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function validateDossierForm(values: DossierFormValues, today: Date = new Date()): Partial<Record<DossierFormField, DossierFormErrorKey>> {
  const errors: Partial<Record<DossierFormField, DossierFormErrorKey>> = {}
  for (const field of NAME_FIELDS) {
    const value = values[field].trim()
    if (!value) errors[field] = 'required'
    else if (value.length > 100) errors[field] = 'tooLong'
  }
  const email = values.family_email.trim().toLowerCase()
  if (!email) errors.family_email = 'required'
  else if (email.length > 254 || !EMAIL_RE.test(email)) errors.family_email = 'invalidEmail'

  const phone = values.family_phone.trim()
  if (phone && !PHONE_RE.test(phone)) errors.family_phone = 'invalidPhone'

  const date = values.deceased_death_date
  if (!date) {
    errors.deceased_death_date = 'required'
  } else {
    const twoYearsAgo = new Date(today)
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
    if (date > isoDay(today)) errors.deceased_death_date = 'futureDate'
    else if (date < isoDay(twoYearsAgo)) errors.deceased_death_date = 'tooOld'
  }
  return errors
}
```

- [ ] **27.4** Vérifier : `npx vitest run tests/partner-dossier.test.ts` → `0 failed`.
- [ ] **27.5** Commit : `feat(v2-l4): types de l'espace PF, fenêtre d'annulation 48 h et validation du formulaire (miroir SQL)`.

### Task 28 : `usePartnerDashboard` réécrit sur `/api/partner/*`

**Niveau de revue :** unique.
**Files:**
- Modify: `src/hooks/usePartnerDashboard.ts` (réécriture complète)

- [ ] **28.1** Réécrire `src/hooks/usePartnerDashboard.ts` (plus AUCUN appel `supabase.rpc('partner_dashboard')` ni `supabase.from(...)`) :

```ts
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { useLang } from '@/i18n/LanguageContext'
import type { DossierFormValues, PartnerCountersData, PartnerDossier, PartnerInfo } from '@/lib/partner-dossier'

// Espace PF v2 : toutes les lectures et écritures passent par l'API (/api/partner/*), elle-même
// adossée aux RPC security definer. Le hook ne reçoit JAMAIS de contenu famille.
export type PartnerActionResult =
  | { ok: true; emailSent: boolean; activationUrl?: string; alreadyCancelled?: boolean }
  | { ok: false; code: string; message: string; field?: string; duplicateCount?: number }

interface PartnerDashboardState {
  loading: boolean
  error: boolean
  notPartner: boolean
  partner: PartnerInfo | null
  dossiers: PartnerDossier[]
  counters: PartnerCountersData | null
}

const INITIAL: PartnerDashboardState = { loading: true, error: false, notPartner: false, partner: null, dossiers: [], counters: null }

async function readJson(res: Response) {
  return res.json().catch(() => null)
}

function failure(res: Response, data: Record<string, unknown> | null): PartnerActionResult {
  return {
    ok: false,
    code: typeof data?.code === 'string' ? data.code : `HTTP_${res.status}`,
    message: typeof data?.error === 'string' ? data.error : '',
    field: typeof data?.field === 'string' ? data.field : undefined,
    duplicateCount: typeof data?.duplicate_count === 'number' ? data.duplicate_count : undefined,
  }
}

export function usePartnerDashboard() {
  const { lang } = useLang()
  const [state, setState] = useState<PartnerDashboardState>(INITIAL)

  const refresh = useCallback(async () => {
    try {
      const [listRes, countersRes] = await Promise.all([
        apiFetch(`/api/partner/dossiers?lang=${lang}`),
        apiFetch(`/api/partner/counters?lang=${lang}`),
      ])
      const [list, counters] = await Promise.all([readJson(listRes), readJson(countersRes)])
      if (listRes.status === 403 || countersRes.status === 403) {
        setState({ ...INITIAL, loading: false, notPartner: true })
        return
      }
      if (!listRes.ok || !countersRes.ok || !list?.success || !counters?.success) {
        setState((prev) => ({ ...prev, loading: false, error: true }))
        return
      }
      setState({ loading: false, error: false, notPartner: false, partner: list.partner, dossiers: list.dossiers ?? [], counters: counters.counters })
    } catch {
      setState((prev) => ({ ...prev, loading: false, error: true }))
    }
  }, [lang])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const post = useCallback(async (url: string, body: Record<string, unknown>): Promise<PartnerActionResult> => {
    try {
      const res = await apiFetch(url, { method: 'POST', body: JSON.stringify({ ...body, lang }) })
      const data = await readJson(res)
      if (!res.ok || !data?.success) return failure(res, data)
      void refresh()
      return { ok: true, emailSent: Boolean(data.email_sent), activationUrl: data.activation_url, alreadyCancelled: data.already_cancelled }
    } catch {
      return { ok: false, code: 'NETWORK', message: '' }
    }
  }, [lang, refresh])

  const createDossier = useCallback(
    (values: DossierFormValues, confirmDuplicate: boolean) =>
      post('/api/partner/dossiers', {
        ...values,
        family_email: values.family_email.trim().toLowerCase(),
        family_phone: values.family_phone.trim() || null,
        confirm_duplicate: confirmDuplicate,
      }),
    [post],
  )
  const resendInvitation = useCallback((id: string) => post(`/api/partner/dossiers/${id}/resend`, {}), [post])
  const cancelDossier = useCallback((id: string) => post(`/api/partner/dossiers/${id}/cancel`, {}), [post])

  return { ...state, refresh, createDossier, resendInvitation, cancelDossier }
}
```

- [ ] **28.2** Vérifier : `npx tsc --noEmit` → erreurs attendues UNIQUEMENT dans `PartnerDashboardPage.tsx` (ancienne forme `data`) — corrigées à la Task 29 ; `grep -rn "partner_dashboard\|from('dossiers')\|from('partners')\|from('attributions')" src` → aucune sortie (H15).
- [ ] **28.3** Commit (après Task 29, les deux tasks sont commitées ensemble pour garder `tsc` vert) : voir 29.7.

### Task 29 : Composants PF, page réécrite, namespace `partner`

**Niveau de revue :** unique + checklist « aucun champ de contenu ».
**Files:**
- Create: `src/components/partner/PartnerCounters.tsx`, `src/components/partner/DossierForm.tsx`, `src/components/partner/DossierCard.tsx`
- Modify: `src/pages/PartnerDashboardPage.tsx` (réécriture), `src/i18n/strings.{fr,en}.ts` (namespace `partner` réécrit en entier)

- [ ] **29.1** Namespace `partner` (remplace intégralement l'existant) :

```ts
// strings.fr.ts
  partner: {
    title: 'Espace partenaire',
    roleManager: 'Gérant',
    roleAdvisor: 'Conseiller',
    loadError: 'Impossible de charger votre espace partenaire.',
    retry: 'Réessayer',
    privacyNotice:
      'Vous ne voyez jamais le contenu du dossier de la famille : ni ses réponses, ni ses démarches, ni ses courriers, ni ses documents.',
    counters: {
      title: 'Vos dossiers',
      createdThisMonth: 'Créés ce mois',
      createdTotal: 'Créés au total',
      activatedTotal: 'Activés par la famille',
      pendingActivation: 'En attente d’activation',
      expiredInvitations: '{count} invitation{s} expirée{s}',
      cancelledTotal: '{count} annulé{s}',
    },
    form: {
      title: 'Ouvrir un dossier famille',
      familySection: 'La famille',
      deceasedSection: 'Le défunt',
      firstName: 'Prénom',
      lastName: 'Nom',
      email: 'E-mail',
      emailHint: 'L’invitation part à cette adresse : elle doit être personnelle à la famille.',
      phone: 'Téléphone (optionnel)',
      deathDate: 'Date du décès',
      submit: 'Créer et envoyer l’invitation',
      submitting: 'Création...',
      duplicateTitle: 'Un dossier existe déjà pour ce défunt à cette date',
      duplicateBody: 'Confirmez si vous souhaitez tout de même créer un nouveau dossier.',
      duplicateConfirm: 'Créer quand même',
      duplicateCancel: 'Annuler',
      created: 'Dossier créé. L’invitation a été envoyée à {email}.',
      createdEmailFailed: 'Dossier créé, mais l’e-mail n’a pas pu partir : utilisez « Renvoyer l’invitation ».',
      copyLink: 'Copier le lien d’activation (préproduction)',
      linkCopied: 'Lien copié',
      activationsClosed: 'La création de dossiers est momentanément fermée.',
      genericError: 'La création a échoué, réessayez.',
      errors: {
        required: 'Champ obligatoire',
        tooLong: '100 caractères maximum',
        invalidEmail: 'Adresse e-mail invalide',
        invalidPhone: 'Numéro de téléphone invalide',
        futureDate: 'La date ne peut pas être dans le futur',
        tooOld: 'Décès de plus de 2 ans : contactez Seren',
      },
    },
    list: {
      title: 'Dossiers',
      empty: 'Aucun dossier pour le moment.',
      family: 'Famille',
      deceased: 'Défunt : {name} — décès le {date}',
      createdOn: 'Créé le {date}',
      activatedOn: 'Activé le {date}',
      cancelledOn: 'Annulé le {date}',
      invitationValidUntil: 'Invitation valable jusqu’au {date}',
    },
    status: {
      invited: 'Invitation envoyée',
      invitedExpired: 'Invitation expirée',
      active: 'Activé',
      closed: 'Clos',
      cancelled: 'Annulé',
    },
    actions: {
      resend: 'Renvoyer l’invitation',
      resending: 'Envoi...',
      resent: 'Invitation renvoyée.',
      cancel: 'Annuler le dossier',
      cancelConfirm: 'Confirmer l’annulation',
      cancelKeep: 'Garder',
      cancelling: 'Annulation...',
      cancelUntil: 'Annulable jusqu’au {date}',
      actionError: 'L’action a échoué, réessayez.',
    },
  },
// strings.en.ts
  partner: {
    title: 'Partner area',
    roleManager: 'Manager',
    roleAdvisor: 'Advisor',
    loadError: 'Unable to load your partner area.',
    retry: 'Try again',
    privacyNotice:
      'You never see the content of the family’s file: not their answers, steps, letters or documents.',
    counters: {
      title: 'Your cases',
      createdThisMonth: 'Created this month',
      createdTotal: 'Created in total',
      activatedTotal: 'Activated by the family',
      pendingActivation: 'Awaiting activation',
      expiredInvitations: '{count} expired invitation{s}',
      cancelledTotal: '{count} cancelled',
    },
    form: {
      title: 'Open a family case',
      familySection: 'The family',
      deceasedSection: 'The deceased',
      firstName: 'First name',
      lastName: 'Last name',
      email: 'Email',
      emailHint: 'The invitation is sent to this address: it must belong to the family.',
      phone: 'Phone (optional)',
      deathDate: 'Date of death',
      submit: 'Create and send the invitation',
      submitting: 'Creating...',
      duplicateTitle: 'A case already exists for this deceased person on this date',
      duplicateBody: 'Confirm if you still want to create a new case.',
      duplicateConfirm: 'Create anyway',
      duplicateCancel: 'Cancel',
      created: 'Case created. The invitation was sent to {email}.',
      createdEmailFailed: 'Case created, but the email could not be sent: use “Resend invitation”.',
      copyLink: 'Copy the activation link (pre-production)',
      linkCopied: 'Link copied',
      activationsClosed: 'Case creation is temporarily closed.',
      genericError: 'Creation failed, please try again.',
      errors: {
        required: 'Required field',
        tooLong: '100 characters maximum',
        invalidEmail: 'Invalid email address',
        invalidPhone: 'Invalid phone number',
        futureDate: 'The date cannot be in the future',
        tooOld: 'Death more than 2 years ago: contact Seren',
      },
    },
    list: {
      title: 'Cases',
      empty: 'No cases yet.',
      family: 'Family',
      deceased: 'Deceased: {name} — died on {date}',
      createdOn: 'Created on {date}',
      activatedOn: 'Activated on {date}',
      cancelledOn: 'Cancelled on {date}',
      invitationValidUntil: 'Invitation valid until {date}',
    },
    status: {
      invited: 'Invitation sent',
      invitedExpired: 'Invitation expired',
      active: 'Activated',
      closed: 'Closed',
      cancelled: 'Cancelled',
    },
    actions: {
      resend: 'Resend invitation',
      resending: 'Sending...',
      resent: 'Invitation resent.',
      cancel: 'Cancel the case',
      cancelConfirm: 'Confirm cancellation',
      cancelKeep: 'Keep',
      cancelling: 'Cancelling...',
      cancelUntil: 'Can be cancelled until {date}',
      actionError: 'The action failed, please try again.',
    },
  },
```

- [ ] **29.2** `src/components/partner/PartnerCounters.tsx` — props `{ counters: PartnerCountersData }`. Quatre tuiles (`grid grid-cols-2 gap-4 lg:grid-cols-4`, tuile `rounded-card border border-border-card bg-white p-5 shadow-card-border`, libellé `text-sm font-medium text-text-secondary`, valeur `font-display text-[28px] font-normal text-text`) dans cet ordre : `createdThisMonth` ← `created_this_month`, `createdTotal` ← `created_total`, `activatedTotal` ← `activated_total`, `pendingActivation` ← `pending_activation`. Sous la grille, ligne `text-sm text-text-muted` : `fmt(expiredInvitations, { count, s })` · `fmt(cancelledTotal, { count, s })` (affichée seulement si l'une des deux valeurs > 0). **Aucun montant.**
- [ ] **29.3** `src/components/partner/DossierForm.tsx` — props `{ onCreate: (values: DossierFormValues, confirmDuplicate: boolean) => Promise<PartnerActionResult>; activationsEnabled: boolean }`. Si `!activationsEnabled` : carte avec `t.partner.form.activationsClosed`, pas de formulaire. Sinon : deux `fieldset` (`familySection` : prénom, nom, e-mail + `emailHint`, téléphone ; `deceasedSection` : prénom, nom, `<Input type="date" max={isoDay(new Date())} />`, `isoDay` importé de `@/lib/partner-dossier`), `Label`/`Input` Shadcn, grille `grid gap-4 sm:grid-cols-2`. Logique non triviale :

```tsx
  const [values, setValues] = useState<DossierFormValues>(EMPTY_DOSSIER_FORM)
  const [errors, setErrors] = useState<Partial<Record<DossierFormField, DossierFormErrorKey>>>({})
  const [duplicatePending, setDuplicatePending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [outcome, setOutcome] = useState<{ kind: 'created'; email: string; emailSent: boolean; activationUrl?: string } | { kind: 'error'; message: string } | null>(null)

  const submit = async (confirmDuplicate: boolean) => {
    const localErrors = validateDossierForm(values)
    setErrors(localErrors)
    if (Object.keys(localErrors).length > 0) return
    setSubmitting(true)
    setOutcome(null)
    const result = await onCreate(values, confirmDuplicate)
    setSubmitting(false)
    if (result.ok) {
      setOutcome({ kind: 'created', email: values.family_email.trim().toLowerCase(), emailSent: result.emailSent, activationUrl: result.activationUrl })
      setValues(EMPTY_DOSSIER_FORM)
      setDuplicatePending(false)
      return
    }
    if (result.code === 'DUPLICATE_DECEASED') { setDuplicatePending(true); return }
    if (result.code === 'INVALID_INPUT' && result.field) {
      const fieldMap: Record<string, DossierFormField> = { family_name: 'family_last_name', email: 'family_email', phone: 'family_phone', deceased_name: 'deceased_last_name', death_date: 'deceased_death_date' }
      const target = fieldMap[result.field]
      if (target) { setErrors({ [target]: target === 'family_email' ? 'invalidEmail' : target === 'family_phone' ? 'invalidPhone' : 'required' }); return }
    }
    setOutcome({ kind: 'error', message: result.message || t.partner.form.genericError })
  }
```

  Rendu du doublon : bandeau `rounded-2xl border border-warning/40 bg-warning-light p-4` avec `duplicateTitle`, `duplicateBody`, boutons `duplicateConfirm` (`submit(true)`) et `duplicateCancel` (`setDuplicatePending(false)`). Résultat `created` : `PillBadge tone="success"` + `fmt(created, { email })` ou `createdEmailFailed` ; si `activationUrl` : bouton `variant="outline"` `copyLink` → `navigator.clipboard.writeText(activationUrl)` puis libellé `linkCopied` (l'URL n'est jamais affichée en clair ni journalisée). Messages d'erreur de champ : `t.partner.form.errors[errors[field]]`.
- [ ] **29.4** `src/components/partner/DossierCard.tsx` — props `{ dossier: PartnerDossier; onResend: (id: string) => Promise<PartnerActionResult>; onCancel: (id: string) => Promise<PartnerActionResult>; activationsEnabled: boolean }`. Carte `rounded-card border border-border-card bg-white p-5 shadow-card-border`, colonne sur mobile, 2 colonnes à partir de `sm`. Contenu STRICTEMENT limité à : prénom + nom de la famille, e-mail, téléphone s'il existe ; `fmt(list.deceased, { name: prénom + nom, date })` ; `createdOn`, `activatedOn` / `cancelledOn` / `invitationValidUntil` selon le statut ; badge de statut :

| Statut | Clé | `PillBadge tone` |
|---|---|---|
| `invited` et `!invite_expired` | `status.invited` | `violet` (état « en cours ») |
| `invited` et `invite_expired` | `status.invitedExpired` | `warning` |
| `active` | `status.active` | `success` |
| `closed` | `status.closed` | `neutral` |
| `cancelled` | `status.cancelled` | `neutral` |

  Actions : « Renvoyer » visible si `dossier.can_resend && activationsEnabled` ; « Annuler » visible si `dossier.can_cancel && canCancel(dossier)` avec confirmation en deux temps (`cancel` → `cancelConfirm` / `cancelKeep`) et mention `fmt(actions.cancelUntil, { date: cancelDeadline(dossier.created_at) })`. Retour d'action : succès → message `actions.resent` (renvoi) ; échec → `result.message || t.partner.actions.actionError`. Dates formatées par `new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })` (heure ajoutée pour `cancelUntil` : `hour: '2-digit', minute: '2-digit'`).
- [ ] **29.5** `src/pages/PartnerDashboardPage.tsx` (réécriture) :

```tsx
import { Navigate } from 'react-router-dom'
import { usePartnerDashboard } from '@/hooks/usePartnerDashboard'
import { useAccount } from '@/hooks/useAccount'
import { useT } from '@/i18n/useT'
import { AppHeader } from '@/components/layout/AppHeader'
import { SectionHeading } from '@/components/ui/section-heading'
import { PillBadge } from '@/components/ui/pill-badge'
import { Button } from '@/components/ui/button'
import { PartnerCounters } from '@/components/partner/PartnerCounters'
import { DossierForm } from '@/components/partner/DossierForm'
import { DossierCard } from '@/components/partner/DossierCard'

// Espace partenaire v2 (contrat §2.2, §4.4). Règle rouge : identité de la famille et du défunt
// seulement, JAMAIS le contenu. Gardé par RequireAccess area="partner" + RPC côté serveur.
export function PartnerDashboardPage() {
  const t = useT()
  const { me } = useAccount()
  const { loading, error, notPartner, partner, dossiers, counters, refresh, createDossier, resendInvitation, cancelDossier } = usePartnerDashboard()
  const activationsEnabled = me?.flags.partner_activations_enabled !== false

  if (notPartner) return <Navigate to="/" replace />

  return (
    <div className="min-h-screen bg-bg">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        {loading && (
          <div className="flex min-h-[40vh] items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-border border-t-primary" />
          </div>
        )}
        {!loading && error && (
          <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
            <p className="mb-4 text-text-secondary">{t.partner.loadError}</p>
            <Button onClick={() => void refresh()}>{t.partner.retry}</Button>
          </div>
        )}
        {!loading && !error && partner && counters && (
          <>
            <SectionHeading as="h1" className="mb-3 max-w-none" title={t.partner.title} lead={partner.name} />
            <PillBadge tone="neutral" className="mb-8">
              {partner.user_role === 'manager' ? t.partner.roleManager : t.partner.roleAdvisor}
            </PillBadge>
            <PartnerCounters counters={counters} />
            {/* v2:billing-preview */}
            <section className="mt-10">
              <DossierForm onCreate={createDossier} activationsEnabled={activationsEnabled} />
            </section>
            <section className="mt-10">
              <h2 className="mb-4 font-display text-2xl font-normal text-text">{t.partner.list.title}</h2>
              {dossiers.length === 0 ? (
                <p className="text-text-muted">{t.partner.list.empty}</p>
              ) : (
                <div className="space-y-4">
                  {dossiers.map((dossier) => (
                    <DossierCard key={dossier.id} dossier={dossier} onResend={resendInvitation} onCancel={cancelDossier} activationsEnabled={activationsEnabled} />
                  ))}
                </div>
              )}
            </section>
            <p className="mt-10 text-center text-sm italic text-text-muted">{t.partner.privacyNotice}</p>
          </>
        )}
      </main>
    </div>
  )
}
```

- [ ] **29.6** Vérifier : gate R3 vert ; checklist « aucun champ de contenu » : `grep -rn "answers\|roadmap\|letter\|document\|attachment\|send_\|quota" src/components/partner src/pages/PartnerDashboardPage.tsx src/hooks/usePartnerDashboard.ts` → aucune sortie ; `grep -rn "#[0-9A-Fa-f]\{6\}" src/components/partner` → aucune sortie.
- [ ] **29.7** Commit (Tasks 28 + 29) : `git add src/hooks/usePartnerDashboard.ts src/components/partner src/pages/PartnerDashboardPage.tsx src/i18n/strings.fr.ts src/i18n/strings.en.ts && git commit -m "feat(v2-l4): espace PF — créer (doublon confirmé), lister, renvoyer, annuler sous 48 h, compteurs explicites, sans contenu famille"`.

---

## Lot L4c (partie app) — Vue admin Seren

Revue : route **double** (réservée aux admins, aucune PII), page **unique**. Branche `feature/v2-l4c-app` (SF2.7) ; la migration `20260915202000_v2_admin.sql` est livrée par `docs/plan-v2-sql.md` sur `feature/v2-l4c-sql`, mergée **avant** celle-ci (contrat §8.3) ; les tasks ci-dessous n'en dépendent qu'au runtime.

### Task 30 : `GET /api/admin/overview`

**Niveau de revue :** double.
**Files:**
- Create: `server/routes/admin.js`
- Modify: `server/server.js` (import + montage avant `// v2:mount-admin`), `server/lib/messages.js` (avant `// v2:messages-l4c`)
- Test: `tests/admin-routes.test.ts`

- [ ] **30.1** Test qui échoue, `tests/admin-routes.test.ts` :

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@sentry/node', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import express from 'express'
import request from 'supertest'
import * as Sentry from '@sentry/node'
// @ts-expect-error — module JS serveur
import { createAdminRouter } from '../server/routes/admin.js'

const OVERVIEW = {
  generated_at: '2026-09-17T10:00:00Z', month: '2026-09',
  partners: [{ partner_id: 'p-1', name: 'Pompes Funèbres Démo', status: 'active', dossiers_total: 7, dossiers_this_month: 3,
    invited_pending: 2, activated: 4, cancelled: 1, last_dossier_at: '2026-09-16T08:00:00Z' }],
}

function makeApp(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result)
  const app = express()
  app.use('/api/admin', createAdminRouter({
    requireAuth: (req: express.Request & { user?: unknown; supabaseClient?: unknown }, _res: express.Response, next: express.NextFunction) => {
      req.user = { id: 'admin-1' }
      req.supabaseClient = { rpc }
      next()
    },
  }))
  return { app, rpc }
}

describe('GET /api/admin/overview', () => {
  it('admin : 200 { success, overview } via admin_partner_overview au token utilisateur', async () => {
    const { app, rpc } = makeApp({ data: OVERVIEW, error: null })
    const res = await request(app).get('/api/admin/overview')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, overview: OVERVIEW })
    expect(rpc).toHaveBeenCalledWith('admin_partner_overview')
  })
  it('RPC null (compte non admin : PF, famille, none) : 403 NOT_ADMIN', async () => {
    const res = await request(makeApp({ data: null, error: null }).app).get('/api/admin/overview')
    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ success: false, code: 'NOT_ADMIN' })
  })
  it('RPC en erreur : 500 ADMIN_ERROR + Sentry', async () => {
    const res = await request(makeApp({ data: null, error: { code: 'XX000', message: 'boom' } }).app).get('/api/admin/overview?lang=en')
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('ADMIN_ERROR')
    expect(res.body.error).toBe('Admin area error')
    expect(Sentry.captureException).toHaveBeenCalled()
  })
})
```

- [ ] **30.2** Vérifier l'échec : `npx vitest run tests/admin-routes.test.ts` → échec d'import.
- [ ] **30.3** Créer `server/routes/admin.js` :

```js
// Vue admin Seren (contrat §3.3.14, §4.6) : compteurs par partenaire, AUCUNE PII famille. La
// barrière est en SQL (auth.uid() présent dans seren_admins, sinon null) ; aucun gate dossier.
import { Router } from 'express'
import * as Sentry from '@sentry/node'
import { msg } from '../lib/messages.js'

export function createAdminRouter({ requireAuth }) {
  const router = Router()

  router.get('/overview', requireAuth, async (req, res) => {
    const lang = req.query?.lang === 'en' ? 'en' : 'fr'
    try {
      const { data, error } = await req.supabaseClient.rpc('admin_partner_overview')
      if (error) throw new Error(`admin_partner_overview_failed:${error.code ?? 'unknown'}`)
      if (!data) return res.status(403).json({ success: false, code: 'NOT_ADMIN', error: msg(lang, 'not_admin') })
      return res.json({ success: true, overview: data })
    } catch (error) {
      console.error('❌ admin/overview :', error?.message ?? 'erreur inconnue')
      Sentry.captureException(error)
      return res.status(500).json({ success: false, code: 'ADMIN_ERROR', error: msg(lang, 'admin_error') })
    }
  })

  return router
}
```

- [ ] **30.4** `messages.js` : juste avant `// v2:messages-l4c` dans `fr` : `not_admin: 'Accès réservé à l’équipe Seren',` et `admin_error: 'Erreur dans l’espace d’administration',` ; dans `en` : `not_admin: 'Seren team only',` et `admin_error: 'Admin area error',`.
- [ ] **30.5** `server.js` : import `import { createAdminRouter } from './routes/admin.js';` ; juste avant `// v2:mount-admin` :

```js
// Vue admin Seren (lot L4c) : compteurs par partenaire, réservée aux comptes seren_admins (SQL).
app.use('/api/admin', createAdminRouter({ requireAuth }));
```

- [ ] **30.6** Vérifier : `npx vitest run tests/admin-routes.test.ts` → `0 failed` ; gate R3 vert.
- [ ] **30.7** Commit : `feat(v2-l4c): GET /api/admin/overview — compteurs par partenaire, 403 NOT_ADMIN hors seren_admins`.

### Task 31 : `useAdminOverview` et `AdminPage` (`/admin`)

**Niveau de revue :** unique.
**Prérequis :** note N6 validée.
**Files:**
- Create: `src/hooks/useAdminOverview.ts`, `src/pages/AdminPage.tsx`
- Modify: `src/App.tsx` (ligne juste avant `{/* v2:route-admin */}`), `src/i18n/strings.{fr,en}.ts` (namespace neuf `admin` avant `// v2:ns-l4c`)

- [ ] **31.1** i18n :

```ts
// strings.fr.ts
  admin: {
    title: 'Administration Seren',
    lead: 'Compteurs par partenaire — aucune donnée des familles.',
    generatedAt: 'Mis à jour le {date}',
    month: 'Mois en cours : {month}',
    refresh: 'Actualiser',
    empty: 'Aucun partenaire.',
    forbidden: 'Accès réservé à l’équipe Seren.',
    loadError: 'Impossible de charger les compteurs.',
    never: '—',
    totals: 'Total',
    columns: {
      partner: 'Partenaire',
      status: 'Statut',
      total: 'Dossiers créés',
      thisMonth: 'Créés ce mois',
      pending: 'Invités en attente',
      activated: 'Activés',
      cancelled: 'Annulés',
      lastDossier: 'Dernier dossier',
    },
    statusLabels: { prospect: 'Prospect', active: 'Actif', suspended: 'Suspendu', terminated: 'Résilié' },
  },
// strings.en.ts
  admin: {
    title: 'Seren administration',
    lead: 'Counters per partner — no family data.',
    generatedAt: 'Updated on {date}',
    month: 'Current month: {month}',
    refresh: 'Refresh',
    empty: 'No partners.',
    forbidden: 'Seren team only.',
    loadError: 'Unable to load the counters.',
    never: '—',
    totals: 'Total',
    columns: {
      partner: 'Partner',
      status: 'Status',
      total: 'Cases created',
      thisMonth: 'Created this month',
      pending: 'Invited, pending',
      activated: 'Activated',
      cancelled: 'Cancelled',
      lastDossier: 'Latest case',
    },
    statusLabels: { prospect: 'Prospect', active: 'Active', suspended: 'Suspended', terminated: 'Terminated' },
  },
```

- [ ] **31.2** `src/hooks/useAdminOverview.ts` :

```ts
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'

export interface AdminPartnerRow {
  partner_id: string
  name: string
  status: 'prospect' | 'active' | 'suspended' | 'terminated'
  dossiers_total: number
  dossiers_this_month: number
  invited_pending: number
  activated: number
  cancelled: number
  last_dossier_at: string | null
}
export interface AdminOverview { generated_at: string; month: string; partners: AdminPartnerRow[] }

type State = { loading: boolean; forbidden: boolean; error: boolean; overview: AdminOverview | null }

export function useAdminOverview() {
  const [state, setState] = useState<State>({ loading: true, forbidden: false, error: false, overview: null })

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }))
    try {
      const res = await apiFetch('/api/admin/overview')
      const data = await res.json().catch(() => null)
      if (res.status === 403) return setState({ loading: false, forbidden: true, error: false, overview: null })
      if (!res.ok || !data?.success) return setState({ loading: false, forbidden: false, error: true, overview: null })
      setState({ loading: false, forbidden: false, error: false, overview: data.overview as AdminOverview })
    } catch {
      setState({ loading: false, forbidden: false, error: true, overview: null })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { ...state, refresh }
}
```

- [ ] **31.3** `src/pages/AdminPage.tsx` : `AppHeader` ; `SectionHeading as="h1" title={t.admin.title} lead={t.admin.lead}` ; ligne `fmt(t.admin.month, { month })` · `fmt(t.admin.generatedAt, { date })` + bouton `refresh` (`variant="outline" size="sm"`). États : chargement (spinner), `forbidden` → `t.admin.forbidden` (la page reste sûre même sans `RequireAccess`), `error` → `loadError` + bouton `refresh`, liste vide → `empty`. Tableau dans `<div className="overflow-x-auto rounded-card border border-border-card bg-white shadow-card-border">` : `<table className="w-full min-w-[720px] text-left text-sm">`, en-têtes `text-text-secondary font-medium`, colonnes `t.admin.columns.*` dans l'ordre partner, status, total, thisMonth, pending, activated, cancelled, lastDossier ; cellule statut = `PillBadge` (`active` → `success`, `suspended` → `warning`, `prospect`/`terminated` → `neutral`) libellé `t.admin.statusLabels[status]` ; `last_dossier_at` formaté `Intl.DateTimeFormat` ou `t.admin.never` ; ligne de pied `t.admin.totals` avec les sommes des 5 colonnes numériques (calcul `overview.partners.reduce`). Aucune colonne famille, défunt ou e-mail.
- [ ] **31.4** `App.tsx` : `import { AdminPage } from '@/pages/AdminPage'` ; juste avant `{/* v2:route-admin */}` : `<Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />` (enveloppe `RequireAccess area="admin"` ajoutée par L8 au merge de L3, note N6).
- [ ] **31.5** Vérifier : gate R3 vert.
- [ ] **31.6** Commit : `feat(v2-l4c): page /admin — compteurs par partenaire (FR/EN, tokens @theme), sans PII`.

---

## Lot L4b — Estimation « à facturer ce mois » (CIBLE, préprod seulement)

Revue : **unique**. Branche `feature/v2-l4b`, créée APRÈS le merge de L4 dans `integration/v2-demo` (l'ancre `{/* v2:billing-preview */}` est posée par L4) : `git worktree add ../wt-v2-l4b -b feature/v2-l4b integration/v2-demo`. Premier élément de l'ordre de coupe.

### Task 32 : `billing-preview.ts`, `BillingPreview`, insertion à l'ancre

**Niveau de revue :** unique.
**Prérequis :** note N5 validée.
**Files:**
- Create: `src/lib/billing-preview.ts`, `src/components/partner/BillingPreview.tsx`
- Modify: `src/pages/PartnerDashboardPage.tsx` (1 import + 1 ligne à l'ancre), `src/i18n/strings.{fr,en}.ts` (namespace neuf `partnerBilling` avant `// v2:ns-l4b`)
- Test: `tests/billing-preview.test.ts`

- [ ] **32.1** Test qui échoue, `tests/billing-preview.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { formatEuroTtc, billingPreviewLines } from '@/lib/billing-preview'

// Intl insère des espaces insécables (U+00A0, U+202F) : normalisés pour les assertions.
const n = (s: string) => s.replace(/[  ]/g, ' ')

describe('formatEuroTtc', () => {
  it('fr : montant rond sans décimales, suffixe TTC', () => {
    expect(n(formatEuroTtc(22000, 'fr'))).toBe('220 € TTC')
  })
  it('fr : décimales conservées quand il y en a', () => {
    expect(n(formatEuroTtc(22050, 'fr'))).toBe('220,50 € TTC')
  })
  it('en : incl. VAT', () => {
    expect(n(formatEuroTtc(44000, 'en'))).toBe('€440 incl. VAT')
  })
})

describe('billingPreviewLines', () => {
  it('N × unitaire et total, sans HT ni montant de TVA', () => {
    const lines = billingPreviewLines({ billable_count: 2, seren_due_ttc_cents: 44000, unit_due_ttc_cents: 22000, currency: 'EUR' }, 'fr')
    expect(lines.count).toBe(2)
    expect(n(lines.formula)).toBe('2 × 220 € TTC')
    expect(n(lines.total)).toBe('440 € TTC')
    expect(JSON.stringify(lines)).not.toMatch(/HT|183/)
  })
  it('zéro dossier : 0 × 220 € TTC, total 0 € TTC', () => {
    const lines = billingPreviewLines({ billable_count: 0, seren_due_ttc_cents: 0, unit_due_ttc_cents: 22000, currency: 'EUR' }, 'fr')
    expect(n(lines.formula)).toBe('0 × 220 € TTC')
    expect(n(lines.total)).toBe('0 € TTC')
  })
})
```

- [ ] **32.2** Vérifier l'échec : `npx vitest run tests/billing-preview.test.ts` → échec d'import.
- [ ] **32.3** Créer `src/lib/billing-preview.ts` :

```ts
import type { Lang } from '@/i18n'
import type { BillingPreviewData } from '@/lib/partner-dossier'

// Estimation préprod (D7, A7) : dossiers ACTIVÉS par la famille ce mois × (prix − commission)
// snapshotés. Affichage sans valeur comptable : jamais de HT ni de montant de TVA (arrondi non tranché).
export function formatEuroTtc(cents: number, lang: Lang): string {
  const amount = new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
  return `${amount} ${lang === 'en' ? 'incl. VAT' : 'TTC'}`
}

export function billingPreviewLines(preview: BillingPreviewData, lang: Lang) {
  return {
    count: preview.billable_count,
    formula: `${preview.billable_count} × ${formatEuroTtc(preview.unit_due_ttc_cents, lang)}`,
    total: formatEuroTtc(preview.seren_due_ttc_cents, lang),
  }
}
```

- [ ] **32.4** i18n :

```ts
// strings.fr.ts
  partnerBilling: {
    title: 'Ce mois',
    line: '{count} dossier{s} activé{s} · {formula} à facturer',
    total: 'Total estimé : {total}',
    disclaimer: 'Estimation — facturation non active.',
  },
// strings.en.ts
  partnerBilling: {
    title: 'This month',
    line: '{count} activated case{s} · {formula} to invoice',
    total: 'Estimated total: {total}',
    disclaimer: 'Estimate — invoicing not active.',
  },
```

- [ ] **32.5** `src/components/partner/BillingPreview.tsx` — props `{ preview: BillingPreviewData | null }` ; `null` → `return null` ; sinon carte `mt-6 rounded-card border border-primary-border bg-primary-light p-5` : titre `t.partnerBilling.title` (`text-sm font-medium text-text-secondary`), `fmt(t.partnerBilling.line, { count, s: count > 1 ? 's' : '', formula })` (`font-display text-xl text-text`), `fmt(t.partnerBilling.total, { total })`, `disclaimer` (`text-xs italic text-text-muted`). Formatage via `billingPreviewLines(preview, lang)`.
- [ ] **32.6** `PartnerDashboardPage.tsx` : `import { BillingPreview } from '@/components/partner/BillingPreview'` ; juste après `{/* v2:billing-preview */}` : `<BillingPreview preview={counters.billing_preview} />`.
- [ ] **32.7** Vérifier : `npx vitest run tests/billing-preview.test.ts` → `0 failed` ; gate R3 vert.
- [ ] **32.8** Commit : `feat(v2-l4b): estimation « N × 220 € TTC à facturer » sous PARTNER_BILLING_PREVIEW (préprod), sans HT ni TVA`.

---

## Lot L7 — Textes bêta, runbook de démo, CLAUDE.md

Revue : **unique**. Branche `feature/v2-l7-app` (SF2.7). **Validation scindée (SF2.10)** : le **ton et l'offre** sont validés par Arnaud en U2 (10 min, grille §7 de `docs/textes-beta-v2.md`) ; la **relecture juridique** des textes bêta et des corps de courriers est un **prérequis hors créneau** (contrat §10.3, P6 et P7, échéance jeudi 12h) qui conditionne GNG6 (4) et (13). `scripts/seed-demo-v2.sql` **et** l'en-tête de `scripts/seed-demo-pf.sql` ne sont PAS dans ce plan (note N14, SF2.6) : ils appartiennent à `docs/plan-v2-sql.md` Task 12, sur `feature/v2-l7-sql`.

### Task 33 : `docs/textes-beta-v2.md` — CGU, confidentialité, données sensibles, art. 14, lettre d'engagement PF, support

**Niveau de revue :** unique.
**Files:**
- Create: `docs/textes-beta-v2.md`

- [ ] **33.1** Créer le document avec exactement les sections suivantes (prose FR complète, ton sobre adapté au deuil, phrases courtes ; chaque section se termine par une ligne « Statut : brouillon bêta — à valider (U2) — relecture juridique requise avant ouverture prod ») :
  0. **En-tête** : objet, date (2026-09-16), statut, lien vers le contrat §9.2 ; **liste fermée des informations à fournir par Arnaud** (sans lesquelles les textes restent en brouillon) : dénomination et forme sociale de Seren, SIREN, adresse du siège, directeur de la publication, adresse du support (H9, défaut `support@seren-app.fr`), durée de conservation retenue (proposition : 12 mois après la dernière connexion, alignée sur la purge à 1 an du chantier T), durée de la phase pilote PF et conditions tarifaires hors pilote.
  1. **Conditions générales d'utilisation (bêta)** : 1.1 Objet (accompagnement des démarches après un décès) ; 1.2 Accès sur invitation d'une pompe funèbre partenaire, compte personnel, lien d'activation valable 7 jours ; 1.3 Version bêta : informations et modèles de courriers indicatifs, en cours de relecture juridique, à vérifier auprès des organismes ; 1.4 Envois postaux : 10 envois inclus, réalisés par un prestataire d'impression et d'affranchissement, **un courrier envoyé ne peut plus être modifié**, contenu généré à partir de modèles et des informations saisies par l'utilisateur, qui en reste responsable ; 1.5 Ce que la pompe funèbre voit (identité de la famille et du défunt, statut d'activation) et ne voit jamais (réponses, démarches, courriers, documents, envois) ; 1.6 Responsabilité (obligation de moyens, pas de conseil juridique) ; 1.7 Données personnelles : renvoi à la politique de confidentialité ; 1.8 Fin d'utilisation et effacement (demande au support, traitement sous 30 jours) ; 1.9 Droit applicable (droit français) ; 1.10 Contact.
  2. **Politique de confidentialité (bêta)** : 2.1 Responsable de traitement (Seren, identité de la section 0) ; 2.2 Données reçues de la pompe funèbre (prénom, nom, e-mail, téléphone éventuel de la famille ; prénom, nom et date de décès du défunt) ; 2.3 Données saisies par la famille (réponses au questionnaire, démarches, courriers, adresse d'expéditeur, pièces jointes dont l'acte de décès) ; 2.4 Finalités et bases légales (exécution du service ; consentement explicite pour les données sensibles, art. 9.2.a) ; 2.5 Destinataires et sous-traitants : Supabase (base de données, UE — eu-west-1), Render (hébergement de l'application), Resend (e-mails d'invitation et de réinitialisation), MySendingBox (impression et envoi des courriers), Sentry (erreurs techniques, sans données personnelles), PostHog (mesure d'audience, uniquement après accord cookies) — **point à vérifier par Arnaud** : localisation des traitements de Resend et de MySendingBox et encadrement des transferts hors UE ; 2.6 La pompe funèbre n'accède jamais au contenu du dossier ; aucun LLM ne reçoit de données pendant la bêta ; 2.7 Durée de conservation (valeur de la section 0) ; 2.8 Droits (accès, rectification, effacement, opposition, limitation, portabilité), contact support, réclamation CNIL ; 2.9 Sécurité (isolation des comptes en base, stockage privé des documents, chiffrement des échanges) ; 2.10 Coffre de documents sans antivirus pendant la bêta (risque assumé, contrat §9.3-3) : ne déposer que les pièces nécessaires aux envois.
  3. **Données sensibles** : texte exact de la case (`consent.sensitiveData`, Task 24) et notice de 3 phrases : quelles informations (décès, situation familiale, patrimoine), pourquoi (préparer les démarches et les courriers), retrait possible à tout moment par demande d'effacement.
  4. **Information art. 14 (e-mail d'invitation)** : copie VERBATIM des gabarits FR et EN de `renderInvitationEmail` (Task 15, rendus avec partenaire « Pompes Funèbres Démo », prénom « Claire », date « 23 septembre 2026 »). Mention en tête : « Toute modification demandée se fait dans `server/lib/invitation-email.js` (lot L2b, correctif P1) puis est recopiée ici ».
  5. **Lettre d'engagement pilote — pompe funèbre partenaire** : parties ; objet (phase pilote Seren, sans facturation pendant le pilote, durée et conditions tarifaires hors pilote de la section 0) ; engagements de la PF : informer oralement la famille de l'ouverture du dossier et de l'e-mail à venir, saisir une adresse e-mail personnelle et exacte de la famille (jamais une adresse contrôlée par la PF), ne jamais transmettre ni utiliser le lien d'activation, annuler sous 48 h un dossier ouvert par erreur, protéger les accès de ses gérants et signaler tout départ ; engagements de Seren : ne jamais donner à la PF accès au contenu du dossier, information art. 14 de la famille dès l'invitation, sécurité, support ; **clause de sous-traitance conforme à l'art. 28** pour les opérations réalisées pour le compte de la PF (réception des coordonnées de la famille et envoi de l'invitation) : objet et durée, nature et finalité, types de données et catégories de personnes, instructions documentées, confidentialité des personnes autorisées, mesures de sécurité (art. 32), sous-traitants ultérieurs (liste de la section 2.5) et information préalable des changements, assistance pour les droits des personnes, notification des violations sans délai injustifié, suppression ou restitution en fin de contrat, mise à disposition des informations et audits ; base légale de la saisie par la PF avant tout consentement de la famille (à confirmer par le conseil juridique) ; signature. Rappel en tête : **condition GNG6 (8) — sans signature, `PARTNER_ACTIVATIONS_ENABLED` reste absent en prod (gérants seulement)**.
  6. **Support et effacement** : adresse publiée, délai de réponse annoncé (5 jours ouvrés), procédure d'effacement manuelle (renvoi `docs/runbook-beta-prod.md` § Effacement et `scripts/erase-family.sql`), délai d'exécution 30 jours.
  7. **Grille de validation U2** : tableau `| Texte | Validé (oui/non) | Corrections demandées |` pour les sections 1 à 6, plus les formulations du catalogue épicène (Task 1) et de l'offre (Task 3).
- [ ] **33.2** Vérifier : `grep -c "Statut : brouillon bêta" docs/textes-beta-v2.md` → `7` ; `grep -n "art. 28" docs/textes-beta-v2.md` → au moins 2 lignes.
- [ ] **33.3** Commit : `docs(v2-l7): textes bêta — CGU, confidentialité, données sensibles, art. 14, lettre d'engagement PF (art. 28), support`.

### Task 34 : Valeurs définitives de `legalPages` (après merge de L3)

**Niveau de revue :** unique.
**Prérequis :** L3 mergé dans `integration/v2-demo` (Task 39) ; Task 33 validée sur le **ton et l'offre** par Arnaud (U2) — en attendant, reprendre les brouillons. La relecture **juridique** (P7) arrive après et ne bloque pas cette task : elle bloque GNG6 (4).
**Files:**
- Modify: `src/i18n/strings.fr.ts`, `src/i18n/strings.en.ts` (VALEURS du namespace `legalPages` uniquement)

- [ ] **34.1** Mettre la branche à jour : `git rebase integration/v2-demo` (branche locale non poussée) ; attendu `Successfully rebased`.
- [ ] **34.2** `legalPages.legal.blocks` = une entrée `{ heading, body }` par sous-section 1.1 à 1.10 de `docs/textes-beta-v2.md` (titre de la sous-section → `heading`, texte → `body`, paragraphes séparés par `\n\n`) ; `legalPages.security.blocks` = sous-sections 2.1 à 2.10. EN : traduction fidèle, même nombre de blocs. `betaBanner` et `title` inchangés. Aucune clé ajoutée ni supprimée.
- [ ] **34.3** Vérifier : gate R3 vert ; parité du nombre de blocs : `grep -c "heading:" src/i18n/strings.fr.ts` et `grep -c "heading:" src/i18n/strings.en.ts` renvoient la même valeur (20 attendus : 10 blocs CGU + 10 blocs confidentialité).
- [ ] **34.4** Commit : `docs(v2-l7): pages /legal et /security alimentées par les textes bêta (FR/EN)`.

### Task 35 : `docs/runbook-demo-rendu.md` v2

**Niveau de revue :** unique.
**Files:**
- Modify: `docs/runbook-demo-rendu.md` (réécriture complète)

- [ ] **35.1** Réécrire le runbook avec ces sections et contenus précis :
  - **§0 État et paliers** : tableau des paliers (contrat §1.2) avec, pour chacun, le tag ou le deploy ID de repli (`preprod-plancher`, deploy ID U1, rc2) ; rappel « prod intouchée jusqu'à U4 » **et « aucun commit sur `main` jusqu'à U4 »** (SF2.11 : le fast-forward de l'étape 6 de U4 en dépend) ; renvoi au tableau **« Prérequis hors créneaux » P1-P12** du contrat §10.3, dont **P1 (2-3 plis MySendingBox LIVE envoyés par Arnaud, mer. 9h)** qui conditionne GNG6 (12) et l'ouverture du papier live.
  - **§1 Deux profils de navigateur (obligatoire)** : Chrome → Profils → créer « Seren PF » et « Seren Famille » ; raison : la session Supabase est stockée dans le `localStorage` de l'origine, deux onglets du même profil partagent donc la même session (activer la famille déconnecterait la PF) ; saisir la Basic Auth préprod dans CHAQUE profil et cocher la mémorisation ; profil PF connecté au gérant PF-X ; profil Famille ouvert sur la boîte e-mail de démo et sur le compte famille pré-activé.
  - **§2 Créneaux d'Arnaud** — réécrit le 16/09 (MF2.2, SF2.4, SF2.5, E7, E9, E13). Toute sortie inattendue = **STOP** et copie dans la session ; aucune clé, aucun mot de passe, aucun secret dans le chat. Les tags rc sont **locaux** au dépôt (posés par L8 dans `wt-integration`) : ils sont donc visibles depuis `../push-preprod`, qui est un worktree du même dépôt.

    **U1 — mer. 16/09, au plus tard 11h** : `docs/checklist-push.md`, intégralement (rien n'en est repris ici). GNG1 est rendu en fin de créneau et **décide du nombre de fichiers du dry-run de U2**.

    **U2 — mer. 12h30-13h25 (55 min)**, dans cet ordre :

    1. **CI sur le commit qu'on va déployer** (dépôt principal) : `git push origin integration/v2-demo` puis `gh run list --branch integration/v2-demo --limit 1`. ✅ `completed success` **avant** tout `db push` (les migrations sont irréversibles). 🛑 CI rouge → ne rien pousser en base, coller le lien du run.
    2. **Worktree de push et cible** :

    ```bash
    cd /Users/arnaudgay/Documents/git/Seren/push-preprod
    git checkout --detach preprod-v2-rc1
    cat supabase/.temp/project-ref
    ```

    ✅ `kvtzhyxlqouvpwasedbe`. 🛑 Toute autre valeur (surtout `oltwzvfjazwjvghpzhia`) : STOP immédiat.
    3. **Contrôle E7 — AVANT le `db push`** (SQL Editor préprod ; la migration v2 copie `attributions` → `dossiers` avec une contrainte de format sur l'e-mail, une seule adresse invalide ferait échouer **tout** le push) :

    ```sql
    select count(*) as emails_invalides
    from public.attributions a
    join auth.users u on u.id = a.user_id
    where lower(btrim(u.email)) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
       or char_length(u.email) > 254;
    ```

    ✅ `0`. 🛑 Sinon : corriger ou supprimer ces lignes d'`attributions` avant de pousser (déjà fait en U1 étape E si U1 s'est déroulé normalement).
    4. **Dry-run, liste CONDITIONNELLE** (SF2.4) : `supabase migration list` puis `supabase db push --dry-run`.
       - **GNG1 vert** (U1 a poussé les 8 migrations 2a) → **exactement 4 fichiers** : `20260915200000_v2_core.sql`, `20260915201000_v2_partner_rpc.sql`, `20260915202000_v2_admin.sql`, `20260915210000_transmissions_f1.sql`.
       - **GNG1 NO-GO** (U1 n'a pas poussé les migrations) → **exactement 12 fichiers** : les 8 de `docs/checklist-push.md` §D (`20260725120000_purchases.sql`, `20260913200000_pf_dashboard_demo.sql`, `20260914100000_sender_profiles_organisations.sql`, `20260914110000_organisations_seed.sql`, `20260914120000_letter_sends_papier.sql`, `20260914150000_purchases_kind_writer.sql`, `20260914160000_attachments.sql`, `20260914170000_resync_reader.sql`) **puis** les 4 v2 ci-dessus.
       🛑 Toute autre liste = STOP.
    5. **`supabase db push`**, puis `supabase migration list` → **18/18** dans les deux cas. Plans B : **H6** → exécuter dans le SQL Editor `alter function public.hook_before_user_created(jsonb) owner to postgres;` et `grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;` ; **42501 « must be owner of table objects »** (seulement dans le cas 12 fichiers) → procédure en 4 étapes de `docs/checklist-push.md` §D, **relancer `db push` tel quel ne suffit pas**.
    6. **Seed partie 1** (SQL Editor) : partenaires PF-X / PF-Y et enrôlements des gérants et de l'admin. ✅ Les lignes annoncées par le script.
    7. **Hook** : Auth → Hooks → Before User Created → Postgres → `public.hook_before_user_created` → **activer**.
    8. **Code préprod** (R10, forme pelée — `preprod-v2-rc1` est un tag annoté, `rc1:pre-prod` serait **rejeté**) :

    ```bash
    cd /Users/arnaudgay/Documents/git/Seren/Application
    git fetch origin
    git merge-base --is-ancestor origin/pre-prod 'preprod-v2-rc1^{commit}' && echo "fast-forward possible"
    git push origin 'preprod-v2-rc1^{commit}:refs/heads/pre-prod'
    git push origin preprod-v2-rc1
    ```

    ✅ fast-forward, Render déploie, **deploy ID noté**. 🛑 `rejected (non-fast-forward)` : ne jamais forcer — si `preprod-plancher` avait été poussé, la session doit d'abord exécuter 39.8.
    9. **Comptes internes — créés par Arnaud, jamais par un script** (must-fix 2, écart E13) : Authentication → Users → **« Add user »** (auto-confirm) pour les gérants PF-X, PF-Y et l'admin, **en posant le mot de passe à la création** (valeur générée par `openssl rand -base64 18`, gardée dans le gestionnaire de mots de passe d'Arnaud — jamais dans le dépôt ni dans le chat : cela évite l'aller-retour par « Send password recovery », qui dépend du SMTP et reste réservé au **gérant de PF réel** en prod (Task 44 §9) ; le compte reste « jamais connecté », condition exigée par `link_enrollments`). 🛑 **Le bouton doit CRÉER le compte : « already registered » = STOP et enquête** (l'adresse enrôlée est déjà détenue par quelqu'un). Puis **copier les 3 UUID** (colonne UID). ⚠️ **Ne se connecter à aucun de ces comptes avant l'étape 10** (ni par l'app, ni par le script) : la partie 2 refuse un compte déjà connecté.
    10. **Seed partie 2 — appariement explicite e-mail ↔ UUID** (SQL Editor) :

    ```sql
    select public.link_enrollments('[{"email":"pf.demo@seren-test.fr","user_id":"<UUID PF-X>"},
                                    {"email":"pf.temoin@seren-test.fr","user_id":"<UUID PF-Y>"},
                                    {"email":"admin.demo@seren-test.fr","user_id":"<UUID admin>"}]'::jsonb);
    ```

    ✅ `partner_users_linked: 2`, `seren_admins_linked: 1`, **`pending: 0` et `untrusted: 0`**. 🛑 `untrusted > 0` : un compte portant une adresse enrôlée n'est pas fiable (créé avant l'enrôlement, déjà connecté, changement d'e-mail en attente, ou UUID d'un autre compte) → enquête, aucun rôle n'a été donné.
    11. **Provisionnement des comptes de probes et de démo — APRÈS l'étape 10, jamais avant** (le script se connecte réellement : lancé avant la partie 2, il poserait `last_sign_in_at` et `link_enrollments` refuserait les comptes) — depuis `../push-preprod`, qui contient le script (le dépôt principal est sur `main` et ne l'a pas) ; les dossiers passent par `POST /api/partner/dossiers` (écart E10 : la RPC exige le secret serveur) :

    ```bash
    cd /Users/arnaudgay/Documents/git/Seren/push-preprod
    E2E_TARGET=preprod \
    PROBE_SUPABASE_URL=https://kvtzhyxlqouvpwasedbe.supabase.co \
    PROBE_SUPABASE_KEY='<clé publishable préprod>' \
    PROVISION_API_URL=https://preprod-app.seren-app.fr \
    PROVISION_PFX_EMAIL=pf.demo@seren-test.fr PROVISION_PFY_EMAIL=pf.temoin@seren-test.fr \
    PROVISION_ADMIN_EMAIL=admin.demo@seren-test.fr PROVISION_DEMO_EMAIL=famille.demo@seren-test.fr \
    PROVISION_PFX_PASSWORD='<mdp PF-X>' PROVISION_PFY_PASSWORD='<mdp PF-Y>' PROVISION_ADMIN_PASSWORD='<mdp admin>' \
    PROBE_ENV_FILE="$HOME/.seren-probes.env" \
    node scripts/provision-v2.mjs
    ```

    ✅ sortie sans erreur, identifiants écrits dans `~/.seren-probes.env` (mode 600, hors dépôt). **Code de sortie 2** = action d'Arnaud requise : le message nomme l'étape manquante (« Add user » non fait, partie 2 non jouée, ou mot de passe non fourni) — la corriger et relancer **la même commande**. 🛑 Échec persistant → **seed partie 3** (dossier de démo actif créé en SQL) : la démo est sauvée, les probes sont reportées en U3.
    12. **Vérification** :

    ```bash
    cd /Users/arnaudgay/Documents/git/Seren/push-preprod
    E2E_TARGET=preprod PROBE_SUPABASE_URL=https://kvtzhyxlqouvpwasedbe.supabase.co \
    PROBE_SUPABASE_KEY='<clé publishable préprod>' PROVISION_API_URL=https://preprod-app.seren-app.fr \
    node --env-file="$HOME/.seren-probes.env" scripts/provision-v2.mjs --verify
    ```

    ✅ `# 12/12 ok`.
    13. **Validation des textes, 10 min — TON ET OFFRE seulement** (SF2.10) : grille §7 de `docs/textes-beta-v2.md`, formulations du catalogue épicène et de l'offre. La **relecture juridique** (CGU, confidentialité, données sensibles, art. 14, corps de courriers) est un prérequis **hors créneau** (contrat §10.3, P6 et P7, échéance jeudi 12h).

    ⚠️ **Pièges de ce créneau.** *(E9)* Un compte famille dont le dossier est **actif** ne peut plus être supprimé depuis le Dashboard (`Delete user` bloqué) : clore d'abord le dossier (partie B de `scripts/erase-family.sql`). *(Resend)* Le provisionnement fait **réellement** partir les invitations vers `rls-probe-*@seren-test.fr` : c'est accepté ; pour l'éviter, retirer temporairement `RESEND_API_KEY` de Render (les dossiers sont créés quand même, avec `email_sent:false`). *(H17)* L'unicité de l'e-mail famille est globale : une adresse déjà utilisée renvoie `EMAIL_UNAVAILABLE` — prévoir des adresses neuves pour la répétition.

    **U3 — mer. 20h30-21h15** : push de `preprod-v2-rc2` **en forme pelée** (commandes exactes fournies par 41.3), deploy ID noté ; si l'E2E et les probes ont été refusés aux agents l'après-midi, les lancer ici, depuis `../push-preprod` — **un seul nom de variable pour le mode écriture, `PROBE_WRITE=1`** (SF2.5 ; `--write` n'existe pas et serait ignoré silencieusement) :

    ```bash
    cd /Users/arnaudgay/Documents/git/Seren/push-preprod
    set -a && . "$HOME/.seren-probes.env" && set +a
    E2E_TARGET=preprod E2E_API_URL=https://preprod-app.seren-app.fr \
      E2E_SUPABASE_URL=https://kvtzhyxlqouvpwasedbe.supabase.co E2E_SUPABASE_KEY="$PROBE_SUPABASE_KEY" \
      node scripts/e2e-v2.mjs
    node --env-file="$HOME/.seren-probes.env" scripts/rls-probes.mjs
    PROBE_WRITE=1 PROBE_API_URL=https://preprod-app.seren-app.fr \
      node --env-file="$HOME/.seren-probes.env" scripts/rls-probes.mjs
    ```

    ✅ `1..13` sans `not ok` pour l'E2E ; aucune ligne `not ok` pour les probes (en lecture seule, les sondes d'écriture sortent en SKIP). Puis **répétition chronométrée** (2 profils, vraie boîte) et verdict des défauts (GNG5).

    **Jeudi 9h-9h25** : push de rc3 s'il est retenu, puis tag de démo — commandes exactes en 41.5, **toutes en forme pelée**, tag `demo-2026-09-18` **annoté** et poussé séparément. Deploy IDs rc2 et rc3 notés, puis checklist du jour J (§4).
  - **§3 Scénario chronométré** (reprend le plan retenu, adapté à D3) : 0:00 modèle (290 € TTC famille dans la facture PF, 70 € de commission PF, 220 € TTC facturés par Seren, la PF ne voit jamais le contenu) ; 0:45 profil PF : compteurs explicites (créés ce mois, au total, activés, en attente) et estimation L4b si livrée ; création d'un dossier en direct (e-mail neuf de la boîte de démo) ; ressaisie du même défunt → avertissement de doublon ; 2:00 profil Famille : e-mail d'invitation (repli : lien copiable « préproduction » du profil PF, collé dans le profil Famille) → `/activation` → mot de passe → `/bienvenue` (3 cases, « proposé par Pompes Funèbres Démo ») ; 3:15 questionnaire en textes statiques (2-3 questions) puis bascule sur le compte pré-activé du même profil ; 4:30 écran de fin « N courriers prêts », roadmap avec bandeau de relecture, courrier bailleur pré-rempli, PJ PDF fictive, envoi papier en clé TEST → « Pris en charge », badge « 9 envois inclus restants sur 10 » ; phrase orale : « en test, l'imprimeur accepte le pli sans l'imprimer ; en production le suivi est réel » ; 6:30 profil PF : le dossier créé à 0:45 est « Activé », aucune réponse ni courrier visible ; 7:15 sécurité : `/signup` redirigé, sortie du scénario hook (inscription non invitée refusée), sortie des probes (PF-X ne lit pas sa propre famille), flags fermés (LLM, e-mail aux organismes, mini-paiement) ; 8:15 ce qui ouvre ce soir en bêta pilote (D1, D3, D8) et la suite (LRAR, file de validation, relances, facturation SEPA, coffre complet).
  - **§4 Checklist du jour J** : 14h00 warm-up automatique (agents, `/api/health` toutes les 5 min jusqu'à 15h30) ; 14h50 ouvrir les deux profils, page PF chargée en moins de 3 s ; invitation de secours prête (dossier créé à 14h45, lien copié hors écran) ; compte pré-activé : `/api/me` = quota 10/10, consentement à jour ; captures ouvertes dans un dossier local ; Sentry préprod ouvert.
  - **§5 Replis** : e-mail absent → lien copiable ; activation en échec → compte pré-activé ; envoi papier en échec (502/503) → PDF téléchargé + captures du 2a ; préprod rouge à 10h45 → Render « Rollback » vers le deploy rc2 ; migration v2 fautive → Render « Rollback » vers le deploy de U1 (la RPC `partner_dashboard` v0 reste intacte) ; hook qui refuse tout → Auth → Hooks → désactiver (1 clic), le gate serveur maintient les 403 ; **Render ne déploie pas un tag** : rollback par « Rollback » sur un deploy ou « Deploy specific commit ».
  - **§6 Pièges connus** : `dedup_key` papier (même modèle + même adresse sur un compte = 409 `SEND_ALREADY_EXISTS` : un compte neuf par répétition), plafonds `send_limits` (10/utilisateur, 50/jour : relever en préprod par `update send_limits set max_user_daily = 50, max_global_daily = 200 where id = 1;` avant la répétition), statut figé « Pris en charge » en clé TEST, fragment `#t=` et Basic Auth (H8 : si le navigateur perd le fragment après le défi Basic Auth, ouvrir le lien APRÈS avoir saisi la Basic Auth dans le profil), unicité globale de l'e-mail famille (H17 : une adresse = un dossier).
  - **§7 Captures de secours (réalisées par les AGENTS en 41.1, pas par Arnaud — SF2.10)** : la recette visuelle parcourt déjà les 14 écrans dans le panneau navigateur et en capture chacun en **FR, largeur desktop**, dans un dossier local nommé dans le rapport de 41.1. Arnaud ne refait en U3 que les captures manquantes ou fausses (5 min maximum). Liste des 14 écrans, en FR, desktop : `/login`, `/activation` (prêt), `/activation` (lien expiré), `/bienvenue`, une question du questionnaire, écran de fin, roadmap avec bandeau, panneau d'envoi papier, envoi « Pris en charge » + quota 9/10, 402 « contactez le support », `/partenaire` (compteurs + formulaire), avertissement de doublon, carte « Activé », `/admin`.
- [ ] **35.2** Vérifier : `grep -c "^## \|^### " docs/runbook-demo-rendu.md` → au moins 8 ; `grep -n "oltwzvfjazwjvghpzhia" docs/runbook-demo-rendu.md` → uniquement dans des mises en garde (jamais dans une commande).
- [ ] **35.3** Commit : `docs(v2-l7): runbook de démo v2 — 2 profils, créneaux U2/U3/J, scénario chronométré, replis et pièges`.

### Task 36 : `CLAUDE.md` (branche `feature/v2-l7-app`)

**Niveau de revue :** unique.
**Files:**
- Modify: `CLAUDE.md` (sections Stack, Variables d'environnement, Workflow & état, Points d'attention)

(`scripts/seed-demo-pf.sql` **ne fait plus partie de cette task** : son en-tête « obsolète v2 » est livré par `docs/plan-v2-sql.md` Task 12 — un seul propriétaire par fichier, SF2.6.)

- [ ] **36.1** `CLAUDE.md` :
  - **Stack / Backend** : remplacer « paiement du forfait (Stripe Checkout + webhook) » par « espace partenaire PF et activation famille par jeton (v2), gate dossier actif, mini-paiement « envoi supplémentaire » (fermé par flag) » ; **IA** : ajouter « coupée par défaut (`FEATURE_LLM`) ».
  - **Variables d'environnement** : supprimer les puces `PAYMENTS_ENABLED` et `FORFAIT_INCLUDED_SENDS` ; réécrire `STRIPE_*` en « `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_EXTRA_SEND` — mini-paiement uniquement, inerte sans `EXTRA_SENDS_ENABLED` (`STRIPE_PRICE_ID` n'est plus lu) » ; ajouter : « **Flags v2** (seule la valeur exacte `'true'` ouvre, relus à chaque requête sauf `FEATURE_LLM` lu au démarrage) : `FEATURE_LLM`, `EMAIL_SENDS_ENABLED`, `EXTRA_SENDS_ENABLED`, `PAPER_SENDS_ENABLED` (canal papier ET dépôt de PJ), `PARTNER_ACTIVATIONS_ENABLED`, `SHOW_ACTIVATION_LINK` (**jamais en prod**), `PARTNER_BILLING_PREVIEW` (préprod seulement) — tableau préprod/prod : `docs/design-v2-demonstrateur.md` §5 et §11.2 » et « `SUPPORT_EMAIL` — contact affiché (défaut `support@seren-app.fr`) ».
  - **Workflow & état** : ajouter une puce « **Fait (suite) — démonstrateur v2** (spec `docs/design-v2-demonstrateur.md`, plans `docs/plan-v2-app.md` et `docs/plan-v2-sql.md`) : modèle PF (la PF ouvre le dossier, la famille active par jeton 7 j, 10 envois inclus via pont `purchases` `partner_dossier:<id>`), hook Auth « Before User Created », gate `requireActiveDossier` fail-closed, consentements versionnés, vue admin Seren, F1 transmissions. Tags : `preprod-plancher`, `preprod-v2-rc1..3`, `demo-2026-09-18`. Bêta pilote prod : `docs/runbook-beta-prod.md` (GNG6). » ; dans « Décisions produit ouvertes », retirer « correctif RLS transmissions » (F1 livré) et « droit à l'effacement » devient « effacement automatisé (procédure manuelle bêta livrée) ».
  - **Points d'attention** : ajouter « **Dette pont `purchases`** : lignes `stripe_session_id = 'partner_dossier:<id>'` à `amount_total` null — toute requête de CA sur `purchases` exclut ce préfixe (retrait au lot 2c) » ; « **Agents** : Supabase local uniquement (`supabase start` puis `--local`), jamais `link`/`--linked`/`db push` ; `psql` absent de l'hôte → `docker exec -i supabase_db_Application psql -U postgres -d postgres` ; le `.env` du dépôt principal visait la PROD et a été renommé (`.env.prod-NE-PAS-UTILISER`) » ; mettre à jour le nombre de tests avec la valeur consignée par L8 à rc1 ; ajouter « **Gel de `main` jusqu'à U4 (jeudi 18/09 16h30)** : aucun commit, aucun merge local sur `main` — la promotion prod est un fast-forward de `demo-2026-09-18` et un commit de documentation suffirait à le faire échouer une heure après la démo (SF2.11). Les correctifs de la semaine vont sur `pre-prod` ou sur une branche de travail. »
- [ ] **36.2** *(supprimée le 16/09 — SF2.6)* L'en-tête « obsolète v2 » de `scripts/seed-demo-pf.sql` est écrit par `docs/plan-v2-sql.md` Task 12 (branche `feature/v2-l7-sql`). Ne pas y toucher ici : deux en-têtes sur le même fichier = doublon ou conflit de merge.
- [ ] **36.3** Vérifier : `grep -n "PAYMENTS_ENABLED\|FORFAIT_INCLUDED_SENDS" CLAUDE.md` → aucune ligne hors mention « n'est plus lu » ; `grep -n "main" CLAUDE.md | grep -i "gel"` → la consigne de gel de `main` est présente ; commit : `docs(v2-l7): CLAUDE.md v2 (flags, pont purchases, agents en local, gel de main jusqu'à U4)`.

---

## Lot L8 — Intégration, E2E, tags, recette

Revue : vérification avec preuves (sorties collées) ; tout correctif touchant SQL, gate ou jeton repasse en **double revue**, même en urgence. Worktree `wt-integration`. Environnement local : règle R9 (outillage de `docs/plan-v2-sql.md` Task 0 : `v2-env.sh`, `psql-local`, `with-db-lock`, `run-sql-checks`) ; les variables locales se lisent par `supabase status -o env` (`API_URL`, `PUBLISHABLE_KEY`).

### Task 37 : `scripts/e2e-v2.mjs` (propriété L6 au contrat, écrit par ce plan — note N8)

**Niveau de revue :** double (manipule le jeton ; garde anti-prod).
**Files:**
- Create: `scripts/e2e-v2.mjs` sur la branche **`feature/v2-l6-e2e`**, dans son propre worktree (SF2.7 : ne jamais écrire dans `feature/v2-l6`, ni dans le worktree du plan SQL, qui travaillent en parallèle cette nuit) :

```bash
cd /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-integration \
  && git worktree add ../wt-v2-l6-e2e -b feature/v2-l6-e2e integration/v2-demo \
  && ln -s /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-integration/node_modules ../wt-v2-l6-e2e/node_modules
```

`scripts/check-env-target.mjs`, importé par le script, existe déjà sur `integration/v2-demo` (L0) : cette branche n'a donc **aucune** dépendance au lot L6, et merge juste après lui (contrat §8.3).

- [ ] **37.1** Créer (**nuit du 15 au 16**, pour que le rejeu local de mercredi 8h-11h en dispose) :

```js
#!/usr/bin/env node
// ============================================================================
// scripts/e2e-v2.mjs — Parcours v2 de bout en bout par l'API PUBLIQUE (contrat §10.2)
// ============================================================================
// Création PF → check → signUp (hash) → claim (+ rejeu) → record_consents → /api/me (10/10)
// → envoi papier (clé TEST) → quota 9/10 → vue PF sans contenu → compteurs → signUp non invité refusé.
//
// Cibles : Supabase LOCAL par défaut ; préprod seulement avec E2E_TARGET=preprod ; PROD toujours
// refusée (project-ref ou domaine app.seren-app.fr). Node pur, fetch natif, zéro dépendance.
// N'affiche JAMAIS de jeton, de hash, de mot de passe ni d'access token. Sortie TAP, exit 1 si échec.
//
// Variables : E2E_API_URL, E2E_SUPABASE_URL, E2E_SUPABASE_KEY, E2E_PF_EMAIL (repli PROBE_PARTNER_EMAIL),
// E2E_PF_PASSWORD (repli PROBE_PARTNER_PASSWORD), E2E_FAMILY_DOMAIN (défaut seren-test.fr),
// E2E_PAPER=skip (sauter l'envoi papier, ex. local sans clé MySendingBox), E2E_TARGET=preprod.
// ============================================================================
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { isProdTarget } from './check-env-target.mjs'

const env = process.env
function required(name, fallback) {
  const value = env[name] ?? (fallback ? env[fallback] : undefined)
  if (!value) {
    console.error(`Variable manquante : ${name}${fallback ? ` (ou ${fallback})` : ''}`)
    process.exit(1)
  }
  return value
}

const API_URL = required('E2E_API_URL').replace(/\/+$/, '')
const SUPABASE_URL = required('E2E_SUPABASE_URL').replace(/\/+$/, '')
const SUPABASE_KEY = required('E2E_SUPABASE_KEY')
const PF_EMAIL = required('E2E_PF_EMAIL', 'PROBE_PARTNER_EMAIL')
const PF_PASSWORD = required('E2E_PF_PASSWORD', 'PROBE_PARTNER_PASSWORD')
const FAMILY_DOMAIN = env.E2E_FAMILY_DOMAIN || 'seren-test.fr'
const WITH_PAPER = env.E2E_PAPER !== 'skip'

// ── Garde d'environnement (avant tout appel réseau) ────────────────────────
const LOCAL_RE = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/
for (const url of [API_URL, SUPABASE_URL]) {
  if (isProdTarget(url) || new URL(url).hostname === 'app.seren-app.fr') {
    console.error('Refus : cible PROD. Ce script écrit (dossiers, comptes, envoi) — jamais sur la prod.')
    process.exit(1)
  }
}
const isLocal = LOCAL_RE.test(API_URL) && LOCAL_RE.test(SUPABASE_URL)
if (!isLocal && env.E2E_TARGET !== 'preprod') {
  console.error('Refus : URL non locale sans E2E_TARGET=preprod explicite.')
  process.exit(1)
}
if (env.E2E_TARGET === 'preprod' && !SUPABASE_URL.includes('kvtzhyxlqouvpwasedbe')) {
  console.error('Refus : E2E_TARGET=preprod exige la base préprod kvtzhyxlqouvpwasedbe.')
  process.exit(1)
}

const CONSENT_VERSION = readFileSync(new URL('../src/lib/consent-version.ts', import.meta.url), 'utf8')
  .match(/CONSENT_VERSION\s*=\s*'([^']+)'/)?.[1]
if (!CONSENT_VERSION) {
  console.error('CONSENT_VERSION introuvable dans src/lib/consent-version.ts')
  process.exit(1)
}

// ── Utilitaires ─────────────────────────────────────────────────────────────
const results = []
let failed = false
async function step(name, fn) {
  try {
    const detail = await fn()
    results.push(`ok ${results.length + 1} - ${name}${detail ? ` (${detail})` : ''}`)
  } catch (error) {
    failed = true
    results.push(`not ok ${results.length + 1} - ${name} : ${error.message}`)
    throw error
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message)
}
async function http(method, url, { token, body, headers = {} } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(url.startsWith(SUPABASE_URL) ? { apikey: SUPABASE_KEY } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = null }
  return { status: res.status, json }
}
const sha256Hex = (value) => createHash('sha256').update(value, 'utf8').digest('hex')
const FORBIDDEN_CONTENT_KEYS = ['answers', 'roadmap', 'roadmaps', 'steps', 'letters', 'letter_sends', 'sends', 'documents', 'attachments', 'quota', 'consents', 'purchases', 'body', 'variables']
function findForbiddenKeys(node, path = '') {
  if (!node || typeof node !== 'object') return []
  return Object.entries(node).flatMap(([key, value]) => [
    ...(FORBIDDEN_CONTENT_KEYS.includes(key) ? [`${path}${key}`] : []),
    ...findForbiddenKeys(value, `${path}${key}.`),
  ])
}

// ── Parcours ────────────────────────────────────────────────────────────────
const runId = randomUUID().slice(0, 8)
const familyEmail = `e2e.famille+${runId}@${FAMILY_DOMAIN}`
const familyPassword = `E2e-${randomUUID()}-Aa1!`
const deathDate = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString().slice(0, 10)
const state = {}

try {
  await step('connexion du gérant PF', async () => {
    const res = await http('POST', `${SUPABASE_URL}/auth/v1/token?grant_type=password`, { body: { email: PF_EMAIL, password: PF_PASSWORD } })
    assert(res.status === 200 && res.json?.access_token, `connexion PF refusée (HTTP ${res.status})`)
    state.pfToken = res.json.access_token
  })

  await step('création du dossier par la PF (201, hash seul côté base)', async () => {
    const res = await http('POST', `${API_URL}/api/partner/dossiers`, {
      token: state.pfToken,
      body: { family_first_name: 'Claire', family_last_name: `E2E-${runId}`, family_email: familyEmail,
        deceased_first_name: 'Jean', deceased_last_name: `Defunt-${runId}`, deceased_death_date: deathDate, lang: 'fr' },
    })
    assert(res.status === 201, `HTTP ${res.status} ${res.json?.code ?? ''}`)
    assert(typeof res.json?.activation_url === 'string', 'activation_url absent : SHOW_ACTIVATION_LINK=true est requis pour cet E2E')
    state.dossierId = res.json.dossier.id
    state.token = new URL(res.json.activation_url).hash.replace(/^#t=/, '')
    assert(/^[A-Za-z0-9_-]{43}$/.test(state.token), 'jeton de forme inattendue')
    state.hash = sha256Hex(state.token)
    return `dossier ${state.dossierId}, email_sent=${res.json.email_sent}`
  })

  await step('check public de l’invitation (200, e-mail attendu)', async () => {
    const res = await http('POST', `${API_URL}/api/activation/check`, { body: { token_hash: state.hash, lang: 'fr' } })
    assert(res.status === 200, `HTTP ${res.status} ${res.json?.code ?? ''}`)
    assert(res.json.invitation.email === familyEmail, 'e-mail d’invitation inattendu')
  })

  await step('signUp famille avec invite_token_hash (session immédiate)', async () => {
    const res = await http('POST', `${SUPABASE_URL}/auth/v1/signup`, { body: { email: familyEmail, password: familyPassword, data: { invite_token_hash: state.hash } } })
    const accessToken = res.json?.access_token ?? res.json?.session?.access_token
    assert(res.status === 200 && accessToken, `signUp refusé ou sans session (HTTP ${res.status}) — hook et « Confirm email » à vérifier`)
    state.familyToken = accessToken
  })

  await step('claim du dossier (200 claimed) puis rejeu idempotent (already_active)', async () => {
    const first = await http('POST', `${API_URL}/api/activation/claim`, { token: state.familyToken, body: { token_hash: state.hash } })
    assert(first.status === 200 && first.json?.claimed === true, `claim : HTTP ${first.status} ${first.json?.code ?? ''}`)
    const again = await http('POST', `${API_URL}/api/activation/claim`, { token: state.familyToken, body: { token_hash: state.hash } })
    assert(again.status === 200 && again.json?.already_active === true, `rejeu : HTTP ${again.status} ${again.json?.code ?? ''}`)
  })

  await step('check après claim : lien mort (404)', async () => {
    const res = await http('POST', `${API_URL}/api/activation/check`, { body: { token_hash: state.hash } })
    assert(res.status === 404, `HTTP ${res.status}`)
  })

  await step('gate avant consentement : 403 CONSENT_REQUIRED', async () => {
    const res = await http('GET', `${API_URL}/api/letters/quota`, { token: state.familyToken })
    assert(res.status === 403 && res.json?.code === 'CONSENT_REQUIRED', `HTTP ${res.status} ${res.json?.code ?? ''}`)
  })

  await step('record_consents (3 kinds, version courante)', async () => {
    const res = await http('POST', `${SUPABASE_URL}/rest/v1/rpc/record_consents`, {
      token: state.familyToken, body: { p_version: CONSENT_VERSION, p_kinds: ['terms', 'privacy', 'sensitive_data'] },
    })
    assert(res.status === 200 && res.json?.required === false, `HTTP ${res.status}`)
  })

  await step('/api/me famille : role family, consentement OK, quota 10/10', async () => {
    const res = await http('GET', `${API_URL}/api/me`, { token: state.familyToken })
    assert(res.status === 200, `HTTP ${res.status}`)
    assert(res.json.account?.role === 'family' && res.json.account?.consent?.required === false, 'compte inattendu')
    assert(res.json.quota?.balance === 10 && res.json.quota?.included_total === 10, `quota ${JSON.stringify(res.json.quota)}`)
  })

  if (WITH_PAPER) {
    await step('envoi papier (clé TEST) : 202 puis quota 9/10', async () => {
      const user = await http('GET', `${SUPABASE_URL}/auth/v1/user`, { token: state.familyToken })
      assert(user.status === 200 && user.json?.id, 'lecture de l’utilisateur impossible')
      const profile = await http('POST', `${SUPABASE_URL}/rest/v1/sender_profiles`, {
        token: state.familyToken,
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: { user_id: user.json.id, full_name: 'Claire E2E', address_line1: '10 rue des Tests', postal_code: '75011', city: 'Paris' },
      })
      assert(profile.status === 201 || profile.status === 204, `profil expéditeur : HTTP ${profile.status}`)
      const send = await http('POST', `${API_URL}/api/letters/send`, {
        token: state.familyToken,
        body: {
          template_id: 'bailleur-notification', step_id: `e2e-bailleur-${runId}`, lang: 'fr', attachment_ids: [],
          recipient: { name: 'Agence E2E', address_line1: '1 rue de la Paix', postal_code: '75002', city: 'Paris' },
          variables: { deceased_firstname: 'Jean', deceased_lastname: `Defunt-${runId}`, deceased_dod: deathDate,
            organisme_name: 'Agence E2E', user_firstname: 'Claire', user_lastname: `E2E-${runId}`, user_relation: 'fille',
            user_address: '10 rue des Tests, 75011 Paris', city: 'Paris', today_date: new Date().toISOString().slice(0, 10) },
        },
      })
      assert(send.status === 202, `envoi : HTTP ${send.status} ${send.json?.code ?? ''} ${JSON.stringify(send.json?.missing_variables ?? '')}`)
      const quota = await http('GET', `${API_URL}/api/letters/quota`, { token: state.familyToken })
      assert(quota.json?.balance === 9, `quota après envoi : ${quota.json?.balance}`)
    })
  }

  await step('vue PF : dossier activé, AUCUNE clé de contenu', async () => {
    const res = await http('GET', `${API_URL}/api/partner/dossiers`, { token: state.pfToken })
    assert(res.status === 200, `HTTP ${res.status}`)
    const dossier = res.json.dossiers.find((d) => d.id === state.dossierId)
    assert(dossier?.status === 'active', `statut ${dossier?.status}`)
    const forbidden = findForbiddenKeys(res.json)
    assert(forbidden.length === 0, `clés de contenu exposées : ${forbidden.join(', ')}`)
  })

  await step('compteurs PF : activation du mois comptée', async () => {
    const res = await http('GET', `${API_URL}/api/partner/counters`, { token: state.pfToken })
    assert(res.status === 200 && res.json.counters.activated_this_month >= 1, `HTTP ${res.status}`)
  })

  await step('inscription NON invitée refusée par le hook', async () => {
    const res = await http('POST', `${SUPABASE_URL}/auth/v1/signup`, { body: { email: `e2e.refus+${runId}@${FAMILY_DOMAIN}`, password: familyPassword } })
    assert(res.status >= 400 && JSON.stringify(res.json ?? {}).includes('signup_requires_invitation'), `HTTP ${res.status} — compte possiblement créé : le supprimer et vérifier le hook`)
  })
} catch {
  // L'étape en échec est déjà consignée ; les suivantes ne sont pas jouées.
}

console.log(results.join('\n'))
console.log(`1..${results.length}`)
process.exit(failed ? 1 : 0)
```

- [ ] **37.2** `node --check scripts/e2e-v2.mjs` → aucune sortie ; garde : `E2E_API_URL=https://app.seren-app.fr E2E_SUPABASE_URL=http://127.0.0.1:54321 E2E_SUPABASE_KEY=x E2E_PF_EMAIL=x E2E_PF_PASSWORD=x node scripts/e2e-v2.mjs; echo "exit=$?"` → `Refus : cible PROD…` et `exit=1`, sans aucun appel réseau.
- [ ] **37.3** Commit (au nom de L6 si écrit ici, note N8) : `test(v2-l6): E2E v2 par l'API publique — garde anti-prod, jeton jamais affiché`.

### Task 38 : Branche et tag PLANCHER (nuit du 15 au 16, dès les 4 sous-lots PLANCHER commités — au plus tard mer. 10h30)

**Niveau de revue :** vérification avec preuves.
**Files:** aucun fichier modifié (cherry-picks).

- [ ] **38.1** Créer la branche depuis la base L0bis et appliquer les sous-lots PLANCHER dans l'ordre L5 → L2a → L3 → L4 :

```bash
cd /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-integration \
  && git switch -c integration/v2-plancher integration/v2-demo \
  && for lot in l5 l2a l3 l4; do \
       for sha in $(git log --reverse --format=%H --grep="^feat(v2-${lot}-plancher)" "feature/v2-${lot}"); do git cherry-pick -x "$sha" || exit 1; done; \
     done && git log --oneline integration/v2-demo..HEAD
```

Attendu : 4 commits L5 (Tasks 1-4), 1 commit L2a (Task 5), 1 commit L3 (Task 20), 1 commit L4 (Task 26). 🛑 Conflit → `git cherry-pick --abort`, consigner, corriger au nom du lot propriétaire.
- [ ] **38.2** Gate R3 + boot check (Task 13.6, port 3997) → vert ; contrôle : `grep -rn "paywallTitle\|to=\"/signup\"\|formatEuroCents" src` → aucune sortie.
- [ ] **38.3** `git tag -a preprod-plancher -m "Palier PLANCHER v2 (sans migration v2) — $(date -u +%FT%TZ)"` puis `git switch integration/v2-demo`. Consigner le SHA dans « Notes post-revue ». Ce tag n'est **poussé que si GNG2 est NO-GO** ; la commande donnée à Arnaud est alors, forme pelée (R10) : `git push origin 'preprod-plancher^{commit}:refs/heads/pre-prod'` puis `git push origin preprod-plancher`. ⚠️ Dès qu'il a été poussé, la réintégration 39.8 devient **obligatoire** avant tout tag rc suivant.

### Task 39 : Merges ordonnés, tag rc1, rejeu local complet (mercredi 8h-11h45, rendu GNG2)

**Niveau de revue :** vérification avec preuves ; conflits sur fichiers gelés = version d'intégration.
**Files:** `src/App.tsx` (enveloppe `/admin`, note N6, au merge de L3).

- [ ] **39.1** Pour chaque lot dans l'ordre `l5, l2a, l2b, l1b, l1, l4c-sql, l4c-app, l6, l6-e2e, l3, l4, l7-sql, l7-app` (puis `l4b` s'il est prêt, puis `l9-sql` et `l9-app` quand L9 rend), dans `wt-integration` sur `integration/v2-demo` — la partie `-sql` d'un lot merge toujours **avant** sa partie `-app` (contrat §8.3, SF2.7) :

```bash
git merge --no-ff "feature/v2-<lot>" -m "merge(v2): <lot>" \
  && export VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_dummy \
  && npx tsc --noEmit && npx vitest run && npm run build
```

(`<lot>` n'est pas un paramètre libre : exécuter la commande une fois par identifiant de la liste, dans l'ordre.) Merge rouge → `git reset --hard ORIG_HEAD` (branche locale d'intégration uniquement), consigner, renvoyer au lot. Conflit sur une ancre → garder les deux insertions dans l'ordre des ancres.
- [ ] **39.2** Après `l1b`, `l1` et `l4c` (règle R9) :

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh \
  && run-sql-checks "$INT" scripts/sql-scenarios-f1.sql scripts/sql-scenarios-v2.sql \
  && with-db-lock node "$INT/scripts/hook-scenarios-v2.mjs"
```

Attendu : reset sur toutes les migrations présentes sans erreur (18 après `l4c`), scénarios sans `ERROR`, hook : 5 cas refusés et 3 acceptés (tableau §10.2). Les commandes exactes et sorties attendues de ces scripts font foi dans `docs/plan-v2-sql.md` (Tasks 2 à 5) ; en cas d'écart, suivre ce plan-là.
- [ ] **39.3** Juste après le merge de `l3` : dans `src/App.tsx`, remplacer la ligne `/admin` posée par L4c par `<Route path="/admin" element={<ProtectedRoute><RequireAccess area="admin"><AdminPage /></RequireAccess></ProtectedRoute>} />` ; gate R3 ; commit `fix(v2-l4c): /admin enveloppée par RequireAccess area="admin" (note N6)`.
- [ ] **39.4** Avant le merge de `l7-app` : vérifier que la Task 34 est présente sur `feature/v2-l7-app` (`git log --oneline feature/v2-l7-app | grep "legal"`), sinon la faire exécuter d'abord.
- [ ] **39.5** Tag : `git tag -a preprod-v2-rc1 -m "v2 rc1 — merges L5→L7 verts"` ; consigner le nombre de tests (H14) et le SHA. **Rappel R10** : ce tag est annoté ; la commande de push donnée à Arnaud en U2 est `git push origin 'preprod-v2-rc1^{commit}:refs/heads/pre-prod'`, jamais `preprod-v2-rc1:pre-prod` (rejet serveur).
- [ ] **39.6** Rejeu local du parcours complet (serveur sur Supabase local) :

```bash
eval "$(supabase status -o env 2>/dev/null | grep -E '^(API_URL|PUBLISHABLE_KEY)=')" \
  && (PORT=3100 SUPABASE_URL="$API_URL" SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" APP_URL=http://localhost:3100 \
      CORS_ORIGIN=http://localhost:3100 PARTNER_ACTIVATIONS_ENABLED=true SHOW_ACTIVATION_LINK=true PARTNER_BILLING_PREVIEW=true \
      node server/server.js > "${TMPDIR:-/tmp}/seren-e2e-server.log" 2>&1 &) \
  && curl -s --retry 15 --retry-connrefused --retry-delay 1 -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3100/api/health
```

puis, sur la base locale remise à zéro par 39.2 (grants hébergés compris) et provisionnée par `docs/plan-v2-sql.md` (seeds 1-2 et `scripts/provision-v2.mjs` ; identifiants du gérant PF-X exportés sous `PROBE_PARTNER_EMAIL` / `PROBE_PARTNER_PASSWORD` depuis le fichier hors dépôt indiqué par ce plan, `~/.seren-probes.env` par défaut) :

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh \
  && set -a && . ~/.seren-probes.env && set +a \
  && eval "$(supabase status -o env 2>/dev/null | grep -E '^(API_URL|PUBLISHABLE_KEY)=')" \
  && E2E_API_URL=http://127.0.0.1:3100 E2E_SUPABASE_URL="$API_URL" E2E_SUPABASE_KEY="$PUBLISHABLE_KEY" E2E_PAPER=skip \
     with-db-lock node "$INT/scripts/e2e-v2.mjs" \
  ; lsof -ti tcp:3100 | xargs kill
```

Attendu : toutes les lignes `ok`, `1..12` (l'étape papier est sautée en local). Puis `node scripts/rls-probes.mjs` (mode lecture, cible locale) → aucune ligne `not ok`.
- [ ] **39.7** Rapport GNG2 (**11h45**, recalage du 16/09) à l'orchestrateur : merges verts, tag rc1, scénarios SQL et hook verts, E2E local vert, probes locales vertes, **et le verdict de GNG1 rendu en fin de U1** (si GNG1 est NO-GO, le dry-run de U2 passe à 12 fichiers — Task 35 §2). NO-GO GNG2 → U2 pousse `preprod-plancher` (Task 38) et la v2 glisse à jeudi 9h, sans bêta jeudi.
- [ ] **39.8** **Réintégration du plancher (obligatoire si `preprod-plancher` a été poussé sur `pre-prod`)** — MF2.3. `integration/v2-plancher` est faite de *cherry-picks* : ses SHA ne sont **pas** des ancêtres de `integration/v2-demo`, donc tout push ultérieur de rc1/rc2/rc3 sur `pre-prod` serait `non-fast-forward`, et la règle « ne jamais forcer » bloquerait le créneau. **Avant de poser le tag rc suivant**, dans `wt-integration` sur `integration/v2-demo` :

```bash
git merge --no-ff integration/v2-plancher -m "merge(v2): réintégration plancher poussé"
```

Conflits : la version de `integration/v2-demo` gagne (les correctifs plancher y sont déjà, sous leur SHA d'origine). Puis gate R3, puis — **avant** de donner la moindre commande de push à Arnaud — le contrôle de fast-forward, qui doit réussir :

```bash
git fetch origin
git merge-base --is-ancestor origin/pre-prod 'preprod-v2-rc2^{commit}' && echo "fast-forward possible"
```

🛑 S'il échoue : ne pas donner la commande, consigner, et remonter à l'orchestrateur (option : demander à Arnaud un `git fetch` + lecture de `git log --oneline origin/pre-prod -3` pour identifier ce qui a été poussé). Consigner la réintégration dans « Notes post-revue ».

### Task 40 : Vérifications préprod après U2 (GNG3 13h25, GNG4 18h)

**Niveau de revue :** vérification avec preuves.
**Files:** aucun.

- [ ] **40.1** GNG3 (lecture seule) : `curl -s https://preprod-app.seren-app.fr/api/health` → 200 ; `curl -s -o /dev/null -w '%{http_code}\n' https://preprod-app.seren-app.fr/api/me` → 401 ; bundle : commande §G de `docs/checklist-push.md` (identifiants Basic Auth saisis par Arnaud dans son terminal) → seulement `kvtzhyxlqouvpwasedbe` ; `/api/me` du gérant PF et de la famille pré-activée (tokens obtenus par `POST /auth/v1/token?grant_type=password` avec les identifiants de `~/.seren-probes.env`, jamais affichés) → PF `role: partner`, famille `quota: {balance: 10, included_total: 10}`, `consent.required: false`.
- [ ] **40.1 bis** **Étape papier, juste après GNG3 (~13h30) — premier appel réel à MySendingBox (H11, SF2.8).** Les agents n'appellent jamais MySendingBox depuis le local (R5) : la préprod en clé **TEST** est le premier essai du multipart de `server/lib/paper-sender.js`. Lancer **tout de suite** l'E2E de 40.2 (ou, si les comptes de probes ne sont pas prêts, son seul envoi papier depuis le compte famille de démo). ✅ 202 et `status` « Pris en charge ». 🛑 Échec multipart → plan B `buildMultipart` **ouvert jusqu'à 17h** : correctif sur `feature/v2-l2b` (double revue, note post-revue), merge, rc2, poussé en U3 ; au-delà de 17h, `PAPER_SENDS_ENABLED` est retiré de la préprod pour la démo (PDF + captures) et GNG6 (9)-(14) reste rouge.
- [ ] **40.2** GNG4 (écritures par l'API publique, comptes `@seren-test.fr`) :

```bash
set -a && . ~/.seren-probes.env && set +a \
  && E2E_TARGET=preprod E2E_API_URL=https://preprod-app.seren-app.fr E2E_SUPABASE_URL=https://kvtzhyxlqouvpwasedbe.supabase.co \
     E2E_SUPABASE_KEY="$PROBE_SUPABASE_KEY" node scripts/e2e-v2.mjs
```

Attendu : `1..13`, aucune ligne `not ok` (envoi papier 202 en clé TEST). Puis les probes, **lecture seule puis écriture** — un seul nom de variable, `PROBE_WRITE=1` (SF2.5 ; `--write` n'existe pas, le script l'ignore silencieusement) :

```bash
node --env-file="$HOME/.seren-probes.env" scripts/rls-probes.mjs
PROBE_WRITE=1 PROBE_API_URL=https://preprod-app.seren-app.fr node --env-file="$HOME/.seren-probes.env" scripts/rls-probes.mjs
```

Attendu : aucune ligne `not ok` ; en lecture seule, SKIP des sondes d'écriture ; en écriture, les preuves de hook (inscription refusée **et** acceptée) et la sonde `partner:secret` (RPC PF sans `p_secret` → `invalid_secret`) tournent réellement. Sans `PROBE_API_URL`, les sondes HTTP et de hook sortent en SKIP explicite. Si le système de permissions refuse ces écritures : consigner, et placer les deux commandes en tête de U3 (Arnaud).
- [ ] **40.3** Rouge d'isolation (une probe PF → contenu, famille A → B) : STOP, bêta bloquée, migration corrective par `docs/plan-v2-sql.md`, double revue, push en U3.

### Task 41 : Recette visuelle, rc2/U3, correctifs P1, rc3, tag de démo, gel, warm-up

**Niveau de revue :** vérification avec preuves ; correctifs P1 au nom du lot propriétaire.
**Files:** correctifs P1 éventuels (fichiers du lot propriétaire, note post-revue obligatoire).

- [ ] **41.1** Recette visuelle locale (mercredi après GNG4) : démarrer le front et l'API sur Supabase local :

```bash
eval "$(supabase status -o env 2>/dev/null | grep -E '^(API_URL|PUBLISHABLE_KEY)=')" \
  && VITE_SUPABASE_URL="$API_URL" VITE_SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" SUPABASE_URL="$API_URL" SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" \
     PARTNER_ACTIVATIONS_ENABLED=true SHOW_ACTIVATION_LINK=true PARTNER_BILLING_PREVIEW=true npm run dev:all
```

(lancé en arrière-plan), ouvrir `http://localhost:5173` dans le panneau navigateur, et pour chacun des 14 écrans de §7 du runbook de démo, en FR puis EN, vérifier à largeur desktop puis `resize_window` 400 × 800 : aucun défilement horizontal, textes non tronqués, aucune couleur hors tokens, actions accessibles au clavier. Consigner chaque défaut « écran — constat — gravité (P1 bloque la démo / P2) ». **Captures (SF2.10)** : sur le même parcours, capturer **chacun des 14 écrans en FR à largeur desktop** et les déposer dans `${TMPDIR:-/tmp}/seren-captures-demo/` (nommage `NN-ecran.png`, ordre du §7 du runbook de démo) ; donner le chemin du dossier et la liste des fichiers dans le rapport de task. C'est ce dossier que le runbook de démo appelle « captures de secours » : Arnaud ne refait en U3 que ce qui manque.
- [ ] **41.2** Correctifs P1 : sur la branche du lot propriétaire (worktree du lot), TDD si logique, gate R3, commit `fix(v2-<lot>): …`, merge dans `integration/v2-demo`, gate R3. SQL, gate ou jeton → double revue.
- [ ] **41.3** Avant U3 (20h30) : `git tag -a preprod-v2-rc2 -m "v2 rc2 — correctifs de l'après-midi"` ; message à Arnaud : SHA, liste des correctifs, et la commande **en forme pelée** (R10), précédée de son contrôle de fast-forward — et, si `preprod-plancher` a été poussé, **après** la réintégration 39.8 :

```bash
git fetch origin
git merge-base --is-ancestor origin/pre-prod 'preprod-v2-rc2^{commit}' && echo "fast-forward possible"
git push origin 'preprod-v2-rc2^{commit}:refs/heads/pre-prod'
git push origin preprod-v2-rc2
``` Pendant U3 : suivi Sentry préprod et journaux Render (lecture), consignation des défauts.
- [ ] **41.4** Nuit : correctifs P1 de la recette uniquement ; 8h45 : `git tag -a preprod-v2-rc3 -m "v2 rc3 — correctifs de recette"` si au moins un correctif, avec gate R3, rejeu 39.6 et probes locales verts ; sinon décision écrite « on reste sur rc2 ».
- [ ] **41.5** Jeudi 9h : fournir à Arnaud les commandes exactes, en **forme pelée** (R10) — le tag de démo est **annoté**, comme rc1-rc3, et se pousse séparément :

```bash
git fetch origin
git merge-base --is-ancestor origin/pre-prod 'preprod-v2-rc3^{commit}' && echo "fast-forward possible"
git push origin 'preprod-v2-rc3^{commit}:refs/heads/pre-prod'   # si rc3 est retenu
git push origin preprod-v2-rc3
git tag -a demo-2026-09-18 <SHA poussé> -m "Démo investisseurs 2026-09-18"
git push origin demo-2026-09-18
```

(le tag `demo-2026-09-18` n'est **pas** poussé vers une branche ce jour-là : la promotion prod du même commit vers `main` a lieu en U4, Task 44 §7) ; après déploiement : GNG3 (40.1) et E2E préprod (40.2) jusqu'à 10h40. 10h45 : vert = gel dur ; rouge = recommander Render « Rollback » vers le deploy rc2.
- [ ] **41.6** Warm-up (jeudi 14h00-15h30), commande lancée en arrière-plan :

```bash
for i in $(seq 1 19); do printf '%s ' "$(date +%H:%M)"; curl -s -o /dev/null -w '%{http_code} %{time_total}s\n' https://preprod-app.seren-app.fr/api/health; sleep 300; done
```

Rapport court à 14h50 : dernier code 200 et temps < 3 s, sinon alerte immédiate (bascule sur captures).
- [ ] **41.7** Consigner dans « Notes post-revue » : SHA et tags, nombre de tests, sorties E2E/probes, défauts ouverts, palier atteint (PLANCHER, MINIMUM ou CIBLE).

---

## Lot L9 — Préparation de la promotion prod (bêta pilote)

Revue : contre-épreuves SQL en **double revue** ; runbook en **revue unique**. Branche `feature/v2-l9-app` (SF2.7) ; `docs/plan-v2-sql.md` écrit `scripts/backfill-prod-beta.sql` et `scripts/erase-family.sql` sur `feature/v2-l9-sql`, mergée **avant** celle-ci — note N16. Ce plan n'ajoute sur cette branche que `docs/runbook-beta-prod.md`. Les contre-épreuves s'exécutent sur Supabase local (règle R9), **dans une transaction annulée** (`begin … rollback`) et sous `with-db-lock` ; les fichiers de simulation vivent dans `${TMPDIR:-/tmp}` (jamais versionnés). Aucun script ne s'exécute sur une base distante par un agent.

### Task 42 : Contre-épreuve de `scripts/erase-family.sql` (livré par `docs/plan-v2-sql.md`)

**Niveau de revue :** double.
**Prérequis :** script livré et commité sur `feature/v2-l9-sql` (SF2.7), branche rebasée ou mergée localement ; migrations L1 présentes en local.
**Files:** aucun fichier versionné ; lecture de `scripts/erase-family.sql`.

- [ ] **42.1** Lire l'en-tête et le corps du script livré, et vérifier point par point (verdict OUI/NON par ligne dans le rapport) :
  1. ordre du contrat §9.2 : objets Storage (Dashboard) → anonymisation du dossier → Dashboard « Delete user » → vérification ;
  2. aucune tentative de `delete from storage.objects` (bloquée par le trigger `protect_objects_delete`) ;
  3. garde qui refuse l'exécution tant que les paramètres (adresse, user_id) ne sont pas renseignés ;
  4. refus sur un compte interne (`partner_users`, `seren_admins`) ;
  5. dossier `invited` → `cancelled` ; dossier `active` → `closed` avec `closed_at` ; `invite_token_hash` et `invite_expires_at` à `null` ; contraintes `dossiers_state_check` et `dossiers_identity_check` respectées ;
  6. `family_*` et `deceased_*` à `null` ou `'[effacé]'`, `family_email` remplacée par une valeur unique non personnelle ;
  7. payloads `provider_events` des envois de la famille supprimés ou neutralisés AVANT « Delete user » (ils peuvent contenir l'adresse de l'expéditeur) ;
  8. passe de vérification couvrant `questionnaires`, `roadmaps`, `steps`, `step_actions`, `documents`, `letter_sends`, `send_debits`, `attachments`, `sender_profiles`, `purchases`, `consents`, `questionnaire_sessions`, `transmissions`, `dossiers.user_id` et les objets Storage du préfixe.
  Tout NON → note post-revue P1 adressée à `docs/plan-v2-sql.md` (Task 14), la contre-épreuve reprend après correctif.
- [ ] **42.2** Écrire `${TMPDIR:-/tmp}/erase-sim.sql` (famille active avec contenu, pont et consentements) :

```sql
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('e0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'erase.test@exemple.fr', '', now(), now(), now(), '{}', '{}');
insert into public.partners (id, name) values ('e0000000-0000-4000-8000-0000000000aa', 'PF Effacement Test');
insert into public.dossiers (id, partner_id, source, status, user_id, family_first_name, family_last_name, family_email, family_phone,
                             deceased_first_name, deceased_last_name, deceased_death_date, price_ttc_cents, commission_ttc_cents, activated_at)
values ('e0000000-0000-4000-8000-0000000000d1', 'e0000000-0000-4000-8000-0000000000aa', 'partner', 'active',
        'e0000000-0000-4000-8000-000000000001', 'Claire', 'Martin', 'erase.test@exemple.fr', '06 12 34 56 78',
        'Jean', 'Dupont', '2026-09-10', 29000, 7000, now());
insert into public.consents (user_id, dossier_id, kind, version)
select 'e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-0000000000d1', k, '2026-09-beta-1'
  from unnest(array['terms', 'privacy', 'sensitive_data']) as k;
insert into public.purchases (user_id, status, kind, stripe_session_id, included_sends, paid_at)
values ('e0000000-0000-4000-8000-000000000001', 'paid', 'forfait', 'partner_dossier:e0000000-0000-4000-8000-0000000000d1', 10, now());
insert into public.questionnaires (user_id, answers, status)
values ('e0000000-0000-4000-8000-000000000001', '{}'::jsonb, 'completed');
```

et `${TMPDIR:-/tmp}/erase-assert.sql` (assertions au niveau du contrat, indépendantes des choix d'implémentation) :

```sql
-- « Delete user » simulé (LOCAL uniquement), puis contrôles.
delete from auth.users where id = 'e0000000-0000-4000-8000-000000000001';
do $$
declare
  d public.dossiers%rowtype;
begin
  if exists (select 1 from public.consents where user_id = 'e0000000-0000-4000-8000-000000000001')
     or exists (select 1 from public.purchases where user_id = 'e0000000-0000-4000-8000-000000000001')
     or exists (select 1 from public.questionnaires where user_id = 'e0000000-0000-4000-8000-000000000001') then
    raise exception 'ÉCHEC : lignes owner restantes après Delete user';
  end if;
  select * into d from public.dossiers where id = 'e0000000-0000-4000-8000-0000000000d1';
  if d.id is null then
    raise exception 'ÉCHEC : le dossier a disparu (il doit rester, anonymisé, pour la traçabilité PF)';
  end if;
  if d.status <> 'closed' or d.user_id is not null or d.invite_token_hash is not null then
    raise exception 'ÉCHEC : dossier non clos ou encore rattaché';
  end if;
  if d.family_email = 'erase.test@exemple.fr' or d.family_phone is not null
     or coalesce(d.family_first_name, '') = 'Claire' or coalesce(d.family_last_name, '') = 'Martin'
     or coalesce(d.deceased_first_name, '') = 'Jean' or coalesce(d.deceased_last_name, '') = 'Dupont' then
    raise exception 'ÉCHEC : identité de la famille ou du défunt encore présente';
  end if;
  raise notice 'OK : effacement conforme au contrat §9.2';
end $$;
```

- [ ] **42.3** Produire `${TMPDIR:-/tmp}/erase-family.local.sql` = copie de `scripts/erase-family.sql` où SEULS les paramètres documentés dans son en-tête reçoivent `erase.test@exemple.fr` et `e0000000-0000-4000-8000-000000000001` (commande `sed` écrite d'après l'en-tête ; coller `diff scripts/erase-family.sql "${TMPDIR:-/tmp}/erase-family.local.sql"` dans le rapport : seules les lignes de paramètres diffèrent). Exécuter :

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh \
  && { echo 'begin;'; cat "${TMPDIR:-/tmp}/erase-sim.sql" "${TMPDIR:-/tmp}/erase-family.local.sql" "${TMPDIR:-/tmp}/erase-assert.sql"; echo 'rollback;'; } \
     > "${TMPDIR:-/tmp}/erase-run.sql" \
  && with-db-lock sh -c 'psql-local < "${TMPDIR:-/tmp}/erase-run.sql"' 2>&1 | grep -E "NOTICE|ERROR|ROLLBACK"
```

Attendu : les NOTICE du script livré, puis `NOTICE:  OK : effacement conforme au contrat §9.2`, puis `ROLLBACK`. Garde : même commande avec la copie NON paramétrée (`scripts/erase-family.sql` au lieu de la copie locale) → `ERROR` de la garde « paramètres non renseignés », puis `ROLLBACK`.
- [ ] **42.4** Aucun commit. Rapport : verdicts 42.1, diff 42.3, sorties 42.3.

### Task 43 : Contre-épreuve de `scripts/backfill-prod-beta.sql` (livré par `docs/plan-v2-sql.md`)

**Niveau de revue :** double.
**Prérequis :** script livré et commité sur `feature/v2-l9-sql` (SF2.7), branche rebasée ou mergée localement ; migrations L1 présentes en local.
**Files:** aucun fichier versionné ; lecture de `scripts/backfill-prod-beta.sql`.

- [ ] **43.1** Lire le script livré et vérifier (verdict OUI/NON par ligne) :
  1. mode aperçu par défaut, écriture seulement sur geste explicite documenté en en-tête ;
  2. exclusions D6 : adresses `@seren-test.fr` (compte E2E, compte B des probes), comptes présents dans `partner_users`, `seren_admins` ou `account_enrollments`, comptes anonymes (`is_anonymous`) ou supprimés (`deleted_at`), comptes ayant déjà un dossier, adresses portant déjà un dossier non annulé ;
  3. dossiers créés : `source = 'direct'`, `status = 'active'`, `partner_id` null, `user_id` et `activated_at` renseignés, adresse en minuscules ;
  4. AUCUNE ligne `purchases` (pas de pont) et AUCUNE ligne `consents` (re-consentement sur `/bienvenue`) ;
  5. garde-fou de volume (arrêt au-delà d'un plafond) et contrôle « insérés = attendus » ;
  6. rejouable (second passage : 0 création) ;
  7. aucune adresse complète affichée (aperçu masqué) et requêtes de détection des résidus de tests (`@seren-test.fr`, documents `rls-probe-%`).
  Tout NON → note post-revue P1 adressée à `docs/plan-v2-sql.md` (Task 13).
- [ ] **43.2** Écrire `${TMPDIR:-/tmp}/backfill-sim.sql` :

```sql
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_anonymous)
select v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email, '', now(), now(), now(), '{}', '{}', v.anon
  from (values
    ('b0000000-0000-4000-8000-000000000001', 'Reel.Un@Exemple.fr', false),
    ('b0000000-0000-4000-8000-000000000002', 'reel.deux@exemple.fr', false),
    ('b0000000-0000-4000-8000-000000000003', 'test.e2e.claude+b@seren-test.fr', false),
    ('b0000000-0000-4000-8000-000000000004', 'gerant.backfill@pf-exemple.fr', false),
    ('b0000000-0000-4000-8000-000000000005', 'deja.dossier@exemple.fr', false),
    ('b0000000-0000-4000-8000-000000000006', 'admin.backfill@seren-app.fr', false),
    ('b0000000-0000-4000-8000-000000000007', 'anonyme.backfill@exemple.fr', true)
  ) as v(id, email, anon);
insert into public.partners (id, name) values ('b0000000-0000-4000-8000-0000000000aa', 'PF Backfill Test');
insert into public.partner_users (user_id, partner_id) values ('b0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-0000000000aa');
insert into public.account_enrollments (email, role) values ('admin.backfill@seren-app.fr', 'seren_admin');
insert into public.dossiers (source, status, user_id, family_email, price_ttc_cents, commission_ttc_cents, activated_at)
values ('direct', 'active', 'b0000000-0000-4000-8000-000000000005', 'deja.dossier@exemple.fr', 0, 0, now());
```

et `${TMPDIR:-/tmp}/backfill-assert.sql` :

```sql
do $$
begin
  if (select count(*) from public.dossiers
       where user_id in ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002')
         and source = 'direct' and status = 'active' and partner_id is null and activated_at is not null) <> 2 then
    raise exception 'ÉCHEC : les 2 comptes réels n''ont pas exactement un dossier direct actif';
  end if;
  if not exists (select 1 from public.dossiers where user_id = 'b0000000-0000-4000-8000-000000000001' and family_email = 'reel.un@exemple.fr') then
    raise exception 'ÉCHEC : adresse non normalisée en minuscules';
  end if;
  if exists (select 1 from public.dossiers where user_id in ('b0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000004',
                                                               'b0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000007')) then
    raise exception 'ÉCHEC : un compte exclu a reçu un dossier';
  end if;
  if (select count(*) from public.dossiers where user_id = 'b0000000-0000-4000-8000-000000000005') <> 1 then
    raise exception 'ÉCHEC : dossier dupliqué pour un compte qui en avait déjà un';
  end if;
  if exists (select 1 from public.purchases where user_id in ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002'))
     or exists (select 1 from public.consents where user_id in ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002')) then
    raise exception 'ÉCHEC : pont purchases ou consentement créé par le backfill';
  end if;
  raise notice 'OK : backfill conforme à D6';
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","email":"reel.un@exemple.fr","role":"authenticated"}';
do $$
begin
  if public.my_account() ->> 'role' <> 'family' or (public.my_account() -> 'consent' ->> 'required')::boolean is not true then
    raise exception 'ÉCHEC : my_account inattendu pour un compte backfillé';
  end if;
  raise notice 'OK : my_account = family, consentement requis (→ /bienvenue)';
end $$;
reset role;
```

- [ ] **43.3** Produire `${TMPDIR:-/tmp}/backfill.local.sql` = copie du script livré basculée en mode écriture selon le geste documenté dans son en-tête (diff collé dans le rapport), puis exécuter le script DEUX fois dans la même transaction annulée :

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh \
  && { echo 'begin;'; cat "${TMPDIR:-/tmp}/backfill-sim.sql" "${TMPDIR:-/tmp}/backfill.local.sql" "${TMPDIR:-/tmp}/backfill.local.sql" "${TMPDIR:-/tmp}/backfill-assert.sql"; echo 'rollback;'; } \
     > "${TMPDIR:-/tmp}/backfill-run.sql" \
  && with-db-lock sh -c 'psql-local < "${TMPDIR:-/tmp}/backfill-run.sql"' 2>&1 | grep -E "NOTICE|ERROR|ROLLBACK"
```

Attendu : premier passage « N créé(s) » (N ≥ 2 selon les comptes locaux présents), second passage « 0 », puis `NOTICE:  OK : backfill conforme à D6`, `NOTICE:  OK : my_account = family, consentement requis (→ /bienvenue)`, `ROLLBACK`. Le mode aperçu (script non modifié) ne doit créer aucun dossier : même commande avec `scripts/backfill-prod-beta.sql` à la place de la copie, sans l'assert, suivie de `select count(*) from public.dossiers where user_id = 'b0000000-0000-4000-8000-000000000001';` → `0`.
- [ ] **43.4** Aucun commit. Rapport : verdicts 43.1, diff 43.3, sorties 43.3.

### Task 44 : `docs/runbook-beta-prod.md` — promotion prod pas à pas (U4)

**Niveau de revue :** unique (relecture croisée des commandes par l'orchestrateur).
**Prérequis :** Tasks 42 et 43 vertes (le runbook recopie les invocations EXACTES des deux scripts livrés).
**Files:**
- Create: `docs/runbook-beta-prod.md`

- [ ] **44.1** Créer le runbook avec ces sections, dans cet ordre, chaque étape portant « Durée », « Qui », « Commandes », « ✅ Attendu », « 🛑 STOP si », « ↩️ Retour arrière » :
  - **§0 Conditions GNG6** : tableau des 14 conditions du contrat §10.3 avec colonne « preuve » (lien, sortie ou signature) et règle de décision : (1)-(7) rouge → report vendredi 9h-11h ; (8) rouge → étapes 1 à 8 seulement (gérants) ; (9)-(14) rouge → pas d'étape 10 (bêta sans papier). **Reprendre aussi, en tête de §0, le tableau « Prérequis hors créneaux » P1-P12 du contrat §10.3** (item, responsable, échéance, ce qu'il bloque), avec ces deux points en gras : **P1** — les 2-3 plis de contrôle sont envoyés par Arnaud depuis son compte MySendingBox **LIVE** au plus tard **mercredi 9h** (option (a)), et la condition GNG6 (12) se lit « plis **acceptés/imprimés** dans le dashboard MSB », la réception étant vérifiée après coup sous la surveillance §12 ; **P12** — **aucun commit sur `main` jusqu'à U4**, sans quoi le fast-forward de l'étape 6 échoue. Écrire enfin l'**option (b)** : si P1, P3 (DPA), P4 (grille tarifaire) ou P6 (relecture juridique des corps de courriers) manque jeudi, la bêta ouvre **sans papier** et `PAPER_SENDS_ENABLED=true` est posé vendredi 19/09 ou lundi 22/09 — décision d'Arnaud, en 1 minute et sans redéploiement.
  - **§1 Étape 0 — État initial (5 min, Arnaud)** : noter le deploy ID prod actuel (Render → service prod → Events) ; vérifier la dernière sauvegarde (Supabase prod → Database → Backups) ; relire l'inventaire des migrations prod consigné en U1 (étape B de `docs/checklist-push.md`) et en déduire N attendu (prod à 6/6 → N = 12). **Lecture `webhook_config` (SF2.9), ici et pas plus tard** : dans le SQL Editor prod, `select id from webhook_config;` — **si une ligne existe** (user step de l'envoi de courriers v1), sa valeur de `rpc_secret` est celle à reporter dans `WEBHOOK_RPC_SECRET` à l'étape 2, et **rien n'est inséré** à l'étape 4 ; si la table est vide, générer la valeur à l'étape 2 et l'insérer à l'étape 4. 🛑 Ne jamais écraser une ligne existante : Render et la base divergeraient et les RPC de webhook deviendraient des no-ops silencieux (statuts d'envoi figés).
  - **§2 Étape 1 — Supabase Auth PROD (10 min, Arnaud)** : Confirm email décoché ; Allow new users to sign up activé ; Anonymous, Phone, OAuth désactivés ; Site URL `https://app.seren-app.fr` ; Redirect URLs `https://app.seren-app.fr/**` ; SMTP custom Resend (`smtp.resend.com`, 465, user `resend`, domaine vérifié) ; Rate limit e-mails 30/h ; modèle « Reset password » en français ; mot de passe minimum 8 ; **hook NON activé à ce stade**. Retour arrière : réglages précédents notés avant modification.
  - **§3 Étape 2 — Variables Render PROD, « Save » sans déployer (10 min, Arnaud)** : colonne prod du contrat §11.2. À poser : `SUPABASE_URL`/`VITE_SUPABASE_URL` = `https://oltwzvfjazwjvghpzhia.supabase.co`, clés publishable prod, `APP_URL` et `CORS_ORIGIN` = `https://app.seren-app.fr`, `WEBHOOK_RPC_SECRET` (**valeur lue à l'étape 0 si `webhook_config` prod a déjà une ligne** ; sinon valeur neuve `openssl rand -hex 32` — jamais celle de la préprod, jamais collée dans le chat). ⚠️ Variable **obligatoire** depuis la revue du 16/09 : sans elle, la création et le renvoi de dossiers répondent 500 `PARTNER_ERROR` (contrat §4.4, §11.2), `RESEND_API_KEY`, `RESEND_FROM`, `SUPPORT_EMAIL`, `MSB_WEBHOOK_URL_SECRET` (valeur distincte de la préprod). À laisser ABSENTES : `PAPER_SENDS_ENABLED`, `MYSENDINGBOX_API_KEY`, `PARTNER_ACTIVATIONS_ENABLED`, `SHOW_ACTIVATION_LINK`, `PARTNER_BILLING_PREVIEW`, `FEATURE_LLM`, `EMAIL_SENDS_ENABLED`, `EXTRA_SENDS_ENABLED`, `STRIPE_PRICE_ID_EXTRA_SEND`. À RETIRER : `PAYMENTS_ENABLED`, `STRIPE_PRICE_ID`, `FORFAIT_INCLUDED_SENDS`.
  - **§4 Étape 3 — Migrations PROD (20 min, Arnaud ; agents relisent les sorties)** :

```bash
cd /Users/arnaudgay/Documents/git/Seren/Application
git fetch origin --tags
git worktree add --detach ../push-prod demo-2026-09-18
cd ../push-prod
supabase link --project-ref oltwzvfjazwjvghpzhia
cat supabase/.temp/project-ref
supabase migration list
supabase db push --dry-run
```

    ✅ project-ref = `oltwzvfjazwjvghpzhia` ; dry-run = exactement les N fichiers attendus, soit pour une prod à 6/6 : `20260725120000_purchases.sql`, `20260913200000_pf_dashboard_demo.sql`, `20260914100000_sender_profiles_organisations.sql`, `20260914110000_organisations_seed.sql`, `20260914120000_letter_sends_papier.sql`, `20260914150000_purchases_kind_writer.sql`, `20260914160000_attachments.sql`, `20260914170000_resync_reader.sql`, `20260915200000_v2_core.sql`, `20260915201000_v2_partner_rpc.sql`, `20260915202000_v2_admin.sql`, `20260915210000_transmissions_f1.sql`. 🛑 toute autre liste. Puis `supabase db push` ; **plan B 42501** (« must be owner of table objects ») — recopier la procédure en 4 étapes de `docs/checklist-push.md` §D : (1) créer les 3 policies dans Storage → Policies ; (2) exécuter la partie **non-Storage** de `20260914160000_attachments.sql` dans le SQL Editor ; (3) `supabase migration repair --status applied 20260914160000` (exception explicite et unique à la règle « jamais de repair seul », sortie collée dans la session) ; (4) `supabase db push`. ⚠️ Relancer `db push` tel quel **ne suffit pas** : le fichier commence par des `drop policy … on storage.objects`, qui exigent eux aussi d'être propriétaire, et l'erreur se reproduirait ; plan B H6 (`alter function public.hook_before_user_created(jsonb) owner to postgres;` et `grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;` dans le SQL Editor) ; `supabase migration list` → N/N. ⚠️ `20260914120000` retire la policy d'écriture de `letter_sends` : l'ancien code prod ne peut plus enregistrer un envoi e-mail → **enchaîner les étapes 4 à 6 dans les 20 minutes**. Retour arrière : migrations additives laissées en place ; code prod inchangé tant que l'étape 6 n'est pas faite.
  - **§5 Étape 4 — `webhook_config` PROD (3 min)** : reprendre la lecture de l'étape 0. **Si une ligne existait déjà** : ne rien écrire, seulement vérifier que `WEBHOOK_RPC_SECRET` posé à l'étape 2 est bien **sa** valeur (contrôle : `select (rpc_secret = '<valeur posée dans Render>') as accord from webhook_config where id = 1;` → `true`, tapé dans le SQL Editor, jamais dans le chat). **Sinon** : `insert into webhook_config (id, rpc_secret) values (1, '<valeur de WEBHOOK_RPC_SECRET prod>');` ✅ exactement 1 ligne `id = 1`, accordée avec Render. 🛑 Désaccord → corriger Render (pas la base) et redéployer.
  - **§6 Étape 5 — Backfill (10 min)** : recopier ici, depuis la Task 43, l'invocation exacte de `scripts/backfill-prod-beta.sql` (passe aperçu, puis geste d'écriture explicite) ; relever le nombre de candidats de l'aperçu et le comparer au comptage des comptes réels fait en U1 (🛑 écart inexpliqué) ; exécuter l'écriture ; contrôler : aucun pont `purchases` pour les dossiers `direct`, aucun consentement créé. Retour arrière (avant toute connexion d'une famille) : `delete from public.dossiers where source = 'direct' and created_at >= '<horodatage relevé juste avant l'écriture>';`.
  - **§7 Étape 6 — Code PROD (15 min)** :

```bash
cd /Users/arnaudgay/Documents/git/Seren/Application
git fetch origin
git merge-base --is-ancestor origin/main 'demo-2026-09-18^{commit}' && echo "fast-forward possible"
git push origin 'demo-2026-09-18^{commit}:refs/heads/main'
git push origin demo-2026-09-18
```

    ✅ `fast-forward possible` puis `… demo-2026-09-18 -> main` ; Render déploie (Manual Deploy « Clear build cache & deploy » si une `VITE_*` a changé) ; deploy ID noté ; `curl -s -o /dev/null -w '%{http_code}\n' https://app.seren-app.fr/api/health` → `200` ; bundle : `JS=$(curl -s https://app.seren-app.fr/ | grep -o '/assets/index-[^"]*\.js' | head -1) && curl -s "https://app.seren-app.fr$JS" | grep -o -E 'kvtzhyxlqouvpwasedbe|oltwzvfjazwjvghpzhia' | sort | uniq -c` → seulement `oltwzvfjazwjvghpzhia`. ⚠️ **Forme pelée obligatoire** (R10, MF2.1) : `demo-2026-09-18` est un tag **annoté**, `git push origin demo-2026-09-18:main` serait refusé (`trying to write non-commit object`) — une heure après la démo, en plein créneau. Le tag lui-même est poussé séparément (3ᵉ ligne). 🛑 `rejected (non-fast-forward)` ou contrôle `merge-base` en échec : **ne jamais forcer**. **Remède (SF2.11)**, quelqu'un a commité sur `main` malgré le gel : dans `wt-integration`, `git fetch origin && git merge --no-ff origin/main -m "merge(v2): main dans l'intégration avant promotion"` (conflits = version d'intégration, sauf fichier appartenant à `main`), gate R3 complet, `git tag -a demo-2026-09-18-prod -m "Promotion prod 2026-09-18"`, puis, **après accord explicite d'Arnaud**, `git push origin 'demo-2026-09-18-prod^{commit}:refs/heads/main'` et `git push origin demo-2026-09-18-prod`. La préprod reste sur le commit démo : ne pas y rejouer ce merge avant jeudi soir. Retour arrière : Render « Rollback » vers le deploy ID de l'étape 0 (migrations additives conservées ; prévenir le support que l'envoi e-mail v1 est indisponible).
  - **§8 Étape 7 — Hook « Before User Created » (5 min)** : Auth → Hooks → Before User Created → Postgres → `public.hook_before_user_created` → activer ; test de refus depuis le terminal d'Arnaud : `curl -s -X POST 'https://oltwzvfjazwjvghpzhia.supabase.co/auth/v1/signup' -H "apikey: $SUPABASE_PUBLISHABLE_KEY_PROD" -H 'Content-Type: application/json' -d '{"email":"refus-hook-2026-09-18@seren-app.fr","password":"Refus-hook-2026!"}'` (variable exportée par Arnaud dans son shell) → ✅ HTTP 403 et `signup_requires_invitation`. 🛑 HTTP 200 (compte créé) : Delete user immédiat, désactiver le hook, diagnostiquer. Retour arrière : toggle off (1 clic) ; le gate serveur maintient les 403.
  - **§9 Étape 8 — Gérants PF pilotes et admins Seren (15 min)** : dans le SQL Editor, un bloc par pompe funèbre :

```sql
do $$
declare
  v_name    constant text := 'RAISON SOCIALE À RENSEIGNER';
  v_siret   constant text := null;                                   -- 14 chiffres ou null
  v_billing constant text := null;                                   -- e-mail de facturation ou null
  v_manager constant text := lower(btrim('gerant@a-renseigner.invalid'));
  v_pid uuid;
begin
  if v_name = 'RAISON SOCIALE À RENSEIGNER' or v_manager like '%.invalid' then
    raise exception 'renseigner la raison sociale et l''e-mail du gérant';
  end if;
  insert into public.partners (name, siret, billing_email, status, contract_signed_at)
  values (v_name, v_siret, v_billing, 'active', current_date)
  returning id into v_pid;
  insert into public.account_enrollments (email, role, partner_id) values (v_manager, 'partner_manager', v_pid);
  raise notice 'partenaire % créé, gérant enrôlé', v_pid;
end $$;
```

    admins : `insert into public.account_enrollments (email, role) values (lower(btrim('<adresse de l''admin>')), 'seren_admin');` ; Authentication → Users → « Add user » (auto-confirm) pour chaque gérant et admin (« already registered » = STOP, enquête), copier les UUID ; `select public.link_enrollments('[{"email":"…","user_id":"…"}, …]'::jsonb);` → ✅ `pending: 0` **et `untrusted: 0`** (sinon une adresse enrôlée est déjà détenue : enquête avant toute ouverture) ; puis, **et seulement après la partie 2**, « Send password recovery » pour chaque gérant réel, qui fixe lui-même son mot de passe (procédure réservée aux vrais gérants de PF : les comptes de démo et de probes de la préprod ont le leur depuis « Add user ») ; connexion d'un gérant sur `https://app.seren-app.fr/login` → `/partenaire`, formulaire « création momentanément fermée » (flag absent).
  - **§10 Étape 9 — Ouverture des dossiers famille (si GNG6 (8)) (10 min)** : Render → `PARTNER_ACTIVATIONS_ENABLED=true` ; dossier de contrôle de bout en bout avec une vraie boîte d'Arnaud (adresse dédiée, jamais réutilisée : unicité globale H17) : création par un gérant → e-mail reçu (mentions art. 14 vérifiées) → activation → `/bienvenue` → questionnaire → roadmap → PDF ; puis effacement du compte de contrôle par la procédure §13. Retour arrière : retirer la variable (1 min).
  - **§11 Étape 10 — Papier LIVE, DERNIER geste (si GNG6 (9)-(14)) (15 min)** : MySendingBox → réglages du compte : fenêtre d'annulation allongée au-delà des 15 min par défaut ; Webhooks : `https://app.seren-app.fr/api/letters/provider-webhook/<MSB_WEBHOOK_URL_SECRET prod>` ; Render → `MYSENDINGBOX_API_KEY` = clé LIVE, puis `PAPER_SENDS_ENABLED=true` ; contrôle : un envoi vers une adresse contrôlée depuis le compte de contrôle → pli visible dans le dashboard MySendingBox, annulable (`DELETE /letters/{id}`) avant la date d'envoi si nécessaire. Retour arrière : retirer `PAPER_SENDS_ENABLED` (1 min, sans redéploiement : canal papier et dépôt de PJ fermés).
  - **§12 Surveillance J+1 à J+7** : chaque matin, dashboard MySendingBox (plis de la veille, contrôle a posteriori), Sentry seren-server et seren-app, boîte support, et `select count(*) from letter_sends where channel = 'papier' and created_at > now() - interval '24 hours';` ; seuil d'alerte : plus de 20 plis par jour ou un pli manifestement erroné → retirer `PAPER_SENDS_ENABLED` et analyser.
  - **§13 Effacement sur demande** : recopier depuis la Task 42 l'invocation exacte de `scripts/erase-family.sql` (passe de repérage, suppression Storage au Dashboard, passe d'anonymisation, « Delete user », passe de vérification), réponse à la personne sous 30 jours, trace de la demande (date de réception, date d'exécution) tenue hors base. ⚠️ **Écart E9** : `Delete user` est **bloqué** par le Dashboard tant que le compte porte un dossier **actif** (`dossiers_state_check` + `on delete set null`) — clore d'abord le dossier (partie B de `scripts/erase-family.sql`), puis supprimer. Vaut aussi pour tout compte de test ou de contrôle créé en U4 (étape 9).
  - **§14 Tableau récapitulatif des retours arrière** : étape → geste → durée → effet.
- [ ] **44.2** Vérifier : `grep -c "✅" docs/runbook-beta-prod.md` ≥ 11 ; `grep -n "SHOW_ACTIVATION_LINK" docs/runbook-beta-prod.md` → uniquement dans la liste « À laisser ABSENTES » ; `grep -n "scripts/backfill-prod-beta.sql\|scripts/erase-family.sql" docs/runbook-beta-prod.md` → au moins une invocation complète chacun.
- [ ] **44.3** Commit : `docs(v2-l9): runbook de promotion prod de la bêta pilote — ordre réversible, GNG6, papier live en dernier geste`.

### Task 45 : Accompagnement de U4 (agents, lecture seule)

**Niveau de revue :** vérification avec preuves.
**Files:** aucun.

- [ ] **45.1** Avant chaque étape du runbook, reformuler à Arnaud la commande et l'attendu ; relire chaque sortie qu'il colle (project-ref, liste du dry-run, NOTICE du backfill, `link_enrollments`) et donner un verdict GO/STOP explicite.
- [ ] **45.2** Contrôles agents autorisés (lecture seule, aucune écriture prod) : après l'étape 6, `curl -s -o /dev/null -w '%{http_code}\n' https://app.seren-app.fr/api/health` → `200` ; `curl -s -o /dev/null -w '%{http_code}\n' https://app.seren-app.fr/api/me` → `401` ; `curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' -d '{"token_hash":"x"}' https://app.seren-app.fr/api/activation/check` → `503` avant l'étape 9, `400` après ; commande bundle de §7 → seulement `oltwzvfjazwjvghpzhia`.
- [ ] **45.3** Consigner dans « Notes post-revue » : heure de chaque étape, deploy IDs, N migrations, nombre de dossiers backfillés, partenaires et gérants liés, état final des flags prod, décision papier live.

---

## Notes post-revue

_Format : `> **Note post-revue (Task N, AAAA-MM-JJ) :** constat — correctif ou écart acté — impact.`_

Amendements des **deux revues adversariales** appliqués au plan AVANT exécution (décisions au contrat §12.2) :

> **Note post-revue (règles R2/R10, 2026-09-16) :** MF2.1 — tout push d'un tag **annoté** vers une branche (`rc1`, `rc2`, `rc3`, `preprod-plancher`, `demo-2026-09-18`) était écrit `tag:branche`, forme **rejetée par le serveur** ; règle **R10** ajoutée (forme pelée `'tag^{commit}:refs/heads/branche'`, contrôle `merge-base --is-ancestor` d'abord, tag poussé séparément), répercutée en 38.3, 39.5, 39.8, 41.3, 41.5, Task 35 §2 et Task 44 §7 — sans elle, U2, U3, le push de jeudi 9h et la promotion prod échouaient dans les créneaux d'Arnaud.
> **Note post-revue (Task 39, 2026-09-16) :** MF2.3 — étape **39.8** ajoutée : réintégration `--no-ff` de `integration/v2-plancher` si le plancher a été poussé sur `pre-prod`, gate R3, puis contrôle de fast-forward **avant** de donner une commande de push.
> **Note post-revue (Task 35, 2026-09-16) :** MF2.2 + SF2.4 + E13 — bloc **U2 réécrit** avec les commandes exactes (variables `PROBE_SUPABASE_URL`/`KEY`, `E2E_TARGET=preprod`, `PROVISION_API_URL`, `PROVISION_*_EMAIL` et `PROVISION_*_PASSWORD`), séquence imposée par le must-fix 2 (« Add user » par Arnaud, UUID copiés, seed partie 2 par paires), liste du dry-run **conditionnelle** (4 fichiers si GNG1 vert, 12 si NO-GO), contrôle **E7** avant le `db push`, avertissement **E9**.
> **Note post-revue (Tasks 35 et 44, 2026-09-16) :** revue de vérification (I1, I2) — **règle de mot de passe unique et ordre de provisionnement unique** alignés sur le contrat §2.2-1 et §12.2 : les comptes internes de démo et de probes reçoivent leur mot de passe **à la création** (« Add user », conservé par Arnaud dans son gestionnaire, jamais dans le dépôt ni dans le chat), « Send password recovery » ne concernant que le **gérant de PF réel** en prod (Task 44 §9) et, là aussi, **après** la partie 2 ; U2 §2 étapes 9 et 11 portent l'avertissement « aucune connexion avant l'étape 10 », le provisionnement suivant la partie 2. Motif : `provision-v2.mjs` se connecte réellement, ce qui poserait `last_sign_in_at` et ferait refuser la liaison (`enrollment_account_untrusted`) — `docs/plan-v2-sql.md` (Task 9 Step 4, écart E13) prescrivait l'ordre inverse et a été corrigé au même moment.
> **Note post-revue (Task 36, 2026-09-16) :** SF2.6 — **36.2 supprimée** (l'en-tête « obsolète v2 » de `scripts/seed-demo-pf.sql` appartient à `docs/plan-v2-sql.md` Task 12) ; SF2.11 — consigne « aucun commit sur `main` jusqu'à U4 » ajoutée à `CLAUDE.md`.
> **Note post-revue (Tasks 30-31, 33-36, 37, 42-44, 2026-09-16) :** SF2.7 — branches scindées `-sql` / `-app` et `feature/v2-l6-e2e`, worktrees distincts, ordre de merge 39.1 mis à jour : les deux plans créaient la même branche au même chemin.
> **Note post-revue (Task 40, 2026-09-16) :** SF2.8 — **40.1 bis** ajoutée : premier appel réel à MySendingBox juste après GNG3 (~13h30), fenêtre de plan B `buildMultipart` jusqu'à 17h ; SF2.5 — commandes de probes normalisées sur `PROBE_WRITE=1` et `PROBE_API_URL` (le `--write` du runbook était ignoré par le script : les preuves de hook n'auraient jamais tourné).
> **Note post-revue (Task 41, 2026-09-16) :** SF2.10 — les **14 captures FR desktop** sont prises par les agents pendant la recette visuelle (41.1) ; Arnaud ne complète que les manquantes en U3.
> **Note post-revue (Task 44, 2026-09-16) :** SF2.9 — `webhook_config` prod **lu à l'étape 0** et réutilisé s'il existe ; MF2.5 — tableau « Prérequis hors créneaux » P1-P12 et option (a)/(b) du papier live repris en §0 ; SF2.11 — remède écrit si le fast-forward vers `main` échoue.

Écarts constatés **à l'exécution du lot L2a** (branche `feature/v2-l2a`) :

> **Note post-revue (Task 13, 2026-09-16) :** les deux moitiés du plan se contredisaient — le commentaire d'en-tête du bloc paiements prescrit en 13.4 cite littéralement `PAYMENTS_ENABLED`, `STRIPE_PRICE_ID` et `FORFAIT_INCLUDED_SENDS`, alors que le test prescrit en 13.1 asserte `expect(source).not.toMatch(/PAYMENTS_ENABLED/)` sur le **source brut, commentaires compris** : le gate échouait (1 test sur 587). Correctif minimal retenu — le **test reste mot pour mot celui du plan** (c'est l'assertion de sécurité : ces variables ne doivent plus être lues) et c'est le **commentaire** qui est reformulé en périphrase (« les trois variables d'environnement du forfait … »). Impact : aucun sur le comportement ; la garantie est même renforcée (aucune occurrence du nom, pas même en commentaire).
> **Note post-revue (Task 10, 2026-09-16) :** le `makeApp` prescrit en 10.1 fixe le défaut `getExtraPrice` à `300`, alors que le plan demande par ailleurs de **conserver** les autres tests `/status` — dont celui qui asserte `extra_price === { amount_total: 990 }`. Défaut laissé à **990** (valeur historique du fichier) : aucun test neuf de la Task 10 n'observe ce montant, et la valeur d'un faux injecté n'a pas de portée contractuelle.
> **Note post-revue (Task 10, 2026-09-16) :** conséquence non listée du passage de `/status` à `payments_enabled: false` constant — le premier test de `describe('GET /api/payments/status')` assertait `payments_enabled === true`. Assertion basculée à `false` (le plan ne mentionnait que le renommage du test « vente fermée »).
Correctifs appliqués **après la revue du lot L2a** (verdict MERGEABLE, aucun défaut critique — deux trous de couverture, aucun défaut de comportement, aucune ligne de production modifiée) :

> **Note post-revue (revue L2a, défaut mineur 1, 2026-09-16) :** trou de couverture — les trois cas non-famille de l'`it.each` de `tests/active-dossier-gate.test.ts` portaient tous `dossier: null`, si bien que le 403 venait systématiquement de la clause `dossier?.status !== 'active'` : supprimer `account.role !== 'family'` de `server/lib/require-active-dossier.js` laissait la suite **entièrement verte** (mutant survivant). Cas `['rôle partner AVEC dossier actif (défense en profondeur)', …]` ajouté — dossier actif *et* consentement à jour, seule forme capable de rougir sur cette clause seule. Mutation rejouée : **1 échec exactement**, sur ce seul cas. Impact : aucun sur le comportement (le code était déjà conforme au contrat §4.1) ; la défense en profondeur est désormais pinnée.
> **Note post-revue (revue L2a, défaut mineur 2, 2026-09-16) :** trou de couverture — le test de coupure du coffre (`tests/attachments-routes.test.ts`) n'assertait que `status 503`, `code`, `backend.rows` et `backend.objects` vides, quatre assertions qui restent vraies si `attachmentsKillSwitch` est monté **après** `uploadLimiter, handleUpload` (multer bufferise en mémoire et ne touche jamais le faux backend). L'ordre exigé par le contrat §4.2 (« avant multer, donc aucun fichier bufferisé » et « ne consomme aucun quota ») n'était donc verrouillé par rien — seule des quatre chaînes de gardes dans ce cas, l'équivalent courriers l'étant déjà. Test « 35 refus, jamais 429 » ajouté (pendant exact de `letters-paper-routes.test.ts`, limiteur du coffre à 30/h). Mutation rejouée : `expected 429 to be 503`, **1 échec exactement**. Impact : aucun sur le comportement.
> **Note post-revue (revue L2a, points d'information, 2026-09-16) :** deux constats **volontairement non traités en L2a**, à porter à L8/U2. (1) `server/routes/transmission.js` renvoie encore `error.message` brut au client sur `/api/user/transmission` : code **pré-existant**, extrait verbatim et prescrit littéralement par la Task 12.3 (« forme actuelle conservée », produit transmission gelé) — dévier ici aurait été l'écart ; à traiter au dégel du produit, la route `/transmission/:code` ayant elle été durcie au passage (message construit sur le seul code SQLSTATE). (2) `tsconfig.tsbuildinfo` est **suivi par git** et réécrit par `npm run build` : pré-existant et hors périmètre L2a (§8.2), mais il salit `git status` après chaque gate et peut gêner un contrôle « arbre propre » en L8.

> **Note post-revue (Task 8, 2026-09-16) :** dans `tests/letters-paper-routes.test.ts`, le helper `gate()` de la garde 1 utilise l'**import statique** de `createRequireActiveDossier` (option explicitement autorisée par 8.1) plutôt que l'import dynamique, et le `await gate(...)` des appels disparaît — le helper est synchrone. Le mécanisme d'armement du flag `PAPER_SENDS_ENABLED` réutilise le `vi.stubEnv` déjà en place dans le fichier, comme le demande la même étape.
Écarts constatés **pendant l'exécution** :

> **Note post-revue (Task 15, 2026-09-16) :** le test `tests/invitation-email.test.ts` tel qu'écrit au plan passe sous Vitest mais **ne compile pas** (`npx tsc --noEmit` : TS2352 et TS2493 sur `send.mock.calls[0][0]`) — `vi.fn(async () => …)` sans paramètre déclaré donne un `mock.calls` typé tuple **vide**, donc l'indexation `[0][0]` est une erreur de type et le gate R3 échouait. Correctif minimal : le fake déclare son paramètre (`async (_payload: Record<string, unknown>) => …`, exempté de `noUnusedParameters` par le préfixe `_`) ; aucune assertion modifiée, aucun changement de comportement. Impact : gate R3 vert (564 tests, `tsc --noEmit` clean).

> **Note post-revue (Task 16, 2026-09-16) :** deux écarts de rédaction du plan, sans impact fonctionnel — (1) le bloc L2b compte **21 clés**, pas 22 : l'énumération de 16.2 et le tableau §4.9 du contrat en listent 21, et le contrôle `node -e …` renvoie `[]` (87 clés FR = 87 clés EN, parité conservée) ; (2) le tableau §4.9 du contrat écrit ses valeurs avec l'apostrophe **droite** `'` alors que 16.2 impose l'apostrophe **typographique** `’` « du fichier » — textes repris verbatim, apostrophes normalisées en `’` conformément à 16.2 et à l'usage du reste de `server/lib/messages.js`. Le commentaire d'en-tête du plan (`// v2 — espace partenaire et activation famille (lot L2b)`) est repris tel quel dans les deux blocs `fr` et `en`.

Correctifs du **correcteur L2b** (relecture du 2026-09-16, verdict MERGEABLE sans défaut critique) :

> **Note post-revue (Tasks 17 et 18, 2026-09-16) — écart de typage non documenté à l'exécution :** quatre `sqlCode as string` ont été ajoutés aux `it.each` de `tests/partner-routes.test.ts` (×3) et `tests/activation-routes.test.ts` (×1). Ils sont nécessaires et non cosmétiques : les tuples des tableaux de cas mélangent `string`, `number` et `undefined`, donc TypeScript infère `string | number | undefined` pour le premier élément, que `sqlError(message: string)` et `{ message: sqlCode }` refusent. Aucune assertion ni aucun comportement modifié ; l'écart est consigné ici, comme l'impose R6.

> **Note post-revue (Task 17, 2026-09-16) — alerte Sentry du secret RPC manquant :** le bloc de code du plan fait passer `requireRpcSecret` par `partnerError()`, qui émet un `Sentry.captureException` à **chaque** requête, alors que le contrat §4.4 précise « émis **au premier appel** ». Le contrat étant gelé, il prime : verrou `secretAlerted` porté par le routeur, alerte unique, réponse inchangée (500 fail-closed, sans appel base ni e-mail). Sans ce verrou, un `WEBHOOK_RPC_SECRET` absent en production génère un événement Sentry par tentative de création de dossier. Couvert par mutation (retirer le verrou fait échouer le test).

> **Note post-revue (Task 17, 2026-09-16) — `partner_name` toujours présent :** `successPayload` renvoie désormais `partner_name: partnerName ?? null`. Si une RPC omettait la clé, `JSON.stringify` la supprimait de la réponse, alors que le contrat §4.4 la donne toujours présente (`text|null`, §3.3.10 / §3.3.11) ; le front PF lirait `undefined` là où il attend une valeur ou `null`. À reconfirmer au premier E2E contre les RPC réelles de L1.

> **Note post-revue (Tasks 16, 17 et 18, 2026-09-16) — deux trous de couverture fermés :** (1) le test « code SQL inconnu » ne vérifiait l'absence du message Postgres brut que dans la **réponse** ; assertions ajoutées sur les journaux et sur la charge Sentry (un refactor de `partnerError()` qui journaliserait `error.message`, donc potentiellement une valeur saisie, passait au vert). (2) La parité FR/EN de `server/lib/messages.js` n'était garantie par **aucun** test — lacune **préexistante** à L2b (les messages serveur sont un module JS non typé, contrairement à `src/i18n` où tsc l'impose) : supprimer une clé du bloc `en` laissait 564/564 au vert et `msg()` retombait en silence sur le français. Contrôle ajouté à `tests/partner-routes.test.ts` — donc **dans** le périmètre §8.2 du lot, plutôt que dans un fichier neuf — et portant sur tout le fichier, y compris les blocs que L2a et L4c ajoutent à leurs propres ancres `v2:messages-*`.

> **Point d'intégration pour Task 39 (merge de L2a), 2026-09-16 :** `app.set('trust proxy', 1)` n'existe **ni** sur `feature/v2-l2b` **ni** sur `feature/v2-l2a` à ce jour (L2a s'arrête à la Task 11 ; la ligne appartient à sa Task 13). Sans elle, derrière le proxy Render, `req.ip` vaut l'adresse du proxy pour tout le monde et le limiteur par IP de `POST /api/activation/check` devient 30 requêtes / 10 min **pour l'ensemble des visiteurs** — déni de service auto-infligé sur l'activation des familles le jour de la bêta. Le test de L2b simule déjà la ligne (`app.set('trust proxy', 1)`) : à vérifier comme contrôle de sortie au merge de L2a, hors périmètre L2b.
Écarts constatés **à l'exécution du lot L3** (branche `feature/v2-l3`), déclarés par l'implémenteur :

> **Note post-revue (Task 20, 2026-09-16) :** le retrait du paywall laissait le JSDoc de `startCheckout` dans `usePayments.ts` alors que la fonction, elle, disparaissait — le contrôle 20.9 (`grep -rn "startCheckout" src` → aucune sortie) échouait sur ce seul commentaire. Correctif minimal : JSDoc supprimé avec la fonction. Impact : aucun sur le comportement, contrôle 20.9 vert.
> **Note post-revue (Task 23, 2026-09-16) :** le contrôle **23.5** est inatteignable par construction — il cherche `localStorage|sessionStorage|cookie` dans les fichiers du lot, or la task **21.3** impose précisément d'écrire « …jamais `localStorage`, `sessionStorage` ni cookie » en commentaire d'en-tête de `activation-fragment.ts`, que le motif matche toujours. Vérification faite **hors commentaires** : aucune occurrence de substance (le jeton ne quitte jamais la mémoire). Contrôle à reformuler (`--invert-match` sur les lignes de commentaire) plutôt qu'à « corriger » dans le code.

Correctifs appliqués **à la revue du lot L3** (2 défauts mineurs de code, 1 de plan) :

> **Note post-revue (Task 23, 2026-09-16) :** `/api/activation/claim` renvoie **403 ACCOUNT_ROLE_FORBIDDEN** quand la session est celle d'un compte interne (`server/routes/activation.js:20`, lot L2b) ; ce statut tombait dans la branche générique `retry: 'claim'` — le bouton « Réessayer » relançait une RPC qui refuse par construction, soit une impasse à relance infinie. Correctif : `if (res.status === 403) return setState({ kind: 'error', retry: null })`, placé **après** le test `EMAIL_MISMATCH` (403 lui aussi, distingué par son `code`). Impact : écran d'erreur sans reprise, l'adresse de support fait le relais.
> **Note post-revue (Task 23, 2026-09-16) — écart au plan assumé :** le code de **23.2**, à reprendre « telle quelle », faisait tomber **toute** erreur `signUp` non 403 dans le repli « compte existant » (prudence H4). Une erreur transitoire — 429 `over_email_send_rate_limit`, panne 5xx côté Auth — affichait donc « Un compte existe déjà avec cette adresse », factuellement faux, et réclamait un mot de passe que la famille n'a jamais choisi. Correctif : `429` et `>= 500` partent sur l'écran d'erreur avec reprise ; le repli H4 **reste le défaut** pour tout le reste (422 `user_already_exists`, comptes backfillés, statuts inattendus), donc aucune régression du parcours « compte existant ». Impact : un message faux de moins, prudence H4 conservée là où elle protège.
> **Note post-revue (Task 23, 2026-09-16) :** après une activation réussie le jeton est effacé — un **retour arrière** du navigateur sur `/activation` affichait « Lien incomplet » sans issue, alors que le compte vient d'être créé. Ajout du lien « Déjà activé ? Connectez-vous » déjà présent sur l'écran « lien invalide ». Aucune clé i18n neuve (`t.activation.alreadyActivated`, FR et EN).

Défauts **écartés** à la revue, preuve à l'appui (à ne pas « corriger » plus tard) :

> **Note post-revue (Task 22, 2026-09-16) :** la revue proposait de faire renvoyer le cache par `load()` dans `useAccount.ts` (`if (cache) return Promise.resolve(cache)`) au motif que le contrat §7.2 dit « cache de module (patron `usePayments`) ». **Écarté** : (1) le patron cité fait exactement l'inverse — l'effet de `usePayments` refait `fetchStatus()` à **chaque** montage et ne renvoie jamais son `cache`, qui sert uniquement à amorcer `useState` (« les suivants partent de l'état connu … tout en revalidant en arrière-plan ») ; `useAccount` s'y conforme déjà, sans clignotement puisque `cache.loading === false` ; (2) le correctif serait **nuisible au scénario de démo** : une famille connectée avant l'activation de son dossier voit `AccessNotActivatedScreen`, qui n'offre aucun rafraîchissement (seulement déconnexion et retour à `/login`) — un cache dur la laisserait sur cet écran pour toute la session, même après l'activation par la PF, alors que la revalidation au montage la rattrape à la navigation suivante. Le coût évité (un `GET /api/me` par navigation gardée) ne vaut pas ce risque.
> **Note post-revue (Task 21, 2026-09-16) — nuance à conserver :** la garantie « jeton capturé avant toute initialisation » porte sur l'**initialisation des outils** (Sentry, PostHog), pas sur l'évaluation des modules : les `import` de `main.tsx` s'exécutent forcément avant `captureActivationFragment()`. Sans conséquence, vérifié : supabase-js ne réagit qu'à `access_token`/`error*` dans le fragment (jamais `#t=`), et `/activation` ne charge **aucune ressource tierce** (polices auto-hébergées via `@fontsource-variable/*`, aucun `@import` distant, `index.html` sans ressource externe), conformément au §6. Déplacer les `import` sous la capture serait inutile et casserait le module.
