# Design + Plan — Espace partenaire PF v0-démo

> Rédigé et validé le 2026-09-13 (GO d'Arnaud). **Contexte exceptionnel : rendu investisseurs + ouverture bêta le 2026-09-16 (J-3).** Doc combiné spec+plan (dérogation assumée au format deux-docs) et exécution compressée — chaque dérogation au process est notée ici.
> **Périmètre de déploiement : branche `pre-prod` UNIQUEMENT avant le rendu** (préprod `preprod-app.seren-app.fr`, protégée par Basic Auth). `main`/prod n'est PAS touchée avant le rendu ; le merge dans `main` se fera après, ou sera remplacé par le vrai chantier 4.

## Objectif

Montrer aux investisseurs un espace partenaire **réellement câblé** sur la préprod : une PF connectée voit 4 agrégats vivants — dossiers accompagnés, dossiers ayant payé, CA généré, commission — alimentés par les attributions de démo et les **vrais achats Stripe en mode test**.

## Décisions actées

- **Vrai mini-dashboard branché** (choix d'Arnaud contre la recommandation maquette — acté), contenu par le confinement préprod.
- Bêta réelle sans relecture juridique : **assumée par Arnaud le 2026-09-13** (P1 roadmap produit — le bandeau bêta reste disponible à ~1 h si revirement).
- Hors scope (chantier 4 complet, après le rendu) : enrôlement, QR/codes, landing co-brandée, ledger, reversements/paliers, anti-fraude, paramétrage.

## Données (1 migration `202609XX000000_pf_dashboard_demo.sql`)

- `partners` : `id` uuid PK défaut gen_random_uuid, `name` text NOT NULL, `commission_rate` numeric(4,3) NOT NULL DEFAULT 0.200, `created_at`.
- `partner_users` : `user_id` uuid PK ref auth.users ON DELETE CASCADE, `partner_id` uuid NOT NULL ref partners ON DELETE CASCADE, `created_at`. (Un compte auth = au plus une PF.)
- `attributions` : `user_id` uuid PK ref auth.users ON DELETE CASCADE, `partner_id` uuid NOT NULL ref partners, `created_at`. (Un dossier famille attribué à au plus une PF — « premier code gagne » viendra au chantier 4.)
- **RLS activée sur les 3 tables, AUCUNE policy** (deny-all — le modèle `purchases`) : ni les familles ni les partenaires ne lisent ces tables directement. Seed/administration : SQL Editor par Arnaud (v0-démo assumé).

## RPC `partner_dashboard()` — l'unique voie de lecture

`security definer`, `set search_path = public`, GRANT EXECUTE à `authenticated`. Logique : `partner_id` ← `partner_users` WHERE `user_id = auth.uid()` ; si absent → NULL (le front redirige). Sinon retourne un json : `{ partner_name, commission_rate, attributed_count, paid_count, revenue_cents, commission_cents }` — agrégats calculés par jointure `attributions` × `purchases` (statut payé — se caler sur les valeurs réelles de `20260725120000_purchases.sql`), `commission_cents = round(revenue_cents × commission_rate)`. **Aucune PII dans la réponse, aucun détail par dossier** (règle rouge T13 : un partenaire ne voit jamais une famille, pas même un prénom).

## Front

- Route `/partenaire` (ProtectedRoute). Hook `usePartnerDashboard` → `supabase.rpc('partner_dashboard')` ; réponse NULL → `<Navigate to="/dashboard" />`.
- Page « Espace partenaire » : en-tête avec nom de la PF + taux, 4 tuiles design system (tokens `@theme`, bleu action, cartes arrondies) : Dossiers accompagnés / Dossiers ayant payé / CA généré / Votre commission (montants formatés €). Mention discrète « Préversion — dispositif complet à venir ».
- FR/EN via les dictionnaires (`strings.{fr,en}.ts`), zéro chaîne en dur. Aucun lien ajouté à la navigation partagée (accès par URL — risque zéro sur l'app famille).

## Vérifications (adaptation assumée : pas de harnais BDD-live en 72 h)

- Suite Vitest complète verte (199 tests) + tsc + revue SQL de la migration (RLS deny-all, definer, grants).
- **Probes REST d'isolation scriptées contre la préprod** (le contrôleur les exécute, lecture seule) : compte famille → SELECT direct sur `partners`/`attributions` = vide/refusé ET `rpc/partner_dashboard` = null ; compte PF démo → RPC = agrégats corrects ; compte PF → SELECT direct sur `purchases` d'autrui = vide. Consignées dans la note post-revue.
- E2E démo : Checkout test → le compteur « payés » et la commission bougent.

## Plan d'exécution (3 tasks, revues compressées : 1 revue combinée spec+qualité par task — dérogation J-3 notée)

1. **Migration + RPC** — Create `supabase/migrations/…_pf_dashboard_demo.sql`. L'implémenteur lit `20260725120000_purchases.sql` (colonnes/statuts réels, patron RPC/definer) et s'y cale. Vérif : suite verte, revue SQL.
2. **Front** — `src/pages/PartnerDashboardPage.tsx`, hook, route dans `App.tsx`, clés FR/EN. Vérif : tsc + tests + rendu local.
3. **Seed + runbook démo** — `scripts/seed-demo-pf.sql` (1 PF « Pompes Funèbres Démo » 20 %, rattachement d'un compte PF de démo, attributions des comptes de test — emails paramétrables en tête de script) + `docs/runbook-demo-rendu.md` (checklist de la démo du 16 : comptes, URLs, Basic Auth, scénario, rollback).

## User steps (Arnaud — chemin critique)

1. **Stripe préprod (dès que possible — sans lui, « payés » = 0 à la démo)** : compte Stripe mode test, produit+tarif → `STRIPE_PRICE_ID`, clés test, webhook → `STRIPE_WEBHOOK_SECRET`, variables Render préprod + `PAYMENTS_ENABLED=true`, `WEBHOOK_RPC_SECRET` (env + ligne `webhook_config`).
2. `supabase link` préprod (`kvtzhyxlqouvpwasedbe`) + `supabase db push` (applique `purchases` + la migration de cette spec).
3. Exécuter `scripts/seed-demo-pf.sql` (SQL Editor préprod) après création du compte PF de démo.
4. Merge de `feature/pf-dashboard-demo` dans `pre-prod` + push (déploie la préprod). PAS dans `main` avant le rendu.
