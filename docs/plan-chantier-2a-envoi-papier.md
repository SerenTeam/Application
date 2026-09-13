# Chantier 2a — Envoi papier · Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Un utilisateur payant fait partir un vrai courrier simple papier (MySendingBox) depuis une étape de sa roadmap : corps regénéré serveur, acte de décès joint, adresse résolue par l'annuaire, quota débité atomiquement (facturation à l'acte au-delà), statuts suivis (webhook-ping + resynchronisation), kill switch et plafonds.

**Architecture :** Spec amendée `docs/design-chantier-2a-envoi-papier.md` (pré-vol du 13/09 : 7 amendements appliqués, table de mapping figée §M ci-dessous). Branche `feature/chantier-2a` ; **AUCUN merge vers `main`/`pre-prod` avant la levée du gel post-rendu (2026-09-16 au soir minimum)**. Toutes les migrations timestampées **après** `20260913200000` (le mini-dashboard PF est déjà sur la base préprod).

**Tech stack :** Express ESM, Supabase (RLS + RPC `security definer` à secret `webhook_config`), MySendingBox REST direct (PAS le SDK), React 18 + TS, Vitest (base : 199 tests / 19 fichiers).

**Référence patrons existants** (à imiter, pas à réinventer) : adaptateur → `server/lib/email-sender.js` ; RPC à secret → `20260725120000_purchases.sql` ; idempotence/claim → `server/lib/letters-store.js` ; webhook raw-body → montages dans `server/server.js` ; jumeaux testés → `server/lib/letter-channels.js` + `tests/letter-templates.test.ts`.

---

## §M — Table de mapping figée (pré-vol 13/09, doc officielle MySendingBox)

| Événement MySendingBox | Statut `letter_sends` | Note |
|---|---|---|
| *(avant POST)* | `prepared` | interne |
| 201 du `POST /letters` (ou `letter.created`) | `submitted` | `provider_ref` = `_id` |
| `letter.accepted` | `submitted` (no-op) | chaîne d'impression |
| `letter.sent` | `sent` | **final nominal du courrier simple** |
| `letter.wrong_address` | `failed_address` | NPAI, possible APRÈS `sent` (5-10 j) |
| `letter.returned_to_sender` | `failed_address` si `wrong_address: true`, sinon `failed` | sémantique à confirmer sur payloads réels ; ⚠️ arrive APRÈS expédition → transition `sent → failed` autorisée (revue Task 4) |
| `letter.error` | `failed` | |
| `letter.canceled` | `failed` | suite à DELETE Seren uniquement |
| `filing_proof`/`in_transit`/`distributed`/`delivery_proof`/`lost` | *(lot 2c)* | persistés dans `provider_events`, ignorés en 2a |

Prémisses d'appel : `manage_returned_mail: true` OBLIGATOIRE à chaque POST ; header `Idempotency-Key` (UUID v4, par tentative logique) ; `metadata: { seren_send_id }` ; auth Basic (clé API en username, mot de passe vide) ; adresse : lignes ≤ 45 caractères (refuser côté Seren, jamais tronquer) ; PDF : `address_placement: 'insert_blank_page'` (page d'adresse ajoutée par MSB, +1 feuille — le gabarit `first_page` n'est pas documenté, optimisation post-test-réel) ; PJ : `source_file_2..5` (fusion MSB, max 5). MSB n'a pas de champ `status` : l'état se dérive d'un fold sur `events[]` (non ordonnés, dédupliqués par `_id`). Webhook = ping non fiable (pas de signature documentée) : secret d'URL + persist brut + `GET /letters/{id}` avant toute écriture.

---

## Task 1 : Migration profils expéditeur + annuaire

**Files:** Create `supabase/migrations/20260914100000_sender_profiles_organisations.sql`

- [ ] **1.1** Écrire la migration (complète, style du repo — commentaires FR) :

```sql
-- Profil expéditeur persistant (chantier 2a) : consommé par la fusion des courriers
-- et par l'envoi papier (adresse expéditeur). Un profil par compte.
create table if not exists sender_profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  address_line1 text not null check (char_length(address_line1) <= 45),
  address_line2 text check (char_length(address_line2) <= 45),
  postal_code   text not null check (postal_code ~ '^[0-9]{5}$'),
  city          text not null check (char_length(city) <= 45),
  relationship  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table sender_profiles enable row level security;
create policy "own sender profile" on sender_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Annuaire des organismes (chantier 2a) : caisses locales des 4 réseaux + entrées nationales.
-- Lecture pour tout authentifié (données publiques) ; AUCUNE policy d'écriture (seed par migration).
create table if not exists organisations (
  id            text primary key,               -- slug, ex. 'cpam-75'
  name          text not null,
  kind          text not null check (kind in ('caisse_locale','national')),
  network       text check (network in ('caf','cpam','carsat','impots')),
  department    text check (department ~ '^(2A|2B|[0-9]{2,3})$'),
  address_line1 text not null check (char_length(address_line1) <= 45),
  address_line2 text check (char_length(address_line2) <= 45),
  postal_code   text not null check (postal_code ~ '^[0-9]{5}$'),
  city          text not null check (char_length(city) <= 45),
  verified_at   date not null,
  source_url    text,
  created_at    timestamptz not null default now()
);
alter table organisations enable row level security;
create policy "authenticated read organisations" on organisations
  for select using (auth.role() = 'authenticated');
create index if not exists idx_organisations_network_dept on organisations(network, department);
```

- [ ] **1.2** Vérifier : `npx tsc --noEmit` (0 err) ; `npx vitest run` (199/199 — non-régression) ; relecture SQL (rejouable base vierge ET préprod).
- [ ] **1.3** Commit : `git add supabase/migrations/20260914100000_sender_profiles_organisations.sql && git commit -m "feat(2a): tables sender_profiles + organisations (RLS, lignes d'adresse ≤45)"`

## Task 2 : Import annuaire DILA → seed

**Files:** Create `scripts/import-organisations.mjs`, Create `supabase/migrations/20260914110000_organisations_seed.sql` (généré)

- [ ] **2.1** Script Node (fetch natif, zéro dépendance) contre **l'Annuaire de l'administration (DILA, licence ouverte)** — API `https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/records` (dataset officiel ; EXPLORER l'API réelle d'abord : pivots exacts des types CAF/CPAM/CARSAT/SIP, pagination). Extraire par réseau × département : nom, adresse postale (couper proprement à 45 char : si une ligne dépasse, basculer le surplus en `address_line2`, sinon REJETER l'entrée avec un warning), CP, ville. Générer la migration seed : en-tête commentaire (date, source, compte par réseau) + `insert into organisations ... on conflict (id) do nothing;`. Slug : `<network>-<department>`. **Si l'API s'avère inutilisable** (schéma incompatible), STOP et rapporter BLOCKED avec ce qui a été tenté — pas de données inventées.
- [ ] **2.2** Garde-fous dans le script : compte attendu par réseau ≥ 90 départements sinon exit 1 ; validation regex CP/département ; sortie déterministe (tri par slug) pour des diffs propres.
- [ ] **2.3** Exécuter le script → migration générée ; vérifier : `grep -c "insert into organisations" | wc` cohérent (~360-404), spot-check manuel de 3 entrées (CPAM 75, CAF 33, SIP 69) contre lannuaire.service-public.fr.
- [ ] **2.4** `npx vitest run` (non-régression) ; commit script + migration : `feat(2a): annuaire organisations — import DILA (4 réseaux × départements, seed versionné)`

> **Note post-revue (Task 2, 2026-09-13) :** import DILA livré — 321 lignes (caf 100, cpam 99, impots/SIP 102, carsat 20). Deux réalités du terrain actées : (1) **CARSAT = 20 caisses régionales** (`department = null`, slug par région) — la résolution `network+department` de la Task 9 ne s'applique pas à elles ; décision : en 2a, le panneau (Task 11) propose pour la CARSAT un **choix parmi les 20 caisses par nom de région** (l'utilisateur connaît sa région — aucun mapping inventé). (2) **SIP : une adresse représentative par département** (le 69 en compte 10) — mitigé par l'adresse toujours éditable (spec §7) ; granularité plus fine = amélioration produit ultérieure.

## Task 3 : Question « département du défunt »

**Files:** Modify `server/lib/questions-catalog.js`, `src/types/questionnaire.ts`, `tests/invariants.test.ts:14` (allowlist `IDENTITY_FIELDS`), tests moteur/catalogue concernés ; Create `server/lib/departments.js` (liste 01→976, labels FR=EN « 75 — Paris »)

- [ ] **3.1** TDD : test invariants d'abord — ajouter `deceased_department` à `IDENTITY_FIELDS` (`tests/invariants.test.ts:14`) et un test « la question departement existe, type select, 101+ options, jamais transmise au rédacteur » (vérifier contre `writerContext()` dans `server/routes/questionnaire.js:35-42` : le champ NE doit PAS y apparaître — test négatif).
- [ ] **3.2** Implémenter : question `deceased_department` (type `select`, bloc identité, options depuis `server/lib/departments.js`, textes `{fr,en}`) ; champ optionnel dans `QuestionnaireAnswersV2` (`deceased_department?: string`) ; les vieux dossiers sans département : le panneau d'envoi le demandera (Task 9), aucune migration de données.
- [ ] **3.3** `npx vitest run` → suite verte (nouveaux tests inclus) ; `npx tsc --noEmit`. Commit : `feat(2a): question département du défunt — donnée d'adressage, exclue du rédacteur (invariants à jour)`

> **Note post-revue (Task 3, 2026-09-13) :** question insérée en `order: 5` (fin du bloc identité), 16 questions au total, 201 tests. **Découverte importante** : un `select` entre dans `CLOSED_TYPES` → sans garde, le libellé du département aurait été écho-transmis au rédacteur Mistral via `derniereReponse` (violation directe de la spec). Correctif : `WRITER_EXCLUDED_IDS = ['deceased_department']` dans la route `/answer` + test négatif PII qui reproduit la fuite (rouge avant correctif, vérifié). Toute future question de données de type fermé DOIT être ajoutée à cette liste.

## Task 4 : Migration cycle papier + débits + durcissement RLS

**Files:** Create `supabase/migrations/20260914120000_letter_sends_papier.sql`

- [ ] **4.1** Migration (les blocs, dans cet ordre) :
  1. `alter table purchases add column if not exists kind text not null default 'forfait' check (kind in ('forfait','envoi_sup'));`
  2. `letter_sends` : `add column resend_of uuid references letter_sends(id)`, `add column attachment_ids jsonb`, `add column cost_cents integer` ; **CHECK statuts remplacé** par l'union discriminée : email = `sending/sent/delivered/failed` ; papier = `prepared/submitted/sent/delivered/failed/failed_address` (un seul CHECK sur l'union des valeurs ; la discrimination par canal vit dans la RPC de transitions).
  3. **Suppression de la policy `FOR ALL` utilisateur** de letter_sends → recréer uniquement le SELECT owner. (⚠️ casse `createSend`/`claimRetry`/`markSendResult` côté store — la Task 5 les rebranche sur RPC DANS LE MÊME merge ; les deux tasks sont commitées séparément mais la suite de tests n'est exigée verte qu'après la Task 5 — noter ce point dans les messages de commit.)
  4. RPC (toutes `security definer` + secret `webhook_config` vérifié en base, patron `purchases`) : `create_letter_send(...)` (INSERT avec dedup — formule papier : sha256 de `user|template|adresse normalisée|coalesce(resend_of,'')` — préserver le retour `duplicate`), `claim_letter_retry(...)` (claim atomique, fenêtre stale paramétrée), `mark_letter_result(...)`, et `update_letter_send_status(...)` **réécrite** : transitions forward-only par canal — email : sending→sent→delivered, tout→failed ; papier : prepared→submitted→sent, sent→failed_address (autorisée !), prepared/submitted→failed/failed_address, `delivered` accepté seulement depuis sent+canal lrar (préparé pour le 2c, inatteignable en 2a).
  5. `send_debits` (`send_id` uuid PK ref letter_sends, `user_id`, `source` check `('included','extra')`, `created_at`) — RLS activée, SELECT owner (le compteur front lit ses débits), zéro écriture directe.
  6. RPC `consume_send(p_send_id, p_user_id, …)` : dans UNE transaction — solde = Σ `included_sends` des `purchases` `status='paid'` du user − count(`send_debits`) ; si `resend_of` de l'envoi pointe un original débité en `failed_address` ET sans autre re-envoi gratuit → INSERT débit « offert » marqueur (source `included`, mais SKIP du contrôle de solde) protégé par **index unique partiel** `on letter_sends(resend_of) where resend_of is not null` ; sinon si solde ≤ 0 → raise `quota_exhausted` ; sinon INSERT (`on conflict (send_id) do nothing`). `release_debit(p_send_id)` : DELETE compensatoire (appelé sur échec de soumission provider).
  7. `provider_events` (`id` text PK — `_id` MSB, `send_id` uuid, `event_type` text, `payload` jsonb, `received_at`, `processed_at` nullable) — RLS activée, aucune policy (serveur via RPC `record_provider_event` à secret).
  8. `send_limits` (table de config 1 ligne : `max_user_daily` int default 10, `max_global_daily` int default 50) + fonction `check_send_limits(p_user_id)` (compte les letter_sends papier des 24 h) — modifiable sans redéploiement (spec §5).
- [ ] **4.2** Relecture SQL complète (matrice de transitions écrite en commentaire dans la migration) ; `npx tsc --noEmit`. Commit : `feat(2a): migration cycle papier — statuts, débits atomiques, resend_of, provider_events, plafonds, RLS lecture seule (⚠️ store rebranché en Task 5)`

> **Note post-revue (Task 4, 2026-09-13) :** migration livrée (788 l.) — matrice de transitions en fonction pivot unique, verrou `pg_advisory_xact_lock(20260914, hashtext(user_id))` (sérialise sans dépendre d'une ligne purchases existante), drop du CHECK par boucle DO (pas de pari sur le nom). **Écarts actés** : (1) `send_debits.source` gagne `'offert'` (le marqueur `included` du plan aurait consommé un crédit — bug de plan corrigé) ; (2) `sending→delivered` email conservé (héritage v1, Resend peut livrer avant sent) ; (3) plafonds vérifiés AUSSI dans `create_letter_send` ; (4) `purchases.kind` n'a AUCUN écrivain — voir l'injection Task 9. ⚠️ Opérationnel : ne JAMAIS pousser cette migration sur une base dont le serveur tourne le store pré-Task 5. **Re-revue (52453e7 + drops de convergence) : APPROUVÉE** — 6/6 correctifs fermés à la racine, zéro régression. Vigilances aval héritées : **Task 7** — le fold n'émet `failed` depuis `sent` QUE sur `returned_to_sender` sans `wrong_address` (jamais sur un `letter.error` tardif) ; **Task 5** — alerte Sentry sur rafale d'`invalid_secret` (le patron secret reste un oracle lent par nature) ; **lots 2b/2c** — tout futur écrivain sortant une ligne de `failed` doit gérer `unique_violation` sur `letter_sends_resend_of_uniq`.

## Task 5 : Store letters → RPC (refactor + tests)

**Files:** Modify `server/lib/letters-store.js`, `server/lib/purchases-store.js` (filtre `kind='forfait'` dans `getPaidPurchase` — amendement AM-2), Test `tests/letters-store.test.ts`, `tests/letters-routes.test.ts` (adaptations mocks)

- [ ] **5.1** TDD : adapter les tests du store aux nouveaux appels RPC (mock `client.rpc(...)`) — écrire d'abord, voir échouer. **Contrats Task 4 (faire foi)** : `create_letter_send` → `{duplicate, send}` ; `claim_letter_retry` → ligne jsonb ou null (jamais depuis `failed_address`) ; `mark_letter_result` → `{send, transition_applied}` (🔧 correctifs revue : déballer `.send` ; `transition_applied=false` = course webhook, métadonnées écrites quand même) ; `consume_send` → `{debited, already_debited, source, free_resend, balance_after}` ; `release_debit(p_secret, p_send_id, p_user_id)` → boolean (🔧 3 args — TOUJOURS passer `p_user_id` ; `false` = rien libéré, pas une erreur) ; `record_provider_event`/`mark_provider_event_processed` → boolean ; `check_send_limits` → `'ok'|'user_daily_exceeded'|'global_daily_exceeded'`. Exceptions nommées à traduire : `invalid_secret`, `send_not_found`, `invalid_initial_status`, `invalid_resend_of`, `resend_already_exists`, `quota_exhausted`, `user_daily_exceeded`, `global_daily_exceeded` ; transition refusée = retour `false`, pas d'exception.
- [ ] **5.2** `createSend`/`claimRetry`/`markSendResult` basculés sur les RPC de la Task 4 (mêmes retours qu'avant : `duplicate`, claim booléen, etc. — les routes ne changent PAS). `getPaidPurchase` filtre `kind = 'forfait'`. Ajouter `consumeSend`/`releaseDebit`/`recordProviderEvent` au store.
- [ ] **5.3** `npx vitest run` → **suite complète verte** (y compris tests chantier 1 gate — vérifier qu'un purchase `envoi_sup` seul ne passe pas le gate : nouveau test). Commit : `feat(2a): store letters via RPC uniquement + gate forfait-only — statuts infalsifiables`

## Task 6 : Coffre minimal (attachments + Storage)

**Files:** Create `supabase/migrations/20260914130000_attachments.sql` (table + bucket `documents` privé + policies storage par préfixe `user_id/`), Create `server/routes/attachments.js` (POST multipart via `multer` memoryStorage — NOUVELLE DÉPENDANCE actée, limite 5 Mo ; GET liste ; DELETE), Create `server/lib/mime-sniff.js` (magic bytes : `%PDF-`, `FFD8FF`, `89504E47` — refus sinon), Modify `server/server.js` (montage), Test `tests/attachments-routes.test.ts` (supertest, client Supabase mocké : upload OK/refusé par type/taille, isolation user)

> Note : migration livrée sous `20260914160000_attachments.sql` (et non `…130000` — sans conséquence, l'ordre tient).

- [ ] **6.1** TDD routes (mocks storage) → **6.2** implémentation (upload au client `getSupabaseClient(token)` — la RLS storage s'applique ; URLs signées 300 s générées serveur, jamais stockées) → **6.3** suite verte + tsc → **6.4** commit `feat(2a): coffre minimal — bucket privé, magic bytes, RLS par préfixe`

> **Note post-revue (Tasks 5+6, 2026-09-13) :** approuvées après correctifs (revue combinée). Vigilances héritées : **Task 7** — les PJ peuvent être JPEG/PNG (photos de l'acte au téléphone, choix acté) or MySendingBox attend des PDF → l'adaptateur (ou la préparation d'envoi) **convertit les images en page PDF** (jspdf `addImage`, ajusté A4) avant `source_file_2..5` ; le fold n'émet `failed` depuis `sent` que sur `returned_to_sender` sans `wrong_address`. **Task 9** — dériver `hasPaid` de `getPaidPurchase` (forfait-only) dans `/api/payments/status` et non de `getLatestPurchase` (sinon un achat à l'acte ferait afficher « payé/1 inclus ») ; URLs signées des PJ générées ICI (déplacé de la Task 6, choix documenté). **Runbook/USER STEPS** — si `db push` échoue en `42501 must be owner of table objects` sur les policies storage : les créer via le dashboard Storage (plan B) ; symptôme d'un secret RPC désynchronisé côté webhook email : statuts figés en `sending` (no-op silencieux).

## Task 7 : Adaptateur MySendingBox + PDF postal

**Files:** Create `server/lib/paper-sender.js`, Create `server/lib/msb-status.js` (fold `events[]` → statut Seren, table §M), Modify `server/lib/letter-pdf.js` (option destinataire/expéditeur en première page du CORPS — la page d'adresse est déléguée à MSB via `insert_blank_page`), Test `tests/paper-sender.test.ts`, `tests/msb-status.test.ts`

- [ ] **7.1** TDD : `msb-status` (fold : événements mélangés/dupliqués → statut correct, cas §M un par un, y compris `wrong_address` après `sent`) et `paper-sender` (simulateur injecté : contrat `send({ pdfBuffer, attachments, recipient, sender, metadata }) → { providerRef, status: 'submitted' }` ; `throw 'paper_not_configured'` sans `MYSENDINGBOX_API_KEY` ; refus adresse > 45 char ; Idempotency-Key UUID v4 stable par tentative logique ; `manage_returned_mail: true` et `address_placement: 'insert_blank_page'` TOUJOURS présents dans le corps — tests d'assertion sur le payload).
- [ ] **7.2** Implémentation REST (fetch natif, Basic Auth clé-en-username, `POST /letters`, PJ en `source_file_2..5` max 5) + `getLetter(providerRef)` pour la resync. **7.3** suite verte + tsc. **7.4** commit `feat(2a): adaptateur MySendingBox (REST, simulateur, no-op sans clé) + fold statuts`

> **Note post-revue (Task 7, 2026-09-13) :** première livraison avait deviné le transport (base64/champs plats) — corrigée contre l'étude documentaire du pré-vol : objets `to`/`from` imbriqués (`address_postalcode`…), `source_file_type: 'file'` en multipart, `print_sender_address: true`, corps isolé en 2 fonctions pures (`buildLetterPayload`/`buildMultipart`). Restent « à confirmer au test réel » (2-3 courriers du user step final) : la notation crochets des parts multipart (alternative : champ `to` en JSON stringifié) et, si le multipart est refusé, le plan B `source_file_type: 'remote'` + URLs signées (une fonction à changer). Leçon de process : transmettre l'INTÉGRALITÉ des fiches du pré-vol aux implémenteurs concernés, pas seulement la synthèse.

## Task 8 : Templates côté serveur (regénération du corps)

**Files:** Create `server/lib/letter-templates.js` (jumeau serveur : id, corps FR, variables, canal, `recipient_kind` : `network:caf|cpam|carsat|impots` / `user_specific` / `portail`), Test `tests/letter-templates-server.test.ts` (**parité stricte** id/canal/variables avec `src/data/letter-templates.ts`, patron du test letter-channels existant), Create `server/lib/letter-render.js` (fusion variables → corps, `missingVariables` — miroir de la logique `useLetterGenerator`)

- [ ] **8.1** TDD parité + rendu (variables manquantes → erreur listée, jamais de `{{...}}` résiduel dans un corps rendu — test). **8.2** Implémentation. **8.3** Suite verte. **8.4** Commit `feat(2a): templates jumeaux serveur + regénération du corps (fin du corps libre client)`

## Task 9 : Route d'envoi papier

**Files:** Modify `server/routes/letters.js` (branche `channel='papier'` de POST /send : gate → profil expéditeur requis (400 `sender_profile_required`) → résolution adresse (organisations si `recipient_kind` réseau + `deceased_department`, sinon adresse fournie validée ≤45) → corps regénéré (Task 8, refus si variables manquantes) → PDF + PJ → **kill switch `PAPER_SENDS_ENABLED` ≠ 'true' → 503 `paper_disabled`** → plafonds (`check_send_limits` → 429 + `Sentry.captureException`) → `create_letter_send` → `consume_send` (catch `quota_exhausted` → 402 + offre extra) → `paperSender.send()` (échec → `release_debit` + `mark_letter_result failed`) → 202) ; Create route GET `/api/letters/quota` (solde + débits pour le compteur front) ; Modify `server/routes/payments.js` + migration complémentaire `20260914150000_purchases_kind_writer.sql` (Checkout `envoi_sup` : exige forfait payé — 403 sinon ; `STRIPE_PRICE_ID_EXTRA_SEND` ; webhook → purchases `kind='envoi_sup'`, `included_sends=1`. ⚠️ Règles Task 4 : ajouter `p_kind text default 'forfait'` à `create_pending_purchase` ET `mark_purchase_paid` ; **ne JAMAIS réécrire `kind` sur la branche `on conflict do update`** (un appelant ancien rétrograderait un envoi_sup en forfait → gate ouvert au prix d'un timbre) ; jamais d'écriture paid-puis-kind en deux temps. Et catcher `user_daily_exceeded`/`global_daily_exceeded` remontés par `create_letter_send`, pas seulement par `check_send_limits`) ; Tests `tests/letters-routes.test.ts` + `tests/payments-routes.test.ts` (chaque garde → un test : gate, kill switch OFF par défaut, plafonds, quota épuisé → 402, échec provider → débit libéré, NPAI resend gratuit unique)

- [ ] **9.1** TDD la matrice de gardes (ordre exact ci-dessus) → **9.2** implémentation → **9.3** suite verte + boot check (`PORT=3999`, POST sans kill switch → 503) → **9.4** commit `feat(2a): route envoi papier — gate, quota atomique, facturation à l'acte, kill switch, plafonds`

## Task 10 : Webhook provider + resynchronisation

**Files:** Modify `server/server.js` (montage `express.raw` sur `/api/letters/provider-webhook/:secret` AVANT le json global — patron des 2 webhooks existants), Create `server/routes/provider-webhook.js` (vérif secret d'URL `MSB_WEBHOOK_URL_SECRET` temps-constant → persist brut via `record_provider_event` (idempotent par `_id`) → ACK 200 → traitement asynchrone : `GET /letters/{id}` authentifié → fold `msb-status` → RPC transition ; JAMAIS d'écriture depuis le payload seul) (⚠️ décision actée : la resynchronisation est un **timer serveur** (`setInterval` 6 h dans `server.js`, désarmé sans `MYSENDINGBOX_API_KEY`) — PAS de job pg_cron ni de pg_net : le fetch HTTP vit côté serveur, zéro migration supplémentaire), Test `tests/provider-webhook.test.ts` (secret faux → 404 muet ; événement dupliqué → un seul traitement ; statut écrit UNIQUEMENT après GET simulé)

- [ ] **10.1** TDD → **10.2** implémentation (timer resync : envois `submitted` > 24 h, `sent` ≤ J+30, **et `prepared` avec `provider_ref` non nul** — cas du serveur mort entre le POST provider et l'enregistrement du résultat, revue Task 4 — via `getLetter` + fold + RPC) → **10.3** suite verte, boot check → **10.4** commit `feat(2a): webhook-ping MSB (persist+verify-by-GET) + resynchronisation périodique serveur`

## Task 11 : Front — panneau d'envoi papier

**Files:** Modify `src/components/letter/LetterSendPanel.tsx` (branche papier : profil expéditeur inline (GET/PUT `sender_profiles` via supabase client), adresse destinataire pré-résolue/éditable, sélection PJ (upload → Task 6 routes), compteur quota (GET /api/letters/quota) + bouton « Acheter un envoi » → Checkout extra, statuts papier — ⚠️ wording : `sent` = « Expédié » état final heureux du courrier simple, JAMAIS « distribué » ; `failed_address` → parcours de rattrapage « corriger l'adresse et renvoyer (offert) ») ; Modify `src/data/letter-templates.ts` + `server/lib/letter-channels.js` (requalification : les 5 `lre` → `papier` — le test de parité Task 8 verrouille) ; Modify `src/i18n/strings.{fr,en}.ts` (bloc `paperSend.*`) ; demande du département à la volée si dossier ancien (persisté dans le questionnaire) ; Tests : parité canaux, tsc (parité i18n), suite verte, `npm run build`

- [ ] **11.1** Requalification canaux + test → **11.2** panneau (TDD là où testable, sinon build+tsc) → **11.3** suite verte + build → **11.4** commit `feat(2a): panneau envoi papier — profil, adresse, PJ, quota, à-l'acte, wording sent-final (FR/EN)`

## Task 12 : CLAUDE.md + vérification globale (APRÈS la levée du gel)

- [ ] CLAUDE.md : env (`MYSENDINGBOX_API_KEY`, `MSB_WEBHOOK_URL_SECRET`, `PAPER_SENDS_ENABLED`, `STRIPE_PRICE_ID_EXTRA_SEND`), état chantier 2a, architecture §Backend. Vérif globale : tsc + suite + boot + greps. Merge : `feature/chantier-2a` → `pre-prod` (validation préprod) puis `main` — **jamais avant la fin du gel du rendu**.

## USER STEPS (Arnaud — récapitulés)

1. Compte MySendingBox → clé **test** (`.env` + Render préprod) — débloque l'E2E, pas le code.
2. Tarif Stripe « envoi supplémentaire » (test) → `STRIPE_PRICE_ID_EXTRA_SEND`.
3. `supabase db push` préprod des migrations 2a (après merge pre-prod, post-gel).
4. Webhook MSB déclaré au dashboard (URL avec secret) — post-clé.
5. Avant tout envoi réel : grille tarifaire + DPA + 2-3 courriers réels (valident `sent`/`wrong_address`/`returned_to_sender` réels + gabarit) + relecture juridique des corps + `PAPER_SENDS_ENABLED=true` en dernier.

## Hors scope (rappel)

Écran groupé + relances J+15 + unification statuts démarche (2b) ; LRAR/AR probant (2c) ; antivirus/rétention (chantier 3) ; `first_page` (optimisation post-test réel).
