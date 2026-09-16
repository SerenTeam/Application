-- ════════════════════════════════════════════════════════════════════════════════════════
-- v2 core — dossiers PF, allowlist d'enrôlement, admins Seren, consentements, hook d'inscription,
-- activation par jeton et pont purchases (démonstrateur v2 + bêta pilote).
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Contrat : docs/design-v2-demonstrateur.md §3.2 (DDL), §3.3.1 à §3.3.8 (fonctions), §3.4 (droits).
-- Plan : docs/plan-v2-sql.md, Task 2. Migration ADDITIVE et REJOUABLE : aucun drop de table,
-- aucune retouche de partner_dashboard / consume_send / send_balance / release_debit /
-- create_pending_purchase / mark_purchase_paid (lint tests/migrations-v2-lint.test.ts).
--
-- Modèle de sécurité (mêmes principes que purchases et le dashboard PF v0) :
--  • account_enrollments, seren_admins et dossiers : RLS activée SANS policy (deny-all). dossiers
--    n'a pas même de SELECT owner (arbitrage A1 : la ligne porte les snapshots prix/commission).
--    Toute lecture passe par my_account(), has_active_dossier(), invitation_preview() ou les RPC PF.
--  • consents : une seule policy, SELECT own. Aucune policy d'écriture : record_consents est la porte.
--  • Chaque fonction : security definer (sauf consent_version), search_path vide, noms qualifiés,
--    revoke all from public, anon, authenticated, puis grants nominatifs du §3.4. Les RPC restent
--    appelables en direct via PostgREST : TOUTE leur sécurité est ici (auth.uid(), jeton, rôle).
--  • Aucune identité ne vient d'un paramètre : user_id = auth.uid(), e-mail = auth.jwt() ->> 'email'.
--  • Erreurs métier : raise exception '<code>' using errcode = 'P0001' — le message EST le code.

-- ── partners : champs contractuels v2 (name = raison sociale ; commission_rate conservée, plus lue) ──
alter table public.partners
  add column if not exists siret                text,
  add column if not exists billing_email        text,
  add column if not exists status               text not null default 'active',
  add column if not exists price_ttc_cents      integer not null default 29000,
  add column if not exists commission_ttc_cents integer not null default 7000,
  add column if not exists contract_signed_at   date,
  add column if not exists updated_at           timestamptz not null default now();

do $$ begin
  alter table public.partners add constraint partners_status_check check (status in ('prospect','active','suspended','terminated'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.partners add constraint partners_price_check check (price_ttc_cents >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.partners add constraint partners_commission_check check (commission_ttc_cents >= 0 and commission_ttc_cents <= price_ttc_cents);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.partners add constraint partners_siret_check check (siret is null or siret ~ '^[0-9]{14}$');
exception when duplicate_object then null; end $$;

-- ── partner_users : rôle (la colonne existe, aucun écran conseiller en bêta) ──
alter table public.partner_users
  add column if not exists role text not null default 'manager';

do $$ begin
  alter table public.partner_users add constraint partner_users_role_check check (role in ('manager','advisor'));
exception when duplicate_object then null; end $$;

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

-- ── seren_admins : rôle admin Seren (deny-all, rempli par link_enrollments) — ici et non dans
--    v2_admin, parce que my_account() la lit (arbitrage A2) ──
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
-- ⚠️ Conséquence voulue de dossiers_state_check : un « Delete user » sur le compte d'un dossier
-- ACTIF échoue (on delete set null viole l'état 'active'). L'effacement passe d'abord par la
-- clôture du dossier (scripts/erase-family.sql).

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
drop policy if exists "own consents read" on public.consents;   -- policy NEUVE de ce fichier : drop/create rejouable
create policy "own consents read" on public.consents for select to authenticated using (auth.uid() = user_id);

-- ── Copie des attributions v0 → dossiers de démo (aucun DROP d'attributions, dépréciée) ──
-- Ni pont purchases ni consentement : un compte de démo copié arrive sur /bienvenue avec un solde 0.
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
comment on table public.attributions is 'DÉPRÉCIÉE (v2) : remplacée par public.dossiers (source=demo). Conservée pour le rollback de partner_dashboard v0.';

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §3.3.1 consent_version — constante jumelle de src/lib/consent-version.ts (test de parité)
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.consent_version()
returns text
language sql
immutable
security invoker
set search_path = ''
as $fn$
  select '2026-09-beta-1'::text
$fn$;
revoke all on function public.consent_version() from public, anon, authenticated;
grant execute on function public.consent_version() to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §3.3.2 hook_before_user_created — Supabase Auth « Before User Created » (Postgres)
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Accepte : (1) un e-mail de l'allowlist d'enrôlement (gérants PF, admins Seren), ou (2) un e-mail
-- invité dont user_metadata.invite_token_hash correspond à un dossier 'invited' non expiré.
-- Refuse tout le reste (403 signup_requires_invitation). Aucune écriture, aucune exception levée :
-- une erreur interne remonte comme erreur du hook et Auth refuse l'inscription (fail-closed).
-- security definer owner postgres : supabase_auth_admin est soumis à la RLS, les deux tables lues
-- sont deny-all — sans definer, le hook ne verrait aucune ligne et refuserait TOUT.
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_email text := lower(btrim(event -> 'user' ->> 'email'));
  v_hash  text := event -> 'user' -> 'user_metadata' ->> 'invite_token_hash';
  v_refus constant jsonb := jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'signup_requires_invitation'));
begin
  if v_email is null or v_email = '' then
    return v_refus;
  end if;

  if exists (select 1 from public.account_enrollments e where e.email = v_email) then
    return '{}'::jsonb;
  end if;

  if v_hash ~ '^[0-9a-f]{64}$'
     and exists (select 1
                   from public.dossiers d
                  where d.invite_token_hash = v_hash
                    and d.family_email = v_email
                    and d.status = 'invited'
                    and d.invite_expires_at > now()) then
    return '{}'::jsonb;
  end if;

  return v_refus;
end
$fn$;
alter function public.hook_before_user_created(jsonb) owner to postgres;
revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §3.3.3 link_enrollments — NON exposée (aucun grant) : SQL Editor d'Arnaud, rôle postgres
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Revue de sécurité du 16/09 (must-fix 2) : AUCUNE liaison par simple égalité d'e-mail. Lier tout
-- compte qui PORTE une adresse enrôlée donnerait le rôle de gérant PF (liste des familles : identité,
-- e-mail, téléphone, défunt) ou d'admin Seren à un intrus inscrit entre la partie 1 du seed et le
-- « Add user » d'Arnaud. L'appariement est explicite : p_pairs = [{"email": …, "user_id": <UUID copié
-- depuis « Add user »>}], et le compte doit être FIABLE : créé après l'enrôlement, jamais connecté,
-- sans changement d'e-mail en attente. Tout écart → enrollment_account_untrusted (STOP, enquête).
create or replace function public.link_enrollments(p_pairs jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_pair      jsonb;
  v_email     text;
  v_uid       uuid;
  v_u         record;
  v_first     timestamptz;
  v_rec       record;
  v_partner_n integer := 0;
  v_admin_n   integer := 0;
  v_pending   integer := 0;
  v_untrusted integer := 0;
begin
  -- Garde AVANT toute écriture : un compte enrôlé qui porte un dossier famille ne devient jamais interne.
  if exists (select 1
               from public.account_enrollments e
               join auth.users u on lower(btrim(u.email)) = e.email
               join public.dossiers d on d.user_id = u.id) then
    raise exception 'enrollment_conflict_family' using errcode = 'P0001';
  end if;

  for v_pair in select value from jsonb_array_elements(coalesce(p_pairs, '[]'::jsonb))
  loop
    v_email := lower(btrim(v_pair ->> 'email'));
    begin
      v_uid := (v_pair ->> 'user_id')::uuid;
    exception when others then
      raise notice 'link_enrollments : user_id illisible pour %', v_email;
      raise exception 'enrollment_account_untrusted' using errcode = 'P0001';
    end;

    select min(e.created_at) into v_first from public.account_enrollments e where e.email = v_email;
    if v_first is null then
      raise notice 'link_enrollments : % n''est pas enrôlée (exécuter la partie 1 du seed)', v_email;
      raise exception 'enrollment_account_untrusted' using errcode = 'P0001';
    end if;

    -- Rejeu de la partie 2 : si la paire est DÉJÀ liée à ce compte, les contrôles sont sautés (après
    -- une première liaison, le gérant s'est connecté : last_sign_in_at n'est plus null). Les insert
    -- restent rejoués, donc le rejeu est idempotent et rend les mêmes compteurs.
    if exists (select 1 from public.account_enrollments e
                where e.email = v_email and e.linked_user_id is distinct from v_uid) then
      select u.id,
             lower(btrim(u.email))            as email,
             u.created_at                     as created_at,
             u.last_sign_in_at                as last_sign_in_at,
             coalesce(u.email_change, '')     as email_change
        into v_u
        from auth.users u
       where u.id = v_uid;
      if not found
         or v_u.email is distinct from v_email          -- UUID collé sur la mauvaise ligne
         or v_u.created_at < v_first                    -- compte antérieur à l'enrôlement
         or v_u.last_sign_in_at is not null             -- quelqu'un s'est déjà connecté
         or v_u.email_change <> '' then                 -- changement d'adresse en attente
        raise notice 'link_enrollments : compte non fiable pour % — attendu un compte créé par « Add user » APRÈS l''enrôlement, jamais connecté, sans changement d''e-mail en attente', v_email;
        raise exception 'enrollment_account_untrusted' using errcode = 'P0001';
      end if;
    end if;

    for v_rec in select e.id as enrollment_id, e.role, e.partner_id
                   from public.account_enrollments e
                  where e.email = v_email
    loop
      if v_rec.role = 'partner_manager' then
        insert into public.partner_users (user_id, partner_id, role)
        values (v_uid, v_rec.partner_id, 'manager')
        on conflict (user_id) do update set partner_id = excluded.partner_id, role = 'manager';
        v_partner_n := v_partner_n + 1;
      elsif v_rec.role = 'seren_admin' then
        insert into public.seren_admins (user_id) values (v_uid)
        on conflict (user_id) do nothing;
        v_admin_n := v_admin_n + 1;
      end if;

      update public.account_enrollments
         set linked_user_id = v_uid,
             linked_at      = coalesce(linked_at, now())
       where id = v_rec.enrollment_id;
    end loop;
  end loop;

  -- pending  : enrôlement sans AUCUN compte auth → « Add user » reste à faire.
  -- untrusted: enrôlement non lié alors qu'un compte PORTE l'adresse → SIGNAL D'ALARME (quelqu'un la
  --            détient, ou l'UUID n'a pas été apparié). > 0 = STOP, enquête avant toute ouverture.
  select count(*) filter (where not exists (select 1 from auth.users u where lower(btrim(u.email)) = e.email)),
         count(*) filter (where     exists (select 1 from auth.users u where lower(btrim(u.email)) = e.email))
    into v_pending, v_untrusted
    from public.account_enrollments e
   where e.linked_user_id is null;

  return jsonb_build_object('partner_users_linked', v_partner_n,
                            'seren_admins_linked',  v_admin_n,
                            'pending',              v_pending,
                            'untrusted',            v_untrusted);
end
$fn$;
revoke all on function public.link_enrollments(jsonb) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §3.3.4 invitation_preview — seule RPC anonyme ; pas d'oracle d'état (utilisé/annulé = invalid)
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.invitation_preview(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_d            public.dossiers%rowtype;
  v_partner_name text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('valid', false, 'reason', 'invalid');
  end if;

  select * into v_d from public.dossiers d where d.invite_token_hash = p_token_hash;
  if not found or v_d.status <> 'invited' then
    return jsonb_build_object('valid', false, 'reason', 'invalid');
  end if;

  select p.name into v_partner_name from public.partners p where p.id = v_d.partner_id;

  if v_d.invite_expires_at <= now() then
    return jsonb_build_object('valid', false, 'reason', 'expired', 'partner_name', v_partner_name);
  end if;

  -- Jamais : nom de famille, téléphone, date de décès, snapshots, identifiant de dossier.
  return jsonb_build_object('valid',               true,
                            'email',               v_d.family_email,
                            'partner_name',        v_partner_name,
                            'family_first_name',   v_d.family_first_name,
                            'deceased_first_name', v_d.deceased_first_name,
                            'expires_at',          v_d.invite_expires_at);
end
$fn$;
revoke all on function public.invitation_preview(text) from public, anon, authenticated;
grant execute on function public.invitation_preview(text) to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §3.3.5 claim_dossier — activation par la famille + pont purchases (D4), ordre strict du contrat
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Le pont écrit la SEULE ligne purchases non Stripe du système : stripe_session_id =
-- 'partner_dossier:<id>' (unique → idempotent), amount_total null (dette documentée §9.3-7 :
-- toute requête de CA sur purchases doit exclure ce préfixe). consume_send/send_balance intacts.
-- Le statut du partenaire n'est PAS vérifié : une PF suspendue ne coupe jamais une famille invitée.
create or replace function public.claim_dossier(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid          uuid := auth.uid();
  v_email        text := lower(btrim(auth.jwt() ->> 'email'));
  v_d            public.dossiers%rowtype;
  v_active_id    uuid;
  v_partner_name text;
begin
  -- 1.
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  -- 2. Un compte interne n'est jamais famille (§2.3).
  if exists (select 1 from public.partner_users pu where pu.user_id = v_uid)
     or exists (select 1 from public.seren_admins sa where sa.user_id = v_uid) then
    raise exception 'account_role_forbidden' using errcode = 'P0001';
  end if;
  -- 3.
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;
  -- 4. Verrou de ligne : deux claims concurrents du même lien se sérialisent.
  select * into v_d from public.dossiers d where d.invite_token_hash = p_token_hash for update;
  -- 5. Idempotence (double clic, retry réseau) : le hash est déjà effacé par le premier claim.
  if not found then
    select d.id into v_active_id from public.dossiers d where d.user_id = v_uid and d.status = 'active';
    if v_active_id is not null then
      return jsonb_build_object('claimed', false, 'already_active', true, 'dossier_id', v_active_id);
    end if;
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;
  -- 6.
  if v_d.status <> 'invited' then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;
  -- 7.
  if v_d.invite_expires_at <= now() then
    raise exception 'invitation_expired' using errcode = 'P0001';
  end if;
  -- 8. L'e-mail vient du JWT, jamais d'un paramètre.
  if v_email is null or v_d.family_email <> v_email then
    raise exception 'email_mismatch' using errcode = 'P0001';
  end if;
  -- 9.
  if exists (select 1 from public.dossiers d where d.user_id = v_uid) then
    raise exception 'account_already_linked' using errcode = 'P0001';
  end if;
  -- 10.
  update public.dossiers
     set status            = 'active',
         user_id           = v_uid,
         activated_at      = now(),
         invite_token_hash = null,
         invite_expires_at = null,
         updated_at        = now()
   where id = v_d.id;
  -- 11. Pont, même transaction.
  insert into public.purchases (user_id, status, kind, stripe_session_id, included_sends, amount_total, currency, paid_at)
  values (v_uid, 'paid', 'forfait', 'partner_dossier:' || v_d.id::text, v_d.included_sends, null, null, now())
  on conflict (stripe_session_id) do nothing;
  -- 12.
  select p.name into v_partner_name from public.partners p where p.id = v_d.partner_id;
  return jsonb_build_object('claimed',        true,
                            'already_active', false,
                            'dossier_id',     v_d.id,
                            'partner_name',   v_partner_name);
end
$fn$;
revoke all on function public.claim_dossier(text) from public, anon, authenticated;
grant execute on function public.claim_dossier(text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §3.3.6 my_account — rôle exclusif (partner > family > none), is_admin orthogonal
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.my_account()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_uid      uuid := auth.uid();
  v_version  text := public.consent_version();
  v_is_admin boolean;
  v_role     text := 'none';
  v_partner  jsonb := null;
  v_dossier  jsonb := null;
  v_pu       record;
  v_d        record;
  v_kinds    integer;
  v_accepted timestamptz;
begin
  if v_uid is null then
    return null;
  end if;

  v_is_admin := exists (select 1 from public.seren_admins sa where sa.user_id = v_uid);

  -- Contrat résilié (décision 16/09) : plus aucun rôle PF, donc plus aucune PII famille. 'suspended'
  -- garde la lecture (seules création et renvoi sont bloquées par partner_inactive).
  select p.id, p.name, p.status, pu.role as user_role
    into v_pu
    from public.partner_users pu
    join public.partners p on p.id = pu.partner_id
   where pu.user_id = v_uid
     and p.status <> 'terminated';

  if found then
    v_role := 'partner';
    v_partner := jsonb_build_object('id', v_pu.id, 'name', v_pu.name, 'status', v_pu.status, 'user_role', v_pu.user_role);
  else
    select d.id, d.status, d.source, d.deceased_first_name, d.activated_at, d.included_sends, p.name as partner_name
      into v_d
      from public.dossiers d
      left join public.partners p on p.id = d.partner_id
     where d.user_id = v_uid
       and d.status in ('active','closed');
    if found then
      v_role := 'family';
      -- Jamais de snapshot prix/commission, jamais family_email, jamais de hash.
      v_dossier := jsonb_build_object('id',                  v_d.id,
                                      'status',              v_d.status,
                                      'source',              v_d.source,
                                      'partner_name',        v_d.partner_name,
                                      'deceased_first_name', v_d.deceased_first_name,
                                      'activated_at',        v_d.activated_at,
                                      'included_sends',      v_d.included_sends);
    end if;
  end if;

  select count(distinct c.kind), min(c.accepted_at)
    into v_kinds, v_accepted
    from public.consents c
   where c.user_id = v_uid
     and c.version = v_version
     and c.kind in ('terms','privacy','sensitive_data');

  return jsonb_build_object(
    'user_id',  v_uid,
    'role',     v_role,
    'is_admin', v_is_admin,
    'partner',  v_partner,
    'dossier',  v_dossier,
    'consent',  jsonb_build_object('version',     v_version,
                                   'required',    v_role = 'family' and v_kinds < 3,
                                   'accepted_at', case when v_kinds = 3 then v_accepted end));
end
$fn$;
revoke all on function public.my_account() from public, anon, authenticated;
grant execute on function public.my_account() to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §3.3.7 record_consents — 3 finalités exactement, version courante, dossier actif
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.record_consents(p_version text, p_kinds text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid        uuid := auth.uid();
  v_dossier_id uuid;
  v_kinds      text[];
  v_inserted   integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select d.id into v_dossier_id from public.dossiers d where d.user_id = v_uid and d.status = 'active';
  if v_dossier_id is null then
    raise exception 'dossier_not_active' using errcode = 'P0001';
  end if;

  if p_version is null or p_version <> public.consent_version() then
    raise exception 'consent_version_mismatch' using errcode = 'P0001';
  end if;

  -- Ensemble exact {privacy, sensitive_data, terms} : ordre et doublons ignorés ; un null ou une
  -- valeur inconnue rend l'ensemble différent.
  select coalesce(array_agg(distinct k order by k), '{}'::text[])
    into v_kinds
    from unnest(coalesce(p_kinds, '{}'::text[])) as k;
  if v_kinds is distinct from array['privacy','sensitive_data','terms']::text[] then
    raise exception 'consent_incomplete' using errcode = 'P0001';
  end if;

  insert into public.consents (user_id, dossier_id, kind, version)
  select v_uid, v_dossier_id, k, p_version
    from unnest(v_kinds) as k
  on conflict (user_id, kind, version) do nothing;
  get diagnostics v_inserted = row_count;

  return jsonb_build_object('recorded', v_inserted, 'version', p_version, 'required', false);
end
$fn$;
revoke all on function public.record_consents(text, text[]) from public, anon, authenticated;
grant execute on function public.record_consents(text, text[]) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §3.3.8 has_active_dossier — sans paramètre : aucun oracle sur autrui
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.has_active_dossier()
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (select 1 from public.dossiers d where d.user_id = auth.uid() and d.status = 'active')
$fn$;
revoke all on function public.has_active_dossier() from public, anon, authenticated;
grant execute on function public.has_active_dossier() to authenticated;
