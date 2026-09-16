# Design — Démonstrateur v2 + bêta pilote · CONTRAT FIGÉ

> Rédigé le 2026-09-15 à 17h40. Sources : plan retenu « risque-first » (paliers, lots L0-L9, timeline, user steps, critique adversariale), analyses d'écart du code sur `integration/2a-preprod`, décisions d'Arnaud du 15/09 vers 17h20 (§1.3). Ces décisions **priment** sur le plan en cas d'écart.
> **Statut : CONTRAT FIGÉ.** C'est la référence unique des agents pour la nuit du 15 au 16/09. Noms de fichiers, tables, colonnes, signatures SQL, clés JSON, routes, codes d'erreur, flags et namespaces i18n ne changent plus sans une **note de contrat** datée en fin de document (§12), validée par l'orchestrateur. Une divergence découverte en cours de lot → on s'arrête, on écrit la note, puis on reprend.
> Branche de base : `integration/v2-demo` (= `integration/2a-preprod` + merge de `main` 63c420e + cherry-pick des probes RLS + L0 4510a61 ; tag local `preprod-2a-base`). Branches de lot : `feature/v2-<lot>` (ex. `feature/v2-l1`), créées depuis `integration/v2-demo` **après** le commit des stubs contractuels L0bis (§8.1).
> Conventions du repo inchangées : prose et commentaires en français, identifiants en anglais, tokens `@theme` uniquement, parité FR/EN vérifiée par tsc, courriers toujours en français, jamais la clé secrète Supabase.

---

## 1. Contexte, décisions et périmètre

### 1.1 Pourquoi un démonstrateur et une bêta

La roadmap v2 (Google Drive, « Roadmap Technique - Seren ») change le modèle économique. **Seren ne vend plus rien aux familles.** La pompe funèbre (PF) partenaire ouvre un dossier Seren pour la famille au moment des obsèques. Elle facture 290 € TTC à la famille dans la facture du dossier, garde 70 € TTC de commission, et Seren lui facture 220 € TTC par dossier. La famille reçoit un compte **actif et payé dès la création** : accès sans limite de durée et 10 envois inclus. Au-delà, un mini-paiement famille est prévu (3 € le courrier simple, 9 € la LRAR), mais il est coupé pour cette itération. **Règle rouge : la PF voit l'identité de la famille et du défunt, jamais le contenu** (réponses, roadmap, courriers, documents, envois).

Le code actuel (2a + dashboard PF v0) porte encore le modèle v1 :
- l'inscription est libre (`/signup`) ;
- un paywall forfait Stripe s'affiche côté famille ;
- le quota vient d'un achat Stripe ;
- la page PF montre un CA et une commission calculés sur des achats famille ;
- le LLM est toujours instancié.

Deux échéances :
- **jeudi 18/09 à 15h**, démonstration investisseurs en live sur la préprod ;
- **jeudi 18/09 à 16h30-18h30**, ouverture d'une **bêta pilote réelle en PROD** par promotion du même commit, avec repli vendredi 19/09 9h-11h.

Ce document fige ce qui est construit, et comment, pour que 11 lots parallèles convergent sans renégociation.

### 1.2 Les paliers et leur repli

| Palier | Contenu | Repli déjà construit |
|---|---|---|
| **PLANCHER** | 2a déployé en préprod ; paywall forfait retiré ; `/signup` fermé côté front ; tuiles euros de la page PF v0 masquées ; textes v2 ; LLM coupé (`FEATURE_LLM`) ; envoi papier montré en clé TEST. **Aucune migration v2.** | Tag local `preprod-plancher` (posé vers 22h par L8) |
| **MINIMUM** | Parcours v2 complet en live (§2) + chantier T : correctif F1, hook « Before User Created », gate fail-closed, consentements persistés, probes v2, vue admin Seren (L4c) et compteurs PF explicites | Render « Rollback » vers le deploy de U1 (la RPC `partner_dashboard` v0 reste intacte) |
| **CIBLE** | L4b : bloc « Ce mois : N dossiers activés · N × 220 € TTC à facturer (estimation, facturation non active) » derrière `PARTNER_BILLING_PREVIEW`, **préprod seulement** | Slide |

**Coupés dès ce soir** (décision du 15/09) :
- la vue dédiée « Vos courriers sont prêts » (ex-L5b) ; il reste une phrase « N courriers prêts » sur l'écran de fin ;
- le mini-paiement Stripe : `EXTRA_SENDS_ENABLED` absent partout, CTA d'achat masqué ;
- les policies RLS d'écriture conditionnées au dossier (L10, post-bêta, semaine du 22/09).

**Ordre de coupe si retard** (jamais L1, L1b, L2a, L6) : L4b → UI d'annulation 48 h (la RPC reste) → page `/security` (on garde `/legal`) → captures à 400 px → L4c UI (la RPC et la route restent).

### 1.3 Décisions actées (Arnaud, 15/09 17h20)

| # | Sujet | Décision |
|---|---|---|
| D1 | Où ouvre la bêta | **PROD**, jeudi 18/09 16h30-18h30 (créneau U4, promotion du commit de démo). Repli vendredi 19/09 9h-11h. Conditions : GNG6 (§10.3). |
| D2 | Création du compte famille sans clé secrète | **Jeton Seren** de 32 octets aléatoires, encodé en base64url, valable 7 jours. Seul son sha256 (hex) transite vers l'API et la base, où il est stocké. L'invitation part par **Resend**. La page `/activation` lit le jeton dans le fragment `#t=` et l'efface **en première instruction du corps de `main.tsx`, avant `initSentry()`**. La famille fait `signUp` avec `options.data.invite_token_hash`, puis la RPC `claim_dossier` rattache le compte. Le hook Postgres « Before User Created » est `security definer` (owner postgres, `search_path` fixé, revoke public/anon/authenticated, grant `supabase_auth_admin`). Il accepte un e-mail figurant dans l'**allowlist d'enrôlement** (gérants PF ET admins Seren), ou un e-mail invité dont le hash correspond. Aucune clé secrète Supabase. |
| D3 (modifiée) | Ce qui ouvre en bêta prod | **Ouverts :** activation, consentement, questionnaire (LLM coupé), roadmap, courriers PDF, **envoi papier LIVE** (clé MySendingBox live, `PAPER_SENDS_ENABLED=true` en prod) **sans file de validation Seren** (contrôle a posteriori dans le dashboard MySendingBox). Le coffre PJ est ouvert quand `PAPER_SENDS_ENABLED='true'` (l'acte de décès en dépend), sans antivirus (risque documenté, chantier 3). **Restent fermés :** e-mail aux organismes (`EMAIL_SENDS_ENABLED` absent), mini-paiement, LLM. **Quota épuisé :** 402 sans CTA d'achat, message « contactez le support ». **Prérequis à la charge d'Arnaud, dans GNG6 :** compte MySendingBox live + moyen de paiement, DPA art. 28, grille tarifaire écrite, 2-3 plis réels de contrôle (**modalité tranchée le 16/09 : option (a) du §10.3 — Arnaud les envoie lui-même depuis son compte LIVE, le critère de jeudi porte sur le dashboard MSB, pas sur la réception**), relecture juridique des corps de courriers. Recommandation : allonger la fenêtre d'annulation dans les réglages du compte MySendingBox (envoi live immédiat, `send_date` possible, `DELETE /letters/{id}` avant la date ; fenêtre de 15 min par défaut, réglable). `PAPER_SENDS_ENABLED=true` en prod est le **DERNIER geste de U4**. Si les prérequis manquent, la bêta ouvre sans papier ; le flag s'ouvre en 1 min sans redéploiement. |
| D4 | Source des 10 envois inclus | **Pont `purchases`** : `claim_dossier` insère `kind='forfait'`, `status='paid'`, `included_sends=10`, `stripe_session_id='partner_dossier:<dossier_id>'`, `on conflict (stripe_session_id) do nothing`. `consume_send`, `send_balance` et `release_debit` restent **intacts**. |
| D5 | Gel et revues | SQL gelé mercredi 11h, push U2 à 12h30. Correctifs poussés en U3 (mer. 20h30) et jeudi 9h. Gel dur jeudi 10h45. **Double revue** : SQL, hook, gate, jeton, seed partie 3, backfill. **Revue unique** : UI et textes. |
| D6 | Comptes prod existants | Backfill ciblé : dossiers `source='direct'` actifs pour les vrais comptes, re-consentement demandé, **sans** pont `purchases` sauf décision contraire. Exclus : `@seren-test.fr`, compte B des probes, résidus de marqueurs. |
| D7 | Suivi financier PF | L4b derrière `PARTNER_BILLING_PREVIEW`, flag préprod seulement. Aucun HT ni TVA affiché. |
| D8 | Ouverture PF par étapes | Gérants dès la promotion. Dossiers famille (`PARTNER_ACTIVATIONS_ENABLED=true`) seulement après : lettre d'engagement PF avec clause art. 28, information art. 14 dans l'invitation, procédure manuelle d'effacement, contact support publié. |
| D9 (nouveau) | Vue admin Seren (lot L4c, ~6 h) | Table `seren_admins(user_id)` deny-all, remplie par SQL (user step). `my_account` et `/api/me` exposent `is_admin`. RPC `admin_partner_overview()` security definer (`auth.uid()` dans `seren_admins`, sinon `null`). Par partenaire : raison sociale, statut, dossiers créés au total, créés ce mois, invités en attente, activés, annulés, date du dernier dossier. **Compteurs uniquement**, aucune PII famille ni contenu. Route front `/admin` gardée (FR/EN, tokens `@theme`). Côté PF, compteurs explicites : créés ce mois, créés au total, activés par la famille, en attente d'activation. |

**Arbitrages techniques pris par ce contrat** (réversibles seulement par note de contrat) :
- **A1.** `dossiers` n'a **aucune policy**, pas même un SELECT owner (le plan prévoyait un SELECT own). Motif : la ligne porte les snapshots prix et commission, qui ne regardent pas la famille. Toute lecture passe par `my_account()`, `has_active_dossier()` ou les RPC PF.
- **A2.** `seren_admins` est créée dans `v2_core` et non dans `v2_admin`, parce que `my_account()` (core) la lit. `v2_admin` ne contient que la RPC `admin_partner_overview`.
- **A3.** L'allowlist d'enrôlement est une seule table, `account_enrollments` (rôles `partner_manager` et `seren_admin`), lue par le hook. La liaison compte ↔ rôle se fait par la fonction SQL non exposée `link_enrollments(p_pairs jsonb)`, appelée par Arnaud dans le SQL Editor après l'« Add user », avec l'**appariement explicite e-mail ↔ UUID** (§3.3.3, revue du 16/09).
- **A4.** La version de consentement est une constante SQL (`consent_version()`) dupliquée côté front (`src/lib/consent-version.ts`), avec un test de parité. Changer de version = migration + code.
- **A5.** Les factories de routers ne gardent plus de gate passe-plat par défaut. Leur défaut est un middleware **fail-closed** (500 `GATE_NOT_CONFIGURED`), et les tests injectent explicitement un passe-plat (8 constructions à adapter).
- **A6.** `link_enrollments`, `consent_version` et un 4ᵉ fichier de migration (`v2_admin`) s'ajoutent au plan : **U2 pousse 4 fichiers**, pas 3.
- **A7.** La facturation estimée (L4b) porte sur les dossiers **activés par la famille ce mois** (`source='partner'`, `activated_at` dans le mois, fuseau Europe/Paris). Elle est calculée sur les snapshots : Σ(`price_ttc_cents` − `commission_ttc_cents`).

### 1.4 Ce qui reste honnêtement hors périmètre

- **LRAR, sous-quota de 5 LRAR, tarif 9 € (lot 2c).** L'offre affiche « 10 envois inclus » sans mentionner les recommandés.
- **Mini-paiement Stripe, file de validation humaine avant envoi, relances J+15, séquence de 12 mois, mode tablette, QR, statistiques, rôle conseiller dans l'UI** (la colonne `role` existe, aucun écran ne l'exploite).
- **Facturation PF réelle** : factures numérotées, PDF, SEPA, avoirs, arbitrage de l'arrondi TVA. L'estimation L4b est un affichage préprod sans valeur comptable.
- **Réécriture de `consume_send` et `send_balance` sur les dossiers.** Le pont `purchases` est une dette documentée, retirée au lot 2c.
- **Code mort à supprimer post-bêta :** `require-purchase.js`, `/api/payments/checkout` forfait et leurs tests.
- **Policies RLS d'écriture conditionnées au dossier (L10).** Le front écrit toujours directement `questionnaires`, `roadmaps`, `steps`, `step_actions`, `documents` et `sender_profiles` sous RLS owner.
- **Coffre complet** (antivirus, rétention, journal d'accès), **effacement RGPD automatisé** (procédure manuelle pour la bêta), purge à 1 an, MFA PF, probes en CI.
- **Pré-remplissage du questionnaire** par les données saisies par la PF : la famille ressaisit nom et date de décès.
- **Chantier 5 complet** (catalogue en base, arborescence déterministe) : seule la rédaction LLM est coupée par flag.
- **Produit transmission** : reste gelé ; seul le correctif F1 est appliqué.
- **Toute écriture sur `main` ou la base prod avant jeudi 16h30.** Aucun agent n'utilise `supabase link`, `--linked` ni `db push`.

---
## 2. Architecture et flux

### 2.1 Vue d'ensemble

```
Gérant PF (profil navigateur « PF »)                 Famille (profil navigateur « Famille »)
  /partenaire ──POST /api/partner/dossiers──┐
                                            │ Node : randomBytes(32) → token (base64url, 43 car.)
                                            │        sha256(token) hex → RPC partner_create_dossier
                                            │ Resend : e-mail d'invitation (art. 14) avec
                                            │        APP_URL/activation#t=<token>
                                            ▼
                                   dossiers (status 'invited', hash, +7 j)
                                            │
  Boîte mail ──clic──► /activation#t=… ─ main.tsx capture puis efface le fragment, AVANT initSentry()
                        │ WebCrypto sha256(token) → POST /api/activation/check {token_hash}
                        │   → RPC invitation_preview → { email, partner_name, … }
                        │ supabase.auth.signUp({ email, password, options.data.invite_token_hash })
                        │   → hook_before_user_created : e-mail invité + hash valide → {}
                        │ POST /api/activation/claim {token_hash}
                        │   → RPC claim_dossier : status 'active', hash effacé, pont purchases (10)
                        ▼
                     /bienvenue → RPC record_consents(CONSENT_VERSION, 3 kinds)
                        ▼
                     /  (questionnaire, LLM coupé) → roadmap → courriers PDF
                        → POST /api/letters/send (papier) : requireAuth → requireActiveDossier
                          → kill switch canal → limiteur → … → consume_send → MySendingBox
  /partenaire ◄── GET /api/partner/dossiers : dossier 'active', aucun contenu
Admin Seren : /admin ◄── GET /api/admin/overview → RPC admin_partner_overview (compteurs)
```

### 2.2 Flux détaillés

1. **Enrôlement des comptes internes** (gérants PF et admins Seren). **Un compte interne n'est JAMAIS créé par une inscription publique** : seul Arnaud le crée, et la liaison exige l'UUID de ce compte. Ordre imposé :
   - **(a)** seed partie 1, en SQL : insertion des lignes `partners` ; insertion de `account_enrollments` (e-mails des gérants, `role='partner_manager'` et `partner_id` ; e-mails des admins, `role='seren_admin'`) ;
   - **(b)** Dashboard Supabase → Authentication → **« Add user » (auto-confirm)** pour chaque gérant et admin. Le bouton doit **CRÉER** le compte : une erreur « already registered » signifie que quelqu'un détient déjà l'adresse → **STOP**, enquête (`auth.users.created_at`, `last_sign_in_at`, `email_change`), jamais de liaison. **Poser le mot de passe à la création** (valeur générée par `openssl rand -base64 18`, conservée par Arnaud dans son gestionnaire de mots de passe — jamais écrite dans le dépôt ni dans le chat) : un compte créé ainsi garde `last_sign_in_at` null, ce qu'exige `link_enrollments` (§3.3.3) ;
   - **(c)** copier l'**UUID** affiché par « Add user » pour chaque compte, et le coller dans la partie 2 du seed (appariement explicite e-mail ↔ UUID) ;
   - **(d)** seed partie 2 : `select public.link_enrollments('[{"email":"…","user_id":"…"}, …]'::jsonb);` — crée les lignes `partner_users` (`role='manager'`) et `seren_admins` **uniquement** pour des comptes fiables (§3.3.3) ;
   - **(e)** **aucune connexion à ces comptes avant (d)** : la partie 2 refuse un compte déjà connecté. `scripts/provision-v2.mjs` se connecte réellement avec les mots de passe posés en (b) : il ne tourne donc **qu'après** la partie 2. **Règle unique des mots de passe** : les mots de passe des comptes internes de démo et de probes sont posés par Arnaud à la création (b) et conservés dans son gestionnaire ; pour un **gérant de PF réel** (ouverture prod), le mot de passe est fixé par l'intéressé via **« Send password recovery »** (Dashboard), déclenché **après la partie 2**. Dans les deux cas, aucun mot de passe n'est écrit dans le dépôt ni communiqué en clair par Seren.
   **Décision (16/09, arbitrage sécurité)** : `scripts/provision-v2.mjs` **ne crée plus** les comptes internes par `signUp` via l'allowlist — un compte issu d'une inscription publique n'est pas fiable et ne sera pas lié. Le script reçoit `PROVISION_PFX_PASSWORD`, `PROVISION_PFY_PASSWORD` et `PROVISION_ADMIN_PASSWORD` (mots de passe posés par Arnaud en (b)) et se contente de se connecter, **après** la partie 2 ; s'il ne peut pas, il sort en code 2 en nommant l'étape manquante (Add user ou partie 2).
2. **Création du dossier (PF).** Le formulaire inline envoie `POST /api/partner/dossiers`. Le serveur :
   - génère le jeton ;
   - appelle `partner_create_dossier` avec le hash, via le client au token utilisateur ;
   - traite deux cas : si la RPC signale un doublon de défunt (même nom de famille + même date chez ce partenaire), 409 `DUPLICATE_DECEASED`, et la PF confirme puis renvoie avec `confirm_duplicate: true` ; un e-mail déjà porté par un dossier non annulé ou par un compte interne donne 409 `EMAIL_UNAVAILABLE` (message générique) ;
   - envoie l'invitation par Resend ;
   - répond 201 avec `email_sent` et `activation_url` (seulement si `SHOW_ACTIVATION_LINK === 'true'`).
3. **Renvoi.** `POST /api/partner/dossiers/:id/resend` → `partner_rotate_invitation` : nouveau jeton, nouvelle expiration à +7 j, l'ancien lien meurt. Au plus 1 renvoi par 10 min et 10 au total par dossier.
4. **Annulation.** `POST /api/partner/dossiers/:id/cancel` → `partner_cancel_dossier`. Autorisée seulement si `status='invited'` et `created_at > now() - 48 h`. Un dossier activé n'est jamais annulable par la PF : aucune action PF ne coupe une famille.
5. **Activation (famille).** Voir §7.3 pour la machine d'états exacte. Cas d'un compte auth déjà existant pour l'e-mail invité (ancien compte, compte backfillé) : `signUp` renvoie `user_already_exists`, puis la page propose `signInWithPassword` puis le claim.
6. **Consentement.** `/bienvenue` affiche la PF émettrice (ou un libellé générique pour `source='direct'`) et le prénom du défunt. Trois cases obligatoires (CGU, confidentialité, données sensibles) appellent `record_consents`. Tant que les trois consentements à la version courante manquent, le serveur répond 403 `CONSENT_REQUIRED` sur toutes les routes métier et la garde front redirige vers `/bienvenue`.
7. **Parcours famille.** Questionnaire, puis roadmap et courriers, inchangés hormis les textes (L5). L'envoi papier consomme le pont (10 → 9). Quand il n'y a plus de crédit : 402 `QUOTA_EXHAUSTED` avec `extra_send_available: false`, et le front affiche « contactez le support ».
8. **Vue PF.** Liste des dossiers (identité famille et défunt, statut, dates, actions) et compteurs du mois. La RPC ne joint aucune table de contenu.
9. **Vue admin Seren.** Compteurs par partenaire, sans PII famille.
10. **Comptes sans dossier** (ancien compte, compte créé hors invitation avant le hook) : `/api/me` → `role='none'`, écran « accès non activé » + contact support. Toutes les routes métier répondent 403 `DOSSIER_NOT_ACTIVE`.

### 2.3 Rôles exclusifs d'un compte

| `my_account().role` | Condition (évaluée dans cet ordre) | Destination front |
|---|---|---|
| `partner` | ligne `partner_users` pour `auth.uid()` | `/partenaire` |
| `family` | dossier avec `user_id = auth.uid()` et `status in ('active','closed')` | `/bienvenue` si consentement requis, sinon routes famille |
| `none` | aucun des deux | `/admin` si `is_admin`, sinon écran « accès non activé » |

`is_admin` est **orthogonal** : il vaut `true` si une ligne `seren_admins` existe. `claim_dossier` refuse tout compte présent dans `partner_users` ou `seren_admins`, et `partner_create_dossier` refuse tout e-mail d'un compte interne ou enrôlé. Un compte ne peut donc pas être à la fois famille et interne.

---
## 3. Contrat de données

### 3.1 Fichiers de migration (tous additifs, horodatés après `20260914170000_resync_reader.sql`)

| Fichier | Lot | Contenu |
|---|---|---|
| `supabase/migrations/20260915200000_v2_core.sql` | L1 (subagent « core ») | ALTER `partners`, `partner_users` ; CREATE `account_enrollments`, `seren_admins`, `dossiers`, `consents` ; copie `attributions` → `dossiers` (`source='demo'`) ; fonctions `consent_version`, `hook_before_user_created`, `link_enrollments`, `invitation_preview`, `claim_dossier`, `my_account`, `record_consents`, `has_active_dossier` |
| `supabase/migrations/20260915201000_v2_partner_rpc.sql` | L1 (subagent « partner ») | `partner_create_dossier`, `partner_rotate_invitation`, `partner_cancel_dossier`, `partner_list_dossiers`, `partner_month_counters` |
| `supabase/migrations/20260915202000_v2_admin.sql` | L4c | `admin_partner_overview` |
| `supabase/migrations/20260915210000_transmissions_f1.sql` | L1b | drop de la policy F1 + `get_transmission_by_code` |

Règles communes (lint `tests/migrations-v2-lint.test.ts`, L1) :
- **Aucun `drop table`**, aucun `drop function` ni `create or replace` sur `partner_dashboard`, `consume_send`, `send_balance`, `release_debit`, `create_pending_purchase`, `mark_purchase_paid`. La table `attributions` est conservée (dépréciée par un commentaire).
- `drop policy` autorisés : `"Authenticated users can read with access_code" on transmissions` (F1) et `"own consents read" on consents` (drop/create rejouable de la policy neuve).
- **Aucune policy d'écriture** (`for insert|update|delete|all`) créée par ces 4 fichiers. Seules policies créées : `"own consents read"` (SELECT, `to authenticated`).
- Chaque fonction : `security definer`, `set search_path = ''`, noms qualifiés `public.` / `auth.`. Exception : `consent_version()`, qui est `security invoker` et `immutable`. Chaque fonction a une ligne `revoke all on function … from public, anon, authenticated;` suivie des `grant` listés au §3.4.
- `alter function … owner to postgres;` explicite sur `hook_before_user_created`.
- **Rejouabilité :** `create table if not exists`, `add column if not exists`, contraintes nommées ajoutées dans un bloc `do $$ … exception when duplicate_object then null; end $$`, `create or replace function` (sur les fonctions NEUVES uniquement), insertions de copie gardées par `where not exists`.
- **Les RPC ne dérivent JAMAIS une identité d'un paramètre** : `partner_id`, `user_id` et le rôle admin viennent de `auth.uid()` ; l'e-mail vient de `auth.jwt() ->> 'email'`.
- Les erreurs métier sont levées par `raise exception '<code>' using errcode = 'P0001';`. Le message EST le code (snake_case, liste §3.5). Le serveur les mappe par égalité stricte sur `error.message`.
- Les montants sont en centimes entiers (convention `purchases.amount_total`).

### 3.2 DDL — `20260915200000_v2_core.sql`

```sql
-- ── partners : champs contractuels v2 (name = raison sociale ; commission_rate conservée, plus lue) ──
alter table public.partners
  add column if not exists siret                text,
  add column if not exists billing_email        text,
  add column if not exists status               text not null default 'active',
  add column if not exists price_ttc_cents      integer not null default 29000,
  add column if not exists commission_ttc_cents integer not null default 7000,
  add column if not exists contract_signed_at   date,
  add column if not exists updated_at           timestamptz not null default now();
-- contraintes nommées (bloc do/duplicate_object) :
--   partners_status_check          check (status in ('prospect','active','suspended','terminated'))
--   partners_price_check           check (price_ttc_cents >= 0)
--   partners_commission_check      check (commission_ttc_cents >= 0 and commission_ttc_cents <= price_ttc_cents)
--   partners_siret_check           check (siret is null or siret ~ '^[0-9]{14}$')

-- ── partner_users : rôle ──
alter table public.partner_users
  add column if not exists role text not null default 'manager';
--   partner_users_role_check       check (role in ('manager','advisor'))

-- ── account_enrollments : allowlist lue par le hook (deny-all) ──
create table if not exists public.account_enrollments (
  id             uuid primary key default gen_random_uuid(),
  email          text not null,
  role           text not null,
  partner_id     uuid references public.partners(id) on delete cascade,
  linked_user_id uuid references auth.users(id) on delete set null,
  linked_at      timestamptz,
  created_at     timestamptz not null default now(),
  constraint account_enrollments_email_check   check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint account_enrollments_role_check    check (role in ('partner_manager','seren_admin')),
  constraint account_enrollments_partner_check check ((role = 'partner_manager') = (partner_id is not null))
);
create unique index if not exists account_enrollments_email_role_uidx on public.account_enrollments (email, role);
alter table public.account_enrollments enable row level security;   -- AUCUNE policy

-- ── seren_admins : rôle admin Seren (deny-all, rempli par link_enrollments) ──
create table if not exists public.seren_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.seren_admins enable row level security;          -- AUCUNE policy

-- ── dossiers : source de vérité de l'activation (deny-all, arbitrage A1) ──
create table if not exists public.dossiers (
  id                    uuid primary key default gen_random_uuid(),
  partner_id            uuid references public.partners(id) on delete restrict,
  source                text not null,
  status                text not null default 'invited',
  user_id               uuid references auth.users(id) on delete set null,
  family_first_name     text,
  family_last_name      text,
  family_email          text not null,
  family_phone          text,
  deceased_first_name   text,
  deceased_last_name    text,
  deceased_death_date   date,
  price_ttc_cents       integer not null,
  commission_ttc_cents  integer not null,
  included_sends        integer not null default 10,
  invite_token_hash     text,
  invite_expires_at     timestamptz,
  invite_issued_at      timestamptz,
  invite_rotation_count integer not null default 0,
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  activated_at          timestamptz,
  cancelled_at          timestamptz,
  cancelled_by          uuid references auth.users(id) on delete set null,
  closed_at             timestamptz,
  updated_at            timestamptz not null default now(),
  constraint dossiers_source_check   check (source in ('partner','direct','demo')),
  constraint dossiers_status_check   check (status in ('invited','active','closed','cancelled')),
  constraint dossiers_partner_check  check ((source = 'direct') = (partner_id is null)),
  constraint dossiers_email_check    check (family_email = lower(btrim(family_email))
                                            and char_length(family_email) <= 254
                                            and family_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint dossiers_phone_check    check (family_phone is null or family_phone ~ '^[0-9 +().-]{6,30}$'),
  constraint dossiers_identity_check check (source <> 'partner' or (
                                              family_first_name   is not null and family_last_name   is not null and
                                              deceased_first_name is not null and deceased_last_name is not null and
                                              deceased_death_date is not null)),
  constraint dossiers_names_check    check (coalesce(char_length(family_first_name),1)   between 1 and 100
                                        and coalesce(char_length(family_last_name),1)    between 1 and 100
                                        and coalesce(char_length(deceased_first_name),1) between 1 and 100
                                        and coalesce(char_length(deceased_last_name),1)  between 1 and 100),
  constraint dossiers_amounts_check  check (price_ttc_cents >= 0 and commission_ttc_cents >= 0 and included_sends >= 0),
  constraint dossiers_hash_check     check (invite_token_hash is null or invite_token_hash ~ '^[0-9a-f]{64}$'),
  constraint dossiers_state_check    check (
       (status = 'invited'   and user_id is null and invite_token_hash is not null and invite_expires_at is not null
                             and activated_at is null and cancelled_at is null)
    or (status = 'active'    and user_id is not null and activated_at is not null and invite_token_hash is null
                             and cancelled_at is null)
    or (status = 'closed'    and closed_at is not null and invite_token_hash is null)
    or (status = 'cancelled' and cancelled_at is not null and user_id is null and invite_token_hash is null))
);
-- Un e-mail = au plus un dossier non annulé (unicité GLOBALE, toutes PF confondues).
create unique index if not exists dossiers_family_email_open_uidx on public.dossiers (family_email) where status <> 'cancelled';
-- Un compte = au plus un dossier.
create unique index if not exists dossiers_user_uidx              on public.dossiers (user_id) where user_id is not null;
create unique index if not exists dossiers_invite_hash_uidx       on public.dossiers (invite_token_hash) where invite_token_hash is not null;
create index        if not exists dossiers_partner_created_idx    on public.dossiers (partner_id, created_at desc);
create index        if not exists dossiers_partner_deceased_idx   on public.dossiers (partner_id, lower(deceased_last_name), deceased_death_date);
alter table public.dossiers enable row level security;              -- AUCUNE policy (A1)

-- ── consents : preuve append-only ──
create table if not exists public.consents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  dossier_id  uuid references public.dossiers(id) on delete set null,
  kind        text not null,
  version     text not null,
  accepted_at timestamptz not null default now(),
  constraint consents_kind_check    check (kind in ('terms','privacy','sensitive_data')),
  constraint consents_version_check check (version ~ '^[0-9]{4}-[0-9]{2}-[a-z0-9-]{1,40}$')
);
create unique index if not exists consents_user_kind_version_uidx on public.consents (user_id, kind, version);
alter table public.consents enable row level security;
drop policy if exists "own consents read" on public.consents;   -- policy NEUVE de ce fichier : drop/create rejouable, toléré par le lint
create policy "own consents read" on public.consents for select to authenticated using (auth.uid() = user_id);

-- ── Copie des attributions v0 → dossiers de démo (aucun DROP d'attributions) ──
insert into public.dossiers (partner_id, source, status, user_id, family_email,
                             price_ttc_cents, commission_ttc_cents, included_sends, activated_at, created_at)
select a.partner_id, 'demo', 'active', a.user_id, lower(btrim(u.email)),
       p.price_ttc_cents, p.commission_ttc_cents, 10, a.created_at, a.created_at
  from public.attributions a
  join auth.users u   on u.id = a.user_id
  join public.partners p on p.id = a.partner_id
 where u.email is not null
   and not exists (select 1 from public.dossiers d where d.user_id = a.user_id)
   and not exists (select 1 from public.dossiers d where d.family_email = lower(btrim(u.email)) and d.status <> 'cancelled');
```

> Note : la copie ne crée **ni** pont `purchases` **ni** consentement. Un compte de démo copié arrive donc sur `/bienvenue` avec un solde de 0, sauf s'il possède déjà des achats Stripe de test. Les comptes de démo utilisés en live sont provisionnés par le vrai parcours (L6) ou par le seed partie 3 (L7).

### 3.3 Fonctions — signatures exactes, logique, retours

Notation : **SD** = `security definer`, **SP** = `set search_path = ''`. `v_uid := auth.uid()`, `v_email := lower(btrim(auth.jwt() ->> 'email'))`.

#### 3.3.1 `public.consent_version() returns text` — core

`language sql immutable`, **security invoker**. Corps : `select '2026-09-beta-1'::text`. Grant : `authenticated`.
Constante jumelle front : `export const CONSENT_VERSION = '2026-09-beta-1'` dans `src/lib/consent-version.ts`. La parité est testée par `tests/consent-version.test.ts`, qui lit la migration.

#### 3.3.2 `public.hook_before_user_created(event jsonb) returns jsonb` — core

`language plpgsql`, SD, SP, `stable`. `alter function public.hook_before_user_created(jsonb) owner to postgres;`
```
v_email := lower(btrim(event -> 'user' ->> 'email'));
v_hash  := event -> 'user' -> 'user_metadata' ->> 'invite_token_hash';
si v_email est null ou ''                                                     → REFUS
si exists (select 1 from public.account_enrollments where email = v_email)   → return '{}'::jsonb
si v_hash ~ '^[0-9a-f]{64}$' et exists (select 1 from public.dossiers
      where invite_token_hash = v_hash and family_email = v_email
        and status = 'invited' and invite_expires_at > now())                 → return '{}'::jsonb
sinon                                                                          → REFUS
REFUS = jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'signup_requires_invitation'))
```
Droits (exacts) :
```sql
revoke all     on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant  execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
grant  usage   on schema public to supabase_auth_admin;
```
Aucune écriture. Aucune exception levée : toute erreur interne remonte comme erreur du hook, et Auth refuse l'inscription (fail-closed). Branchement : Dashboard → Authentication → Hooks → Before User Created → Postgres → `public.hook_before_user_created`. En local : `supabase/config.toml`
```toml
[auth.hook.before_user_created]
enabled = true
uri = "pg-functions://postgres/public/hook_before_user_created"
```

#### 3.3.3 `public.link_enrollments(p_pairs jsonb default '[]'::jsonb) returns jsonb` — core

`language plpgsql`, SD, SP. **Non exposée** : `revoke all … from public, anon, authenticated`, aucun grant. Appelée par Arnaud dans le SQL Editor (rôle postgres).

**Règle de sécurité (revue du 16/09)** : la liaison ne se fait **jamais** par simple égalité d'e-mail. Promouvoir en gérant PF ou en admin Seren tout compte qui *porte* une adresse enrôlée donnerait le rôle à un intrus qui se serait inscrit (ou aurait fait changer son adresse) avant Arnaud. L'appariement est donc **explicite** : `p_pairs` est un tableau d'objets `{"email": "…", "user_id": "<uuid copié depuis « Add user »>"}`.

Pour chaque paire (dans l'ordre), avec `v_email := lower(btrim(->>'email'))` et `v_uid := (->>'user_id')::uuid` :
1. Enrôlements de `v_email` : aucun → `raise 'enrollment_account_untrusted'` (précédé d'un `raise notice` nommant l'adresse).
2. **Idempotence** : si tous les enrôlements de `v_email` ont déjà `linked_user_id = v_uid`, la paire est un no-op (les contrôles 3-7 sont sautés, les `insert … on conflict` sont rejoués). C'est ce qui rend le rejeu de la partie 2 sûr après que le gérant s'est connecté.
3. `u := auth.users where id = v_uid` : introuvable, ou `lower(btrim(u.email)) <> v_email` → `raise 'enrollment_account_untrusted'`. (Le contrôle `u.id = p_user_id` du couple e-mail/UUID est ici : un UUID collé pour la mauvaise ligne est refusé.)
4. `u.created_at < e.created_at` (enrôlement le plus ancien de cette adresse) → `raise 'enrollment_account_untrusted'` : le compte existait **avant** l'enrôlement, il n'a pas été créé par Arnaud pour ce rôle.
5. `u.last_sign_in_at is not null` → `raise 'enrollment_account_untrusted'` : quelqu'un s'est déjà connecté à ce compte ; un compte « Add user » jamais utilisé a `last_sign_in_at` null, y compris lorsque son mot de passe a été posé à la création. **Conséquence de runbook** : exécuter la partie 2 *avant toute connexion* à ces comptes — donc avant le premier `scripts/provision-v2.mjs` (démo, probes) et, pour un gérant de PF réel, avant « Send password recovery » (§2.2-1).
6. `coalesce(u.email_change, '') <> ''` → `raise 'enrollment_account_untrusted'` : un changement d'adresse est en attente sur ce compte.
7. Dossier famille pour `v_uid` (`dossiers.user_id`) → `raise 'enrollment_conflict_family'`.
8. Liaison : `partner_manager` → `insert into public.partner_users (user_id, partner_id, role) values (…, 'manager') on conflict (user_id) do update set partner_id = excluded.partner_id, role = 'manager'` ; `seren_admin` → `insert into public.seren_admins (user_id) … on conflict do nothing` ; puis `linked_user_id = v_uid` et `linked_at = coalesce(linked_at, now())`.

La **garde `enrollment_conflict_family` reste évaluée avant toute écriture**, sur l'ensemble des enrôlements (pas seulement les paires), comme avant.

Retour : `{"partner_users_linked": int, "seren_admins_linked": int, "pending": int, "untrusted": int}` où :
- `pending` = enrôlements non liés dont **aucun** compte auth ne porte l'adresse ;
- `untrusted` = enrôlements non liés dont **un compte auth existe** et n'a pas été apparié : c'est un **signal d'alarme** (quelqu'un détient l'adresse), pas une attente. `untrusted > 0` = STOP, enquête avant d'ouvrir quoi que ce soit.

`p_pairs` vide (défaut) ne lie rien : l'appel devient un simple état des lieux (`pending` / `untrusted`).

#### 3.3.4 `public.invitation_preview(p_token_hash text) returns jsonb` — core

`language plpgsql`, SD, SP, `stable`. Grant : `anon, authenticated`.
- `p_token_hash !~ '^[0-9a-f]{64}$'` ou aucune ligne `invite_token_hash = p_token_hash` : `{"valid": false, "reason": "invalid"}`.
- Ligne trouvée, `status = 'invited'`, `invite_expires_at <= now()` : `{"valid": false, "reason": "expired", "partner_name": text|null}`.
- Ligne trouvée, `status = 'invited'`, non expirée :
```json
{"valid": true, "email": "famille@exemple.fr", "partner_name": "Pompes Funèbres Démo",
 "family_first_name": "Claire", "deceased_first_name": "Jean", "expires_at": "2026-09-22T15:00:00Z"}
```
`partner_name` vaut `partners.name`, ou `null` si `partner_id` est null. La RPC ne renvoie jamais nom de famille, téléphone, date de décès, snapshots ni identifiant de dossier. Le hash est effacé au claim et à l'annulation : un lien utilisé ou annulé répond `invalid` (pas d'oracle d'état).

#### 3.3.5 `public.claim_dossier(p_token_hash text) returns jsonb` — core (pont D4)

`language plpgsql`, SD, SP, volatile. Grant : `authenticated`. Ordre strict :
1. `v_uid is null` → `raise 'not_authenticated'`.
2. Compte interne (`partner_users` ou `seren_admins` pour `v_uid`) → `raise 'account_role_forbidden'`.
3. `p_token_hash !~ '^[0-9a-f]{64}$'` → `raise 'invalid_token'`.
4. `select * into v_d from public.dossiers where invite_token_hash = p_token_hash for update;`
5. **Non trouvé** : si un dossier `user_id = v_uid and status = 'active'` existe, `return {"claimed": false, "already_active": true, "dossier_id": <id>}` (idempotence d'un double clic ou d'un retry réseau) ; sinon `raise 'invalid_token'`.
6. `v_d.status <> 'invited'` → `raise 'invalid_token'`.
7. `v_d.invite_expires_at <= now()` → `raise 'invitation_expired'`.
8. `v_d.family_email <> v_email` (ou `v_email` null) → `raise 'email_mismatch'`.
9. Un autre dossier existe pour `v_uid` → `raise 'account_already_linked'`.
10. Mise à jour :
    ```sql
    update public.dossiers set status = 'active', user_id = v_uid, activated_at = now(),
           invite_token_hash = null, invite_expires_at = null, updated_at = now() where id = v_d.id;
    ```
11. Pont (même transaction) :
    ```sql
    insert into public.purchases (user_id, status, kind, stripe_session_id, included_sends, amount_total, currency, paid_at)
    values (v_uid, 'paid', 'forfait', 'partner_dossier:' || v_d.id::text, v_d.included_sends, null, null, now())
    on conflict (stripe_session_id) do nothing;
    ```
12. `return {"claimed": true, "already_active": false, "dossier_id": "<uuid>", "partner_name": text|null}`.

Le statut du partenaire n'est **pas** vérifié : une PF suspendue ne coupe jamais une famille invitée.

#### 3.3.6 `public.my_account() returns jsonb` — core

`language plpgsql`, SD, SP, `stable`. Grant : `authenticated`. `v_uid` null → `return null`.
```json
{
  "user_id": "uuid",
  "role": "partner | family | none",
  "is_admin": false,
  "partner": null | { "id": "uuid", "name": "text", "status": "prospect|active|suspended|terminated", "user_role": "manager|advisor" },
  "dossier": null | {
    "id": "uuid", "status": "active|closed", "source": "partner|direct|demo",
    "partner_name": "text|null", "deceased_first_name": "text|null",
    "activated_at": "timestamptz", "included_sends": 10
  },
  "consent": { "version": "2026-09-beta-1", "required": true, "accepted_at": null }
}
```
Règles :
- `role` suit l'ordre §2.3. `partner` est non null seulement si `role = 'partner'`, `dossier` seulement si `role = 'family'`.
- **Contrat terminé** (décision du 16/09, question de revue) : une ligne `partner_users` dont le partenaire est en `status = 'terminated'` **ne donne plus le rôle** — `role` retombe à `family` ou `none` selon l'ordre §2.3, et `partner` vaut `null`. L'ex-gérant perd donc l'accès à la liste de ses familles (identité, e-mail, téléphone, défunt) dès la résiliation. `'suspended'` **conserve la lecture** (liste, compteurs, `my_account`) : seules la création et le renvoi sont bloqués (`partner_inactive`, §3.3.9 étape 2) — une PF suspendue doit pouvoir continuer à suivre les familles déjà engagées, et aucune action PF ne coupe jamais une famille (§3.3.5).
- `consent.required = (role = 'family') and (select count(distinct kind) from public.consents where user_id = v_uid and version = public.consent_version() and kind in ('terms','privacy','sensitive_data')) < 3`.
- `consent.accepted_at` = `min(accepted_at)` des trois lignes à la version courante quand elles sont toutes présentes, sinon `null`.
- Jamais de snapshot prix ou commission, jamais `family_email`, jamais de hash.

#### 3.3.7 `public.record_consents(p_version text, p_kinds text[]) returns jsonb` — core

`language plpgsql`, SD, SP. Grant : `authenticated`.
1. `v_uid is null` → `raise 'not_authenticated'`.
2. Pas de dossier `user_id = v_uid and status = 'active'` → `raise 'dossier_not_active'`.
3. `p_version <> public.consent_version()` → `raise 'consent_version_mismatch'`.
4. `p_kinds` ne contient pas exactement l'ensemble `{terms, privacy, sensitive_data}` (ordre et doublons ignorés, aucune autre valeur) → `raise 'consent_incomplete'`.
5. Insertion des 3 lignes `(v_uid, dossier.id, kind, p_version)` avec `on conflict (user_id, kind, version) do nothing`.
6. `return {"recorded": <int lignes insérées>, "version": "2026-09-beta-1", "required": false}`.

#### 3.3.8 `public.has_active_dossier() returns boolean` — core

`language sql`, SD, SP, `stable`. Grant : `authenticated`. Corps : `select exists (select 1 from public.dossiers where user_id = auth.uid() and status = 'active')`. Aucun paramètre : pas d'oracle sur autrui. Prévue pour les policies L10 et utilisable par les probes.

#### 3.3.9 `public.partner_create_dossier(...) returns jsonb` — partner_rpc

```sql
public.partner_create_dossier(
  p_secret              text,
  p_family_first_name   text,
  p_family_last_name    text,
  p_family_email        text,
  p_family_phone        text,
  p_deceased_first_name text,
  p_deceased_last_name  text,
  p_deceased_death_date date,
  p_token_hash          text,
  p_confirm_duplicate   boolean default false
) returns jsonb
```
`language plpgsql`, SD, SP. Grant : `authenticated`. Ordre strict :

0. **Secret partagé, AVANT toute autre étape** (revue du 16/09, must-fix 1). Le jeton d'activation est choisi par l'appelant (`p_token_hash`) : si une PF pouvait appeler cette RPC en direct via PostgREST, elle choisirait un jeton qu'elle connaît, s'inscrirait à la place de la famille (hook satisfait : e-mail invité + hash valide, Confirm email décoché) et prendrait le compte. La RPC exige donc le secret partagé, que seul le serveur Express détient — même patron que `consume_send` (migration `20260914120000`), inliné, jamais encapsulé dans un helper :
   ```sql
   if not exists (select 1 from public.webhook_config w where w.id = 1 and w.rpc_secret = p_secret) then
     raise exception 'invalid_secret' using errcode = 'P0001';
   end if;
   ```
   Le secret n'identifie personne : `partner_id` vient toujours de `auth.uid()` (règle §3.1). Il ne fait qu'interdire le chemin direct.
1. `select partner_id, role into v_pid, v_role from public.partner_users where user_id = auth.uid()` ; non trouvé → `raise 'not_a_partner'`.
2. `partners.status <> 'active'` → `raise 'partner_inactive'`.
3. Normalisation : `btrim` sur tous les textes, `lower(btrim())` sur l'e-mail, téléphone vide → null. Validations, dans cet ordre :

   | Condition | Exception |
   |---|---|
   | prénom ou nom famille vide ou > 100 caractères | `invalid_family_name` |
   | e-mail hors motif du CHECK ou > 254 caractères | `invalid_email` |
   | téléphone non null hors motif | `invalid_phone` |
   | prénom ou nom défunt vide ou > 100 caractères | `invalid_deceased_name` |
   | date null, `> current_date` ou `< current_date - interval '2 years'` | `invalid_death_date` |
   | hash hors `^[0-9a-f]{64}$` | `invalid_token_hash` |

4. Plafond : `count(*) from dossiers where partner_id = v_pid and created_at > now() - interval '24 hours'` ≥ 50 → `raise 'partner_daily_limit'`.
5. E-mail indisponible → `raise 'email_unavailable'` (message générique, ne dit jamais pourquoi). Cas couverts :
   - dossier `family_email = v_email and status <> 'cancelled'` ;
   - ligne `account_enrollments.email = v_email` ;
   - compte auth avec cet e-mail présent dans `partner_users` ou `seren_admins`.
6. Doublon de défunt : si `not p_confirm_duplicate`, compter `v_dup` = dossiers `partner_id = v_pid and status <> 'cancelled' and lower(deceased_last_name) = lower(v_deceased_last) and deceased_death_date = p_deceased_death_date`. Si `v_dup > 0` → `return {"created": false, "duplicate_warning": true, "duplicate_count": v_dup}` sans insertion.
7. Insertion :
   ```sql
   insert … (source 'partner', status 'invited', snapshots copiés de partners, included_sends 10,
             invite_token_hash p_token_hash, invite_expires_at now() + interval '7 days',
             invite_issued_at now(), created_by auth.uid())
   ```
   Une `unique_violation` (course sur l'index e-mail ou sur le hash) → `raise 'email_unavailable'`.
8. Retour :
```json
{"created": true, "duplicate_warning": false, "partner_name": "text",
 "dossier": {"id": "uuid", "status": "invited", "created_at": "ts", "invite_expires_at": "ts",
             "family_first_name": "text", "family_last_name": "text", "family_email": "text",
             "deceased_first_name": "text", "deceased_last_name": "text", "deceased_death_date": "YYYY-MM-DD"}}
```

#### 3.3.10 `public.partner_rotate_invitation(p_secret text, p_dossier_id uuid, p_token_hash text) returns jsonb` — partner_rpc

SD, SP. Grant : `authenticated`. Ordre strict :
0. **Secret partagé** (`webhook_config` id 1), contrôlé **avant l'étape 1**, patron et motif identiques au §3.3.9 étape 0 → `invalid_secret`. Sans ce contrôle, une PF tuerait le lien d'une famille en direct (rotation silencieuse, aucun e-mail envoyé) et lui substituerait un jeton de son choix.
1. Partenaire introuvable → `not_a_partner`.
1bis. **`partners.status <> 'active'` → `partner_inactive`** (amendement du 16/09, revue L1/L1b C1 — voir §12.2). Même règle et même code qu'en création (§3.3.9 étape 2), parce que le §3.3.6 l'énonce déjà : `'suspended'` conserve la lecture, « seules la création **et le renvoi** sont bloqués », et `'terminated'` ne donne plus aucun rôle PF. Sans cette étape, une PF suspendue ou résiliée continuait à relire la PII famille et défunt du payload de retour, dossier par dossier, et à tuer les liens d'activation en attente : la révocation n'existait qu'à l'écran.
2. Hash invalide → `invalid_token_hash`.
3. `select … from dossiers where id = p_dossier_id and partner_id = v_pid for update` ; non trouvé → `dossier_not_found` (même réponse pour un dossier d'une autre PF).
4. `status <> 'invited'` → `dossier_not_invitable`.
5. `invite_issued_at > now() - interval '10 minutes'` → `rotation_too_soon`.
6. `invite_rotation_count >= 10` → `rotation_limit`.
7. Mise à jour : `invite_token_hash`, `invite_expires_at = now() + 7 days`, `invite_issued_at = now()`, `invite_rotation_count + 1`, `updated_at`. Une `unique_violation` sur le hash → `invalid_token_hash`.

Retour : `{"rotated": true, "partner_name": "text", "dossier": {…mêmes clés que 3.3.9…}}`. Une invitation expirée reste renvoyable.

#### 3.3.11 `public.partner_cancel_dossier(p_dossier_id uuid) returns jsonb` — partner_rpc

SD, SP. Grant : `authenticated`. Ordre strict :
1. `not_a_partner` — **la résolution du partenaire exclut `status = 'terminated'`** (amendement du 16/09, revue L1/L1b C1 — voir §12.2) : un contrat résilié ne donne plus aucun rôle PF (§3.3.6), donc plus aucune écriture sur un dossier de famille, exactement comme il ne donne plus la lecture (§3.3.12, §3.3.13). `'suspended'` conserve l'annulation, comme il conserve la lecture.
2. `for update` sur `id = p_dossier_id and partner_id = v_pid` ; non trouvé → `dossier_not_found`.
3. `status in ('active','closed')` → `dossier_already_active`.
4. `status = 'cancelled'` → `return {"cancelled": false, "already_cancelled": true, "dossier": {"id", "status", "cancelled_at"}}`.
5. `created_at <= now() - interval '48 hours'` → `cancel_window_elapsed`.
6. Mise à jour : `status = 'cancelled'`, `cancelled_at = now()`, `cancelled_by = auth.uid()`, `invite_token_hash = null`, `invite_expires_at = null`.

Retour : `{"cancelled": true, "already_cancelled": false, "dossier": {"id": "uuid", "status": "cancelled", "cancelled_at": "ts"}}`. Gérant et conseiller y ont droit.

#### 3.3.12 `public.partner_list_dossiers() returns jsonb` — partner_rpc

SD, SP, `stable`. Grant : `authenticated`. Pas de partenaire, **ou partenaire en `status = 'terminated'`** (décision du 16/09) → `return null`, que le serveur traduit en 403 `NOT_A_PARTNER`. `'suspended'` garde la lecture. Ne lit que `partners`, `partner_users` et `dossiers` : **aucune jointure vers questionnaires, roadmaps, steps, step_actions, documents, letter_sends, send_debits, attachments, sender_profiles, purchases, consents ni storage.**
```json
{
  "partner": {"id": "uuid", "name": "text", "status": "active", "user_role": "manager"},
  "dossiers": [{
    "id": "uuid", "status": "invited|active|closed|cancelled", "source": "partner|demo",
    "family_first_name": "text|null", "family_last_name": "text|null", "family_email": "text",
    "family_phone": "text|null", "deceased_first_name": "text|null", "deceased_last_name": "text|null",
    "deceased_death_date": "YYYY-MM-DD|null", "created_at": "ts", "activated_at": "ts|null",
    "cancelled_at": "ts|null", "invite_expires_at": "ts|null",
    "invite_expired": false, "can_resend": true, "can_cancel": true, "cancel_deadline": "ts"
  }]
}
```
- Tri `created_at desc`, `limit 500`.
- `invite_expired = status = 'invited' and invite_expires_at <= now()`.
- `can_resend = status = 'invited'`.
- `can_cancel = status = 'invited' and created_at > now() - 48 h`.
- `cancel_deadline = created_at + 48 h`.

#### 3.3.13 `public.partner_month_counters() returns jsonb` — partner_rpc

SD, SP, `stable`. Grant : `authenticated`. Pas de partenaire, **ou partenaire `terminated`** (même règle que §3.3.12) → `null` → 403 `NOT_A_PARTNER`. Mois courant en Europe/Paris : `v_start := date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'`.
```json
{
  "month": "2026-09",
  "created_this_month": 3,
  "created_total": 7,
  "activated_total": 4,
  "pending_activation": 2,
  "expired_invitations": 1,
  "cancelled_total": 1,
  "activated_this_month": 2,
  "billing_preview": null | {
    "billable_count": 2,
    "seren_due_ttc_cents": 44000,
    "unit_due_ttc_cents": 22000,
    "currency": "EUR"
  }
}
```
Définitions (tous les dossiers de `v_pid`, toutes sources, sauf mention) :

| Clé | Définition |
|---|---|
| `created_this_month` | `created_at >= v_start` |
| `created_total` | tous |
| `activated_total` | `activated_at is not null` (activés par la famille) |
| `pending_activation` | `status = 'invited' and invite_expires_at > now()` |
| `expired_invitations` | `status = 'invited' and invite_expires_at <= now()` |
| `cancelled_total` | `status = 'cancelled'` |
| `activated_this_month` | `activated_at >= v_start` |

`billing_preview` : non null seulement si `user_role = 'manager'`. `billable_count` = dossiers `source = 'partner' and activated_at >= v_start and status in ('active','closed')`. `seren_due_ttc_cents` = Σ(`price_ttc_cents − commission_ttc_cents`) de ces dossiers. `unit_due_ttc_cents` = `price − commission` du partenaire courant. Le serveur remet `billing_preview` à `null` si `PARTNER_BILLING_PREVIEW !== 'true'` (§5).

#### 3.3.14 `public.admin_partner_overview() returns jsonb` — v2_admin (L4c)

SD, SP, `stable`. Grant : `authenticated`. `auth.uid()` absent de `seren_admins` → `return null`.
```json
{
  "generated_at": "ts",
  "month": "2026-09",
  "partners": [{
    "partner_id": "uuid", "name": "text", "status": "active",
    "dossiers_total": 7, "dossiers_this_month": 3, "invited_pending": 2,
    "activated": 4, "cancelled": 1, "last_dossier_at": "ts|null"
  }]
}
```
- Tri `name asc`.
- `invited_pending` = `status = 'invited'` (expirés compris).
- `activated` = `activated_at is not null`.
- Mois en Europe/Paris, calculé comme 3.3.13.
- Aucune colonne famille, défunt ou e-mail ; aucune jointure vers le contenu ; ne lit ni `siret` ni `billing_email`.

#### 3.3.15 `public.get_transmission_by_code(p_code text) returns table (data text, created_at timestamptz)` — transmissions_f1 (L1b)

`language sql`, SD, SP, `stable`. Grant : `authenticated` (révoqué de `public, anon`). Corps :
```sql
select t.data, t.created_at from public.transmissions t
 where char_length(p_code) between 4 and 64 and t.access_code = upper(p_code) limit 1
```
Même fichier : `drop policy if exists "Authenticated users can read with access_code" on public.transmissions;`. Les 4 policies owner restent.

#### 3.3.16 `public.partner_dashboard()` v0

**Intouchée** : ni drop, ni `create or replace`, ni changement de grant. Plus appelée par le front v2 (L4). Elle garantit que Render « Rollback » vers le deploy de U1 reste fonctionnel après U2.

### 3.4 Récapitulatif des droits

| Fonction | SD | SP | Grant execute | Appelant |
|---|---|---|---|---|
| `consent_version()` | non (invoker, immutable) | `''` | authenticated | fonctions SQL, probes |
| `hook_before_user_created(jsonb)` | oui (owner postgres) | `''` | **supabase_auth_admin seul** | Supabase Auth |
| `link_enrollments(jsonb)` | oui | `''` | **aucun** | SQL Editor (Arnaud), paires e-mail ↔ UUID |
| `invitation_preview(text)` | oui | `''` | anon, authenticated | `POST /api/activation/check` (client public) |
| `claim_dossier(text)` | oui | `''` | authenticated | `POST /api/activation/claim` (token utilisateur) |
| `my_account()` | oui | `''` | authenticated | `/api/me`, `requireActiveDossier` |
| `record_consents(text, text[])` | oui | `''` | authenticated | front `/bienvenue` (`supabase.rpc`) |
| `has_active_dossier()` | oui | `''` | authenticated | probes, L10 futur |
| `partner_create_dossier(text,text,text,text,text,text,text,date,text,boolean)` | oui | `''` | authenticated **+ secret** | `POST /api/partner/dossiers` **seulement** |
| `partner_rotate_invitation(text, uuid, text)` | oui | `''` | authenticated **+ secret** | `POST /api/partner/dossiers/:id/resend` **seulement** |
| `partner_cancel_dossier(uuid)` | oui | `''` | authenticated | `POST /api/partner/dossiers/:id/cancel` |
| `partner_list_dossiers()` | oui | `''` | authenticated | `GET /api/partner/dossiers` |
| `partner_month_counters()` | oui | `''` | authenticated | `GET /api/partner/counters` |
| `admin_partner_overview()` | oui | `''` | authenticated | `GET /api/admin/overview` |
| `get_transmission_by_code(text)` | oui | `''` | authenticated | `GET /api/transmission/:code` |

Chaque fonction : `revoke all on function <signature complète> from public, anon, authenticated;` avant les grants. Les RPC admin, claim, liste, compteurs et annulation sont appelables en direct via PostgREST avec la clé publishable. **C'est assumé** : toute leur sécurité est dans le SQL (`auth.uid()`, jeton, rôle), jamais dans Express. Les kill switches Express (`PARTNER_ACTIVATIONS_ENABLED`) sont des interrupteurs d'exploitation, pas des barrières de sécurité.

**Exception : `partner_create_dossier` et `partner_rotate_invitation`** (revue du 16/09). Ce sont les deux seules RPC où l'appelant **choisit un secret d'authentification** (le hash du jeton d'activation) ; un appel direct permettrait à une PF de fabriquer un jeton qu'elle connaît, donc de prendre le compte de la famille. Elles gardent `grant execute … to authenticated` (le serveur les appelle avec le **token utilisateur**, comme toutes les autres), mais **ne sont plus utilisables en direct** : sans `p_secret` valide (`webhook_config` id 1, détenu par Express via `WEBHOOK_RPC_SECRET`), elles lèvent `invalid_secret` avant toute lecture. La création et le renvoi passent donc **obligatoirement** par `POST /api/partner/dossiers` et `POST /api/partner/dossiers/:id/resend`, qui restent soumis au kill switch, au limiteur 30/h et 20/h par utilisateur et à l'envoi Resend.

### 3.5 Codes d'exception SQL (message exact)

`not_authenticated`, `account_role_forbidden`, `invalid_token`, `invitation_expired`, `email_mismatch`, `account_already_linked`, `dossier_not_active`, `consent_version_mismatch`, `consent_incomplete`, `not_a_partner`, `partner_inactive`, `invalid_family_name`, `invalid_email`, `invalid_phone`, `invalid_deceased_name`, `invalid_death_date`, `invalid_token_hash`, `partner_daily_limit`, `email_unavailable`, `dossier_not_found`, `dossier_not_invitable`, `rotation_too_soon`, `rotation_limit`, `dossier_already_active`, `cancel_window_elapsed`, `enrollment_conflict_family`, **`invalid_secret`** (§3.3.9/§3.3.10, secret `webhook_config` absent ou faux — jamais renvoyé tel quel au client : 500 `PARTNER_ERROR`), **`enrollment_account_untrusted`** (§3.3.3, compte non fiable pour un enrôlement).

---
## 4. Contrat API (Express)

Conventions reprises du repo :
- réponse `{ success: boolean, error?: string, code?: string, … }` ;
- `error` = `msg(lang, key)` (`server/lib/messages.js`), avec `lang` pris du corps ou de la query (`'en'`, sinon `'fr'`) ;
- `code` = constante MAJUSCULE stable, lue par le front ;
- 500 toujours accompagné de `Sentry.captureException` ;
- jamais de `console.*` du corps de requête.

### 4.1 Middlewares partagés

**`requireAuth`** : inchangé (`server/server.js`).

**`server/lib/require-active-dossier.js`** (L2a) :
```js
export function createRequireActiveDossier({ loadAccount = (client) => client.rpc('my_account') } = {})
// → async function requireActiveDossier(req, res, next)
```
- À monter **après** `requireAuth` ; lit avec `req.supabaseClient`.
- Erreur de lecture (`error` ou exception) → **500** `{ code: 'ACCOUNT_ERROR', error: msg(lang,'account_error') }` + Sentry. **Jamais `next()` sur erreur.**
- `data == null`, `data.role !== 'family'` ou `data.dossier?.status !== 'active'` → **403** `{ code: 'DOSSIER_NOT_ACTIVE', error: msg(lang,'dossier_not_active') }`.
- `data.consent.required === true` → **403** `{ code: 'CONSENT_REQUIRED', error: msg(lang,'consent_required') }`.
- Sinon `req.account = data; next()`.

**`FAIL_CLOSED_GATE`** (A5, exporté par le même fichier) : `(req,res) => res.status(500).json({ success:false, code:'GATE_NOT_CONFIGURED', error: msg(lang,'send_error') })`. C'est le défaut du paramètre `requireActiveDossier` de `createQuestionnaireRouter`, `createLettersRouter`, `createAttachmentsRouter` et `createPaymentsRouter`. Les tests passent `requireActiveDossier: (req,res,next)=>next()` explicitement.

**`server/lib/flags.js`** (stub L0bis, propriété L2a) :
```js
export const FLAG_NAMES = ['FEATURE_LLM','EMAIL_SENDS_ENABLED','EXTRA_SENDS_ENABLED','PAPER_SENDS_ENABLED',
  'PARTNER_ACTIVATIONS_ENABLED','SHOW_ACTIVATION_LINK','PARTNER_BILLING_PREVIEW']
export function flagOn(name) { return process.env[name] === 'true' }      // relu à CHAQUE appel
export function publicFlags() { return {
  llm_enabled: flagOn('FEATURE_LLM'),
  email_sends_enabled: flagOn('EMAIL_SENDS_ENABLED'),
  extra_sends_enabled: flagOn('EXTRA_SENDS_ENABLED'),
  paper_sends_enabled: flagOn('PAPER_SENDS_ENABLED'),
  partner_activations_enabled: flagOn('PARTNER_ACTIVATIONS_ENABLED'),
  partner_billing_preview: flagOn('PARTNER_BILLING_PREVIEW') } }         // SHOW_ACTIVATION_LINK jamais exposé
export function killSwitch(name, { code, messageKey }) // → middleware 503 { code, error } si !flagOn(name)
```

**`createIpRateLimiter({ max, windowMs, message })`** : ajouté par L2b dans `server/lib/rate-limit.js`, avec la clé `req.ip`. `server.js` pose `app.set('trust proxy', 1)` (L2a) : Render est derrière un proxy.

### 4.2 Montage dans `server/server.js` (L2a) et ordre des gardes

| Préfixe | Router (fichier) | Gate dossier | Notes |
|---|---|---|---|
| `/api/me` | `createMeRouter({ requireAuth })` — `server/routes/me.js` (L2a) | **non** | |
| `/api/questionnaire` | `createQuestionnaireRouter({ requireAuth, requireActiveDossier, mistral, model })` | oui, toutes routes | `mistral = flagOn('FEATURE_LLM') && MISTRAL_API_KEY ? new Mistral(...) : null` **au démarrage** ; le client n'est pas instancié sinon ; log « rédacteur : statique » |
| `/api/payments` | `createPaymentsRouter({ requireAuth, requireActiveDossier, … })` sans `priceId` ni `includedSends` forfait | `checkout-extra-send` seulement | webhook non gaté |
| `/api/letters` | `createLettersRouter({ requireAuth, requireActiveDossier, …, extraSendAvailable: () => flagOn('EXTRA_SENDS_ENABLED') && !!stripeClient && !!STRIPE_PRICE_ID_EXTRA_SEND })` | `/send`, `/quota`, `/organisations`, `GET /` | `/webhook` non gaté |
| `/api/letters/provider-webhook` | inchangé | **non** | |
| `/api/attachments` | `createAttachmentsRouter({ requireAuth, requireActiveDossier })` | oui, toutes routes | |
| `/api/partner` | `createPartnerRouter(...)` — `server/routes/partner.js` (L2b) | **non** (comptes PF) | montage à l'ancre `// v2:mount-partner` |
| `/api/activation` | `createActivationRouter(...)` — `server/routes/activation.js` (L2b) | **non** | ancre `// v2:mount-activation` |
| `/api/admin` | `createAdminRouter({ requireAuth })` — `server/routes/admin.js` (L4c) | **non** | ancre `// v2:mount-admin` |
| `/api/user/transmission`, `/api/transmission/:code` | `createTransmissionRouter({ requireAuth })` — `server/routes/transmission.js` (L2a, extrait de server.js) | **non** (produit gelé) | `:code` via RPC F1 |
| `/api/health` | inchangé | non | |

Les montages raw-body des 3 webhooks restent **avant** `express.json()` (inchangé).

Ordre des middlewares **par route** (contrat testé) :
- `POST /api/letters/send` : `requireAuth → requireActiveDossier → channelKillSwitch → sendLimiter → handler`. `requireActiveDossier` occupe exactement l'ancien slot `requirePurchase`. `channelKillSwitch` remplace `paperKillSwitch` : pour `channels[template_id] === 'papier'` il exige `PAPER_SENDS_ENABLED`, sinon 503 `PAPER_DISABLED` (inchangé) ; pour `'email'` il exige `EMAIL_SENDS_ENABLED`, sinon 503 `EMAIL_SENDS_DISABLED` ; un autre canal ou un modèle inconnu passe (tranché dans le handler). Gardes 3 à 10 de la branche papier **inchangées**. Un refus 403, 503 ou 500 du gate ou du kill switch ne consomme jamais le quota horaire.
- `GET /api/letters/quota`, `GET /api/letters/organisations`, `GET /api/letters/` : `requireAuth → requireActiveDossier → handler`.
- `POST /api/questionnaire/start` : `requireAuth → requireActiveDossier → startLimiter → handler`. `/resume` : `requireAuth → requireActiveDossier → resumeLimiter → handler`. `/answer`, `/reask`, `/complete` : `requireAuth → requireActiveDossier → handler`.
- `POST /api/attachments` : `requireAuth → requireActiveDossier → attachmentsKillSwitch → uploadLimiter → handleUpload → handler`. `attachmentsKillSwitch` : `PAPER_SENDS_ENABLED !== 'true'` → 503 `ATTACHMENTS_DISABLED`, avant multer, donc aucun fichier bufferisé. `GET /api/attachments` et `DELETE /api/attachments/:id` : `requireAuth → requireActiveDossier → handler` (lister et supprimer restent possibles flag fermé).
- `POST /api/payments/checkout` : **toujours 503** `{ code:'PAYMENTS_DISABLED', error: msg(lang,'payments_disabled') }` (forfait famille abandonné ; `requireAuth` conservé).
- `POST /api/payments/checkout-extra-send` : `requireAuth → requireActiveDossier → checkoutLimiter → handler`. Vente ouverte ssi `flagOn('EXTRA_SENDS_ENABLED') && stripe && extraPriceId`, sinon 503 `PAYMENTS_DISABLED`. **La garde 403 `FORFAIT_REQUIRED` est supprimée** (le gate dossier la remplace).
- `GET /api/payments/status` : `requireAuth → handler`, réponse inchangée avec `payments_enabled: false`.
- `POST /api/payments/webhook`, `POST /api/letters/webhook`, `POST /api/letters/provider-webhook/:secret` : **aucun** `requireAuth` ni gate.
- Le 402 `QUOTA_EXHAUSTED` de `/send` porte `extra_send_available: extraSendAvailable()` (donc `false` en bêta) et `support_email: process.env.SUPPORT_EMAIL || 'support@seren-app.fr'`.

`server/server.js` ne lit plus `PAYMENTS_ENABLED`, `STRIPE_PRICE_ID` ni `FORFAIT_INCLUDED_SENDS`, et n'importe plus `createRequirePurchase`. Le fichier et ses tests restent en code mort jusqu'au nettoyage post-bêta.

### 4.3 `GET /api/me` (L2a)

Middlewares : `requireAuth`. Pas de gate. Handler : `req.supabaseClient.rpc('my_account')`. Réponse **200** :
```json
{
  "success": true,
  "account": { …forme exacte de my_account() §3.3.6… },
  "quota": null | { "balance": 10, "included_total": 10 },
  "flags": { "llm_enabled": false, "email_sends_enabled": false, "extra_sends_enabled": false,
             "paper_sends_enabled": true, "partner_activations_enabled": true, "partner_billing_preview": true },
  "support_email": "support@seren-app.fr"
}
```
- `quota` n'est calculé que si `account.role === 'family' && account.dossier?.status === 'active'`. Calcul identique à `GET /api/letters/quota` : Σ `included_sends` des purchases `paid` − débits `included|extra`, plancher 0. Sinon `null`.
- `account` null (RPC renvoie null) → 200 avec `account: null`, `quota: null`.
- Erreurs : 401 (requireAuth) ; **500** `{ code:'ACCOUNT_ERROR', error: msg(lang,'account_error') }`.

### 4.4 Routes partenaire — `server/routes/partner.js` (L2b)

```js
export function createPartnerRouter({ requireAuth, invitationSender, appUrl, supportEmail, rpcSecret,
                                      generateInviteToken, hashInviteToken })
```
Tous les appels RPC se font avec `req.supabaseClient`. Les erreurs RPC sont mappées par `error.message` (§3.5) ; tout code inconnu → 500 `PARTNER_ERROR`.

**`rpcSecret`** (revue du 16/09) : `process.env.WEBHOOK_RPC_SECRET`, passé au montage (§4.2). C'est la seule clé que le serveur ajoute aux RPC `partner_create_dossier` et `partner_rotate_invitation` (`p_secret`, 1ᵉʳ argument, §3.3.9/§3.3.10). Règles :
- **absent ou vide** → `POST /dossiers` et `POST /dossiers/:id/resend` répondent **500 `PARTNER_ERROR`** *sans appeler la base* (fail-closed : mieux vaut une création impossible qu'une création contournable) ; un `Sentry.captureException(new Error('partner_rpc_secret_missing'))` est émis au premier appel ;
- code SQL `invalid_secret` (serveur et base désaccordés) → **500 `PARTNER_ERROR`**, jamais renvoyé au client, avec Sentry. Il n'est **pas** dans la table de mapping `RPC_ERRORS` : il tombe dans la branche « code inconnu » ;
- le secret n'est **jamais** journalisé, jamais envoyé à Sentry, jamais renvoyé dans une réponse (même règle que le jeton, §4.8). Les autres routes (`GET /dossiers`, `/counters`, `cancel`) n'en reçoivent pas.

| Méthode, chemin | Middlewares (ordre) | Corps / params | Succès | Erreurs |
|---|---|---|---|---|
| `GET /api/partner/dossiers` | `requireAuth` | — | 200 `{ success, partner, dossiers }` (§3.3.12) | RPC null → 403 `NOT_A_PARTNER` ; 500 `PARTNER_ERROR` |
| `POST /api/partner/dossiers` | `requireAuth → killSwitch('PARTNER_ACTIVATIONS_ENABLED', 503 PARTNER_ACTIVATIONS_DISABLED) → requireRpcSecret (500 si absent) → createLimiter (30/h/user)` | `{ family_first_name, family_last_name, family_email, family_phone?, deceased_first_name, deceased_last_name, deceased_death_date: 'YYYY-MM-DD', confirm_duplicate?: boolean, lang?: 'fr'\|'en' }` | 201 `{ success, dossier, partner_name, email_sent: boolean, activation_url?: string }` | 409 `DUPLICATE_DECEASED` (+ `duplicate_count`) ; 403 `NOT_A_PARTNER` / `PARTNER_INACTIVE` ; 409 `EMAIL_UNAVAILABLE` ; 400 `INVALID_INPUT` (+ `field`: `family_name`\|`email`\|`phone`\|`deceased_name`\|`death_date`) ; 429 `PARTNER_DAILY_LIMIT` ; 429 limiteur ; 500 `PARTNER_ERROR` |
| `POST /api/partner/dossiers/:id/resend` | `requireAuth → killSwitch(PARTNER_ACTIVATIONS_ENABLED) → requireRpcSecret (500 si absent) → resendLimiter (20/h/user)` | `:id` UUID (sinon 404 sans appel base), `{ lang? }` | 200 `{ success, dossier, partner_name, email_sent, activation_url? }` | 404 `DOSSIER_NOT_FOUND` ; 409 `DOSSIER_NOT_INVITABLE` ; 429 `ROTATION_TOO_SOON` / `ROTATION_LIMIT` ; 403 `NOT_A_PARTNER` / `PARTNER_INACTIVE` (§3.3.10 étape 1bis) ; 500 |
| `POST /api/partner/dossiers/:id/cancel` | `requireAuth` | `:id` UUID | 200 `{ success, dossier, already_cancelled }` | 404 `DOSSIER_NOT_FOUND` ; 409 `DOSSIER_ALREADY_ACTIVE` / `CANCEL_WINDOW_ELAPSED` ; 403 `NOT_A_PARTNER` ; 500 |
| `GET /api/partner/counters` | `requireAuth` | — | 200 `{ success, counters }` (§3.3.13 ; `billing_preview` forcé à `null` si `!flagOn('PARTNER_BILLING_PREVIEW')`) | 403 `NOT_A_PARTNER` ; 500 |

Création et renvoi, dans l'ordre :
0. `rpcSecret` présent et non vide, sinon 500 `PARTNER_ERROR` sans appel base (ci-dessus) ;
1. `token = generateInviteToken()` ;
2. `hash = hashInviteToken(token)` ;
3. RPC, avec `p_secret: rpcSecret` en 1ᵉʳ argument ;
4. `invitationSender.send({ to: dossier.family_email, lang, partnerName, familyFirstName, activationUrl: `${appUrl}/activation#t=${token}`, expiresAt, supportEmail })`, dans un `try/catch` : un échec donne `email_sent:false` + Sentry, **sans jamais inclure token, URL ni e-mail** dans le message ou le contexte ;
5. `activation_url` n'est présent dans la réponse que si `flagOn('SHOW_ACTIVATION_LINK')` ;
6. la variable `token` n'est jamais loggée, jamais passée à Sentry.

L'invitation **ne dépend pas** d'`EMAIL_SENDS_ENABLED`. Sans `RESEND_API_KEY` ou `RESEND_FROM`, le sender lève `email_not_configured` → `email_sent:false`, et le dossier est quand même créé.

**`server/lib/invitation-email.js`** (L2b) : `createInvitationSender({ resendClient, from })` → `{ send(opts) → { providerRef } }`. Gabarits FR et EN en texte brut, avec :
- la PF émettrice ;
- la finalité (« votre pompe funèbre vous ouvre un accompagnement Seren pour les démarches après le décès ») ;
- les données reçues de la PF (identité et coordonnées de la famille, prénom, nom et date de décès du défunt) et la base (exécution du service proposé par la PF) ;
- la durée de validité du lien (7 jours) ;
- les droits (accès, rectification, effacement, opposition) et le contact `supportEmail` ;
- un lien vers `APP_URL/security`.

L'e-mail ne contient ni le nom ni la date de décès du défunt, ni PJ. Sujet FR : `« {partnerName} vous ouvre votre accompagnement Seren »`.

**`server/lib/invite-token.js`** (L2b) : `generateInviteToken() → string` (base64url de `crypto.randomBytes(32)`, 43 caractères) ; `hashInviteToken(token) → string` (hex sha256 des octets UTF-8 de la chaîne) ; `isInviteToken(s)` ; `isTokenHash(s)`.

### 4.5 Routes d'activation — `server/routes/activation.js` (L2b)

```js
export function createActivationRouter({ requireAuth, publicClient, supportEmail })
```

| Méthode, chemin | Middlewares (ordre) | Corps | Succès | Erreurs |
|---|---|---|---|---|
| `POST /api/activation/check` | `killSwitch(PARTNER_ACTIVATIONS_ENABLED, 503 PARTNER_ACTIVATIONS_DISABLED) → ipLimiter (30 / 10 min / IP)` — **public** | `{ token_hash, lang? }` | 200 `{ success, invitation: { email, partner_name, family_first_name, deceased_first_name, expires_at }, support_email }` | 400 `INVALID_TOKEN` (hash hors motif, sans appel base) ; 404 `INVITATION_INVALID` ; 410 `INVITATION_EXPIRED` (+ `partner_name`, `support_email`) ; 429 ; 500 `ACTIVATION_ERROR` |
| `POST /api/activation/claim` | `requireAuth → killSwitch(PARTNER_ACTIVATIONS_ENABLED)` | `{ token_hash, lang? }` | 200 `{ success, claimed, already_active, dossier_id, partner_name? }` | 400 `INVALID_TOKEN` ; 404 `INVITATION_INVALID` (`invalid_token`) ; 410 `INVITATION_EXPIRED` ; 403 `EMAIL_MISMATCH` / `ACCOUNT_ROLE_FORBIDDEN` ; 409 `ACCOUNT_ALREADY_LINKED` ; 500 `ACTIVATION_ERROR` |

`check` appelle `invitation_preview` avec `publicClient` (clé publishable, rôle anon). `claim` appelle `claim_dossier` avec `req.supabaseClient`. Le corps n'est jamais loggé.

### 4.6 Routes admin — `server/routes/admin.js` (L4c)

| Méthode, chemin | Middlewares | Succès | Erreurs |
|---|---|---|---|
| `GET /api/admin/overview` | `requireAuth` | 200 `{ success, overview }` (§3.3.14) | RPC null → 403 `NOT_ADMIN` ; 500 `ADMIN_ERROR` |

### 4.7 Route transmission (L2a, correctif F1)

`GET /api/transmission/:code` : `requireAuth → handler` → `req.supabaseClient.rpc('get_transmission_by_code', { p_code: code })`. Aucune ligne → 404 `{ success:false, error:'Code invalide ou données non trouvées' }` (texte actuel conservé, produit gelé). Sinon 200 `{ success:true, data: JSON.parse(row.data), created_at: row.created_at }` (forme actuelle). `GET /api/user/transmission` : inchangé.

### 4.8 Sentry serveur et journaux (L2a)

`Sentry.init({ …, beforeSend(event) })` :
- si `event.request?.url` contient `/api/activation/` ou `/api/partner/dossiers`, supprimer `event.request.data`, `event.request.query_string`, `event.request.cookies` et l'en-tête `authorization` ;
- sur tout événement, remplacer toute sous-chaîne `#t=[A-Za-z0-9_-]+` par `#t=[scrubbed]` dans `message`, `exception.values[].value` et `request.url` ;
- remplacer les valeurs des clés `token_hash`, `invite_token_hash`, `activation_url` par `[scrubbed]`.

Un test espion vérifie qu'aucun `console.*` n'émet le jeton, le hash ou l'URL d'activation dans les routes partner et activation.

### 4.9 Clés de messages (`server/lib/messages.js`, FR puis EN)

Blocs délimités par ancres (§8.3). Textes EN = traduction fidèle.

| Clé | FR | EN | Lot |
|---|---|---|---|
| `account_error` | Erreur lors de la lecture de votre compte | Error while reading your account | L2a |
| `dossier_not_active` | Votre accès Seren n'est pas encore activé. Contactez votre pompe funèbre ou le support. | Your Seren access is not activated yet. Contact your funeral home or support. | L2a |
| `consent_required` | Merci de valider les conditions d'utilisation avant de continuer | Please accept the terms of use before continuing | L2a |
| `email_sends_disabled` | L'envoi par e-mail n'est pas encore disponible : téléchargez le courrier pour l'envoyer vous-même | Email sending is not available yet: download the letter to send it yourself | L2a |
| `attachments_disabled` | Le dépôt de documents n'est pas encore disponible | Document upload is not available yet | L2a |
| `quota_exhausted` (**réécrite**) | Vous avez utilisé les envois inclus dans votre accompagnement. Contactez le support pour tout envoi supplémentaire. | You have used the sends included in your support plan. Contact support for any additional send. | L2a |
| `partner_error` | Erreur dans l'espace partenaire | Partner area error | L2b |
| `not_a_partner` | Ce compte n'est pas rattaché à une pompe funèbre partenaire | This account is not linked to a partner funeral home | L2b |
| `partner_inactive` | Votre espace partenaire est suspendu : contactez Seren | Your partner area is suspended: contact Seren | L2b |
| `partner_activations_disabled` | La création de dossiers est momentanément fermée | Case creation is temporarily closed | L2b |
| `duplicate_deceased` | Un dossier existe déjà pour ce défunt à cette date. Confirmez pour en créer un autre. | A case already exists for this deceased person on this date. Confirm to create another one. | L2b |
| `email_unavailable` | Cette adresse e-mail ne peut pas être utilisée pour un nouveau dossier | This email address cannot be used for a new case | L2b |
| `invalid_input` | Informations incomplètes ou invalides | Missing or invalid information | L2b |
| `partner_daily_limit` | Trop de dossiers créés sur les dernières 24 heures | Too many cases created in the last 24 hours | L2b |
| `dossier_not_found` | Dossier introuvable | Case not found | L2b |
| `dossier_not_invitable` | Ce dossier n'attend plus d'activation | This case is no longer awaiting activation | L2b |
| `rotation_too_soon` | Une invitation vient d'être envoyée, réessayez dans quelques minutes | An invitation was just sent, try again in a few minutes | L2b |
| `rotation_limit` | Nombre maximal de renvois atteint pour ce dossier : contactez Seren | Maximum number of resends reached for this case: contact Seren | L2b |
| `dossier_already_active` | La famille a déjà activé son accès : l'annulation n'est plus possible, contactez Seren | The family has already activated their access: cancellation is no longer possible, contact Seren | L2b |
| `cancel_window_elapsed` | Le délai d'annulation de 48 heures est dépassé | The 48-hour cancellation window has passed | L2b |
| `activation_error` | Erreur lors de l'activation de votre accès | Error while activating your access | L2b |
| `invalid_token` | Lien d'activation invalide | Invalid activation link | L2b |
| `invitation_invalid` | Ce lien n'est plus valide ou a déjà été utilisé | This link is no longer valid or has already been used | L2b |
| `invitation_expired` | Ce lien a expiré : demandez un nouveau lien à votre pompe funèbre | This link has expired: ask your funeral home for a new one | L2b |
| `email_mismatch` | Ce lien correspond à une autre adresse e-mail | This link belongs to another email address | L2b |
| `account_role_forbidden` | Ce compte ne peut pas activer un dossier famille | This account cannot activate a family case | L2b |
| `account_already_linked` | Ce compte est déjà rattaché à un dossier | This account is already linked to a case | L2b |
| `not_admin` | Accès réservé à l'équipe Seren | Seren team only | L4c |
| `admin_error` | Erreur dans l'espace d'administration | Admin area error | L4c |

`purchase_required` et `forfait_required` restent dans le fichier (code mort), sans usage.

---
## 5. Flags

**Règle unique : seule la valeur exacte `'true'` ouvre.** Absente, vide, `TRUE`, `1` ou `yes` → fermé. Lecture par `flagOn(name)` à **chaque requête** : ouvrir ou fermer = changer la variable Render, qui redémarre le service, sans rebuild. **Exception :** `FEATURE_LLM` est lue une seule fois au démarrage (le client Mistral est instancié ou non).

| Flag | Ce qu'il ouvre (`'true'`) | Fermé → comportement | Défaut | Préprod | Prod bêta |
|---|---|---|---|---|---|
| `FEATURE_LLM` | Rédacteur Mistral du questionnaire (requiert aussi `MISTRAL_API_KEY`) | Textes statiques du catalogue ; client Mistral non instancié ; aucune donnée ne sort | fermé | **absent** | **absent** |
| `EMAIL_SENDS_ENABLED` | Canal e-mail aux organismes (`POST /api/letters/send`, canal `email`) | 503 `EMAIL_SENDS_DISABLED` avant le limiteur ; front : PDF seul | fermé | **absent** | **absent** |
| `EXTRA_SENDS_ENABLED` | Mini-paiement « envoi supplémentaire » (`checkout-extra-send`, `extra_send_available`) | 503 `PAYMENTS_DISABLED` ; 402 sans CTA d'achat | fermé | **absent** | **absent** |
| `PAPER_SENDS_ENABLED` | Canal papier (MySendingBox) **et** dépôt de PJ (`POST /api/attachments`) | 503 `PAPER_DISABLED` / `ATTACHMENTS_DISABLED` ; front : PDF seul | fermé | `true` (clé TEST) | `true` **en dernier geste de U4**, clé LIVE, si les prérequis D3 sont réunis ; sinon absent |
| `PARTNER_ACTIVATIONS_ENABLED` | Création et renvoi d'invitations, `check` et `claim` d'activation | 503 `PARTNER_ACTIVATIONS_DISABLED` ; liste, annulation et compteurs restent disponibles | fermé | `true` | `true` après les conditions D8 (sinon absent : gérants seulement) |
| `SHOW_ACTIVATION_LINK` | `activation_url` dans les réponses de création et de renvoi (lien copiable, secours démo) | champ absent de la réponse | fermé | `true` | **absent** (jamais en prod : une PF qui détient le jeton peut prendre le compte) |
| `PARTNER_BILLING_PREVIEW` | `billing_preview` dans `GET /api/partner/counters` et bloc L4b | `billing_preview: null`, bloc masqué | fermé | `true` | **absent** |

**Variables devenues obsolètes** (plus lues par `server.js` après L2a ; à retirer de Render préprod et prod) : `PAYMENTS_ENABLED`, `STRIPE_PRICE_ID`, `FORFAIT_INCLUDED_SENDS`. Le quota vient désormais du snapshot `dossiers.included_sends` via le pont.

**Nouvelles variables non-flag :**
- `SUPPORT_EMAIL`, adresse de contact affichée (défaut `support@seren-app.fr`, cf. hypothèse H9) ;
- `WEBHOOK_RPC_SECRET` — **déjà requise** par les RPC à secret du chantier 2a ; depuis la revue du 16/09 elle est **aussi** requise par `POST /api/partner/dossiers` et `/:id/resend` (§3.4, §4.4). Elle doit valoir exactement `webhook_config.rpc_secret` (ligne `id = 1`) de la base visée : un désaccord ferme la création de dossiers (500), sans rien exposer.

## 6. Jeton d'activation

| Propriété | Contrat |
|---|---|
| Génération | Serveur uniquement : `crypto.randomBytes(32)` → `Buffer.toString('base64url')`. 43 caractères, motif `^[A-Za-z0-9_-]{43}$`. 256 bits d'entropie. |
| Hash | `sha256` sur les **octets UTF-8 de la chaîne base64url** (pas sur les 32 octets bruts), hexadécimal minuscule, 64 caractères, motif `^[0-9a-f]{64}$`. Node : `crypto.createHash('sha256').update(token, 'utf8').digest('hex')`. WebCrypto : `crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))`, puis octets → hex. |
| Vecteur de test partagé | `tests/fixtures/invite-token-vector.json` (stub L0bis), testé par `tests/invite-token.test.ts` (L2b, Node) et `tests/activation-token.test.ts` (L3, WebCrypto de Node 22). |
| Transport | Présent **uniquement** dans l'e-mail (`${APP_URL}/activation#t=<token>`) et, si `SHOW_ACTIVATION_LINK`, dans `activation_url` de la réponse PF. **Le fragment n'est jamais envoyé au serveur par le navigateur.** Toutes les requêtes API ne portent que le hash. |
| Stockage | Base : `dossiers.invite_token_hash` seulement. Auth : `user_metadata.invite_token_hash` posé par `signUp`, effacé côté front par `updateUser({ data: { invite_token_hash: null } })` après le claim (best effort, le hash est déjà mort). Front : variable de module en mémoire, **jamais** `localStorage`, `sessionStorage` ni cookie. |
| Expiration | `now() + 7 days` à la création et à chaque renvoi. Vérifiée par le hook, `invitation_preview` et `claim_dossier`. |
| Usage unique | `claim_dossier` et `partner_cancel_dossier` mettent `invite_token_hash = null`. Un renvoi remplace le hash, et l'ancien lien meurt. |
| Front — capture | `src/lib/activation-fragment.ts` (L3) : `captureActivationFragment(): void`, **première instruction du corps de `src/main.tsx`**, avant `initSentry()` et `initPosthog()`. Si `location.hash` commence par `#t=` : mémoriser la valeur si elle respecte le motif, puis **toujours** `history.replaceState(history.state, '', location.pathname + location.search)`. Autres exports : `getActivationToken(): string \| null` (lecture non destructive, compatible StrictMode) et `clearActivationToken(): void`. |
| Front — Sentry | `src/lib/sentry.ts` (L3) : `beforeSend` et `beforeBreadcrumb` remplacent `#t=[A-Za-z0-9_-]+` par `#t=[scrubbed]` dans `request.url`, `breadcrumb.data.url`, `breadcrumb.data.to`, `breadcrumb.data.from` et `message`. |
| Serveur — Sentry et journaux | §4.8. Jamais de `console.*` de `req.body` ; jamais le jeton ni l'URL dans une exception. |
| PostHog | Risque faible et vérifié (opt-out par défaut, pageview manuel). Le fragment est effacé avant toute initialisation. |
| Referer | Le fragment n'est jamais inclus dans un `Referer`. La page `/activation` ne charge aucune ressource tierce. |

---

## 7. Front

### 7.1 Routes (`src/App.tsx`, propriété L3 ; L4c ajoute une ligne à l'ancre `{/* v2:route-admin */}`)

| Route | Enveloppe | Page | Lot |
|---|---|---|---|
| `/login` | public | `LoginPage` : le lien « Créer un compte » est remplacé par le texte `t.access.loginNoAccount` (« Votre accès vous est ouvert par votre pompe funèbre ») | L3 |
| `/signup` | public | `<Navigate to="/login" replace />` (`SignupPage.tsx` supprimée) | L3 |
| `/activation` | **public** (pas de `ProtectedRoute`) | `src/pages/ActivationPage.tsx` | L3 |
| `/bienvenue` | `ProtectedRoute` + `RequireAccess area="consent"` | `src/pages/ConsentPage.tsx` | L3 |
| `/`, `/dashboard`, `/documents`, `/profile` | `ProtectedRoute` + `RequireAccess area="family"` | inchangées | L3 |
| `/access` (transmission, gelé) | `ProtectedRoute` | inchangée | — |
| `/partenaire` | `ProtectedRoute` + `RequireAccess area="partner"` | `PartnerDashboardPage` réécrite | L4 (page), L3 (enveloppe) |
| `/admin` | `ProtectedRoute` + `RequireAccess area="admin"` | `src/pages/AdminPage.tsx` | L4c (page et ligne de route) |
| `/legal`, `/security` | public | contenu bêta (`t.legalPages.*`), bandeau « version bêta — relecture juridique en cours » | L3 (structure), L7 (valeurs des textes) |

L'écran « accès non activé » n'est pas une route : `src/components/auth/AccessNotActivatedScreen.tsx` (L3), rendu par `RequireAccess`. Il contient le message, le contact `support_email`, un bouton de déconnexion et un lien `/login`.

### 7.2 Compte, garde et redirections

**Stub L0bis** `src/types/account.ts` (types figés, calqués sur §3.3.6 et §4.3) :
```ts
export type AccountRole = 'partner' | 'family' | 'none'
export interface AccountPartner { id: string; name: string; status: 'prospect'|'active'|'suspended'|'terminated'; user_role: 'manager'|'advisor' }
export interface AccountDossier { id: string; status: 'active'|'closed'; source: 'partner'|'direct'|'demo'; partner_name: string|null; deceased_first_name: string|null; activated_at: string; included_sends: number }
export interface Account { user_id: string; role: AccountRole; is_admin: boolean; partner: AccountPartner|null; dossier: AccountDossier|null; consent: { version: string; required: boolean; accepted_at: string|null } }
export interface PublicFlags { llm_enabled: boolean; email_sends_enabled: boolean; extra_sends_enabled: boolean; paper_sends_enabled: boolean; partner_activations_enabled: boolean; partner_billing_preview: boolean }
export interface MeResponse { success: true; account: Account|null; quota: { balance: number; included_total: number }|null; flags: PublicFlags; support_email: string }
```

**Stub L0bis** `src/hooks/useAccount.ts` : `useAccount(): { loading: boolean; error: boolean; me: MeResponse|null; refresh: () => Promise<void> }`. Cache de module (patron `usePayments`), `resetAccountCache()` exporté et appelé par `useAuth` sur `SIGNED_IN` et `SIGNED_OUT` (L3 branche l'appel). En cas d'erreur réseau : `error: true`, et la garde affiche l'écran d'erreur générique (`t.errors.somethingWrong*`), **jamais** les routes protégées.

**`src/lib/access-redirect.ts`** (L3, fonction pure testée) :
```ts
export type AccessArea = 'family' | 'consent' | 'partner' | 'admin'
export type AccessDecision = { kind: 'allow' } | { kind: 'redirect'; to: string } | { kind: 'screen'; screen: 'not_activated' }
export function resolveAccessRedirect(account: Account | null, area: AccessArea): AccessDecision
```
Table de décision exhaustive (`account === null` → `screen not_activated`) :

| Compte | `family` | `consent` | `partner` | `admin` |
|---|---|---|---|---|
| `role=partner` | redirect `/partenaire` | redirect `/partenaire` | allow | allow si `is_admin`, sinon redirect `/partenaire` |
| `role=family`, dossier `active`, `consent.required` | redirect `/bienvenue` | allow | redirect `/bienvenue` | allow si `is_admin`, sinon redirect `/bienvenue` |
| `role=family`, dossier `active`, consentement OK | allow | redirect `/` | redirect `/` | allow si `is_admin`, sinon redirect `/` |
| `role=family`, dossier `closed` | screen | screen | screen | allow si `is_admin`, sinon screen |
| `role=none`, `is_admin` | redirect `/admin` | redirect `/admin` | redirect `/admin` | allow |
| `role=none` | screen | screen | screen | screen |

**`src/components/auth/RequireAccess.tsx`** (L3) : `({ area, children })`, spinner pendant `loading`, puis applique la décision. Après `/login`, la redirection par défaut vers `/` passe par la garde, qui oriente vers `/partenaire`, `/admin` ou `/bienvenue`.

### 7.3 Activation — machine d'états de `ActivationPage` (L3)

1. `token = getActivationToken()`. Absent → état `missing` (« Lien incomplet : rouvrez le lien reçu par e-mail » + support).
2. `hash = await sha256Hex(token)` (`src/lib/activation-token.ts`), puis `fetch('/api/activation/check', { method:'POST', body:{ token_hash, lang } })` (sans Bearer).
   - 200 → `ready` : affiche `partner_name`, e-mail en lecture seule, mot de passe + confirmation (`PasswordInput`, `PasswordRules`, `PasswordConfirmField`).
   - 404 → `invalid` (bouton `/login` : « Déjà activé ? Connectez-vous »).
   - 410 → `expired` (« Demandez un nouveau lien à {partner_name} » + support).
   - 503 → `closed`. 429 ou 5xx → `error` avec réessai.
3. Session déjà ouverte : e-mail de session = e-mail invité → étape 5 ; sinon état `other_session` (bouton « Se déconnecter et continuer »).
4. Soumission : `supabase.auth.signUp({ email, password, options: { data: { invite_token_hash: hash }, emailRedirectTo: origin + '/bienvenue' } })`.
   - `data.session` présente → étape 5.
   - Erreur `code === 'user_already_exists'` (ou 422), ou `data.user` avec `identities` vide → `supabase.auth.signInWithPassword({ email, password })` ; en cas d'échec, état `existing_account` (« Un compte existe déjà avec cette adresse : saisissez son mot de passe ou réinitialisez-le », lien `/reset-password`). **Cet état couvre aussi le cas où l'adresse a été occupée par un tiers** (compte antérieur au hook, ou changement d'e-mail) : la famille reste bloquée, sans fuite. Procédure support au §9.3-1 ; l'écran doit donc toujours proposer le contact support à côté de la réinitialisation.
   - Erreur 403 ou message contenant `signup_requires_invitation` → `invalid`.
   - Pas de session sans erreur (Confirm email resté activé) → `error` + `Sentry.captureMessage('activation_no_session')`, sans e-mail.
5. `apiFetch('/api/activation/claim', { method:'POST', body: { token_hash, lang } })`.
   - 200 → `updateUser({ data: { invite_token_hash: null } })` (erreur ignorée), `clearActivationToken()`, `resetAccountCache()`, `navigate('/bienvenue', { replace: true })`.
   - 403 `EMAIL_MISMATCH` → `other_session`. 410 → `expired`. 404 → `invalid`. 409 → `error` + support.

### 7.4 Consentement — `ConsentPage` (L3)

- Titre : « Bienvenue ». Si `dossier.partner_name` : « Votre accompagnement Seren vous est proposé par {partner} », sinon « Votre accompagnement Seren ». Puis « Nous sommes à vos côtés pour les démarches liées au décès de {deceased_first_name} » (phrase omise si prénom null).
- Trois cases `Checkbox` (Shadcn), toutes obligatoires :
  - `terms` : « J'accepte les conditions générales d'utilisation (version bêta) », lien `/legal` ;
  - `privacy` : « J'ai pris connaissance de la politique de confidentialité », lien `/security` ;
  - `sensitive_data` : « J'accepte que Seren traite les informations sensibles nécessaires à mes démarches (décès, situation familiale, patrimoine) ».
- CTA « Commencer ». Action : `supabase.rpc('record_consents', { p_version: CONSENT_VERSION, p_kinds: ['terms','privacy','sensitive_data'] })` → `refresh()` → `navigate('/', { replace: true })`. Sur erreur `consent_version_mismatch`, rechargement de la page.
- `src/components/auth/CGUCheckbox.tsx` : supprimé avec `SignupPage` (L3), ou réutilisé si utile.

### 7.5 `CONSENT_VERSION`

Fichier exact : **`src/lib/consent-version.ts`** (stub L0bis) → `export const CONSENT_VERSION = '2026-09-beta-1' as const`. Parité SQL testée par `tests/consent-version.test.ts` (L1) : lit `supabase/migrations/20260915200000_v2_core.sql` et vérifie que la constante apparaît dans le corps de `consent_version()`. Changer de version = migration corrective + modification de ce fichier dans le même commit.

### 7.6 Textes d'offre v2 et envoi indisponible (L5)

- **Offre côté famille** (jamais de prix affiché) : « Accès sans limite de durée » · « 10 envois postaux inclus » · « proposé par {partner_name} » (libellé générique si `source='direct'`). Aucune mention LRAR à l'écran.
- **`QuotaBadge`** : « {count} envoi{s} inclus restant{s} sur {total} » (`total` = `included_total` de `/api/letters/quota`).
- **402 `QUOTA_EXHAUSTED`** : « Vous avez utilisé vos envois inclus. Pour tout envoi supplémentaire, contactez le support : {support_email}. » Aucun bouton d'achat (le serveur renvoie `extra_send_available:false`).
- **Canal fermé** (`flags.paper_sends_enabled === false` pour un modèle papier, `flags.email_sends_enabled === false` pour un modèle e-mail) : le bouton d'envoi est remplacé par « L'envoi par Seren n'est pas encore disponible pour ce courrier : téléchargez-le pour l'envoyer vous-même », avec les actions PDF existantes. Même rendu quand le serveur répond 503 `PAPER_DISABLED`, `EMAIL_SENDS_DISABLED` ou `ATTACHMENTS_DISABLED`.
- **Paywall forfait** (`LetterSendPanel.tsx`, bloc `paymentsEnabled && !hasPaid`) : supprimé par **L3** (sous-lot plancher), avec `startCheckout` et la branche `success` forfait de `CheckoutReturnBanner`. `extra_success` et la reprise papier sont conservés.
- **`CompletionScreen`** : ajoute « {n} courrier{s} prêt{s} » (étapes de la roadmap générée avec `letter_template_id`), prop `lettersCount: number`.
- **Roadmap** : bandeau permanent « Informations indicatives, en cours de relecture juridique : vérifiez auprès de l'organisme concerné ».
- **Catalogue épicène** (`server/lib/questions-catalog.js`, FR seulement, valeurs enum inchangées) :
  - questions l.103, 190, 260, 276, 298 ; retrait de la parenthèse de formulaire l.341 ;
  - options l.136 → « En emploi salarié », l.138 → « À son compte ou chef d'entreprise », l.139 → « À la retraite », l.165 → « Hébergement chez un proche ou autre situation » ;
  - aide l.226 → « En cas de doute, pas d'inquiétude : une recherche gratuite existe via l'AGIRA. » ;
  - test anti-formes genrées (`(e)`, `il/elle`, `/elle`) sur questions, aides et libellés d'options.
- **Notes des 5 modèles « recommandé avec AR »** (`src/data/letter-templates.ts` + jumeau serveur) : « Seren l'envoie pour vous par courrier ; joindre l'acte de décès. »

### 7.7 Namespaces i18n et propriété des clés

`src/i18n/strings.fr.ts` et `strings.en.ts` : un lot ne modifie **que** ses namespaces. Un namespace neuf est inséré **juste avant** son ancre (§8.3), jamais ailleurs.

| Namespace | Propriétaire | Nature |
|---|---|---|
| `activation` (neuf) | L3 | page `/activation`, tous les états §7.3 |
| `consent` (neuf) | L3 | page `/bienvenue` |
| `access` (neuf) | L3 | écran « accès non activé », `loginNoAccount`, garde |
| `legalPages` (neuf) | L3 crée, L7 met à jour les **valeurs** | contenus `/legal`, `/security`, `betaBanner` |
| `auth.login.noAccount`, `auth.login.createAccount`, `auth.signup` | L3 | retrait ou réécriture |
| `payments` | L3 | nettoyage du paywall forfait (les clés utilisées par le mini-paiement restent) |
| `layout.legalContent`, `layout.securityContent` | L3 | pointent vers `legalPages` ou sont retirées |
| `partner` (réécrit en entier) | L4 | liste, formulaire, compteurs, actions |
| `partnerBilling` (neuf) | L4b | bloc estimation |
| `admin` (neuf) | L4c | page `/admin` |
| `completion`, `roadmap`, `paperSend`, `lettersPage`, `offer` (neuf) | L5 | offre v2, N courriers prêts, envoi indisponible, quota, avertissement roadmap |
| tous les autres | personne | gel |

`server/lib/messages.js` : blocs L2a, L2b et L4c (§4.9). L1, L1b, L6, L7 et L4b n'y touchent pas.

---

## 8. Propriété des fichiers et ordre de merge

### 8.1 Stubs contractuels L0bis (commit de l'orchestrateur AVANT de créer les branches de lot)

Motif : les lots qui mergent tôt consomment des contrats livrés par des lots qui mergent tard. Les stubs ci-dessous sont **complets et figés**. Chaque fichier a un lot propriétaire, seul autorisé à le modifier ensuite.

| Fichier | Contenu | Propriétaire ensuite |
|---|---|---|
| `docs/design-v2-demonstrateur.md` | ce contrat | orchestrateur (notes §12) |
| `src/lib/consent-version.ts` | `export const CONSENT_VERSION = '2026-09-beta-1' as const` | L1 (parité) |
| `src/types/account.ts` | types §7.2 | L3 |
| `src/hooks/useAccount.ts` | hook §7.2 (fetch `/api/me` via `apiFetch`, cache de module, `resetAccountCache`) | L3 |
| `server/lib/flags.js` | §4.1 (`FLAG_NAMES`, `flagOn`, `publicFlags`, `killSwitch`) | L2a |
| `tests/fixtures/invite-token-vector.json` | vecteurs §6 | L2b |
| Ancres dans `server/server.js` | lignes `// v2:mount-partner`, `// v2:mount-activation`, `// v2:mount-admin`, séparées par une ligne vide, juste après le montage de `/api/attachments` | L2a (L2b et L4c insèrent leur `import` en tête de fichier et leur `app.use` **juste avant** leur ancre) |
| Ancres dans `server/lib/messages.js` | en fin des objets `fr` et `en` : `// v2:messages-l2a`, `// v2:messages-l2b`, `// v2:messages-l4c`, séparées par une ligne vide | chaque lot insère **juste avant** son ancre |
| Ancres dans `src/i18n/strings.{fr,en}.ts` | en fin d'objet : `// v2:ns-l3`, `// v2:ns-l4`, `// v2:ns-l4b`, `// v2:ns-l4c`, `// v2:ns-l5`, séparées par une ligne vide | idem (les namespaces **existants** se modifient en place) |
| Ancre dans `src/App.tsx` | `{/* v2:route-admin */}` après la route `/partenaire` | L4c |

Contenu exact de `tests/fixtures/invite-token-vector.json` :
```json
[
  { "token": "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
    "token_bytes_hex": "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    "hash": "ea866a757e4c38babfa8127cbe9a409d3e1f93a00ff1488ff735fcf917afffd0" },
  { "token": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "token_bytes_hex": "0000000000000000000000000000000000000000000000000000000000000000",
    "hash": "0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a" }
]
```
(`hash` = sha256 hex de la chaîne `token` en UTF-8 ; `token_bytes_hex` = décodage base64url de `token`, pour tester `generateInviteToken`.)

**Contenu exact du commit L0bis** (revue du 16/09, must-fix 4) — **un seul commit** sur `integration/v2-demo`, au-dessus de `4510a61`, sans déplacer le tag `preprod-2a-base` :

| Élément | Compte attendu | Détail |
|---|---|---|
| Documents | **3** | `docs/design-v2-demonstrateur.md` (ce contrat), `docs/plan-v2-sql.md`, `docs/plan-v2-app.md` |
| Stubs | **5** | `src/lib/consent-version.ts`, `src/types/account.ts`, `src/hooks/useAccount.ts`, `server/lib/flags.js`, `tests/fixtures/invite-token-vector.json` (contenu ci-dessus, figé) |
| Ancres `server/server.js` | **3** | `// v2:mount-partner`, `// v2:mount-activation`, `// v2:mount-admin` |
| Ancres `server/lib/messages.js` | **6** | `// v2:messages-l2a`, `-l2b`, `-l4c`, dans l'objet `fr` **et** dans l'objet `en` |
| Ancres `src/i18n/strings.fr.ts` puis `strings.en.ts` | **5 + 5** | `// v2:ns-l3`, `// v2:ns-l4`, `// v2:ns-l4b`, `// v2:ns-l4c`, `// v2:ns-l5` |
| Ancre `src/App.tsx` | **1** | `{/* v2:route-admin */}` après la route `/partenaire` |

Soit **20 lignes d'ancre**, 5 stubs et 3 documents ; **aucun autre fichier n'est touché** et le gate R3 reste vert (les ancres sont des commentaires). Le **§12.2 est rempli dans ce même commit** : une ligne datée par note N1-N16 de `docs/plan-v2-app.md` (Task 0.3) et une décision explicite pour chacun des écarts E0-E13 de `docs/plan-v2-sql.md`. Gate de sortie : `docs/plan-v2-app.md` Task 0.1 (`git status` vide, les 5 fichiers présents, `grep -c` = 3, 6, 5, 5, 1) et `docs/plan-v2-sql.md` Task 0 Step 1. **Tant que ce commit n'existe pas, aucune branche `feature/v2-*` n'est créée** : les deux plans s'arrêtent à leur Task 0.

### 8.2 Propriété par lot (branche `feature/v2-<lot>`, scindée `-sql` / `-app` quand les deux plans y écrivent)

Un fichier absent de ce tableau est **gelé** : le toucher exige une note §12.

**Branches (revue du 16/09, SF2.7).** Un lot écrit par les **deux** plans a **deux** branches et **deux** worktrees, pour qu'aucun exécutant ne rejoue `git worktree add -b` sur une branche ou un chemin déjà pris, et que deux subagents de nuit ne se disputent pas le même `.git/index.lock` : `feature/v2-l4c-sql` / `feature/v2-l4c-app`, `feature/v2-l7-sql` / `feature/v2-l7-app`, `feature/v2-l9-sql` / `feature/v2-l9-app`. L6 reste sur `feature/v2-l6` (plan SQL, qui en est le seul auteur) ; la Task 37 du plan app écrit `scripts/e2e-v2.mjs` sur `feature/v2-l6-e2e`. Les lots portés par un seul plan (L1, L1b, L2a, L2b, L3, L4, L4b, L5) gardent leur nom simple.

| Lot | Palier | Fichiers créés (C) / modifiés (M) — exclusifs | Dépend du contrat de |
|---|---|---|---|
| **L5** Contenu | PLANCHER | M `server/lib/questions-catalog.js` (FR), M `tests/questions-catalog.test.ts`, M `src/data/letter-templates.ts`, M `server/lib/letter-templates.js`, M `src/components/questionnaire/CompletionScreen.tsx`, M `src/pages/QuestionnairePage.tsx` (prop `lettersCount` seulement), M `src/components/dashboard/RoadmapView.tsx` (bandeau seulement), M `src/components/letter/QuotaBadge.tsx`, M `src/components/letter/PaperSendPanel.tsx` (textes 402 et envoi indisponible seulement), namespaces L5, M `README.md` | stubs `useAccount`, `account.ts` |
| **L2a** Serveur gate | PLANCHER (`FEATURE_LLM`) + MINIMUM | C `server/lib/require-active-dossier.js`, C `server/routes/me.js`, C `server/routes/transmission.js`, M `server/server.js`, M `server/lib/flags.js`, M `server/routes/questionnaire.js`, M `server/routes/letters.js` (signature, gardes, `/quota`, 402), M `server/routes/attachments.js`, M `server/routes/payments.js`, bloc L2a de `messages.js` ; tests : C `tests/active-dossier-gate.test.ts`, C `tests/me-route.test.ts`, C `tests/flags.test.ts`, C `tests/transmission-route.test.ts`, C `tests/server-sentry-scrub.test.ts`, M `tests/questionnaire-routes.test.ts`, M `tests/letters-routes.test.ts`, M `tests/letters-paper-routes.test.ts`, M `tests/letters-webhook.test.ts`, M `tests/attachments-routes.test.ts`, M `tests/payments-routes.test.ts`, M `tests/payments-webhook.test.ts`, M `tests/purchase-gate.test.ts` (conservé vert, code mort) | §3.3.6, §3.3.15 |
| **L2b** Serveur PF et activation | MINIMUM | C `server/routes/partner.js`, C `server/routes/activation.js`, C `server/lib/invite-token.js`, C `server/lib/invitation-email.js`, M `server/lib/rate-limit.js` (ajout `createIpRateLimiter`), insertion aux ancres `mount-partner`/`mount-activation` de `server.js`, bloc L2b de `messages.js` ; tests : C `tests/partner-routes.test.ts`, C `tests/activation-routes.test.ts`, C `tests/invite-token.test.ts`, C `tests/invitation-email.test.ts` | §3.3.4, 3.3.5, 3.3.9-3.3.13, `flags.js` |
| **L1b** F1 | MINIMUM | C `supabase/migrations/20260915210000_transmissions_f1.sql`, C `scripts/sql-scenarios-f1.sql` | — |
| **L1** Migrations v2 | MINIMUM | C `supabase/migrations/20260915200000_v2_core.sql`, C `supabase/migrations/20260915201000_v2_partner_rpc.sql`, M `supabase/config.toml` (bloc hook), C `scripts/sql-scenarios-v2.sql`, C `scripts/hook-scenarios-v2.mjs` (local uniquement), C `tests/migrations-v2-lint.test.ts`, C `tests/consent-version.test.ts`, M `src/lib/consent-version.ts` (si besoin de parité) | — |
| **L4c** Admin Seren | MINIMUM | C `supabase/migrations/20260915202000_v2_admin.sql`, C `server/routes/admin.js`, C `src/pages/AdminPage.tsx`, C `src/hooks/useAdminOverview.ts`, C `tests/admin-routes.test.ts`, ancres `mount-admin`, `route-admin`, `messages-l4c`, `ns-l4c` | §3.3.14, `RequireAccess` (L3 : la page compile sans, la route est câblée à l'ancre) |
| **L6** Probes et provisionnement | MINIMUM | M `scripts/rls-probes.mjs`, C `scripts/provision-v2.mjs`, C `tests/provision-v2-guard.test.ts` (écart E12), M `docs/runbook-rls-probes.md` ; sur `feature/v2-l6-e2e` : C `scripts/e2e-v2.mjs` (note N8) | §3, §4 |
| **L3** Front famille | PLANCHER (paywall, `/signup`) + MINIMUM | M `src/main.tsx`, M `src/lib/sentry.ts`, C `src/lib/activation-fragment.ts`, C `src/lib/activation-token.ts`, C `src/lib/access-redirect.ts`, C `src/components/auth/RequireAccess.tsx`, C `src/components/auth/AccessNotActivatedScreen.tsx`, C `src/pages/ActivationPage.tsx`, C `src/pages/ConsentPage.tsx`, M `src/App.tsx`, M `src/pages/LoginPage.tsx`, D `src/pages/SignupPage.tsx`, M ou D `src/components/auth/CGUCheckbox.tsx`, M `src/hooks/useAuth.ts`, M `src/hooks/useAccount.ts`, M `src/types/account.ts`, M `src/components/letter/LetterSendPanel.tsx` (retrait paywall), M `src/hooks/usePayments.ts` (retrait `startCheckout`), M `src/components/payments/CheckoutReturnBanner.tsx`, M `src/lib/auth.ts`, namespaces L3 ; tests : C `tests/access-redirect.test.ts`, C `tests/activation-fragment.test.ts`, C `tests/activation-token.test.ts` | §4.3, §4.5, §6, §7 |
| **L4** Front PF | PLANCHER (masquage euros) + MINIMUM | M `src/pages/PartnerDashboardPage.tsx`, M `src/hooks/usePartnerDashboard.ts` (réécrit sur `/api/partner/*`, plus d'appel à `partner_dashboard`), C `src/components/partner/DossierForm.tsx`, C `src/components/partner/DossierCard.tsx`, C `src/components/partner/PartnerCounters.tsx`, C `src/lib/partner-dossier.ts` (`canCancel`, `validateDossierForm`), C `tests/partner-dossier.test.ts`, namespace `partner`, pose l’ancre `{/* v2:billing-preview */}` dans `PartnerDashboardPage.tsx` | §4.4 |
| **L7** Seeds, runbooks, textes | MINIMUM | C `scripts/seed-demo-v2.sql` (parties 1, 2, 3) **et** M `scripts/seed-demo-pf.sql` (en-tête « obsolète v2 ») — les deux sur `feature/v2-l7-sql`, propriétaire unique `docs/plan-v2-sql.md` Task 12 (SF2.6) ; sur `feature/v2-l7-app` : M `docs/runbook-demo-rendu.md`, C `docs/textes-beta-v2.md` (CGU, confidentialité, données sensibles, art. 14, lettre d'engagement PF art. 28, contact support), valeurs de `legalPages` (après merge de L3), M `CLAUDE.md` | §3 |
| **L4b** Estimation facturation | CIBLE | C `src/components/partner/BillingPreview.tsx`, C `src/lib/billing-preview.ts` (formatage `N × 220 € TTC`), C `tests/billing-preview.test.ts`, insertion d'**une** ligne dans `PartnerDashboardPage.tsx` à l'ancre `{/* v2:billing-preview */}` (posée par L4), namespace `partnerBilling` | §3.3.13, §4.4 |
| **L8** Intégration | — | merges, tags, `docs/plan-v2-demonstrateur.md` (notes post-revue), correctifs P1 (au nom du lot propriétaire, note de revue obligatoire) | tous |
| **L9** Préparation prod | BÊTA | C `docs/runbook-beta-prod.md`, C `scripts/backfill-prod-beta.sql`, C `scripts/erase-family.sql` | §3, §11 |

### 8.3 Ordre de merge dans `integration/v2-demo` (fast-forward ou merge local, gate local vert à chaque étape)

`L0 (fait) → L0bis (stubs) → L5 → L2a → L2b → L1b → L1 → L4c-sql → L4c-app → L6 → L6-e2e → L3 → L4 → L7-sql → L7-app → L4b`. Puis L9-sql puis L9-app (docs et scripts seuls, sans conflit) à tout moment après L7. La partie `-sql` d'un lot merge **avant** sa partie `-app` (la migration précède la route qui l'appelle ; le seed précède le runbook qui le cite).

Gate local après **chaque** merge : `npx tsc --noEmit && npx vitest run && npm run build`. Après L1b, L1 et L4c : en plus, `supabase db reset --local`, `psql -f scripts/sql-scenarios-v2.sql`, `node scripts/hook-scenarios-v2.mjs`. Un merge rouge est annulé (`git reset --hard` sur la branche d'intégration **locale** uniquement), jamais corrigé à chaud sans note.

Conflit attendu et règle de résolution :
- sur un **fichier gelé** → la version de la branche d'intégration gagne et le lot fautif refait son commit ;
- sur une **ancre** → garder les deux insertions dans l'ordre des ancres.

## 9. Sécurité et RGPD

### 9.1 Isolation

| Frontière | Garantie | Preuve |
|---|---|---|
| PF ↔ contenu famille | Aucune policy ne donne accès à la PF aux tables de contenu (policies owner `auth.uid() = user_id`). Les RPC PF ne lisent que `partners`, `partner_users` et `dossiers` (§3.3.12). La PF n'a ni token famille ni jeton après activation. | lint L1 (grep de jointures interdites), probe forte L6 : PF-X contre le contenu de SA famille active → 0 ligne |
| PF-X ↔ PF-Y | `partner_id` dérivé de `auth.uid()` ; `dossier_not_found` identique pour un dossier inexistant ou étranger | scénarios SQL L1 + probes L6 |
| Famille ↔ dossiers | `dossiers` deny-all ; la famille ne voit que la projection `my_account()` (sans snapshots, sans hash) | probe : SELECT direct → 0 ligne |
| Anonyme | `invitation_preview` seule accessible ; le hash de 256 bits est non énumérable ; limite par IP côté Express | probes anon |
| Admin Seren ↔ PII | `admin_partner_overview` = compteurs uniquement ; aucune policy admin sur les tables de contenu ni sur le storage | revue L4c + probe famille/PF → `null` |
| Inscription libre | Front : `/signup` redirigé. Auth : hook « Before User Created » (allowlist ou e-mail invité + hash valide). Serveur : gate fail-closed sur toutes les routes métier. | `hook-scenarios-v2.mjs` (acceptés ET refusés), probe HTTP compte sans dossier → 403 |
| PF ↔ jeton d'activation | Une PF ne peut ni **choisir** le jeton ni **tuer** un lien en direct : `partner_create_dossier` et `partner_rotate_invitation` exigent le secret `webhook_config` que seul Express détient (§3.4). Elle n'obtient le jeton que par `SHOW_ACTIVATION_LINK` (préprod uniquement). | scénarios S1-S3 (appel sans secret → `invalid_secret`) + probe « RPC PF sans secret » |
| PF résiliée ↔ familles | `partners.status = 'terminated'` → `my_account().partner` null, `partner_list_dossiers` et `partner_month_counters` → `null` (403 `NOT_A_PARTNER`) : plus aucune PII famille après la résiliation. `'suspended'` garde la lecture, sans création ni renvoi. | scénario S9 (PF résiliée → null) |
| Écritures sur `purchases` | Seuls écrivains : RPC Stripe à secret (inchangées) et `claim_dossier` (lié au jeton, 1 ligne par dossier, idempotent) | scénario SQL : double claim → 1 seule ligne, solde 10 |
| Rôles internes (gérant, admin) | Ne s'obtiennent que par `link_enrollments(p_pairs)`, non exposée, sur un compte **créé par Arnaud** et apparié par UUID (§3.3.3). Une inscription publique sur une adresse enrôlée ne donne aucun rôle. | scénarios S14a-m (UUID d'un autre compte, compte antérieur, déjà connecté, changement d'e-mail en attente → non lié ; `untrusted` > 0) |

### 9.2 RGPD

- **Art. 14 (données collectées auprès d'un tiers, la PF).** L'e-mail d'invitation est le premier contact : identité de la PF, finalité, catégories de données reçues, droits, contact support, lien vers la politique de confidentialité (§4.4). Textes : L7, validation Arnaud en U2.
- **Consentement de la famille** : table `consents` append-only, versionnée, horodatée, une ligne par finalité, sans policy d'écriture.
- **Sous-traitance PF (art. 28)** : lettre d'engagement pilote signée avant `PARTNER_ACTIVATIONS_ENABLED=true` en prod (D8). MySendingBox : DPA art. 28 avant la clé live (D3).
- **Effacement (audit F2)** : procédure manuelle `scripts/erase-family.sql` + Dashboard, rédigée par L9 et testée en local. Ordre :
  1. suppression des objets storage du préfixe `<user_id>/` (Dashboard Storage) ;
  2. anonymisation du dossier (`family_*` et `deceased_*` à `null` ou `'[effacé]'`, statut `closed`, `closed_at`) ;
  3. Dashboard Auth → Delete user (cascade `on delete cascade` des tables owner ; `dossiers.user_id` → `null`).
  Délai d'exécution annoncé : 30 jours, via le contact support.
- **Minimisation Mistral** : LLM coupé, aucune donnée ne sort.
- **Sentry** : pas de PII, scrub du jeton (§4.8, §6).

### 9.3 Risques résiduels assumés (documentés, pas corrigés avant la bêta)

1. **Pré-occupation d'un e-mail** : fermée par le hook, qui exige le hash d'un jeton valide. Trois résidus :
   - un compte auth **créé avant l'activation du hook** avec l'e-mail d'une famille bloque son `signUp` (422), et la famille doit alors connaître le mot de passe de ce compte ;
   - **une adresse peut aussi être occupée par un changement d'e-mail** (`auth.users.email_change`) depuis un compte existant — compte v1 de la prod, compte sans dossier, voire compte PF. Le `signUp` de la famille renvoie alors 422 `user_already_exists` et la connexion échoue : la famille reste en état `existing_account` (§7.3). **Pas de fuite** (le claim exige le jeton, et un compte interne est refusé par `account_role_forbidden`), mais c'est un **déni d'activation**. Constat local (16/09, GoTrue 2.192.0, `enable_confirmations = false`, `double_confirm_changes = true`) : `PUT /auth/v1/user {email}` **n'applique pas** le changement immédiatement — `email` reste l'ancienne adresse, la nouvelle est stockée dans `email_change`/`new_email` et un lien de confirmation part vers **les deux** adresses ; l'occupation exige donc l'accès à la boîte visée. À vérifier sur les projets hébergés (H19) : si « Secure email change » y était désactivé, un seul lien partirait, toujours vers la **nouvelle** adresse ;
   - **Procédure support commune** : lire `auth.users.created_at`, `last_sign_in_at` et `email_change` pour l'adresse concernée ; si le compte n'est pas celui de la famille, **Delete user** après vérification (attention à l'écart E9 : un dossier actif bloque la suppression), puis renvoi de l'invitation par la PF. Côté front, aucun écran n'offre de changement d'adresse : vérifié le 16/09 — `/profile` affiche `user?.email` en lecture seule, et les deux seuls `supabase.auth.updateUser` de `src/` portent sur le **mot de passe** (`ChangePasswordForm.tsx`, `src/lib/auth.ts`) ou sur `data.invite_token_hash` (§7.3). **Aucun lot ne doit ouvrir de changement d'e-mail dans l'app avant la fermeture L10** ;
   - un gérant PF peut inviter une adresse qu'il contrôle et consommer 10 envois (facturés à sa PF ; en bêta non facturée, borné par `partner_daily_limit` 50/24 h, `send_limits` 10/utilisateur et 50/jour, contrôle a posteriori MySendingBox).
2. **Écritures directes du front non conditionnées au dossier** : un compte sans dossier actif (antérieur au hook) peut écrire `questionnaires`, `roadmaps`, `steps`, `step_actions`, `documents`, `sender_profiles` via PostgREST sous RLS owner, et déposer un objet storage sous son préfixe. Aucun accès aux données d'autrui, aucun envoi, aucun coût. Fermeture : L10, semaine du 22/09.
3. **Coffre sans antivirus ni rétention** : magic bytes + 5 Mo + bucket privé + préfixe owner + 20 fichiers par compte. Chantier 3.
4. **Papier live sans file de validation** (D3) : un courrier erroné part et est facturé. Mitigations :
   - corps regénéré côté serveur depuis des modèles relus (prérequis GNG6) ;
   - `send_limits` (10 par utilisateur et 50 au global par 24 h) ;
   - fenêtre d'annulation MySendingBox allongée (recommandation D3) ;
   - contrôle a posteriori dans le dashboard MySendingBox ;
   - kill switch en 1 min.
5. **Kill switch `PARTNER_ACTIVATIONS_ENABLED` partiellement contournable par appel PostgREST direct** : interrupteur d'exploitation et non barrière. Depuis la revue du 16/09, la portée de ce résidu est **réduite au seul `claim_dossier`** — une famille qui détient son jeton peut activer son dossier flag fermé (sans dommage : elle y a droit, le jeton est valide et le pont est idempotent). **La création et le renvoi ne sont plus contournables** : `partner_create_dossier` et `partner_rotate_invitation` exigent le secret `webhook_config` (§3.4), donc passent obligatoirement par Express, avec son kill switch et ses limiteurs par utilisateur (30/h création, 20/h renvoi). La sécurité reste portée par le SQL ; le secret ne fait qu'y ajouter l'obligation de passer par le serveur pour les deux RPC où l'appelant choisit un secret d'authentification.
6. **Jeton exposé à la PF en préprod** (`SHOW_ACTIVATION_LINK`) : acceptable sur données de démo, interdit en prod.
7. **Dette `purchases`** : lignes `partner_dossier:*` à `amount_total` null. Toute requête de CA sur `purchases` doit exclure le préfixe `partner_dossier:`. La v0 `partner_dashboard` les compte en `paid_count` (sans effet, v0 plus affichée).
8. **Oracle `email_unavailable`** (revue du 16/09) : l'unicité de l'e-mail famille est **globale** (`dossiers_family_email_open_uidx`, hypothèse H17). Une PF qui tente une création apprend donc, par le 409 `EMAIL_UNAVAILABLE`, qu'une adresse porte déjà un dossier Seren ouvert — **y compris chez une autre PF**, ce qui trahit un deuil récent. Le message reste générique (il ne dit jamais *pourquoi* l'adresse est prise : dossier ouvert, compte interne ou enrôlement) mais l'oracle à 2 états subsiste. Bornes : la création passe obligatoirement par Express (§3.4), donc **30 tentatives/h/utilisateur** (limiteur) et `partner_daily_limit` 50/24 h par PF ; toute tentative est tracée (`created_by`, journaux Render). Pas d'énumération de masse possible, mais une PF peut tester une adresse qu'elle connaît. **À traiter avec H17** (décision post-bêta sur l'unicité globale) : passer à une unicité par PF, ou répondre « créé » sans effet et signaler à Seren.
9. **Compte interne non fiable détecté tard** : `link_enrollments` refuse de lier un compte suspect (§3.3.3) et le compte `untrusted` dans son retour, mais ne le supprime pas. Si `untrusted > 0`, l'adresse enrôlée est déjà détenue par quelqu'un : la PF ou l'admin n'a pas d'accès, mais l'enrôlement reste bloqué jusqu'à l'enquête d'Arnaud (Delete user ou changement d'adresse d'enrôlement).
10. **Devinage de code de transmission non étranglé** (revue L1/L1b, m7) : le correctif F1 (§3.3.15) ferme l'exposition de **toute** la table `transmissions` à tout authentifié, mais `get_transmission_by_code` garde `grant execute … to authenticated` — elle est donc appelable en direct via PostgREST avec la clé publishable, **hors d'atteinte du limiteur Express** de la route `/api/transmission/:code` (§4.7). La seule borne SQL est `char_length(p_code) between 4 and 64` : un compte connecté peut tenter des codes en boucle. Bornes réelles : les codes sont des valeurs **héritées de la v1** (aucun code n'est plus généré ; le produit est gelé en lecture seule), la table est quasi vide, et chaque appel ne rend qu'une ligne. **Point de contrôle avant la bêta** : relever en prod la longueur et le nombre réels des codes (`select count(*), min(char_length(access_code)), max(char_length(access_code)) from public.transmissions;`) — si des codes courts existent en nombre, allonger la borne basse ou révoquer le grant et ne servir la RPC que par le serveur. Trace : `docs/audit-rls.md` F1.

---

## 10. Tests, preuves et go/no-go

### 10.1 Harnais local (agents, jamais de base distante)

- `supabase start` dans le worktree `wt-integration` ; `supabase db reset --local` rejoue les 18 migrations.
- Bloc hook activé dans `supabase/config.toml` (§3.3.2), puis `supabase stop && supabase start` pour prise en compte.
- Connexion SQL locale : `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. API locale : `http://127.0.0.1:54321` avec la clé publishable locale (`supabase status`).
- `scripts/hook-scenarios-v2.mjs` et `scripts/e2e-v2.mjs` refusent toute URL qui n'est ni `127.0.0.1` ni `localhost` sans `E2E_TARGET=preprod` explicite. Ils refusent **toujours** une URL contenant `oltwzvfjazwjvghpzhia`, via `scripts/check-env-target.mjs`.

### 10.2 Scénarios obligatoires

**SQL (`scripts/sql-scenarios-v2.sql`, L1)** — chaque scénario dans une transaction `rollback`, avec `set local role authenticated; set local request.jwt.claims = '{"sub":"…","email":"…","role":"authenticated"}'` :
1. `partner_create_dossier` par PF-X (**avec le secret**, `webhook_config` inséré dans la transaction du scénario comme en S6) → `created:true`. Même défunt sans confirmation → `duplicate_warning:true`, 0 insertion. Avec confirmation → créé. **Sans secret ou avec un secret faux → `invalid_secret`, avant toute lecture et toute insertion** (y compris pour un gérant PF-X parfaitement légitime).
2. E-mail déjà pris (dossier non annulé, gérant, admin enrôlé) → `email_unavailable`. Compte famille → `not_a_partner`. PF suspendue → `partner_inactive`. **PF résiliée (`terminated`) → `partner_inactive` en création, et `null` en lecture (liste, compteurs, `my_account().partner`).**
3. PF-Y : `partner_rotate_invitation` (avec secret) et `partner_cancel_dossier` sur un dossier de PF-X → `dossier_not_found` ; `partner_list_dossiers` → 0 dossier de PF-X. `partner_rotate_invitation` **sans secret** → `invalid_secret` (le contrôle précède la lecture du dossier : aucun oracle d'existence).
4. `invitation_preview` : hash valide → `valid:true` ; hash aléatoire → `invalid` ; `invite_expires_at` forcé dans le passé → `expired`.
5. `claim_dossier` :
   - bon e-mail → `claimed:true`, dossier `active`, hash `null`, 1 ligne `purchases` `partner_dossier:<id>` à 10 ;
   - rejeu → `already_active:true`, toujours 1 ligne ;
   - mauvais e-mail → `email_mismatch` ;
   - compte PF → `account_role_forbidden` ;
   - expiré → `invitation_expired` ;
   - annulé → `invalid_token`.
6. Pont : `send_balance(<uid>)` = 10 après claim (appel en rôle postgres). 10 `consume_send` successifs réussissent (secret local de test), le 11ᵉ lève `quota_exhausted`.
7. `record_consents` : kinds incomplets → `consent_incomplete` ; mauvaise version → `consent_version_mismatch` ; complet → 3 lignes, rejeu → `recorded:0` ; `my_account().consent.required` passe de `true` à `false`.
8. `my_account()` : PF → `role:'partner'`, famille → `family`, compte vide → `none`, admin → `is_admin:true`.
9. `partner_month_counters` : compteurs attendus sur un jeu de 6 dossiers daté (dont mois précédent, annulé, expiré) ; conseiller → `billing_preview:null`.
10. `admin_partner_overview` : admin → liste ; PF et famille → `null`.
11. `partner_dashboard()` v0 toujours exécutable et inchangée (`pg_get_functiondef` identique au texte de `20260913200000`).
12. Deny-all : en rôle `authenticated`, `select` sur `dossiers`, `account_enrollments`, `seren_admins`, `partners`, `partner_users`, `attributions` → 0 ligne ; `insert` → erreur RLS.
13. Droits : `has_function_privilege('anon', 'public.claim_dossier(text)', 'execute')` = false ; `has_function_privilege('authenticated', 'public.hook_before_user_created(jsonb)', 'execute')` = false ; `supabase_auth_admin` = true ; `link_enrollments(jsonb)` non exécutable par `anon` ni `authenticated`.
13 bis. `link_enrollments(p_pairs)` : liaison par paires e-mail ↔ UUID → gérants et admin créés ; rejeu sans doublon ; `pending` sur un enrôlement sans compte. **Refus `enrollment_account_untrusted`** dans chacun des cas : UUID d'un autre compte que l'adresse, compte **créé avant** l'enrôlement, compte **déjà connecté** (`last_sign_in_at` non null), **changement d'e-mail en attente** (`email_change`). Compte enrôlé portant un dossier famille → `enrollment_conflict_family`. Un compte non apparié mais existant est compté dans `untrusted`.
14. F1 (`sql-scenarios-f1.sql`, L1b) : un authentifié tiers → `select * from transmissions` = 0 ligne ; `get_transmission_by_code(<code>)` → 1 ligne ; mauvais code → 0.

**Hook réel (`scripts/hook-scenarios-v2.mjs`, L1)** — `POST /auth/v1/signup` sur l'API locale :

| Cas | Attendu |
|---|---|
| e-mail aléatoire, sans metadata | **refusé** (403, `signup_requires_invitation`) |
| e-mail invité, sans hash | **refusé** |
| e-mail invité, hash d'un autre dossier | **refusé** |
| e-mail invité, hash expiré | **refusé** |
| e-mail d'un dossier annulé, ancien hash | **refusé** |
| e-mail enrôlé `partner_manager` | **accepté** |
| e-mail enrôlé `seren_admin` | **accepté** |
| e-mail invité + hash valide | **accepté**, puis claim OK |

**Vitest (CI, sans réseau)** :
- L2a :
  - gate fail-closed sur **chaque** route gatée (500 si la RPC échoue, 403 `DOSSIER_NOT_ACTIVE`, 403 `CONSENT_REQUIRED`) ;
  - le refus ne consomme pas le quota horaire (N+1 requêtes refusées, puis une acceptée non limitée) ;
  - webhooks non gatés ; `/checkout` 503 ;
  - `flagOn` : `'true'` seul ouvre (`'TRUE'`, `'1'`, `''` et absent ferment) ;
  - `FEATURE_LLM` absent → `mistral` null et espion jamais appelé ;
  - `/api/me` (forme exacte) ; F1 ; scrub Sentry ;
  - les 8 constructions de routers existantes adaptées, ordre des gardes papier conservé.
- L2b :
  - flags ; `activation_url` présent seulement avec `SHOW_ACTIVATION_LINK` ;
  - mapping de chaque code §3.5 ;
  - e-mail : mentions art. 14 présentes, absence du nom et de la date de décès ;
  - espions `console` et Sentry : jamais de jeton, de hash ni d'URL ; vecteur de hash ; limite par IP.
- L1 : lint des migrations, parité `CONSENT_VERSION`.
- L3 : `resolveAccessRedirect` (table §7.2 complète), `captureActivationFragment` (motif valide et invalide, `replaceState` toujours appelé), `sha256Hex` sur les vecteurs.
- L4 : `canCancel`, `validateDossierForm`.
- L4b : formatage.
- L4c : route admin (null → 403).
- L5 : anti-formes genrées, invariants inchangés.

**Probes (L6, `scripts/rls-probes.mjs`)** : **lecture seule par défaut** ; `PROBE_WRITE=1` (seul nom retenu — revue du 16/09, SF2.5) active les écritures ; refus total de la prod en écriture. Comptes provisionnés par `scripts/provision-v2.mjs` via le vrai parcours : PF-X, PF-Y, famille A (active, avec contenu), famille B (active), compte « sans dossier » (inscrit avec hash valide, sans claim). Familles de sondes :
- tables 2a et storage ;
- RPC internes sans secret ;
- F1 ;
- PF-X contre PF-Y ;
- **PF-X contre le contenu de sa famille A** ;
- A contre B ;
- anonyme contre claim, create, preview ;
- **RPC PF à secret** : `partner_create_dossier` et `partner_rotate_invitation` appelées en direct par un gérant PF authentifié, **sans** `p_secret` → refus `invalid_secret` (preuve du must-fix 1). Le provisionnement et les sondes qui ont besoin d'un dossier réel passent par `POST /api/partner/dossiers` (`PROBE_API_URL`), jamais par la RPC ;
- compte sans dossier → HTTP 403 `DOSSIER_NOT_ACTIVE` sur `/api/letters/quota` et `/api/questionnaire/start` ;
- en mode écriture : hook refusé et accepté.

**E2E (`scripts/e2e-v2.mjs`, L6, API publique)** : création PF → `check` → `signUp` avec hash → `claim` → `record_consents` → `/api/me` (quota 10/10) → envoi papier 202 (clé TEST) → quota 9/10 → liste PF : dossier `active`, aucune clé de contenu → `signUp` non invité refusé.

### 10.3 Go / no-go

| Jalon | Heure | Vert si | Sinon |
|---|---|---|---|
| **GNG1** | **mer. 16/09, fin de U1 — au plus tard 11h** (U1 n'a pas eu lieu mardi soir : retard constaté le 16/09) | CI verte sur `integration/v2-demo` ; préprod 14/14 migrations ; `webhook_config` = `WEBHOOK_RPC_SECRET` ; `/api/health` 200 ; bundle préprod sur `kvtzhyxlqouvpwasedbe` uniquement ; écran Auth → Hooks constaté ; inventaire prod collé ; deploy ID noté. **Pas de smoke papier** (402 garanti avant le pont). | `pre-prod` non poussé ; U2 pousse 2a + v2 ensemble (dry-run recalculé : 12 fichiers) |
| **GNG2** | **mer. 11h45** (gel SQL à 11h, verdict après le rendu de GNG1) | SQL gelé (4 fichiers) ; `db reset --local` + scénarios SQL + hook (acceptés ET refusés) verts ; double revue SQL close ; build vert ; merges L5→L7 et tag `preprod-v2-rc1` posés (Task 39) ; **GNG1 rendu** (vert, ou NO-GO avec dry-run U2 recalculé à 12 fichiers) | U2 pousse `preprod-plancher` sans migration v2 ; v2 reportée à jeudi 9h, sans bêta jeudi |
| **GNG3** | mer. 13h25 | préprod 18/18 ; hook branché (un signup non invité est refusé) ; `/api/me` OK pour PF et famille démo ; quota famille démo 10/10 | Render « Rollback » vers le deploy de U1 ; migrations additives laissées en place |
| **GNG4** | mer. 18h | E2E et probes (lecture, puis écriture) verts sur préprod | isolation rouge → migration corrective en U3, bêta bloquée ; écritures refusées par les permissions → probes et E2E en tête de U3 |
| **GNG5** | mer. 21h15 | répétition chronométrée OK (2 profils, vraie boîte) ; palier atteint écrit ; liste P1 fermée | rc2 conservé, correctifs P1 de nuit, rc3 à 9h |
| **GNG6** (bêta prod) | jeu. 16h30 | (1) GNG5 vert et gel sans rouge ; (2) F1, hook et gate prouvés en préprod ; **et, en prod, preuve datée que l'ordre §11.3 a été tenu — `db push` → backfill → hook ON → un `signUp` non invité refusé (403 `signup_requires_invitation`, capture collée dans la session) → seulement ensuite « Confirm email » décoché** ; (3) inventaire des migrations prod connu et dry-run conforme ; (4) textes bêta validés par Arnaud (CGU, confidentialité, données sensibles, art. 14) ; (5) domaine `RESEND_FROM` vérifié, SMTP custom Auth prod configuré ; (6) procédure d'effacement testée en local, contact support publié ; (7) backfill prod rejoué en local sur un jeu simulé. **Pour ouvrir les dossiers famille** (`PARTNER_ACTIVATIONS_ENABLED=true`) : (8) lettre d'engagement PF art. 28 signée. **Pour ouvrir le papier live** (`PAPER_SENDS_ENABLED=true`, dernier geste) : (9) compte MySendingBox live + moyen de paiement ; (10) DPA art. 28 MySendingBox ; (11) grille tarifaire écrite ; **(12) 2-3 plis de contrôle envoyés par Arnaud depuis son compte MySendingBox LIVE (option (a) ci-dessous), visibles en statut « accepté » ou « imprimé » dans le dashboard MSB — la réception papier est contrôlée après coup sous la surveillance J+1…J+7** ; (13) relecture juridique des corps de courriers ; (14) fenêtre d'annulation MySendingBox réglée. | (1)-(7) rouge → vendredi 9h-11h. (8) rouge → gérants seulement. (9)-(14) rouge → bêta sans papier, flag ouvrable plus tard sans redéploiement |

**Créneaux réels (recalés le 16/09 — U1 n'a pas eu lieu mardi soir)** : les agents travaillent la **nuit du 15 au 16** puis la **journée du 16**.

| Créneau | Quand | Contenu | Jalon |
|---|---|---|---|
| **U1** | mer. 16/09, **au plus tard 11h** | `docs/checklist-push.md` (Auth préprod, inventaire prod, CI, 8 migrations 2a, `webhook_config`, Render, bundle) | GNG1 |
| *(agents)* | nuit du 15 au 16, puis mer. 8h-11h45 | lots L1→L9, merges ordonnés, tag `preprod-v2-rc1`, rejeu local | GNG2 **11h45** |
| **U2** | mer. **12h30-13h25** | push v2 : contrôle E7, dry-run (4 fichiers, ou 12 si GNG1 NO-GO), `db push`, seed partie 1, hook ON, push du code, « Add user » + partie 2 + provisionnement, validation **ton et offre** des textes | GNG3 **13h25** |
| *(agents)* | mer. 13h30-20h | e2e préprod (dont **étape papier, H11**), probes, recette visuelle et captures, correctifs P1, tag rc2 | GNG4 **18h** |
| **U3** | mer. **20h30-21h15** | push rc2 (forme pelée), e2e + probes en écriture si reportés, répétition chronométrée | GNG5 **21h15** |
| **Jeudi** | 9h-9h25 push final (rc3 si retenu) ; **gel dur 10h45** ; **démo 15h** | — | — |
| **U4** | jeu. **16h30-18h30** | promotion prod (`docs/runbook-beta-prod.md`), repli ven. 19/09 9h-11h | GNG6 **16h30** |

**Prérequis hors créneaux** (revue du 16/09, must-fix 5 et SF2.10) — aucun de ces points ne tient dans les 3 h 45 de créneaux d'Arnaud ; chacun a un responsable, une échéance et ce qu'il bloque :

| # | Prérequis | Responsable | Échéance | Bloque |
|---|---|---|---|---|
| P1 | **2-3 plis de contrôle envoyés depuis le compte MySendingBox LIVE** (dashboard MSB ou appel API manuel, vers l'adresse d'Arnaud et celle d'un proche) — **option (a)** retenue | Arnaud | **mer. 16/09 9h** (si l'heure est dépassée : avant U1 ; sinon option (b)) | GNG6 (12), papier live |
| P2 | Compte MySendingBox **live** + moyen de paiement | Arnaud | mer. 16/09 9h (préalable à P1) | GNG6 (9) |
| P3 | **DPA art. 28** MySendingBox signé | Arnaud | mer. 16/09 18h | GNG6 (10) |
| P4 | **Grille tarifaire écrite** (coût par pli, refacturation) | Arnaud | mer. 16/09 18h | GNG6 (11) |
| P5 | Fenêtre d'annulation MSB allongée dans les réglages du compte | Arnaud | jeu. 16h30 (étape 10 de U4) | GNG6 (14) |
| P6 | **Relecture juridique des corps de courriers** (5 modèles papier) | Arnaud / conseil | **jeu. 12h** | GNG6 (13), papier live |
| P7 | **Textes juridiques bêta** relus (CGU, confidentialité, données sensibles, art. 14) — la validation **ton et offre** reste en U2, la relecture juridique est **hors créneau** | Arnaud / conseil | **jeu. 12h** | GNG6 (4), bêta entière |
| P8 | **Lettre d'engagement PF art. 28** signée par la PF pilote | Arnaud + PF | jeu. 16h | GNG6 (8), `PARTNER_ACTIVATIONS_ENABLED` |
| P9 | Domaine `RESEND_FROM` vérifié + SMTP custom Auth (H10) | Arnaud | mer. 16/09, dans U1 | GNG6 (5), invitations |
| P10 | **Boîte de support** relevée (H9, défaut `support@seren-app.fr`) + `SUPPORT_EMAIL` | Arnaud | jeu. 12h | GNG6 (6), 402 et art. 14 |
| P11 | Réglage « Secure email change » lu sur préprod et prod (H19) | Arnaud | U1 (préprod), U4 (prod) | §9.3-1 |
| P12 | **Aucun commit sur `main` jusqu'à U4** (le fast-forward de U4 en dépend, SF2.11) | Arnaud | permanent jusqu'à jeu. 18h30 | étape 6 de U4 |

**Option (b) de repli, décision d'Arnaud** : si P1, P3, P4 ou P6 manque jeudi, le papier live n'ouvre **pas** jeudi — la bêta ouvre sans papier (flag absent) et `PAPER_SENDS_ENABLED=true` est posé **vendredi 19/09** ou **lundi 22/09**, après réception des plis de contrôle, en 1 minute et sans redéploiement.

## 11. Environnements, variables et réglages Auth

### 11.1 Environnements

| Env | Branche | Service | Base Supabase | Qui écrit |
|---|---|---|---|---|
| Local agents | `integration/v2-demo`, `feature/v2-*` | `npm run dev:all` | Supabase **local** (`supabase start`) | agents |
| Préprod | `pre-prod` | `preprod-app.seren-app.fr` (Basic Auth hors `/api`) | `kvtzhyxlqouvpwasedbe` | Arnaud (db push, SQL, Render) ; agents : API publique seulement, comptes `@seren-test.fr` |
| Prod | `main` | `app.seren-app.fr` | `oltwzvfjazwjvghpzhia` | Arnaud uniquement (U4) |

Pushes de migrations depuis des worktrees dédiés (`../push-preprod`, `../push-prod`), liés chacun à un seul project-ref et contrôlés par `cat supabase/.temp/project-ref` et le nombre de fichiers du dry-run (`docs/checklist-push.md`). U2 = **4 fichiers** v2 (A6) **si GNG1 est vert** ; si U1 n'a pas poussé les migrations 2a (GNG1 NO-GO), U2 en pousse **12** — les 8 de `docs/checklist-push.md` §D puis les 4 v2 — et la liste attendue est recalculée avant le `db push` (revue du 16/09, SF2.4). Dans les deux cas, `migration list` doit finir à **18/18**. U4 = inventaire prod + 12 fichiers si la prod est à 6/6.

### 11.2 Variables Render

| Variable | Préprod | Prod bêta (U4) |
|---|---|---|
| `SUPABASE_URL`, `VITE_SUPABASE_URL` | `https://kvtzhyxlqouvpwasedbe.supabase.co` | `https://oltwzvfjazwjvghpzhia.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY` | clé publishable préprod | clé publishable prod |
| `APP_URL` | `https://preprod-app.seren-app.fr` | `https://app.seren-app.fr` |
| `CORS_ORIGIN` | `https://preprod-app.seren-app.fr` | `https://app.seren-app.fr` |
| `SITE_USER`, `SITE_PASSWORD` | définis (Basic Auth) | **absents** |
| `WEBHOOK_RPC_SECRET` | = `webhook_config` préprod | = `webhook_config` prod (ligne insérée en U4) — **valeur obligatoire** : sans elle, la création et le renvoi de dossiers répondent 500 (§4.4) |
| `RESEND_API_KEY`, `RESEND_FROM` | clé + expéditeur du domaine vérifié | idem (seul canal d'activation en prod) |
| `RESEND_WEBHOOK_SECRET` | facultatif | facultatif (canal e-mail fermé) |
| `SUPPORT_EMAIL` | adresse support | adresse support |
| `MYSENDINGBOX_API_KEY` | clé **TEST** | clé **LIVE** (posée avec le dernier geste, si GNG6 (9)-(14)) |
| `MSB_WEBHOOK_URL_SECRET` | `openssl rand -hex 32` | valeur distincte de la préprod |
| `PAPER_SENDS_ENABLED` | `true` | `true` en **dernier geste**, sinon absent |
| `PARTNER_ACTIVATIONS_ENABLED` | `true` | `true` si GNG6 (8), sinon absent |
| `SHOW_ACTIVATION_LINK` | `true` | **absent** |
| `PARTNER_BILLING_PREVIEW` | `true` | **absent** |
| `FEATURE_LLM` | absent | absent |
| `EMAIL_SENDS_ENABLED` | absent | absent |
| `EXTRA_SENDS_ENABLED` | absent | absent |
| `MISTRAL_API_KEY`, `MISTRAL_MODEL` | facultatifs (inertes sans `FEATURE_LLM`) | facultatifs (inertes) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_EXTRA_SEND` | facultatifs (inertes sans `EXTRA_SENDS_ENABLED`) | absents |
| `PAYMENTS_ENABLED`, `STRIPE_PRICE_ID`, `FORFAIT_INCLUDED_SENDS` | **retirés** | **retirés** |
| `SENTRY_DSN`, `VITE_SENTRY_DSN` | facultatifs (projet séparé recommandé) | projets seren-server / seren-app |

Tout changement de `VITE_*` → Manual Deploy « Clear build cache & deploy ». Vérification du bundle : grep du project-ref (checklist U1 §G).

### 11.3 Réglages Supabase Auth

| Réglage | Préprod (U1, hook en U2) | Prod (U4, dans l'ordre du runbook) |
|---|---|---|
| Sign In / Providers → Email → **Confirm email** | décoché | décoché **en dernier, étape (4) ci-dessous** |
| **Allow new users to sign up** | activé (le hook filtre) | activé |
| Anonymous sign-ins, Phone, OAuth | désactivés | désactivés |
| URL Configuration → Site URL | `https://preprod-app.seren-app.fr` | `https://app.seren-app.fr` |
| Redirect URLs | `https://preprod-app.seren-app.fr/**`, `http://localhost:5173/**` | `https://app.seren-app.fr/**` |
| Emails → SMTP Settings | custom Resend (`smtp.resend.com`, 465, user `resend`, domaine vérifié) | idem |
| Rate Limits → e-mails/heure | 30 | 30 |
| Emails → Templates « Reset password » | traduit en FR | traduit en FR |
| Hooks → **Before User Created** | Postgres `public.hook_before_user_created`, activé en **U2** après le db push | activé en U4 à l'**étape (3)** ci-dessous, **avant** l'ouverture aux PF |
| Mot de passe minimum | 8 (aligné sur `PasswordRules`) | 8 |

**Ordre imposé en prod (U4), non négociable** (revue du 16/09) — décocher « Confirm email » avant d'activer le hook ouvrirait, le temps de la manœuvre, l'inscription libre **sans preuve de boîte mail** : ces comptes peuvent écrire les tables owner (§9.3-2) et surtout **occuper des adresses enrôlées ou invitées** (§3.3.3, §9.3-1).
1. `supabase db push` (migrations v2) ;
2. `scripts/backfill-prod-beta.sql` (dossiers `direct` des comptes réels) ;
3. Auth → Hooks → **Before User Created** → ON ;
4. **Preuve** : tenter un `signUp` avec une adresse non invitée → doit être **refusé** (403 `signup_requires_invitation`). Sortie collée dans la session (condition GNG6 (2)) ;
5. **seulement alors** : Sign In / Providers → Email → décocher **Confirm email** ;
6. puis les ouvertures (`PARTNER_ACTIVATIONS_ENABLED`, papier en dernier geste).
Tant que (5) n'est pas fait, l'activation d'une famille exige une confirmation par e-mail : ne pas inviter de famille réelle entre (3) et (5).

Désactivation d'urgence du hook : Auth → Hooks → toggle off (1 clic). L'inscription redevient libre, mais le gate serveur maintient les 403. **Dans ce cas, recocher « Confirm email » dans la foulée** : sans hook *et* sans confirmation, l'inscription est totalement libre.

---

## 12. Hypothèses à vérifier et notes de contrat

### 12.1 Hypothèses à vérifier (propriétaire, moment)

| # | Hypothèse | Vérification | Si fausse |
|---|---|---|---|
| H1 | L'écran Auth → Hooks « Before User Created » est proposé sur les deux projets (la doc Supabase le donne disponible sur Free et Pro) | Arnaud, U1 étape A (préprod) et lecture prod | Bêta glissée ; L10 (policies d'écriture) avancé avant ouverture |
| H2 | `options.data` du `signUp` apparaît dans `event.user.user_metadata` du hook | L1, `hook-scenarios-v2.mjs` en local | Plan B : le hook n'accepte que l'allowlist et l'e-mail invité ; le jeton reste exigé par `claim_dossier` ; pré-occupation documentée |
| H3 | Le hook se déclenche aussi sur « Add user » (Dashboard) | L1 (API admin locale non disponible sans clé secrète : constat en U2) | Sans effet : l'allowlist couvre les deux cas |
| H4 | Un `signUp` sur un e-mail existant renvoie `user_already_exists` (422) avec Confirm email désactivé, sans passer par le hook | L3 et L6 en local | Front : sur toute erreur non 403, tenter `signInWithPassword` |
| H5 | `security definer` owner postgres suffit pour que `supabase_auth_admin` lise `account_enrollments` et `dossiers` malgré la RLS | L1, scénario accepté en local | Ajouter `grant select` + policy `to supabase_auth_admin` (note §12.2) |
| H6 | `db push` accepte `alter function … owner to postgres` et `grant … to supabase_auth_admin` sur le projet hébergé | Arnaud, U2 (dry-run puis push) | Exécuter ces 2 lignes dans le SQL Editor (plan B, consigné) |
| H7 | La préprod est à 14/14 après U1 et la prod à 6/6 (à confirmer par l'inventaire) | Arnaud, U1 étape B | Recalcul des dry-runs U2/U4 |
| H8 | Le navigateur conserve le fragment `#t=` à travers le défi Basic Auth de la préprod | L8, répétition U3 | Démo : lien copiable ouvert après saisie de la Basic Auth ; prod non concernée |
| H9 | Adresse support : `support@seren-app.fr`, boîte existante et relevée | Arnaud, avant GNG6 | Renseigner `SUPPORT_EMAIL` |
| H10 | Domaine `RESEND_FROM` vérifié chez Resend (invitations et SMTP Auth) | Arnaud, U1 | Invitations en `email_sent:false`, démo sur lien copiable ; bêta prod bloquée (GNG6 (5)) |
| H11 | Clé TEST MySendingBox obtenue et multipart accepté (`paper-sender.js`) | **Premier appel réel : étape papier de `scripts/e2e-v2.mjs` sur la préprod juste après GNG3 (mer. ~13h30)** — les agents n'appellent jamais MySendingBox depuis le local (R5). Plan B `buildMultipart` possible **jusqu'à 17h**, avant GNG4 (revue du 16/09, SF2.8) | Plan B `buildMultipart` (double revue, poussé en U3) ; sinon `PAPER_SENDS_ENABLED` absent en démo, PDF + captures |
| H12 | Instance Render préprod sans spin-down (ou warm-up suffisant) | Arnaud, U1 étape B | Health toutes les 5 min dès 14h |
| H13 | `auth.jwt() ->> 'email'` est présent et en minuscules comparables dans le JWT des comptes créés par `signUp` et par « Add user » | L1, scénario claim local | Lire `auth.users.email` par `auth.uid()` dans `claim_dossier` (note §12.2) |
| H14 | La suite réelle compte 484 tests après L0 (constat du commit 4510a61) | L8, gate à chaque merge | Consigner le nombre réel |
| H15 | Aucune route front existante n'appelle directement `supabase.from('dossiers' \| 'partners' \| 'attributions')` hors `usePartnerDashboard` | L3/L4, grep | Réécrire via API |
| H16 | Une PF ne crée pas de dossier pour un décès de plus de 2 ans (borne de `invalid_death_date`) | Arnaud, validation des textes U2 | Élargir la borne par note de contrat avant le gel SQL |
| H17 | Unicité GLOBALE de l'e-mail famille acceptable en bêta (un proche, un dossier) | Arnaud (décision déjà recommandée) | Post-bêta : clôture du dossier précédent |
| H18 | `attributions` préprod ne contient que des comptes de démo (copie `source='demo'` sans effet sur des familles réelles) ; la prod n'a pas de table `attributions` peuplée | Arnaud, inventaire U1 | Supprimer les dossiers `demo` indésirables en SQL avant ouverture |
| H19 | « Secure email change » (double confirmation d'un changement d'adresse) est **actif** sur les projets hébergés préprod et prod, comme en local (constat 16/09 : avec `enable_confirmations=false` et `double_confirm_changes=true`, GoTrue 2.192.0 n'applique pas le changement, il envoie un lien aux deux adresses) | Arnaud, U1 (préprod) et U4 (prod) : Authentication → Sign In / Providers → Email, lire le réglage | Si désactivé : l'activer avant l'ouverture. Sinon, un seul lien part, vers la **nouvelle** adresse — l'occupation reste impossible sans accès à la boîte, mais le squat §9.3-1 devient plus facile à enchaîner |

### 12.2 Notes de contrat

Format : `- [date heure] [lot] section — changement — motif — validé par`.

Notes de la **revue adversariale de sécurité** (contrat figé amendé avant ouverture des branches de lot) :

- [2026-09-16] [revue-sécurité] §3.3.9, §3.3.10, §3.4, §3.5, §4.4, §9.1, §9.3-5 — `p_secret text` devient le 1ᵉʳ paramètre de `partner_create_dossier` et `partner_rotate_invitation`, contrôlé contre `webhook_config` (id 1) avant toute autre étape ; nouveau code `invalid_secret` — sans lui, un gérant PF pouvait appeler ces RPC en direct via PostgREST, **choisir le jeton d'activation**, s'inscrire à la place de la famille (hook satisfait, Confirm email décoché) et prendre son compte, ses 10 envois et tout son contenu : violation directe de la règle rouge (must-fix 1) — validé par Arnaud (à confirmer).
- [2026-09-16] [revue-sécurité] §2.2-1, §3.3.3, §3.4, §9.1 — `link_enrollments` prend des **paires e-mail ↔ UUID** et n'accepte qu'un compte créé après l'enrôlement, jamais connecté, sans changement d'e-mail en attente ; nouveau code `enrollment_account_untrusted`, compteur `untrusted` — la jointure par e-mail promouvait en gérant PF ou admin Seren **tout** compte portant une adresse enrôlée, donc un intrus inscrit entre la partie 1 du seed et le « Add user » d'Arnaud (must-fix 2) — validé par Arnaud (à confirmer).
- [2026-09-16] [revue-sécurité] §2.2-1, §3.3.3 — **arbitrage** : le chemin « `provision-v2.mjs` crée les comptes PF par `signUp` via l'allowlist » (proposé par la revue 2, MF2.2) est **écarté au profit de la sécurité** : un compte issu d'une inscription publique n'est pas fiable et ne sera plus lié. Les comptes gérants et admin sont créés par Arnaud (« Add user »), leur UUID est collé dans la partie 2 du seed, et `provision-v2.mjs` reçoit `PROVISION_*_PASSWORD`. **Le runbook U2 doit être calé là-dessus** — validé par Arnaud (à confirmer).
- [2026-09-16] [revue-sécurité] §11.3, §10.3 GNG6 (2) — ordre imposé en prod : `db push` → backfill → hook ON → preuve du refus d'un `signUp` non invité → seulement ensuite « Confirm email » décoché (SF1.1) — validé par Arnaud (à confirmer).
- [2026-09-16] [revue-sécurité] §9.3-1, §7.3, §12.1 H19 — squat d'adresse par changement d'e-mail documenté, avec le constat local (le changement n'est pas immédiat : confirmation envoyée aux deux adresses) et la procédure support ; vérifié qu'aucun écran de l'app n'ouvre le changement d'e-mail (SF1.2) — validé par Arnaud (à confirmer).
- [2026-09-16] [revue-sécurité] §9.3-8 — oracle `email_unavailable` (unicité globale de l'e-mail famille) documenté avec ses bornes, à trancher avec H17 (SF1.3) — validé par Arnaud (à confirmer).
- [2026-09-16] [revue-sécurité] §3.3.6, §3.3.12, §3.3.13, §9.1 — **décision** (question de revue) : `partners.status = 'terminated'` coupe la lecture (403 `NOT_A_PARTNER`, plus aucune PII famille) ; `'suspended'` conserve la lecture et ne bloque que création et renvoi — validé par Arnaud (à confirmer).

Notes de la **revue adversariale de livraison** (16/09, must-fix MF2.1-MF2.5 et should-fix SF2.4-SF2.11) :

- [2026-09-16] [orchestrateur] §8.1 — **contenu exact du commit L0bis figé** : 3 documents, 5 stubs, 20 lignes d'ancre, §12.2 rempli dans le même commit, gate Task 0.1 / Task 0 Step 1 — sans ce commit, rien de ce que les lots consomment n'existe (`ls` et `grep -c v2:mount` échouent) et les deux plans s'arrêtent à leur Task 0 (MF2.4) — validé par l'orchestrateur.
- [2026-09-16] [orchestrateur] §10.3 — **créneaux recalés** (U1 n'a pas eu lieu mardi soir) : U1 mer. ≤ 11h, GNG1 en fin de U1, GNG2 à 11h45, U2 12h30-13h25, U3 20h30-21h15, jeudi 9h push final, gel 10h45, démo 15h, U4 16h30-18h30 ; les agents travaillent la nuit du 15 au 16 **et** la journée du 16 — validé par l'orchestrateur.
- [2026-09-16] [orchestrateur] §10.3, §1.3 D3 — **papier live, option (a)** : Arnaud envoie lui-même 2-3 plis depuis son compte MySendingBox LIVE (user step daté P1, mer. 9h) ; le critère GNG6 (12) devient « plis acceptés/imprimés visibles dans le dashboard MSB », la réception étant contrôlée après coup (§12 du runbook prod). Tableau **« Prérequis hors créneaux » P1-P12** ajouté, avec responsable, échéance et ce que chacun bloque. Option (b) écrite : papier live ouvert ven. 19/09 ou lun. 22/09 si un prérequis manque (MF2.5) — **décision d'Arnaud attendue sur l'option retenue**.
- [2026-09-16] [L8] `docs/plan-v2-app.md` R10, Tasks 35, 38, 39, 41, 44 — **tout push d'un tag vers une branche utilise la forme pelée** `git push origin 'tag^{commit}:refs/heads/branche'` : la forme `tag:branche` est **rejetée par le serveur** (`trying to write non-commit object`) pour un tag annoté, ce qui aurait fait échouer U2, U3, le push de jeudi 9h et la promotion prod. Les tags restent annotés (`-a`) et sont poussés séparément ; `demo-2026-09-18` est annoté partout (MF2.1) — validé par l'orchestrateur.
- [2026-09-16] [L8] `docs/plan-v2-app.md` 39.8 — **procédure de réintégration du plancher** : si `preprod-plancher` a été poussé sur `pre-prod` (GNG2 NO-GO), tout push ultérieur de rc* serait non-fast-forward ; merge `--no-ff` de `integration/v2-plancher` dans `integration/v2-demo`, gate R3, puis contrôle `git merge-base --is-ancestor origin/pre-prod <tag>^{commit}` **avant** de donner la commande de push à Arnaud (MF2.3) — validé par l'orchestrateur.
- [2026-09-16] [L7] `docs/plan-v2-app.md` Task 35 §2 — **bloc U2 réécrit** avec les commandes exactes, dans la version imposée par le must-fix 2 (comptes internes créés par « Add user », UUID copiés, seed partie 2 par paires, `PROVISION_*_EMAIL` **et** `PROVISION_*_PASSWORD`, `E2E_TARGET=preprod`, `PROBE_SUPABASE_URL`/`KEY`, `PROVISION_API_URL`), liste de fichiers du dry-run conditionnelle (4 si GNG1 vert, **12** si GNG1 NO-GO), contrôle E7 avant le `db push`, avertissement E9 (MF2.2 + SF2.4) — validé par l'orchestrateur.
- [2026-09-16] [L6] §10.2 — **un seul nom pour le mode écriture des probes** : `PROBE_WRITE=1` (le contrat disait `PROBE_READONLY=1`, le runbook U3 `--write`, que le script ignore : les preuves de hook et les sondes d'écriture n'auraient pas tourné en U3) (SF2.5) — validé par l'orchestrateur.
- [2026-09-16] [L7] §8.2 — **`scripts/seed-demo-pf.sql` a un seul propriétaire** : `docs/plan-v2-sql.md` Task 12. La Task 36.2 du plan app est supprimée (deux en-têtes « obsolète v2 » sur la même branche = conflit ou doublon) (SF2.6) — validé par l'orchestrateur.
- [2026-09-16] [orchestrateur] §8.2, §8.3 — **branches scindées entre les deux plans** : `feature/v2-l4c-sql` / `-app`, `feature/v2-l7-sql` / `-app`, `feature/v2-l9-sql` / `-app`, et `feature/v2-l6-e2e` pour la Task 37 du plan app. Motif : les deux plans faisaient `git worktree add … -b` sur la **même** branche et le **même** chemin (le second exécutant échoue), et deux subagents de nuit dans un même worktree se disputent `.git/index.lock`. L'ordre de merge §8.3 devient `L5 → L2a → L2b → L1b → L1 → L4c-sql → L4c-app → L6 → L6-e2e → L3 → L4 → L7-sql → L7-app → L4b`, L9-sql puis L9-app après L7 (SF2.7) — validé par l'orchestrateur.
- [2026-09-16] [L8] §12.1 H11 — **premier appel réel à MySendingBox** : étape papier de l'E2E préprod juste après GNG3 (~13h30), et non un « smoke local de nuit » que la règle R5 interdit ; fenêtre de plan B `buildMultipart` jusqu'à 17h, avant GNG4 (SF2.8) — validé par l'orchestrateur.
- [2026-09-16] [L9] `docs/plan-v2-app.md` Task 44 §1 et §3 — **`webhook_config` prod est LU d'abord** (étape 0) : si une ligne existe (user step de l'envoi de courriers v1), sa valeur est réutilisée dans Render et rien n'est inséré ; sinon génération et insertion à l'étape 4. Sans cela, Render et la base pouvaient diverger et les RPC de webhook devenaient des no-ops silencieux (SF2.9) — validé par l'orchestrateur.
- [2026-09-16] [L8/L7] `docs/plan-v2-app.md` 41.1 et Task 35 §7 — **captures confiées aux agents** (la recette visuelle parcourt déjà les 14 écrans) ; **validation des textes scindée** : ton et offre en U2 (10 min), textes juridiques hors créneau avant GNG6 (P6, P7). Motif : le budget de 3 h 45 d'Arnaud ne tenait pas (SF2.10) — validé par l'orchestrateur.
- [2026-09-16] [orchestrateur] §2.2-1 (b) et (e), §3.3.3 point 5, §12.2.2 E13 — **une seule règle de mot de passe et un seul ordre de provisionnement** dans les trois documents : (1) les comptes internes de **démo et de probes** reçoivent leur mot de passe **à la création** (« Add user », valeur conservée par Arnaud dans son gestionnaire, jamais dans le dépôt ni dans le chat), « Send password recovery » restant la procédure du **gérant de PF réel** en production ; (2) la **partie 2 du seed (`link_enrollments`) précède toute connexion**, donc tout appel à `scripts/provision-v2.mjs`. Motif : le script **se connecte réellement**, ce qui pose `last_sign_in_at` et ferait refuser les comptes (`enrollment_account_untrusted`) — `docs/plan-v2-sql.md` (Task 9 Step 4 et écart E13) prescrivait l'ordre inverse, avec un attendu inatteignable : le lot L6 aurait échoué. La propriété de sécurité de MF1.2 est intacte (un compte « Add user » garde `last_sign_in_at` null même avec un mot de passe posé) et l'aller-retour recovery, qui dépend du SMTP, sort du créneau U2 de 55 min — validé par l'orchestrateur.
- [2026-09-16] [L7/L9] `CLAUDE.md` (Task 36) et `docs/runbook-beta-prod.md` §0 et §7 — **aucun commit sur `main` jusqu'à U4**, et remède écrit si le fast-forward échoue quand même (merge de `origin/main` dans `integration/v2-demo`, gate R3, tag `demo-2026-09-18-prod`, push pelé après accord d'Arnaud) (SF2.11) — validé par l'orchestrateur.

Notes de la **revue adversariale du lot L1/L1b** (16/09, après livraison des migrations) :

- [2026-09-16] [L1] §3.3.10 étape 1bis, §4.4 (ligne *resend*) — **le renvoi d'invitation contrôle désormais le statut du partenaire** : `partners.status <> 'active'` → `partner_inactive`, donc 403 `PARTNER_INACTIVE` côté route. Motif (défaut critique C1) : l'ordre strict du §3.3.10 ne comportait aucun contrôle de statut alors que le §3.3.6 énonce depuis le 16/09 que `'suspended'` bloque « la création **et le renvoi** » et que `'terminated'` retire tout rôle PF. Conséquence du défaut : un gérant **résilié** (donc typiquement pour faute) ou **suspendu** gardait, sur chaque dossier `invited` dont il connaissait l'id, (i) la relecture de la PII famille et défunt renvoyée par la RPC, (ii) l'invalidation du lien d'activation en attente, (iii) l'envoi d'un e-mail à la famille en son nom — la révocation n'existait qu'à l'écran (`my_account()` renvoyait déjà `role='none'`). Aucun changement serveur ni front : `partner_inactive` était déjà mappé (§3.5, `RPC_ERRORS`). Scénarios S3x-S3x3 / S3y-S3y3 — **appliqué par l'exécutant L1, à confirmer par Arnaud**.
- [2026-09-16] [L1] §3.3.11 étape 1 — **l'annulation exclut un partenaire `terminated`** (résolution du partenaire avec `and p.status <> 'terminated'` → `not_a_partner`, 403 `NOT_A_PARTNER` déjà prévu au §4.4). Motif : même défaut C1 côté annulation. Lecture retenue : « contrat résilié = plus aucun rôle PF » (§3.3.6), donc plus aucune écriture sur un dossier de famille, comme il n'y a plus de lecture (§3.3.12/§3.3.13) ; `'suspended'` conserve l'annulation puisque le §3.3.6 ne bloque pour lui que création et renvoi. Portée du défaut plus étroite que pour le renvoi (aucune PII dans le retour : seulement `{id, status, cancelled_at}`, et seuls des dossiers `invited` de moins de 48 h), mais un ex-gérant pouvait encore couper l'activation d'une famille. **Décision produit appliquée par défaut, réversible en une ligne** : si Arnaud préfère laisser l'annulation ouverte à un partenaire résilié, retirer la clause et le scénario S3y2 — **à confirmer par Arnaud**.
- [2026-09-16] [L1b] §9.3-10 — résidu assumé ajouté : `get_transmission_by_code` est appelable en direct via PostgREST (grant `authenticated`), donc le devinage de code n'est pas étranglé par le limiteur Express. Le correctif F1 reste un gain net (l'ancienne policy ouvrait la table entière) ; point de contrôle prod écrit au §9.3 et dans `docs/audit-rls.md` — **appliqué par l'exécutant L1b**.

#### 12.2.1 Notes de plan N1-N16 (`docs/plan-v2-app.md` Task 0.3), décision au 16/09

- [2026-09-16] [L2a] N1 §4.8, §8.2 — `server/lib/sentry-scrub.js` (export `scrubSentryEvent`) ajouté à la propriété L2a — `server/server.js` démarre le serveur à l'import, le test exigé par le contrat n'a rien d'importable sans module dédié — **validée**.
- [2026-09-16] [L3/L5] N2 §7.6, §7.7 — canal e-mail fermé rendu par la clé **existante** `lettersPage.send.notConfigured`, dont L5 réécrit la valeur — respecte la double propriété fichier (L3) / namespace (L5), aucune clé neuve — **validée**.
- [2026-09-16] [L5] N3 §8.2 — `server/lib/letter-templates.js` reste inchangé — le jumeau serveur ne porte pas de champ `notes` et la parité testée ne les couvre pas — **validée**.
- [2026-09-16] [L2a] N4 §1.3 A5 — **10** constructions de routers dans 8 fichiers de tests (et non 8) — `questionnaire-routes.test.ts` en compte 3 — **validée** (constat de code).
- [2026-09-16] [L4b] N5 §8.2 — 1 `import` + 1 ligne JSX dans `PartnerDashboardPage.tsx` à l'ancre `{/* v2:billing-preview */}` — un composant doit être importé pour être rendu — **validée**.
- [2026-09-16] [L4c/L8] N6 §7.1 — `/admin` câblée `ProtectedRoute` seul par L4c ; L8 ajoute `RequireAccess area="admin"` au merge de L3 (39.3) — L4c merge avant L3 ; la route reste gardée côté serveur (403 `NOT_ADMIN`) entre les deux — **validée**.
- [2026-09-16] [L2a] N7 §4.1 — `requireActiveDossier` : `data.consent?.required !== false` → 403 `CONSENT_REQUIRED` — lecture fail-closed d'une réponse `my_account` sans objet `consent` — **validée**.
- [2026-09-16] [L6/L8] N8 §8.2 — `scripts/e2e-v2.mjs` écrit par le plan app (Task 37), commit au nom de L6, **sur la branche `feature/v2-l6-e2e`** (SF2.7) — le plan SQL l'exclut explicitement de son périmètre et GNG4 en dépend — **validée**.
- [2026-09-16] [L9] N9 §8.2 — `docs/runbook-beta-prod.md` reste en L9, conforme au contrat — **validée**.
- [2026-09-16] [L5] N10 §7.6 — la note unique « … joindre l'acte de décès » fait perdre à `assurance-vie-demande` la mention « pièce d'identité, justificatif de qualité de bénéficiaire » — **à trancher par Arnaud** : défaut appliqué = texte du contrat (note unique) ; s'il préfère une note spécifique, c'est un correctif P1 de L5 (1 chaîne, aucune structure changée).
- [2026-09-16] [L2a] N11 §4.2 — `createLettersRouter({ extraSendAvailable })` accepte une fonction (production) ou un booléen (tests), défaut `() => false` — le contrat passe une fonction, les tests existants un booléen — **validée**.
- [2026-09-16] [L2a] N12 §4.2 — `createPaymentsRouter` ne reçoit plus `paymentsEnabled`, `priceId`, `includedSends`, `getPrice` — `server.js` ne lit plus ces variables (forfait abandonné) — **validée**.
- [2026-09-16] [L2a] N13 §4.3 — `server/routes/me.js` importe `readQuota` exporté par `server/routes/letters.js` — « calcul identique à `/quota` » sans dupliquer `BILLABLE_DEBIT_SOURCES` — **validée**.
- [2026-09-16] [L7] N14 §8.2 — `scripts/seed-demo-v2.sql` (parties 1-3) **et** l'en-tête de `scripts/seed-demo-pf.sql` (SF2.6) appartiennent à `docs/plan-v2-sql.md` Task 12 — écritures dans `purchases`, double revue SQL, et un seul propriétaire par fichier — **validée, étendue au seed v0**.
- [2026-09-16] [L2a] N15 §4.1 — `FAIL_CLOSED_GATE` renvoie `msg(lang,'send_error')` y compris sur le questionnaire et le coffre — texte littéral du contrat conservé ; libellé impropre hors courriers, sans impact (état de mauvaise configuration) — **validée**.
- [2026-09-16] [L9] N16 §8.2 — `scripts/backfill-prod-beta.sql` et `scripts/erase-family.sql` écrits par `docs/plan-v2-sql.md` ; le plan app ne livre que `docs/runbook-beta-prod.md` et des contre-épreuves locales — évite deux implémentations concurrentes — **validée**.

#### 12.2.2 Décisions sur les écarts E0-E13 (`docs/plan-v2-sql.md`)

| # | Écart | Décision (2026-09-16) | Conséquence à tenir |
|---|---|---|---|
| E0 | Nom du fichier de lint | **Validée** : le contrat fait foi, `tests/migrations-v2-lint.test.ts` | aucune |
| E1 | Effacement vs `dossiers_identity_check` (date de décès non nulle) | **Validée pour la bêta** : date sentinelle `1900-01-01` — sans elle, l'anonymisation d'un dossier `source='partner'` viole le CHECK ; **à confirmer par Arnaud** (alternative : conserver la vraie date, risque RGPD documenté). Réversible en changeant **une** constante de `scripts/erase-family.sql` | la sentinelle est écrite dans le script, dans `docs/runbook-beta-prod.md` §13 et dans la réponse faite à la personne |
| E2 | Adresse effacée (`family_email` not null + format) | **Validée** : `efface+<dossier_id>@invalid.seren-app.fr` — format accepté par `dossiers_email_check`, sous-domaine sans MX, et le dossier passe `closed` donc sort de l'index d'unicité partiel ; **à confirmer par Arnaud** avec E1 | jamais de renvoi d'invitation sur une adresse `efface+…` |
| E3 | Scénario S11 (`pg_get_functiondef` non comparable) | **Validée** : `md5(prosrc) = 8277ca3955cc35a54f42223295052c28` | si la v0 est un jour modifiée, le hash change et S11 doit être mis à jour sciemment |
| E4 | Harnais local : `psql` absent, privilèges par défaut de la CLI | **Validée** : `docker exec … psql` et `hosted-grants.sql` rejoués après **chaque** `db reset` | déjà porté en §10.1 et en R9 du plan app ; sans cela S12, les probes famille **et** l'E2E local de L3/L8 sont faux |
| E5 | Propriété des scripts de données | **Validée** : backfill et effacement en L9 (contrat §8.2), pas en L7 | = N16 |
| E6 | `included_sends` des dossiers backfillés `source='direct'` | **Validée** : **0**, sans pont `purchases` (D6). **L5 ne doit pas afficher « 10 envois inclus » pour ces comptes** : l'offre est déjà conditionnée par `dossier.included_sends > 0` (plan app Task 3.3) et `QuotaBadge` affiche le total réel (`included_total` = 0) ; le premier envoi renvoie 402 « contactez le support » | **question ouverte pour Arnaud** : offrir 10 envois aux comptes backfillés est un **INSERT `purchases` en U4**, sans aucun changement de code |
| E7 | Copie `attributions` → `dossiers` non défensive | **Validée** : contrôle en lecture **avant** le `db push`, en U1 (checklist §E) **et** en tête de U2 — un e-mail hors format y ferait échouer tout le push | 🛑 STOP si le compte d'e-mails invalides > 0 |
| E8 | `partner_dashboard()` v0 et `anon` en hébergé | **Validée** : la sonde v2 accepte « refusé **ou** `null` » — aucune fuite, la RPC ne renvoie rien à un non-admin | ne pas « corriger » les grants de la v0 (le rollback Render vers U1 doit rester sûr) |
| E9 | `Delete user` bloqué sur un dossier actif | **Validée** : écrit dans les pièges du runbook démo (§6), dans le bloc U2 et dans `docs/runbook-beta-prod.md` §13 — clore le dossier (partie B de `erase-family.sql`) **avant** la suppression | vaut aussi pour les comptes de test de la préprod |
| E10 | Provisionnement des probes par l'API (must-fix 1) | **Validée** : `provision-v2.mjs` et les sondes de hook passent par `POST /api/partner/dossiers` ; `PROVISION_API_URL` / `PROBE_API_URL` obligatoires ; `SHOW_ACTIVATION_LINK=true` (local et préprod **seulement**) | **Task 9 dépend du merge de L2b** et son harnais démarre un serveur Express local (port 3997) : les Tasks 9-11 passent de la nuit à **mer. 8h-11h**, après 39.1. Effet de bord préprod : les invitations partent réellement par Resend vers `rls-probe-*@seren-test.fr` (accepté ; sinon retirer `RESEND_API_KEY` pendant le provisionnement, `email_sent:false` et le dossier est créé quand même) |
| E11 | Variables des probes | **Validée** : `PROBE_USER_A_*` / `PROBE_USER_B_*` conservées (test gelé) ; nouvelles optionnelles `PROBE_PARTNER_Y_*`, `PROBE_NODOSSIER_*`, `PROBE_ADMIN_*`, `PROBE_API_URL`, `PROBE_WRITE` | un seul nom pour l'écriture : `PROBE_WRITE` (SF2.5) |
| E12 | Garde de `provision-v2.mjs` non testée en CI | **Validée** : `tests/provision-v2-guard.test.ts` autorisé et **ajouté à la propriété L6** (§8.2), calqué sur `tests/check-env-target.test.ts` (aucun réseau) | si le temps manque, la garde reste prouvée par commande (Task 9, Step 2) et le test glisse **sans bloquer GNG2** |
| E13 | Comptes internes créés par Arnaud, jamais par un script (must-fix 2) | **Validée** : `link_enrollments(p_pairs)` par appariement e-mail ↔ UUID, `ensureInternal` ne crée plus rien | le runbook U2 est calé sur : partie 1 → « Add user » (mot de passe posé à la création) → copie des UUID → partie 2 → provision → `--verify` |

