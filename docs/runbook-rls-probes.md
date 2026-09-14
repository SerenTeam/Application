# Runbook — Probes d'isolation RLS (`scripts/rls-probes.mjs`)

> Chantier transverse Sécurité/RGPD, priorité n°1 : « deux utilisateurs — vérifier que A ne
> lit jamais les données de B ; et qu'un partenaire ne lit jamais une famille » (identifié en
> juillet dans `docs/audit-rls.md`, jamais industrialisé jusqu'ici — ce runbook documente le
> script qui l'automatise). Rédigé le 2026-09-14.

## Pourquoi ce script et pas Vitest

Le repo n'a pas de harnais BDD-live (`npm test` = Vitest, entièrement mocké — 199 tests, 0
requête réseau). L'isolation RLS ne se prouve que contre un **vrai** projet Supabase (RLS
appliquée par Postgres, pas par un mock). L'approche du projet depuis juillet : des sondes
REST manuelles contre dev/préprod avec deux comptes de test (voir `docs/audit-rls.md`) —
`scripts/rls-probes.mjs` industrialise ces sondes en script rejouable, lisible, et prêt à
rejoindre la CI plus tard (voir § CI ci-dessous).

## Ce que le script prouve

Sortie TAP (`ok`/`not ok`, plan en fin de run), lecture seule à une exception près (voir
§ Écriture). Chaque ligne TAP documente en une phrase la propriété RGPD/RLS qu'elle établit :

1. **Familles A↔B** — pour chaque table de données famille (`questionnaires`, `roadmaps`,
   `steps`, `step_actions`, `documents`, `questionnaire_sessions`, `letter_sends`,
   `purchases`, `attachments`, `sender_profiles`) : B fait un `SELECT * limit 5`, le résultat
   ne doit contenir aucune ligne de A. Table absente de l'environnement (`attachments` et
   `sender_profiles` ne sont pas encore migrées à ce jour, chantier 2a) → `SKIP` propre, pas
   un échec.
2. **Marqueur + écritures croisées** — A insère un document marqueur (seule écriture non
   best-effort du run) ; B ne peut ni le lire, ni l'`UPDATE`, ni `INSERT` un document en
   usurpant le `user_id` de A (`WITH CHECK` RLS).
3. **Tables sans policy d'écriture** — `purchases`, `send_debits`, `partners`, `attributions`
   (si présentes) : même un `INSERT` avec son **propre** `user_id` est refusé, ces tables ne
   se mutent que par RPC `security definer` à secret vérifié en base. **`letter_sends` est
   volontairement exclue de cette liste** : au 2026-09-14, cette table porte encore la policy
   v1 `"own sends" FOR ALL USING/WITH CHECK auth.uid() = user_id`
   (`supabase/migrations/20260716120000_letter_sends.sql`) — un self-insert y réussit
   **légitimement** aujourd'hui (c'est ainsi que la route d'envoi crée une ligne). Le
   durcissement en RPC-only (suppression de cette policy) est déjà planifié et documenté au
   chantier 2a (`docs/design-chantier-2a-envoi-papier.md` §3.5), pas encore livré. Le script
   sonde à la place la propriété qui, elle, est déjà vraie aujourd'hui : un `INSERT` avec le
   `user_id` de **A** est refusé par le `WITH CHECK` même sous la policy actuelle. Quand la
   migration de durcissement du 2a sera posée, il suffira d'ajouter `letter_sends` à
   `NO_WRITE_POLICY_TABLES` dans le script (le test « self-insert refusé » deviendra vrai) —
   c'est une note de déviation, pas un bug à corriger ici.
4. **Partenaire** (sauté avec avertissement si `PROBE_PARTNER_EMAIL`/`PROBE_PARTNER_PASSWORD`
   absents, ou si les tables/RPC n'existent pas encore) : `SELECT` direct sur
   `partners`/`partner_users`/`attributions` → vide/refusé ; `rpc/partner_dashboard` → aucune
   PII pour le partenaire, `null`/vide pour un compte famille ; aucune table famille lisible
   par le partenaire.
5. **Anonyme** — sans token : `SELECT` sur 3 tables sensibles → vide/refusé ;
   `rpc/partner_dashboard` → refusé.

## Écriture (la seule autorisée)

Un document marqueur inséré par A (`crosswrite:documents`), supprimé en best-effort en fin de
run (`# cleanup : …` dans la sortie, hors comptage TAP — un échec de nettoyage n'annule pas un
run par ailleurs vert, mais laisse une ligne de log à vérifier manuellement).

## Lancer le script

```bash
PROBE_SUPABASE_URL=https://<ref>.supabase.co \
PROBE_SUPABASE_KEY=sb_publishable_... \
PROBE_USER_A_EMAIL=test.e2e.claude@seren-test.fr \
PROBE_USER_A_PASSWORD='...' \
PROBE_USER_B_EMAIL=test.e2e.claude+b@seren-test.fr \
PROBE_USER_B_PASSWORD='...' \
node scripts/rls-probes.mjs
```

- Toutes les valeurs viennent de variables d'environnement, **aucune valeur par défaut codée
  en dur** dans le script — l'absence d'une variable requise est un échec immédiat et
  explicite (pas une sonde lancée par erreur contre le mauvais projet).
- Le compte B est créé à la volée (`POST /auth/v1/signup`) s'il n'existe pas encore, en
  réutilisant le même mot de passe que A. Ne fonctionne que sur un projet où la confirmation
  email est désactivée (c'est le cas du projet de dev, `oltwzvfjazwjvghpzhia`, réservé aux
  domaines de test — voir `docs/runbook-supabase-cli.md`) — **jamais en prod**.
- `PROBE_PARTNER_EMAIL`/`PROBE_PARTNER_PASSWORD` sont optionnels : absents → les 4 sondes
  partenaire sont sautées avec un avertissement explicite, le reste du run continue et le exit
  code reste 0 si tout le reste passe. C'est l'état actuel de dev/préprod (aucun compte PF
  n'y existe) et un run sans ces variables doit finir **vert**.

## Quand le lancer

- **Avant chaque gel de fonctionnalité ou mise en production** touchant l'auth, les policies
  RLS, ou une nouvelle table de données famille/partenaire.
- Après toute migration qui ajoute une policy ou une RPC `security definer` (le script vérifie
  que la RLS fait ce qu'elle est censée faire, pas seulement qu'elle existe).
- Ad hoc, en remplacement des sondes manuelles pratiquées jusqu'ici avant un audit RLS
  (`docs/audit-rls.md`).

## Intégration CI future

Pas encore branché à `.github/workflows/ci.yml` (qui tourne aujourd'hui sans réseau, contre
des mocks — cf. `CLAUDE.md` § Points d'attention). Pour l'intégrer :

1. Un projet Supabase **dédié aux probes** (pas dev, pas préprod, pas prod) — éviter tout
   run concurrent qui piétinerait les données d'un autre usage du même projet, et isoler le
   coup de `signup` automatique du compte B.
2. Deux comptes de test permanents sur ce projet (A et B), confirmation email désactivée ; un
   compte partenaire si/quand `partners`/`partner_users`/`attributions` existent.
3. Secrets GitHub Actions : `PROBE_SUPABASE_URL`, `PROBE_SUPABASE_KEY`,
   `PROBE_USER_A_EMAIL`/`PASSWORD`, `PROBE_USER_B_EMAIL`/`PASSWORD`, et plus tard
   `PROBE_PARTNER_EMAIL`/`PASSWORD`.
4. Un job séparé (pas le job Vitest existant, qui doit rester réseau-nul) :
   `node scripts/rls-probes.mjs`, déclenché sur push vers `main` et/ou en planifié
   (le run n'est pas assez rapide/isolé pour tourner sur chaque PR d'un repo à plusieurs
   contributeurs sans un projet dédié — d'où le point 1).
5. Quand `letter_sends` sera durcie (chantier 2a §3.5), retirer la note de déviation
   ci-dessus et déplacer sa sonde dans `NO_WRITE_POLICY_TABLES`.
