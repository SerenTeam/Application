-- Achats du forfait Seren (Stripe Checkout one-shot — chantier 1).
-- Écriture INTERDITE aux utilisateurs : la table n'a QU'UNE policy, en lecture. Toutes les
-- mutations passent par les RPC security definer ci-dessous, protégées par le secret partagé
-- webhook_config (même dispositif que update_letter_send_status, migration letter_sends).
-- Motif : la clé publishable est publique côté front — avec une policy d'insertion ou de mise
-- à jour, n'importe quel utilisateur s'octroierait `status = 'paid'` en appelant PostgREST avec
-- son propre token, reproduisant exactement la faille T1 (paiement contournable par
-- ?payment=success) que ce chantier ferme.
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
drop policy if exists "own purchases read" on purchases;
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
-- Idempotence : la garde `where purchases.status = 'pending'` sur le DO UPDATE fait qu'un rejeu
-- du même événement modifie 0 ligne, et qu'un `completed` relivré après un remboursement ne
-- ressuscite jamais l'accès.
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
-- Garde `status = 'paid'` : un rejeu ne réécrit pas refunded_at.
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

revoke all on function create_pending_purchase from public;
revoke all on function mark_purchase_paid      from public;
revoke all on function mark_purchase_refunded  from public;
revoke all on function expire_purchase         from public;
grant execute on function create_pending_purchase to anon, authenticated;
grant execute on function mark_purchase_paid      to anon, authenticated;
grant execute on function mark_purchase_refunded  to anon, authenticated;
grant execute on function expire_purchase         to anon, authenticated;
