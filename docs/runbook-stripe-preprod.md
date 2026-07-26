# Runbook — Mise en service du paiement en préprod (Stripe test)

> Chantier 1. Objectif : encaisser un vrai paiement de bout en bout en **mode test Stripe** sur
> la préprod, vérifier que l'accès s'ouvre, puis qu'un remboursement le referme. Durée : ~40 min,
> majoritairement des clics. **La prod n'est pas concernée** — elle reste vente fermée
> (`PAYMENTS_ENABLED` non défini) jusqu'à la relecture juridique du catalogue.
>
> Prérequis : PR #1 mergée dans `main` (le service Render préprod suit `main`).

---

## ⚠️ Le piège n°1 : la ligne `webhook_config`

À lire avant tout le reste, parce qu'il échoue **en silence**.

Les écritures dans `purchases` passent par des RPC `security definer` qui vérifient un secret
partagé **stocké en base**, dans la table `webhook_config` :

```sql
... and exists (select 1 from webhook_config where id = 1 and rpc_secret = p_secret)
```

Si cette ligne n'existe pas sur la préprod, ou si sa valeur ne correspond pas à la variable
`WEBHOOK_RPC_SECRET` du service Render préprod, alors : **le webhook Stripe répondra 200, les
logs seront propres, et l'achat ne passera jamais en `paid`**. C'est voulu (silence par
construction, pas de fuite d'information), mais c'est déroutant en test.

La préprod a été remise à zéro le 25/07 (`db reset` + 6 migrations) : la **table** existe, mais
la **ligne** est une insertion manuelle qui n'est pas dans les migrations (un secret ne vit
jamais dans git). Il y a donc de bonnes chances qu'elle soit absente. → Étape 3.

---

## 1. Stripe — produit, tarif, clé (~10 min)

1. Dashboard Stripe → vérifier que le bandeau **« Mode test »** est actif (bascule en haut à
   droite). Tout ce qui suit se fait en mode test ; les objets test et live sont deux mondes
   séparés (un `price_…` test n'existe pas en live).
2. **Catalogue / Produits** → Ajouter un produit :
   - Nom : `Forfait Seren`
   - Tarification : **paiement unique** (surtout pas « récurrent »)
   - Montant : mets `149 €` pour l'instant. Le prix est piloté par Stripe (décision D3) — le
     changer plus tard, c'est changer une variable d'environnement, pas du code. Ne bloque pas
     le test sur la décision de pricing.
   - Devise : EUR
3. Une fois créé, ouvrir le tarif et copier son **ID de tarif** → `STRIPE_PRICE_ID`
   (commence par `price_`, **pas** `prod_` — le `prod_` est l'ID du produit, il ne marchera pas).
4. **Développeurs → Clés API** → copier la **clé secrète** de test → `STRIPE_SECRET_KEY`
   (commence par `sk_test_`). Ne jamais la mettre dans une variable `VITE_*` ni dans git.

> Le webhook (`STRIPE_WEBHOOK_SECRET`) vient à l'étape 5 : il a besoin de l'URL de la préprod.

---

## 2. Base préprod — appliquer la migration `purchases`

```bash
supabase link --project-ref kvtzhyxlqouvpwasedbe   # préprod (mot de passe BDD)
supabase db push                                    # applique 20260725120000_purchases.sql
supabase migration list                             # → 7 migrations Local + Remote
```

⚠️ `link` ne retient qu'un projet : pense à `supabase link --project-ref oltwzvfjazwjvghpzhia`
pour revenir sur la prod ensuite.

---

## 3. Base préprod — le secret partagé (l'étape à ne pas sauter)

Toujours connecté à la préprod, dans le **SQL Editor** du dashboard Supabase préprod :

```sql
-- 1. La ligne existe-t-elle ?
select id, length(rpc_secret) as len from webhook_config;
```

- **0 ligne** → en générer un et l'insérer :

```sql
insert into webhook_config (id, rpc_secret) values (1, '<colle ici un secret long et aléatoire>');
```

  (pour le générer : `openssl rand -hex 32` dans ton terminal)

- **1 ligne** → parfait, mais il faut connaître sa valeur pour la recopier dans Render. Si tu ne
  l'as plus, remplace-la : `update webhook_config set rpc_secret = '<nouveau>' where id = 1;`
  ⚠️ sur la **préprod uniquement** — en prod, ça casserait le webhook Resend des courriers.

**Note cette valeur** : elle doit être identique dans `WEBHOOK_RPC_SECRET` côté Render (étape 4).

---

## 4. Render préprod — variables d'environnement

Service Render **préprod** → Environment. Récupère au passage son URL publique
(`https://<ton-service-preprod>.onrender.com`), tu en as besoin à l'étape 5.

| Variable | Valeur |
| --- | --- |
| `STRIPE_SECRET_KEY` | `sk_test_…` (étape 1.4) |
| `STRIPE_PRICE_ID` | `price_…` (étape 1.3) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` — **étape 5**, à ajouter après |
| `PAYMENTS_ENABLED` | `true` ← ouvre la vente **et** ferme le gate, d'un seul geste |
| `APP_URL` | l'URL publique de la préprod, **sans slash final** |
| `FORFAIT_INCLUDED_SENDS` | `5` (facultatif, c'est le défaut) |
| `WEBHOOK_RPC_SECRET` | la valeur de l'étape 3 — **doit correspondre exactement** |

⚠️ `APP_URL` faux = tu paies puis Stripe te renvoie sur `localhost` ou sur la prod. C'est la
deuxième cause d'échec la plus fréquente après le secret RPC.

Vérifier aussi que la préprod pointe bien sur la **base préprod** (`SUPABASE_URL` =
`https://kvtzhyxlqouvpwasedbe.supabase.co`) et pas sur la prod.

---

## 5. Stripe — l'endpoint webhook

Toujours en mode test : **Développeurs → Webhooks → Ajouter un endpoint**.

- URL : `https://<ton-service-preprod>.onrender.com/api/payments/webhook`
- Événements à sélectionner (exactement ceux que le serveur traite) :
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`
  - `checkout.session.expired`
  - `charge.refunded`

Après création, **révéler le secret de signature** (`whsec_…`) → le poser dans
`STRIPE_WEBHOOK_SECRET` sur Render (étape 4) → **redéployer le service** pour que les variables
soient prises en compte.

---

## 6. Compte de test sur la préprod

Dans le dashboard Supabase **préprod** → Authentication :
- Providers → Email activé, **« Confirm email » désactivé** (sinon tu ne pourras pas te connecter).
- URL Configuration → Site URL = l'URL de la préprod.

Puis crée-toi un compte depuis la préprod et fais le questionnaire jusqu'à la roadmap.

---

## 7. Le test de bout en bout

- [ ] **7.1** Ouvre un courrier à canal email (mutuelle ou employeur) → le bloc d'envoi doit
      afficher **« Débloquer l'envoi — 149,00 € »**. Si le montant manque mais que le bouton est
      là : Stripe est injoignable côté serveur (clé fausse ou `price_` invalide) — le reste
      fonctionne quand même, mais corrige avant de continuer.
- [ ] **7.2** Clic → tu arrives sur la page Stripe hébergée. Carte de test : `4242 4242 4242 4242`,
      date future quelconque, CVC quelconque, code postal quelconque.
- [ ] **7.3** Après paiement → retour sur `/dashboard`, bandeau **« Paiement reçu, confirmation
      en cours… »** puis **« Votre forfait Seren est actif »** en une seconde ou deux.
- [ ] **7.4** Vérifier en base (SQL Editor préprod) :

```sql
select status, amount_total, currency, included_sends, paid_at, stripe_payment_intent
from purchases order by created_at desc limit 3;
```

Attendu : une ligne `paid`, `amount_total = 14900`, `currency = eur`, `included_sends = 5`.

> **Si la ligne est restée `pending`** : le webhook n'a pas abouti. Regarde Stripe →
> Développeurs → Webhooks → ton endpoint → onglet des tentatives. Un **200** avec une ligne
> restée `pending` = le secret RPC ne correspond pas (étape 3). Un **401** = mauvais
> `STRIPE_WEBHOOK_SECRET`. Un **503** = variable absente ou service pas redéployé.

- [ ] **7.5** Retourne sur le courrier → le bloc d'envoi normal est revenu (champ email + bouton
      « Envoyer par email »). L'envoi lui-même n'aboutira que si Resend est configuré sur la
      préprod ; ce n'est pas l'objet de ce test.
- [ ] **7.6 — Rejeu (idempotence).** Stripe → Webhooks → ton endpoint → prends l'événement
      `checkout.session.completed` reçu → **Renvoyer**. Relance la requête SQL de 7.4 :
      **aucun changement, aucune seconde ligne**. C'est l'exigence d'idempotence de la roadmap.
- [ ] **7.7 — Remboursement (D4).** Stripe → Paiements → ton paiement test → **Rembourser**.
      Puis :

```sql
select status, refunded_at from purchases order by created_at desc limit 1;
```

      Attendu : `refunded`. Recharge le courrier → le **paywall est revenu**. C'est la boucle
      complète : tu rembourses depuis Stripe, l'accès se referme tout seul, sans écran admin.

---

## 8. Après le test — ne pas se tromper d'environnement

- La **prod** ne doit recevoir que la migration (`supabase db push` sur
  `oltwzvfjazwjvghpzhia`) et, si tu veux, les variables Stripe. **`PAYMENTS_ENABLED` reste non
  défini en prod** : la vente est fermée tant que la relecture juridique des 50 étapes (P1) n'est
  pas faite et que le chantier 2 (envoi réel) n'est pas livré.
- Le jour de l'ouverture : bascule les clés Stripe en **live** (`sk_live_…`, nouveau `price_…`
  live, **nouvel endpoint webhook live avec son propre `whsec_`**) puis `PAYMENTS_ENABLED=true`.
  Les objets test ne fonctionnent pas en live, et inversement.
- La préprod peut rester en `PAYMENTS_ENABLED=true` en permanence : c'est là qu'on veut que le
  gating soit exercé.
