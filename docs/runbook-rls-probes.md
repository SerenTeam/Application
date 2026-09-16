# Runbook — Probes d'isolation RLS (`scripts/rls-probes.mjs`)

> Chantier transverse Sécurité/RGPD, priorité n°1 : « deux utilisateurs — vérifier que A ne
> lit jamais les données de B ; et qu'un partenaire ne lit jamais une famille » (identifié en
> juillet dans `docs/audit-rls.md`, jamais industrialisé jusqu'ici — ce runbook documente le
> script qui l'automatise). Rédigé le 2026-09-14, réécrit en v2 le 2026-09-16 (démonstrateur
> partenaire : dossiers, consentements, enrôlements, hook d'inscription).

## Pourquoi ce script et pas Vitest

Le repo n'a pas de harnais BDD-live (`npm test` = Vitest, entièrement mocké — aucune requête
réseau). L'isolation RLS ne se prouve que contre un **vrai** projet Supabase (RLS appliquée par
Postgres, pas par un mock). `scripts/rls-probes.mjs` industrialise en script rejouable les sondes
REST manuelles pratiquées depuis juillet (voir `docs/audit-rls.md`), et reste prêt à rejoindre la
CI (voir § Intégration CI future).

## Ce que le script prouve (v2)

Sortie TAP (`ok`/`not ok`, plan en fin de run), `exit 1` si une sonde échoue. Un `SKIP` ne fait
**jamais** échouer un run : il signale une dépendance absente (table, RPC, compte optionnel,
`PROBE_API_URL`) ou le mode lecture seule. Les 14 familles de sondes :

1. **Familles A↔B — tables et storage.** Pour chacune des 13 tables de données famille
   (`questionnaires`, `roadmaps`, `steps`, `step_actions`, `documents`,
   `questionnaire_sessions`, `letter_sends`, `send_debits`, `purchases`, `attachments`,
   `sender_profiles`, `consents`, `transmissions`) : B fait un `SELECT *`, aucune ligne de A ne
   doit apparaître. Plus le storage : B ne liste aucun objet sous le préfixe `A/` du bucket
   `documents`. *SKIP* : table absente de l'environnement, ou bucket indisponible.

   **Force de la preuve, table par table — à lire avant de citer ce chiffre.** Après
   `provision-v2.mjs`, la famille A ne porte de lignes que dans **4** de ces tables :
   `documents` et `questionnaires` (écrites par `ensureContent()`), `purchases` et `consents`
   (écrites par `claim_dossier` et `record_consents`). Ces 4 sondes sont des **preuves fortes** :
   il existe une ligne de A, et B ne la voit pas. Les **9 autres** (`roadmaps`, `steps`,
   `step_actions`, `questionnaire_sessions`, `letter_sends`, `send_debits`, `attachments`,
   `sender_profiles`, `transmissions`) sont **vides** : la sonde y est vraie par vacuité et le
   resterait si la RLS tombait. Le script le dit lui-même dans sa note (`0 ligne accessible
   (preuve faible)`) — **ne pas résumer ce bloc par « les 13 tables sont couvertes »**. Pour rendre
   ces 9 sondes non vacantes, il faut faire écrire à `ensureContent()` une ligne de A dans
   `roadmaps`, `steps` et `sender_profiles` (les 6 dernières dépendent de parcours complets :
   envoi, pièce jointe, session en cours, transmission) ; augmenter le `limit=50` n'y changerait
   rien. Correctif de fond identifié à la revue du 16/09, **non appliqué** : il modifie le chemin
   de provisionnement, et n'a pas pu être rejoué avant la démo.
2. **Comptes famille (`my_account`).** A et B ont chacun un dossier **actif**, un consentement à
   la version courante, et la projection n'expose aucun champ interdit (`family_email`,
   `invite_token_hash`, `price_ttc`, `commission_ttc`). Les deux dossiers sont distincts et
   `has_active_dossier()` est vrai. *SKIP* : RPC `my_account` absente (migration v2 non appliquée).
3. **Marqueur et écritures croisées.** A insère un document marqueur : B ne peut ni le lire, ni
   l'`UPDATE`, ni `INSERT` un document en usurpant le `user_id` de A (`WITH CHECK` RLS).
   *SKIP* : mode lecture seule.
4. **Deny-all.** En lecture : ni une famille ni un gérant PF ne lisent `dossiers`,
   `account_enrollments`, `seren_admins`, `partners`, `partner_users`, `attributions`,
   `webhook_config`, `send_limits`, `provider_events`. En écriture : un `INSERT` direct est
   refusé sur 10 tables (`purchases`, `send_debits`, `letter_sends`, `dossiers`, `consents`,
   `account_enrollments`, `seren_admins`, `partners`, `partner_users`, `attributions`) — **même
   avec son propre `user_id`** : ces tables ne se mutent que par RPC `security definer`.
   *SKIP* (écriture) : mode lecture seule, ou table absente.
5. **RPC internes et secrets.** `send_balance`, `send_limits_status`, `link_enrollments`,
   `hook_before_user_created`, `letter_send_transition_allowed` ne sont pas exécutables par un
   compte famille ; `consume_send`, `release_debit`, `check_send_limits` refusent un faux secret.
   *SKIP* : prod (sonde non jouée).
6. **Correctif F1 — `transmissions`.** B ne lit aucune transmission d'autrui en direct ; le
   partage ne passe que par `get_transmission_by_code` avec le code **exact** (un mauvais code
   ne renvoie rien). *SKIP* : table ou RPC absente, mode lecture seule pour la partie partage.
7. **Partenaire PF-X — la règle rouge.** PF-X est `role partner` sans dossier ; sa liste
   (`partner_list_dossiers`) et ses compteurs (`partner_month_counters`) ne contiennent **aucune**
   clé de contenu ni de secret ; et surtout PF-X ne lit **aucune ligne** des 13 tables famille de
   **sa propre famille activée A**, ni aucun objet de son storage — avec la même gradation qu'au
   point 1 (preuve forte sur les 4 tables où A porte des lignes, vacuité sur les 9 autres ; la note
   de la sonde distingue « preuve forte » et « preuve faible »). *SKIP* : compte PF-X absent.
8. **PF-Y contre PF-X.** PF-Y ne liste aucun dossier de PF-X, et ne peut ni renvoyer l'invitation
   (`POST /api/partner/dossiers/:id/resend` → **404 `DOSSIER_NOT_FOUND`**, jamais 403 : aucun
   indice d'existence) ni annuler (`partner_cancel_dossier` → `dossier_not_found`) un dossier de
   PF-X. *SKIP* : compte PF-Y absent, mode lecture seule.
9. **Admin Seren.** `admin_partner_overview` ne renvoie que des compteurs par partenaire (liste de
   clés figée, aucune adresse e-mail), et renvoie `null` pour une famille comme pour un gérant PF.
   *SKIP* : compte admin absent, ou RPC absente (L4c non déployé).
10. **Anonyme.** Sans token : les tables sensibles sont vides ou refusées ; `invitation_preview`
    d'un hash inconnu répond `{valid:false, reason:'invalid'}` **sans oracle** (aucune autre clé) ;
    `claim_dossier`, `partner_create_dossier` et `my_account` sont refusés.
11. **Compte sans dossier actif.** `role none`, `has_active_dossier` faux, `record_consents`
    refusé (`dossier_not_active`), et le **gate serveur** répond **403 `DOSSIER_NOT_ACTIVE`** sur
    `GET /api/letters/quota` et `POST /api/questionnaire/start` ; en miroir, `GET /api/me` de la
    famille A répond 200 avec son quota. *SKIP* : compte sans dossier absent, `PROBE_API_URL`
    absente.
12. **Hook « Before User Created ».** Trois branches : inscription d'un e-mail **non invité**
    refusée (`signup_requires_invitation`) ; e-mail **invité sans hash** refusée ; e-mail **invité
    avec le bon hash** acceptée. *SKIP* : mode lecture seule, `PROBE_API_URL` absente (le dossier
    de sonde est créé par le serveur, voir § Sondes neuves).
13. **Écritures famille idempotentes.** Rejeu de `record_consents` → `recorded: 0` ; rejeu de
    `claim_dossier` sur un compte déjà actif → `{claimed:false, already_active:true}`.
    *SKIP* : mode lecture seule.
14. **`partner_dashboard` v0 (rollback).** Ni une famille ni un anonyme n'en obtiennent de
    données (`null` ou refus). *SKIP* : RPC absente.

## Modes

| Mode | Ce qui part | Ce qui est refusé |
| --- | --- | --- |
| **défaut (lecture seule)** | connexions, `SELECT`, RPC de lecture | toute inscription, tout `INSERT`/`UPDATE`/`DELETE`, toute RPC mutante — les sondes concernées sortent en `# SKIP mode lecture seule` |
| **`PROBE_WRITE=1`** | en plus : marqueur, tentatives d'écriture censées être refusées, sondes de hook, F1, `partner:secret` | rien de plus, mais **refusé sur la prod sans dérogation possible** |
| **prod + `PROD_OK=1`** | lecture seule uniquement (smoke U4) | l'écriture ; et dans `rawFetch()`, tout verbe non `GET`/`HEAD` hors connexion et hors liste fermée de RPC |

Liste fermée des RPC de lecture autorisées vers la prod (`READONLY_RPCS`) : `my_account`,
`has_active_dossier`, `consent_version`, `partner_list_dossiers`, `partner_month_counters`,
`admin_partner_overview`, `partner_dashboard`, `invitation_preview`. `claim_dossier`,
`record_consents` et `partner_create_dossier` n'y figureront **jamais**.

Toutes les écritures de sonde sont nettoyées en fin de run (`# cleanup : …`, hors comptage TAP) :
marqueur, transmission de sonde, dossier de sonde du hook.

## Provisionnement (`scripts/provision-v2.mjs`)

Depuis le hook d'inscription, **aucun compte ne peut plus être créé à la volée** : les comptes de
probes sont produits par le **vrai parcours d'invitation** (RPC du contrat, jamais un seed).

Prérequis, **dans cet ordre strict** :

1. **Partie 1 du seed** (`scripts/seed-demo-v2.sql`) : partenaires + allowlist `account_enrollments`.
   L'enrôlement précède **toujours** la création des comptes.
2. **Hook** `Before User Created` branché sur le projet.
3. **« Add user »** (Dashboard → Authentication, auto-confirm) par Arnaud pour chaque compte
   interne (gérants PF, admin), **en posant le mot de passe à la création** — jamais une
   inscription par l'app : un compte né d'un `signUp` public n'est pas fiable et sera refusé
   (`enrollment_account_untrusted`, revue du 16/09).
4. **Partie 2 du seed** (`link_enrollments`) avec les paires `{email, user_id}`, **AVANT le premier
   lancement du script** : `provision-v2.mjs` se connecte réellement et poserait `last_sign_in_at`,
   que `link_enrollments` refuse. Il n'y a donc **pas** de premier passage en `exit 2`.
5. **`PROVISION_API_URL`** et les **`PROVISION_*_PASSWORD`** : les dossiers sont créés par
   `POST /api/partner/dossiers`, la RPC `partner_create_dossier` exigeant le secret serveur
   (must-fix 1). Le serveur visé doit porter `PARTNER_ACTIVATIONS_ENABLED=true`,
   `SHOW_ACTIVATION_LINK=true` (pour récupérer le jeton dans `activation_url`) et un
   `WEBHOOK_RPC_SECRET` **égal** à `webhook_config.rpc_secret` de la base visée.

```bash
# Local
PROBE_SUPABASE_URL=http://127.0.0.1:54321 PROBE_SUPABASE_KEY=sb_publishable_... \
PROVISION_API_URL=http://127.0.0.1:3000 \
PROVISION_PFX_EMAIL=… PROVISION_PFY_EMAIL=… PROVISION_PFX_PASSWORD=… PROVISION_PFY_PASSWORD=… \
node scripts/provision-v2.mjs

# Préprod : ajouter E2E_TARGET=preprod et l'URL kvtzhyxlqouvpwasedbe (adresses @seren-test.fr only)
# Vérification en lecture seule (12 contrôles) :
node --env-file="$HOME/.seren-probes.env" scripts/provision-v2.mjs --verify
```

- **Code de sortie 2** = action d'Arnaud requise (« Add user », partie 2 du seed, ou mot de passe
  manquant), puis relancer. `0` = OK, `1` = erreur.
- Les identifiants produits sont écrits dans **`~/.seren-probes.env`** (`PROBE_ENV_FILE`), **mode
  600, hors dépôt**. Aucun mot de passe, jeton ni hash n'est jamais affiché.
- Comptes résiduels `rls-probe-*@seren-test.fr` (préprod) : **à exclure du backfill** bêta.
- La prod est refusée **dans tous les modes**, `--verify` compris.

## Sondes neuves de la revue du 16/09

- **`partner:secret`** : preuve que les deux RPC où l'appelant choisit le hash du jeton
  (`partner_create_dossier`, `partner_rotate_invitation`) ne sont plus utilisables en direct —
  sans secret et avec un faux secret → `invalid_secret`. Sans cette barrière, une PF fabriquerait
  un jeton connu d'elle et prendrait le compte de sa propre famille. Le vrai secret n'est **jamais**
  donné aux probes.
- **Les 3 sondes de hook** exigent désormais `PROBE_API_URL` **et** `SHOW_ACTIVATION_LINK=true`
  sur le serveur visé (le dossier de sonde est créé par `POST /api/partner/dossiers`) — sinon
  `SKIP` explicite.

## Lancer le script

```bash
node --env-file="$HOME/.seren-probes.env" scripts/rls-probes.mjs              # lecture seule
PROBE_WRITE=1 node --env-file="$HOME/.seren-probes.env" scripts/rls-probes.mjs # écriture
```

- Requises : `PROBE_SUPABASE_URL`, `PROBE_SUPABASE_KEY`, `PROBE_USER_A_EMAIL`/`PASSWORD`,
  `PROBE_USER_B_EMAIL`/`PASSWORD`. Aucune valeur par défaut codée en dur.
- Optionnelles (sondes sautées avec avertissement si absentes) : `PROBE_PARTNER_*` (PF-X),
  `PROBE_PARTNER_Y_*`, `PROBE_NODOSSIER_*`, `PROBE_ADMIN_*`.
- `PROBE_API_URL` : serveur Express — `https://preprod-app.seren-app.fr` (les routes `/api` sont
  hors Basic Auth) ou `http://localhost:3000`. Absente → les sondes HTTP du gate et du hook
  sortent en `SKIP`.

## Garde anti-prod

**Quatre barrières**, sans dérogation pour l'écriture :

1. **Garde de tête** (`refuseProdTarget()`, première instruction exécutée, avant la validation des
   variables) : si `PROBE_SUPABASE_URL` contient `oltwzvfjazwjvghpzhia`, l'écriture
   (`PROBE_WRITE=1`) est refusée **sans dérogation possible**, et la lecture seule exige
   `PROD_OK=1` explicite. Sortie `REFUS : …` sur stderr, **exit 1, aucun appel réseau**.
2. **`refuseProdApi()`** (juste après, même position : avant tout réseau) : `PROBE_API_URL` ne peut
   viser ni le project-ref prod ni `app.seren-app.fr`, **quelle que soit la base ciblée** — sans
   quoi un `PROBE_API_URL` de prod couplé à une base locale passait la garde (revue du 16/09).
   Les quatre formes sont couvertes : hôte, hôte + chemin, project-ref, forme sans schéma.
3. **`assertNoProdWrite()`** (dans `rawFetch()`) : vers la prod, seuls partent `GET`/`HEAD`, la
   connexion `POST /auth/v1/token`, le listing storage et les RPC de `READONLY_RPCS`. Tout le
   reste lève **avant** l'envoi.
4. **`api()`** : aucune requête mutante vers le serveur Express quand la cible est la prod
   (l'URL du serveur ne contient pas le project-ref, d'où cette barrière dédiée).

`scripts/provision-v2.mjs` **refuse la prod dans tous ses modes** (il crée comptes et dossiers), et
hors `127.0.0.1`/`localhost` exige `E2E_TARGET=preprod` **et** l'URL préprod, n'accepte que des
adresses `@seren-test.fr`, et refuse toute clé secrète (`sb_secret_…`/`service_role`).

La détection repose sur le project-ref dans l'URL (fonction partagée `isProdTarget()` de
`scripts/check-env-target.mjs`), **plus** le domaine applicatif `app.seren-app.fr` pour les URL de
serveur (`PROBE_API_URL`, `E2E_API_URL`) : un *autre* domaine personnalisé pointant sur la prod ne
serait pas détecté (aucun n'est configuré à ce jour). Tests : `tests/check-env-target.test.ts` et
`tests/provision-v2-guard.test.ts` (sous-processus sur `127.0.0.1`, jamais de réseau vers Supabase).

Avant de lancer le script, contrôler aussi son propre shell : `npm run check:env`.

## Écart local / hébergé

En **local**, réappliquer `hosted-grants.sql` **après chaque `supabase db reset`** : la CLI ne
donne plus `SELECT/INSERT/UPDATE/DELETE` à `anon`/`authenticated` sur les tables créées par
`postgres`, alors que les projets hébergés les accordent (la RLS restant la seule barrière). Sans
ce rejeu, toutes les sondes `family:*` sortent en « refusé » et le run est un **faux vert**.

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
   run concurrent qui piétinerait les données d'un autre usage du même projet.
2. Les comptes de probes provisionnés une fois par `scripts/provision-v2.mjs` (le hook interdit
   toute création à la volée) : familles A et B, PF-X, PF-Y, compte sans dossier, admin.
3. Secrets GitHub Actions : `PROBE_SUPABASE_URL`, `PROBE_SUPABASE_KEY`, `PROBE_USER_A_*`,
   `PROBE_USER_B_*`, `PROBE_PARTNER_*`, `PROBE_PARTNER_Y_*`, `PROBE_NODOSSIER_*`, `PROBE_ADMIN_*`,
   et `PROBE_API_URL` pour les sondes HTTP du gate et du hook.
4. Un job séparé (pas le job Vitest existant, qui doit rester réseau-nul) :
   `node scripts/rls-probes.mjs`, déclenché sur push vers `main` et/ou en planifié.
