-- Écrivains de `purchases.kind` — facturation à l'acte (chantier 2a, Task 9).
-- Spec : docs/design-chantier-2a-envoi-papier.md §4. Plan : docs/plan-chantier-2a-envoi-papier.md,
-- Task 9. Branche `feature/chantier-2a` — AUCUN merge vers `pre-prod`/`main` avant la levée du
-- gel post-rendu (cf. header du plan) ; migration timestampée entre le cycle papier
-- (20260914120000) et le coffre (20260914160000), l'ordre de `db push` reste celui des noms.
--
-- POURQUOI CETTE MIGRATION. Le bloc 1 de 20260914120000_letter_sends_papier.sql a ajouté la
-- colonne `purchases.kind` ('forfait' | 'envoi_sup', défaut 'forfait') mais AUCUNE RPC ne sait
-- l'écrire : les quatre fonctions du chantier 1 énumèrent leurs colonnes et ignorent `kind`.
-- Tant que ce fichier n'existe pas, aucune ligne `envoi_sup` ne peut naître — c'était voulu
-- (pas de fenêtre de vulnérabilité ouverte par la migration précédente). Le Checkout « envoi
-- supplémentaire » (POST /api/payments/checkout-extra-send) a maintenant besoin de ces écrivains.
--
-- ⚠️ LES DEUX RÈGLES DE LA NOTE POST-REVUE TASK 4, TENUES ICI À LA LETTRE :
--  (a) sur la branche `on conflict do update` de mark_purchase_paid, `kind` N'EST PAS RÉÉCRIT.
--      La ligne `pending` porte déjà la bonne valeur (create_pending_purchase l'a posée) ; un
--      appelant ancien (ou un rejeu sans metadata) rétrograderait sinon un `envoi_sup` en
--      `forfait` — et le gate du produit ENTIER s'ouvrirait au prix d'un timbre, puisque
--      getPaidPurchase cherche exactement `status='paid' and kind='forfait'`.
--  (b) `kind` n'est JAMAIS écrit en deux temps (d'abord `paid`, puis le kind) : sur le chemin
--      INSERT, il fait partie du MÊME ordre SQL que `status='paid'`. Une écriture en deux temps
--      laisserait, entre les deux, une ligne `paid`+`forfait` — le gate ouvert le temps d'un
--      aller-retour réseau.
--
-- SIGNATURES : ajouter un paramètre (même avec DEFAULT) crée une SURCHARGE, elle ne remplace pas
-- l'ancienne fonction — et PostgREST, qui résout les surcharges par les noms de paramètres du
-- corps JSON, refuserait alors un appel à 4 arguments (« Could not choose the best candidate
-- function »). Les anciennes signatures sont donc DROPPÉES explicitement avant recréation. Les
-- deux fonctions non touchées (mark_purchase_refunded, expire_purchase) n'ont pas à connaître
-- `kind` : rembourser ou expirer ne dépend pas de la nature de l'achat.
--
-- Garde-fous repris de 20260725120000_purchases.sql, à l'identique : `security definer` +
-- `set search_path = public`, secret partagé webhook_config INLINÉ dans chaque fonction (jamais
-- encapsulé — une fonction `webhook_secret_ok()` serait un oracle), `on conflict do nothing`
-- pour la ligne d'attente, DO UPDATE gardé par `where purchases.status = 'pending'`
-- (idempotence : un rejeu modifie 0 ligne, un `completed` relivré après remboursement ne
-- ressuscite jamais l'accès), revoke/grant nominatifs.
--
-- `coalesce(p_kind, 'forfait')` et rien de plus : une valeur inattendue est REFUSÉE par le CHECK
-- `purchases_kind_check` (échec franc) plutôt que silencieusement ramenée à 'forfait', qui est
-- justement la valeur PRIVILÉGIÉE. La route normalise déjà la valeur avant l'appel — ceinture et
-- bretelles.

drop function if exists create_pending_purchase(text, uuid, text, integer);
create or replace function create_pending_purchase(
  p_secret text, p_user_id uuid, p_session_id text, p_included_sends integer,
  p_kind text default 'forfait'
) returns void language sql security definer set search_path = public as $$
  insert into purchases (user_id, status, stripe_session_id, included_sends, kind)
  select p_user_id, 'pending', p_session_id, coalesce(p_included_sends, 0), coalesce(p_kind, 'forfait')
   where exists (select 1 from webhook_config where id = 1 and rpc_secret = p_secret)
  on conflict (stripe_session_id) do nothing;
$$;

drop function if exists mark_purchase_paid(text, text, uuid, text, integer, text, integer);
create or replace function mark_purchase_paid(
  p_secret text, p_session_id text, p_user_id uuid, p_payment_intent text,
  p_amount_total integer, p_currency text, p_included_sends integer,
  p_kind text default 'forfait'
) returns void language sql security definer set search_path = public as $$
  insert into purchases (user_id, status, stripe_session_id, stripe_payment_intent,
                         amount_total, currency, included_sends, kind, paid_at)
  select p_user_id, 'paid', p_session_id, p_payment_intent,
         p_amount_total, p_currency, coalesce(p_included_sends, 0), coalesce(p_kind, 'forfait'), now()
   where exists (select 1 from webhook_config where id = 1 and rpc_secret = p_secret)
  on conflict (stripe_session_id) do update
     set status                = 'paid',
         stripe_payment_intent = coalesce(excluded.stripe_payment_intent, purchases.stripe_payment_intent),
         amount_total          = coalesce(excluded.amount_total, purchases.amount_total),
         currency              = coalesce(excluded.currency, purchases.currency),
         paid_at               = coalesce(purchases.paid_at, now()),
         updated_at            = now()
         -- `kind` VOLONTAIREMENT ABSENT de ce SET — règle (a) ci-dessus. Ne pas l'ajouter.
   where purchases.status = 'pending';
$$;

-- Le grant n'est pas la barrière de sécurité (PostgREST expose toute fonction du schéma public à
-- qui détient la clé publishable) — le secret vérifié en base l'est. Il reste nécessaire pour que
-- le serveur, qui appelle sans clé secrète (rôle `anon` sur le webhook, `authenticated` sur le
-- Checkout), puisse exécuter ces fonctions.
revoke all on function create_pending_purchase(text, uuid, text, integer, text)                     from public;
revoke all on function mark_purchase_paid(text, text, uuid, text, integer, text, integer, text)     from public;
grant execute on function create_pending_purchase(text, uuid, text, integer, text)                  to anon, authenticated;
grant execute on function mark_purchase_paid(text, text, uuid, text, integer, text, integer, text)  to anon, authenticated;
