# Design — Chantier 1 · Paiement forfait (Stripe)

Source : doc « Seren — Roadmap Technique » v1.0, § Chantier 1 (Google Drive, source de vérité unique),
lue en regard de la « Roadmap Produit » v1.0 § 2 (offre & pricing) et § Phase 1.
Clôt le point d'attention **T1** (paiement contournable). Spec écrite le 2026-07-25.

---

## 1. État des lieux vérifié (2026-07-25)

**T1 est déjà neutralisé — il n'y a rien à remplacer.** La roadmap décrit « l'implémentation
actuelle (lien de test en dur, succès détecté par `?payment=success`) » comme à remplacer
intégralement. Vérification faite : ce code vivait dans `src/pages/DemoPage.tsx`, supprimée au
chantier 0 (commit `3c60a24`, 688 lignes retirées). Le repo ne contient aujourd'hui **aucun**
code de paiement — ni route, ni table, ni dépendance. Le chantier 1 est donc une construction
neuve, sans dette à démonter et sans fenêtre où les deux implémentations coexistent.

Ce qui existe et cadre le chantier :

- **Une seule route « qui agit »** : `POST /api/letters/send` (canal email v1, Resend). L'envoi
  papier/LRAR est le chantier 2, le coffre documents le chantier 3 — le gating doit donc être
  écrit une fois et extensible, pas taillé pour une seule route.
- **Aucune surface admin, aucun rôle admin** dans l'app (d'où la décision D4 ci-dessous).
- **Les patterns nécessaires sont déjà en place** et seront suivis à la lettre :
  | Besoin | Précédent à répliquer |
  | --- | --- |
  | Webhook signé à corps brut | `server/routes/letters.js` (webhook Resend) + montage `express.raw()` **avant** `express.json()` — `server/server.js:83` |
  | Écriture en base sans token utilisateur | RPC `security definer` + secret partagé `webhook_config` — `supabase/migrations/20260716120000_letter_sends.sql` |
  | Router testable sans réseau | Factory à dépendances injectées (`createLettersRouter`) |
  | Messages d'erreur bilingues | Clés dans `server/lib/messages.js` (`msg(lang, key)`) |
  | Plafond par utilisateur | `server/lib/rate-limit.js` (`createUserRateLimiter`) |
  | Test de webhook signé, sans secret réel | `tests/letters-webhook.test.ts` |

---

## 2. Décisions actées (Arnaud, 2026-07-25)

| # | Décision | Portée |
| --- | --- | --- |
| **D1** | **Paywall sur l'action seule.** Gratuit : questionnaire, roadmap, contenu des étapes, aperçu **et** téléchargement PDF des courriers. Payant : l'envoi, et tout ce qui arrivera aux chantiers 2 et 3. | « Le payant démarre quand Seren agit à sa place » (roadmap produit § 2) |
| **D2** | **Infra livrée, vente fermée par défaut.** Un flag serveur `PAYMENTS_ENABLED` ouvre la vente. Motif : P1 « relecture juridique des 50 étapes » est bloquant avant tout lancement payant (USER STEP toujours en attente), et la promesse qui justifie le prix (envoi réel) arrive au chantier 2. | Ouvrir la vente = basculer une variable, pas un chantier |
| **D3** | **Prix piloté par Stripe.** Un seul `STRIPE_PRICE_ID` en variable d'env ; le montant et la devise affichés sont **lus depuis Stripe**. Aucun montant en dur, nulle part. | Le fake-door 99/149/199 se fait sans commit ; l'UI ne peut pas diverger du montant débité |
| **D4** | **Remboursement depuis le Dashboard Stripe.** Le webhook `charge.refunded` repasse l'achat en `refunded` et l'accès se referme seul. Aucun écran ni rôle admin créé. | Zéro surface d'attaque ajoutée |

Décisions techniques prises dans la foulée (pas de consultation nécessaire) :

- **Quota d'envois figé à l'achat** : colonne `included_sends`, valeur issue de l'env au moment
  du paiement. Elle n'est consommée par rien avant le chantier 2, mais la figer à l'achat évite
  une migration plus tard et garantit qu'un changement d'offre ne modifie pas les achats passés.
- **Réutilisation du secret RPC existant** (`webhook_config.rpc_secret` / `WEBHOOK_RPC_SECRET`)
  plutôt qu'un second secret. Il protège exactement la même frontière — « seul notre serveur
  Express appelle ces RPC », face à PostgREST qui expose toute fonction du schéma `public` à
  quiconque détient la clé publishable. Un USER STEP de moins, même périmètre de confiance.
- **Aucune clé Stripe côté client.** Le front ne parle jamais à Stripe : il reçoit une URL de
  Checkout hébergé et redirige. Donc pas de `VITE_STRIPE_*`, donc pas de prise avec T14
  (variables `VITE_*` figées au build).

---

## 3. Modèle de données

Nouvelle table `purchases` — migration versionnée, appliquée par Arnaud (USER STEP).

```sql
create table purchases (
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
```

**RLS : lecture seule, sans exception.** Une unique policy `for select using (auth.uid() = user_id)`.
**Aucune policy `insert` ni `update`** — c'est le cœur du dispositif : la clé publishable est
publique côté front, un utilisateur peut donc appeler PostgREST directement avec son propre
token. Sans cette restriction, il s'auto-octroierait l'accès en écrivant `status = 'paid'`, et on
aurait reproduit T1 sous une autre forme. Toutes les écritures passent par des RPC
`security definer` protégées par le secret partagé, sur le modèle exact de
`update_letter_send_status` :

- `create_pending_purchase(p_secret, p_user_id, p_session_id, p_included_sends)`
- `mark_purchase_paid(p_secret, p_session_id, p_payment_intent, p_amount_total, p_currency)` —
  **upsert** : si le webhook arrive avant que la route Checkout ait écrit la ligne `pending`
  (course possible, Stripe est rapide), la ligne est créée directement en `paid`.
- `mark_purchase_refunded(p_secret, p_payment_intent)`
- `expire_purchase(p_secret, p_session_id)`

**Idempotence par transitions avant-only**, même discipline que les statuts d'envoi : `paid` ne
s'obtient que depuis `pending` (ou par insertion), `refunded` que depuis `paid`, `expired` que
depuis `pending`. Rejouer un événement Stripe modifie **0 ligne**, silencieusement — l'exigence
« rejouer un événement ne crée pas deux achats » de la roadmap est portée par la base, pas par
une table d'événements traités à maintenir. Le `unique` sur `stripe_session_id` ferme le reste.

---

## 4. Flux

### 4.1 Achat

1. `POST /api/payments/checkout` (`requireAuth`, plafonné par utilisateur) crée une session
   Stripe Checkout `mode: 'payment'` : `client_reference_id` et `metadata.user_id` = l'utilisateur,
   `success_url` / `cancel_url` vers l'app. Écrit la ligne `pending`, renvoie `{ url }`.
   Si `PAYMENTS_ENABLED` est faux → **503** (`payments_disabled`), la session n'est jamais créée.
2. Le front redirige vers l'URL Stripe. Le paiement se déroule **entièrement chez Stripe**.
3. Retour sur `/dashboard?checkout=success`. **Ce paramètre ne débloque rien** — c'était
   précisément la faille T1. L'écran affiche « paiement en cours de confirmation » et interroge
   `GET /api/payments/status`, qui lit la base. La seule source de vérité est le webhook.
4. `POST /api/payments/webhook` — route **publique**, corps brut, signature vérifiée par
   `stripe.webhooks.constructEvent` avec `STRIPE_WEBHOOK_SECRET`. Événements traités :

   | Événement | Effet |
   | --- | --- |
   | `checkout.session.completed` (si `payment_status === 'paid'`) | → `paid` |
   | `checkout.session.async_payment_succeeded` | → `paid` (moyens différés type SEPA) |
   | `checkout.session.async_payment_failed`, `checkout.session.expired` | → `expired` |
   | `charge.refunded` | → `refunded` (accès refermé, D4) |
   | tout le reste | ignoré, **200 silencieux** |

   Signature invalide → **401**. Signature valide mais traitement en échec → on logue, on capture
   dans Sentry et on **acquitte quand même en 200** : jamais de 500 sur un webhook signé, sinon
   Stripe réessaie en boucle. Aucun contenu de payload dans les logs (PII payeur).

### 4.2 Gating (D1)

Middleware `requirePurchase`, monté **après** `requireAuth` sur `POST /api/letters/send`, et
réutilisable tel quel par les chantiers 2 et 3. Il lit `purchases` avec le token utilisateur
(la policy `select` suffit — pas de contournement de RLS côté serveur) et exige un achat `paid`.
Refus → **402 Payment Required**, clé `purchase_required`.

**Le flag `PAYMENTS_ENABLED` gouverne la vente et le gate d'un seul geste** — point de
conception le plus important de ce chantier. Flag faux (défaut) : `/checkout` renvoie 503 **et**
le gate laisse passer, c'est-à-dire exactement le comportement actuel, zéro régression pour les
utilisateurs existants. Flag vrai : la vente s'ouvre **et** le gate se ferme. Les deux ne peuvent
pas se désynchroniser : dissocier les deux moitiés produirait soit un mur infranchissable (gate
fermé sans possibilité d'acheter), soit un trou (vente ouverte, gate ouvert). Les deux états sont
couverts par les tests, et la préprod tourne flag vrai + clés Stripe de test.

### 4.3 Prix affiché (D3)

`GET /api/payments/status` renvoie `{ payments_enabled, purchase, price }`, où `price` est lu
depuis Stripe (`prices.retrieve(STRIPE_PRICE_ID)`) et gardé en cache mémoire (TTL 10 min) pour ne
pas appeler Stripe à chaque affichage. Stripe injoignable → `price: null`, l'UI affiche l'appel à
l'action sans montant plutôt que de casser la page ou d'inventer un chiffre.

---

## 5. Frontend

- `LetterSendPanel` : si la vente est ouverte et l'achat absent, le bloc d'envoi laisse place à
  l'appel à l'action « débloquer l'envoi » (montant lu depuis l'API). Le reste du courrier —
  aperçu, variables, copie, PDF — **reste intégralement accessible** (D1).
- Retour de Checkout sur le dashboard : état « confirmation en cours » + interrogation du statut,
  puis confirmation. Annulation → retour silencieux, aucun message culpabilisant (P11 de la
  roadmap produit : achat en période de vulnérabilité, zéro dark pattern).
- Chaînes UI dans `strings.fr.ts` / `strings.en.ts` uniquement (parité garantie par tsc), design
  system existant (bleu #006BFA seule couleur d'action, tokens du `@theme`, jamais de hex en dur).

---

## 6. Vérification

Tests Vitest + supertest, **sans réseau ni secret réel** — le SDK Stripe est injecté en
dépendance comme `emailSender` l'est déjà, et les signatures de test sont calculées localement
(reprise de la mécanique de `tests/letters-webhook.test.ts`) :

- checkout : 401 sans token ; 503 flag faux ; session créée + ligne `pending` flag vrai ;
- gate : `/api/letters/send` passe flag faux ; **402** flag vrai sans achat ; passe avec achat
  `paid` ; **402** de nouveau après `refunded` ;
- webhook : signature invalide → 401 ; événement inconnu → 200 silencieux ; `completed` → `paid` ;
  **rejeu du même événement → aucun changement** ; `charge.refunded` → `refunded` ; webhook
  arrivé avant la ligne `pending` → achat créé quand même ;
- RLS : l'utilisateur lit ses achats, jamais ceux d'un autre, et **n'écrit rien** (le test
  d'isolation rejoint les tests RLS automatisés demandés par le chantier transverse).

Plus : `npx tsc --noEmit`, `npm test` complet (157 tests existants toujours verts), CI verte.

---

## 7. USER STEPS (Arnaud)

Conformément à la règle établie au chantier 0 — toute écriture BDD distante et tout secret est un
user step ; l'agent ne fait que des vérifications en lecture.

1. Compte Stripe : produit + tarif one-shot → récupérer `STRIPE_PRICE_ID`.
2. Clés API (test d'abord) → `STRIPE_SECRET_KEY`.
3. Endpoint webhook `/api/payments/webhook` déclaré côté Stripe → `STRIPE_WEBHOOK_SECRET`.
4. `supabase db push` de la migration `purchases` (prod + préprod).
5. Variables d'env sur Render (prod + préprod), `PAYMENTS_ENABLED` restant **faux** en prod.
6. CGU/CGV et rétractation : à faire relire avant d'ouvrir la vente (les pages `/legal` et
   `/security` sont encore des placeholders) — l'acceptation des CGV se configure côté Stripe.

---

## 8. Hors scope (explicitement)

- **Envois à l'acte au-delà du quota** : le quota est stocké, jamais décompté — l'envoi papier
  qui le consomme est le chantier 2.
- **Stripe Tax / facturation / TVA** : dépend du statut juridique de la société, encore
  « À COMPLÉTER » dans le registre des traitements. Préparé (prix TTC, CGV côté Stripe), non activé.
- **Écran admin de remboursement** (D4), **rôle admin**, **attribution partenaire au checkout**
  (chantier 4 — `purchases.id` sera la clé référencée par `commission_ledger`, la table est
  conçue pour ne pas bouger).
- **Événement d'achat PostHog**, relances de panier abandonné, codes promo.
