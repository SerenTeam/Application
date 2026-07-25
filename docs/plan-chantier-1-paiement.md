# Chantier 1 — Paiement forfait (Stripe) · Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Exécuter le chantier 1 de la roadmap technique — Stripe Checkout one-shot, webhook signé idempotent, table `purchases` verrouillée en écriture, gating serveur réutilisable, paywall UI bilingue. Clôt le point d'attention **T1**.

**Architecture :** Spec validée dans `docs/design-chantier-1-paiement.md` (décisions D1–D4 actées par Arnaud le 25/07). Le chantier est une **construction neuve** : le paiement contournable (`?payment=success` + lien Stripe test en dur) vivait dans `src/pages/DemoPage.tsx`, supprimée au chantier 0 (`3c60a24`) — rien à démonter. Session **cloud** : travail sur la branche `claude/chantier-1-roadmap-lcbe7n`, **PR** à la fin qu'Arnaud merge lui-même (pas de merge local).

**Tech stack :** Express/Node ≥22 (serveur JS), React 18 + Vite + TS, Vitest + supertest, Supabase (RLS + RPC `security definer`), `stripe@22.3.2` (SDK Node officiel, nouvelle dépendance).

**Référence état initial :** 157 tests verts (15 fichiers). `server/server.js` = 268 lignes. Aucune occurrence de `stripe`/`payment` dans `src/` ni `server/`.

**Invariants à ne jamais casser :**
1. **Aucun montant en dur** nulle part (D3) — ni code, ni dictionnaire, ni test d'UI.
2. **`purchases` n'accepte aucune écriture utilisateur** — pas de policy `insert`/`update`, jamais.
3. **Aucun paramètre d'URL ne débloque quoi que ce soit** — la seule source de vérité est le webhook.
4. **`PAYMENTS_ENABLED` gouverne la vente ET le gate d'un seul geste** — les deux moitiés ne se dissocient pas.
5. **Jamais de 500 sur un webhook à signature valide** ; jamais de payload dans les logs.

**USER STEPS bloquants** — voir la section finale. Aucun n'est requis pour **écrire** le code : l'exécution complète (tasks 0 → 7) se fait sans compte Stripe et sans écriture BDD distante, tests inclus (SDK injecté, signatures calculées localement). Ils conditionnent la mise en service, pas le développement.

---

## Task 0 : Dépendance Stripe

**Files:**
- Modify: `package.json`, `package-lock.json`

- [x] **Step 0.1 :** Vérifier la branche — `git -C /home/user/Application status` → propre, sur `claude/chantier-1-roadmap-lcbe7n`.

- [x] **Step 0.2 :** `npm install stripe@22.3.2 --save-exact` (les dépendances du projet sont épinglées sans `^` pour les libs applicatives). Vérifier : `"stripe": "22.3.2"` dans `dependencies`.

- [x] **Step 0.3 : Commit** —

```bash
git add package.json package-lock.json
git commit -m "chore(chantier-1): dépendance stripe (SDK Node officiel)"
```

---

## Task 1 : Migration `purchases` + RPC d'écriture

Réalise la spec § 3. **La migration n'est pas appliquée par l'agent** — `supabase db push` est un USER STEP d'Arnaud (règle du chantier 0). L'agent la versionne et la relit.

Points de conception à respecter dans le SQL :
- RLS **lecture seule** : une seule policy, `for select`. Aucune policy d'écriture — c'est ce qui rend T1 irreproductible (la clé publishable est publique ; sans ça, un utilisateur écrirait `status = 'paid'` via PostgREST avec son propre token).
- Le secret partagé **réutilise** `webhook_config` (déjà déployé, déjà renseigné) : même frontière de confiance, un USER STEP de moins.
- **Idempotence portée par la base** : les gardes de transition rendent tout rejeu neutre (0 ligne modifiée), sans table d'événements traités à maintenir.

**Files:**
- Create: `supabase/migrations/20260725120000_purchases.sql`

- [x] **Step 1.1 :** Créer la migration :

```sql
-- Achats du forfait Seren (Stripe Checkout one-shot — chantier 1).
-- Écriture INTERDITE aux utilisateurs : la table n'a QU'UNE policy, en lecture. Toutes les
-- mutations passent par les RPC security definer ci-dessous, protégées par le secret partagé
-- webhook_config (même dispositif que update_letter_send_status). Motif : la clé publishable
-- est publique côté front — avec une policy d'insertion/mise à jour, n'importe quel
-- utilisateur s'octroierait `status = 'paid'` en appelant PostgREST avec son propre token,
-- reproduisant exactement la faille T1 (paiement contournable) qu'on ferme ici.
create table if not exists purchases (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  status                text not null default 'pending'
                          check (status in ('pending','paid','refunded','expired')),
  amount_total          integer,          -- centimes, tels que facturés par Stripe
  currency              text,
  stripe_session_id     text not null unique,
  stripe_payment_intent text,
  included_sends        integer not null default 0,   -- quota figé à l'achat (chantier 2)
  paid_at               timestamptz,
  refunded_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
alter table purchases enable row level security;
create policy "own purchases read" on purchases
  for select using (auth.uid() = user_id);
create index if not exists purchases_user_idx on purchases (user_id);
create index if not exists purchases_payment_intent_idx on purchases (stripe_payment_intent);

-- Ligne d'attente créée au moment où la session Checkout est ouverte. `on conflict do nothing` :
-- un double clic sur « payer » ne crée jamais deux lignes pour la même session.
create or replace function create_pending_purchase(
  p_secret text, p_user_id uuid, p_session_id text, p_included_sends integer
) returns void language sql security definer set search_path = public as $$
  insert into purchases (user_id, status, stripe_session_id, included_sends)
  select p_user_id, 'pending', p_session_id, coalesce(p_included_sends, 0)
   where exists (select 1 from webhook_config where id = 1 and rpc_secret = p_secret)
  on conflict (stripe_session_id) do nothing;
$$;

-- Encaissement confirmé. UPSERT délibéré : Stripe peut livrer le webhook AVANT que la route
-- Checkout ait fini d'écrire sa ligne `pending` (course réelle, l'ordre n'est pas garanti) —
-- l'achat est alors créé directement en `paid`, jamais perdu.
-- Idempotence : la garde `where purchases.status = 'pending'` sur le DO UPDATE fait qu'un
-- rejeu du même événement modifie 0 ligne, et qu'un `completed` relivré après un
-- remboursement ne ressuscite jamais l'accès.
create or replace function mark_purchase_paid(
  p_secret text, p_session_id text, p_user_id uuid, p_payment_intent text,
  p_amount_total integer, p_currency text, p_included_sends integer
) returns void language sql security definer set search_path = public as $$
  insert into purchases (user_id, status, stripe_session_id, stripe_payment_intent,
                         amount_total, currency, included_sends, paid_at)
  select p_user_id, 'paid', p_session_id, p_payment_intent,
         p_amount_total, p_currency, coalesce(p_included_sends, 0), now()
   where exists (select 1 from webhook_config where id = 1 and rpc_secret = p_secret)
  on conflict (stripe_session_id) do update
     set status                = 'paid',
         stripe_payment_intent = coalesce(excluded.stripe_payment_intent, purchases.stripe_payment_intent),
         amount_total          = coalesce(excluded.amount_total, purchases.amount_total),
         currency              = coalesce(excluded.currency, purchases.currency),
         paid_at               = coalesce(purchases.paid_at, now()),
         updated_at            = now()
   where purchases.status = 'pending';
$$;

-- Remboursement (D4 : geste fait depuis le Dashboard Stripe, l'accès se referme seul).
-- `status = 'paid'` seul : un rejeu ne réécrit pas refunded_at.
create or replace function mark_purchase_refunded(p_secret text, p_payment_intent text)
returns void language sql security definer set search_path = public as $$
  update purchases
     set status = 'refunded', refunded_at = now(), updated_at = now()
   where stripe_payment_intent = p_payment_intent
     and status = 'paid'
     and exists (select 1 from webhook_config where id = 1 and rpc_secret = p_secret);
$$;

-- Session abandonnée ou expirée : la ligne d'attente ne reste pas `pending` indéfiniment.
create or replace function expire_purchase(p_secret text, p_session_id text)
returns void language sql security definer set search_path = public as $$
  update purchases
     set status = 'expired', updated_at = now()
   where stripe_session_id = p_session_id
     and status = 'pending'
     and exists (select 1 from webhook_config where id = 1 and rpc_secret = p_secret);
$$;

revoke all on function create_pending_purchase   from public;
revoke all on function mark_purchase_paid        from public;
revoke all on function mark_purchase_refunded    from public;
revoke all on function expire_purchase           from public;
grant execute on function create_pending_purchase   to anon, authenticated;
grant execute on function mark_purchase_paid        to anon, authenticated;
grant execute on function mark_purchase_refunded    to anon, authenticated;
grant execute on function expire_purchase           to anon, authenticated;
```

- [x] **Step 1.2 :** Relire la migration contre les invariants : aucune policy autre que `select` ; les 4 RPC portent toutes la clause `exists (... webhook_config ...)` ; toutes les transitions sont gardées.

- [x] **Step 1.3 : Commit** — `git commit -m "feat(chantier-1): migration purchases — RLS lecture seule + 4 RPC security definer idempotentes"`

---

## Task 2 : Store `purchases`

Miroir de `server/lib/letters-store.js` : lectures avec le client **utilisateur** (RLS), écritures via RPC avec le client public.

**Files:**
- Create: `server/lib/purchases-store.js`

- [x] **Step 2.1 :** Créer le store avec ces fonctions :

| Fonction | Client | Rôle |
| --- | --- | --- |
| `getPaidPurchase(client, userId)` | utilisateur | Dernier achat `status = 'paid'` (le gate n'a besoin de rien d'autre). `null` si aucun. |
| `getLatestPurchase(client, userId)` | utilisateur | Dernier achat quel que soit le statut — alimente l'écran « confirmation en cours ». |
| `createPending(client, { userId, sessionId, includedSends })` | public | RPC `create_pending_purchase` |
| `markPaid(client, { sessionId, userId, paymentIntent, amountTotal, currency, includedSends })` | public | RPC `mark_purchase_paid` |
| `markRefunded(client, paymentIntent)` | public | RPC `mark_purchase_refunded` |
| `expire(client, sessionId)` | public | RPC `expire_purchase` |

Contraintes, reprises telles quelles de `letters-store.js` :
- Les quatre fonctions RPC lisent `process.env.WEBHOOK_RPC_SECRET` et **lèvent avant tout appel réseau** s'il est absent (message explicite, sans payload).
- Aucune erreur ne transporte de donnée du payload Stripe.
- Un helper privé `rpc(client, name, params)` factorise « secret manquant → throw » + « erreur PostgREST → throw » plutôt que de répéter le bloc quatre fois.

- [x] **Step 2.2 : Commit** — `git commit -m "feat(chantier-1): store purchases — lectures RLS, écritures par RPC"`

---

## Task 3 : Client Stripe + routes `/api/payments`

**Files:**
- Create: `server/lib/stripe-client.js`, `server/routes/payments.js`
- Modify: `server/server.js`, `server/lib/messages.js`

- [x] **Step 3.1 : `server/lib/stripe-client.js`** — instanciation **paresseuse**, exactement comme le client Resend (`server.js:145`) : sans `STRIPE_SECRET_KEY`, l'export vaut `null` et la feature est inerte au lieu de faire planter le démarrage. Expose aussi `getPrice()` : `prices.retrieve(STRIPE_PRICE_ID)` avec cache mémoire TTL 10 min, renvoyant `{ amount_total, currency }` ou `null` si Stripe est injoignable (jamais d'exception propagée — l'UI doit dégrader, pas casser).

- [x] **Step 3.2 : `server/routes/payments.js`** — factory `createPaymentsRouter({ requireAuth, store, stripe, publicClient, paymentsEnabled, priceId, includedSends, appUrl })`, sur le modèle de `createLettersRouter`. Toutes les dépendances injectées : les tests n'ouvrent aucune connexion.

**`POST /checkout`** (`requireAuth` + `createUserRateLimiter({ max: 10, windowMs: 60*60*1000 })`) :
1. `paymentsEnabled` faux **ou** `stripe` null **ou** `priceId` absent → **503** `payments_disabled`.
2. Achat `paid` déjà présent → **200** `{ already_purchased: true }` (on ne fait pas repayer quelqu'un).
3. `stripe.checkout.sessions.create({ mode: 'payment', line_items: [{ price: priceId, quantity: 1 }], success_url: \`${appUrl}/dashboard?checkout=success\`, cancel_url: \`${appUrl}/dashboard?checkout=cancel\`, client_reference_id: req.user.id, customer_email: req.user.email, metadata: { user_id: req.user.id, included_sends: String(includedSends) } })`.
   `included_sends` voyage **dans les metadata** et non lu depuis l'env au moment du webhook : le quota est ainsi figé à l'instant de l'achat, même si l'offre change entre le clic et l'encaissement.
4. `store.createPending(...)` puis **200** `{ url: session.url }`.
5. Échec Stripe → **502** `checkout_failed` + `Sentry.captureException`.

**`GET /status`** (`requireAuth`) → `{ payments_enabled, purchase, price }`. `purchase` = `getLatestPurchase` réduit à `{ status, paid_at, included_sends }` (aucun identifiant Stripe renvoyé au client — inutile côté UI, autant ne pas l'exposer). `price` = `getPrice()` ou `null`.

**`POST /webhook`** — publique, `express.raw({ type: 'application/json' })` en middleware de route :
1. `STRIPE_WEBHOOK_SECRET` absent → **503**.
2. `stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret)` ; exception → **401** `invalid_signature`. **C'est la seule preuve de véracité** — rien d'autre dans la requête n'est cru.
3. Aiguillage :

| Événement | Action |
| --- | --- |
| `checkout.session.completed` **et** `payment_status === 'paid'` | `markPaid` |
| `checkout.session.async_payment_succeeded` | `markPaid` |
| `checkout.session.async_payment_failed`, `checkout.session.expired` | `expire` |
| `charge.refunded` | `markRefunded(payment_intent)` |
| autre | 200 silencieux, log du **seul type** d'événement |

   `user_id` provient de `metadata.user_id` (repli `client_reference_id`) : posé par notre propre serveur à la création de la session et rapporté sous signature vérifiée — donc digne de confiance. Absent → log + 200 (ne jamais faire boucler Stripe sur une donnée qu'on ne peut pas réparer).
4. Toute erreur de traitement → log + `Sentry.captureException` + **200** quand même. Aucun contenu de payload dans les logs (PII payeur).

- [x] **Step 3.3 : Clés dans `server/lib/messages.js`** — section « Paiement (server/routes/payments.js) », **FR et EN, mêmes clés** : `payments_disabled`, `checkout_failed`, `purchase_required`, `payments_status_error`.

- [x] **Step 3.4 : Montage dans `server/server.js`** — deux points de vigilance :
  1. `app.use('/api/payments/webhook', express.raw({ type: 'application/json' }))` **avant** `app.use(express.json())` (ligne 84), à côté du montage Resend existant (ligne 83) et pour la même raison, déjà documentée là-bas : body-parser marque `req._body` après son premier passage et tout parseur suivant laisse `req.body` intact — un JSON reparsé ne permet plus de vérifier une signature octet-exacte.
  2. Le router se monte **après** la déclaration de `const supabase` (ligne 40) dont il reçoit `publicClient`, comme `createLettersRouter`.

  Lecture des variables : `paymentsEnabled: process.env.PAYMENTS_ENABLED === 'true'` (**défaut faux**, D2 — toute autre valeur ferme la vente), `priceId: process.env.STRIPE_PRICE_ID`, `includedSends: Number(process.env.FORFAIT_INCLUDED_SENDS ?? 5)`, `appUrl: process.env.APP_URL || 'http://localhost:5173'`.

- [x] **Step 3.5 : Commit** — `git commit -m "feat(chantier-1): routes /api/payments — checkout, status, webhook signé"`

---

## Task 4 : Gating serveur

**Files:**
- Create: `server/lib/require-purchase.js`
- Modify: `server/server.js`, `server/routes/letters.js`

- [x] **Step 4.1 : `createRequirePurchase({ store, paymentsEnabled })`** → middleware monté **après** `requireAuth` (il dépend de `req.user` et `req.supabaseClient`) :
  - `paymentsEnabled` faux → `next()` immédiat. **C'est le comportement actuel à l'identique** : tant que la vente est fermée, rien ne change pour personne (D2, invariant 4).
  - Sinon `store.getPaidPurchase(req.supabaseClient, req.user.id)` ; absent → **402** `{ success: false, error: msg(lang, 'purchase_required'), code: 'PURCHASE_REQUIRED' }`.
  - Erreur de lecture → **500** + Sentry (ne **jamais** laisser passer sur erreur : un incident BDD ne doit pas ouvrir le gate).

- [x] **Step 4.2 :** Injecter dans `createLettersRouter` (nouveau paramètre `requirePurchase`, avec un défaut « passe-plat » pour ne pas casser les tests existants qui construisent le router sans lui) et le monter sur `POST /send` : `router.post('/send', requireAuth, requirePurchase, sendLimiter, ...)`. Ordre voulu : on ne consomme pas de quota de rate limiting pour une requête qui sera refusée en 402.

- [x] **Step 4.3 :** Câbler dans `server/server.js` et **vérifier** que `GET /api/letters` (liste) **n'est pas** gaté — consulter l'historique de ses propres envois reste accessible même après remboursement.

- [x] **Step 4.4 : Commit** — `git commit -m "feat(chantier-1): gating serveur — 402 sur l'envoi sans achat, inerte vente fermée"`

---

## Task 5 : Tests serveur

Vitest + supertest, **zéro réseau, zéro secret réel**. Le SDK Stripe est un objet injecté (`{ checkout: { sessions: { create } }, webhooks: { constructEvent }, prices: { retrieve } }`), le store est un fake fidèle aux gardes SQL de la Task 1 — même méthode que `tests/letters-webhook.test.ts`, dont le fake store reproduit les transitions de la RPC réelle.

**Files:**
- Create: `tests/payments-routes.test.ts`, `tests/payments-webhook.test.ts`, `tests/purchase-gate.test.ts`

- [x] **Step 5.1 : `payments-routes.test.ts`** — 401 sans token ; **503** vente fermée (et **aucune** session Stripe créée : `create` non appelé) ; vente ouverte → session créée + ligne `pending` + `url` renvoyée ; achat déjà `paid` → `already_purchased`, pas de seconde session ; `/status` renvoie le prix lu depuis Stripe et **`price: null`** quand Stripe échoue (la route reste 200) ; le rate limiter coupe au 11ᵉ appel.

- [x] **Step 5.2 : `payments-webhook.test.ts`** — signature invalide → **401** ; type inconnu → **200** sans écriture ; `checkout.session.completed` → `paid` ; **rejeu du même événement → 0 changement** ; `completed` reçu **avant** la ligne `pending` → achat créé en `paid` ; `charge.refunded` → `refunded` ; `completed` relivré **après** un remboursement → reste `refunded` ; échec du store → **200** malgré tout (invariant 5) ; `expired` → `expired`.

- [x] **Step 5.3 : `purchase-gate.test.ts`** — `POST /api/letters/send` : passe vente fermée ; **402** vente ouverte sans achat ; passe avec achat `paid` ; **402** après remboursement ; **500** (et non un passage) si la lecture échoue ; `GET /api/letters` jamais gaté.

- [x] **Step 5.4 :** `npx vitest run` → **157 tests existants toujours verts** + les nouveaux. `npx tsc --noEmit` → 0 erreur.

- [x] **Step 5.5 : Commit** — `git commit -m "test(chantier-1): routes paiement, webhook idempotent, gating"`

---

## Task 6 : Frontend — paywall et retour de Checkout

**Files:**
- Create: `src/hooks/usePayments.ts`
- Modify: `src/components/letter/LetterSendPanel.tsx`, `src/pages/DashboardPage.tsx`, `src/i18n/strings.fr.ts`, `src/i18n/strings.en.ts`

- [x] **Step 6.1 : `usePayments()`** — appelle `GET /api/payments/status` via `apiFetch`, expose `{ loading, paymentsEnabled, purchase, price, refresh }`. Helper de formatage du montant à partir de `{ amount_total, currency }` **et de la langue courante** (`Intl.NumberFormat`) — jamais de montant écrit à la main (invariant 1).

- [x] **Step 6.2 : `LetterSendPanel`** — si `paymentsEnabled && purchase?.status !== 'paid'`, remplacer le bloc d'envoi par l'appel à l'action : titre, montant formaté (masqué si `price` est `null`), bouton qui `POST /api/payments/checkout` puis `window.location.href = url`. Tout le reste du courrier (aperçu, variables, copie, PDF) **reste intact** — D1. Vente fermée → composant strictement inchangé.

- [x] **Step 6.3 : `DashboardPage`** — lire `?checkout=` :
  - `success` → bandeau « paiement en cours de confirmation », `refresh()` toutes les 2 s, **10 tentatives maximum** puis message « la confirmation peut prendre une minute » (jamais de boucle infinie) ; passage à `paid` → bandeau de confirmation. **Le paramètre d'URL ne débloque rien par lui-même** (invariant 3) : il ne fait qu'afficher un état d'attente, la vérité vient de `/status` qui lit la base.
  - `cancel` → retour silencieux, aucun message culpabilisant (P11 de la roadmap produit : achat en période de vulnérabilité, zéro dark pattern).
  - Dans les deux cas, nettoyer le paramètre de l'URL (`navigate(pathname, { replace: true })`).

- [x] **Step 6.4 : Chaînes FR + EN** sous une clé `payments` dans les deux dictionnaires (parité garantie par tsc). Design system : bleu `#006BFA` seule couleur d'action, tokens du `@theme`, pilules et cartes arrondies — **jamais de hex en dur**.

- [x] **Step 6.5 :** `npx tsc --noEmit` + `npm run build` → OK.

- [x] **Step 6.6 : Commit** — `git commit -m "feat(chantier-1): paywall envoi + retour de Checkout, FR/EN"`

---

## Task 7 : Docs, vérification globale, PR

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `docs/plan-chantier-1-paiement.md`

- [x] **Step 7.1 : `CLAUDE.md`** — ajouter aux « Variables d'environnement » : `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `PAYMENTS_ENABLED` (défaut **faux** — la vente ne s'ouvre qu'explicitement), `FORFAIT_INCLUDED_SENDS`, `APP_URL` ; noter que `WEBHOOK_RPC_SECRET` sert désormais **aussi** aux RPC de paiement. Mettre à jour « Workflow & état du projet » (chantier 1 livré, vente fermée en attente de la relecture juridique) et l'architecture (`server/routes/payments.js`).

- [x] **Step 7.2 : `README.md`** — mentionner le paiement dans les fonctionnalités et l'architecture serveur.

- [x] **Step 7.3 : Vérification globale** —

```bash
cd /home/user/Application
npx tsc --noEmit
VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_dummy npx vitest run
npm run build
grep -rnE "149|99 ?€|payment=success" src/ server/ --include="*.ts" --include="*.tsx" --include="*.js"
```

Attendu : tsc 0 erreur ; 157 tests existants + nouveaux, tous verts ; build OK ; **dernière commande sans aucun résultat** (invariants 1 et 3 : ni montant en dur, ni déblocage par URL).

- [x] **Step 7.4 :** Cocher les steps de ce plan, y consigner chaque « note post-revue ».

- [x] **Step 7.5 : Push + PR** —

```bash
git push -u origin claude/chantier-1-roadmap-lcbe7n
```

Puis PR vers `main` (titre : `Chantier 1 — Paiement forfait (Stripe)`), corps listant : périmètre, décisions D1–D4, les USER STEPS ci-dessous, et la mention explicite que **la vente reste fermée** (`PAYMENTS_ENABLED` non défini) tant que la relecture juridique du catalogue n'est pas faite. **Arnaud merge lui-même.**

---

## USER STEPS (Arnaud)

Aucun n'est nécessaire pour exécuter les tasks 0 → 7. Ils conditionnent la **mise en service**.

| # | Étape | Quand |
| --- | --- | --- |
| 1 | Compte Stripe : produit + tarif one-shot → `STRIPE_PRICE_ID` | avant tout test bout-en-bout |
| 2 | Clés API **test** → `STRIPE_SECRET_KEY` | idem |
| 3 | Endpoint webhook `https://<préprod>/api/payments/webhook` déclaré côté Stripe → `STRIPE_WEBHOOK_SECRET` | idem |
| 4 | `supabase db push` de `20260725120000_purchases.sql` (**préprod d'abord**, prod ensuite) | après merge |
| 5 | Variables sur Render préprod, `PAYMENTS_ENABLED=true` + clés de test → **E2E réel** (achat carte test `4242…`, vérif `paid` en base, envoi débloqué, remboursement depuis le Dashboard → accès refermé) | après merge |
| 6 | Prod : mêmes variables **sauf** `PAYMENTS_ENABLED`, laissé **non défini** | après merge |
| 7 | Relecture juridique du catalogue (P1, déjà en attente) + CGU/CGV et rétractation relues, acceptation configurée côté Stripe | **avant** d'ouvrir la vente |
| 8 | Ouverture de la vente : `PAYMENTS_ENABLED=true` en prod + bascule sur les clés Stripe **live** | quand 7 est fait et le chantier 2 livré |

---

## Notes post-revue (exécution du 2026-07-25)

Écarts entre le plan et ce qui a été livré — tous assumés, aucun ne touche aux invariants.

1. **Tasks 3 et 4 commitées ensemble.** Le câblage du gate dans `server/server.js` référence
   `createRequirePurchase` : séparer les deux commits aurait produit un commit intermédiaire au
   serveur cassé. Un seul commit `feat(chantier-1): routes /api/payments + gating serveur`.
2. **`tests/helpers/purchases-fake.ts` ajouté** (absent de la liste de fichiers du plan) : les
   trois suites ont besoin du même faux store, et le dupliquer trois fois aurait fait diverger
   la reproduction des gardes SQL — c'est précisément ce que les tests d'idempotence vérifient.
   Non collecté par Vitest (`include: tests/**/*.test.ts`).
3. **Cache au niveau du module dans `usePayments`** (non prévu). `LetterSendPanel` est monté une
   fois par courrier : sans cache, chaque courrier affiché aurait déclenché sa propre requête
   `/status`, et le bloc d'envoi aurait clignoté à chaque montage. Purgé sur `SIGNED_IN` /
   `SIGNED_OUT` (`resetPaymentsCache`, appelé depuis `useAuth`) pour ne jamais montrer l'état
   d'un compte à un autre.
4. **Le retour anticipé du paywall est placé après tous les hooks** de `LetterSendPanel` :
   première rédaction fautive (il sautait le `useCallback` de `handleSend` — violation des
   règles des hooks), corrigée avant le commit.
5. **`CheckoutReturnBanner` extrait en composant** (`src/components/payments/`) au lieu d'être
   inline dans `DashboardPage`, déjà à 389 lignes.
6. **Step 7.3, commande de vérification affinée.** Le `grep` du plan remonte aussi les
   commentaires qui *citent* la faille (« ?payment=success », « le fake-door 99/149/199 ») :
   attendu, ce sont des explications, pas du code. Les seules occurrences retenues comme
   légitimes en code sont la construction de `success_url` dans `server/routes/payments.js`.
   Vérifié : aucun montant en dur, aucun déblocage par URL.

---

## Hors scope (rappel spec § 8)

Décompte du quota d'envois (chantier 2) · Stripe Tax, facturation, TVA (dépend du statut juridique, non tranché) · écran et rôle admin · attribution partenaire au checkout (chantier 4) · événement d'achat PostHog, relances de panier, codes promo.
