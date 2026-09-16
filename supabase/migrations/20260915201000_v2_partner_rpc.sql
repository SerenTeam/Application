-- ════════════════════════════════════════════════════════════════════════════════════════
-- v2 RPC partenaire — création, renvoi, annulation, liste et compteurs des dossiers PF
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Contrat : docs/design-v2-demonstrateur.md §3.3.9 à §3.3.13, droits §3.4, codes §3.5.
-- Plan : docs/plan-v2-sql.md, Task 3. Dépend de 20260915200000_v2_core.sql.
--
-- Règle rouge : la PF voit l'identité de la famille et du défunt, JAMAIS le contenu. Ces fonctions ne
-- lisent que partners, partner_users et dossiers (lint : aucune table de contenu, ni purchases, ni
-- consents, ni storage). partner_id vient EXCLUSIVEMENT de auth.uid() : un dossier d'une autre PF
-- répond dossier_not_found, exactement comme un dossier inexistant (pas d'oracle d'existence).
-- partner_dashboard() v0 n'est pas touchée : le rollback de code vers le deploy de U1 reste sûr.
-- Le jeton n'arrive jamais ici : seul son sha256 hex (p_token_hash), calculé par le serveur.

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §3.3.9 partner_create_dossier
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.partner_create_dossier(
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
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_pid            uuid;
  v_partner        public.partners%rowtype;
  v_family_first   text := btrim(p_family_first_name);
  v_family_last    text := btrim(p_family_last_name);
  v_email          text := lower(btrim(p_family_email));
  v_phone          text := nullif(btrim(p_family_phone), '');
  v_deceased_first text := btrim(p_deceased_first_name);
  v_deceased_last  text := btrim(p_deceased_last_name);
  v_dup            integer;
  v_d              public.dossiers%rowtype;
begin
  -- 0. Secret partagé, AVANT TOUT (revue 16/09, must-fix 1) : ici l'APPELANT choisit le hash du jeton
  -- d'activation. Appelable en direct via PostgREST, cette RPC laisserait une PF fabriquer un jeton
  -- qu'elle connaît, s'inscrire à la place de la famille (hook satisfait) et prendre son compte.
  -- Même patron que consume_send, INLINÉ (jamais encapsulé dans un helper). N'identifie personne :
  -- partner_id vient toujours d'auth.uid().
  if not exists (select 1 from public.webhook_config w where w.id = 1 and w.rpc_secret = p_secret) then
    raise exception 'invalid_secret' using errcode = 'P0001';
  end if;
  -- 1.
  select pu.partner_id into v_pid from public.partner_users pu where pu.user_id = auth.uid();
  if v_pid is null then
    raise exception 'not_a_partner' using errcode = 'P0001';
  end if;
  -- 2.
  select * into v_partner from public.partners p where p.id = v_pid;
  if v_partner.status <> 'active' then
    raise exception 'partner_inactive' using errcode = 'P0001';
  end if;
  -- 3. Validations, dans l'ordre du contrat (les CHECK de la table restent le filet).
  if coalesce(v_family_first, '') = '' or coalesce(v_family_last, '') = ''
     or char_length(v_family_first) > 100 or char_length(v_family_last) > 100 then
    raise exception 'invalid_family_name' using errcode = 'P0001';
  end if;
  if v_email is null or char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;
  if v_phone is not null and v_phone !~ '^[0-9 +().-]{6,30}$' then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;
  if coalesce(v_deceased_first, '') = '' or coalesce(v_deceased_last, '') = ''
     or char_length(v_deceased_first) > 100 or char_length(v_deceased_last) > 100 then
    raise exception 'invalid_deceased_name' using errcode = 'P0001';
  end if;
  if p_deceased_death_date is null or p_deceased_death_date > current_date
     or p_deceased_death_date < (current_date - interval '2 years') then
    raise exception 'invalid_death_date' using errcode = 'P0001';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_token_hash' using errcode = 'P0001';
  end if;
  -- 4. Plafond anti-abus (borne aussi la consommation d'envois par une PF qui s'inviterait elle-même).
  if (select count(*) from public.dossiers d where d.partner_id = v_pid and d.created_at > now() - interval '24 hours') >= 50 then
    raise exception 'partner_daily_limit' using errcode = 'P0001';
  end if;
  -- 5. E-mail indisponible : message générique, ne dit jamais pourquoi.
  if exists (select 1 from public.dossiers d where d.family_email = v_email and d.status <> 'cancelled')
     or exists (select 1 from public.account_enrollments e where e.email = v_email)
     or exists (select 1
                  from auth.users u
                 where lower(u.email) = v_email
                   and (exists (select 1 from public.partner_users pu2 where pu2.user_id = u.id)
                        or exists (select 1 from public.seren_admins sa where sa.user_id = u.id))) then
    raise exception 'email_unavailable' using errcode = 'P0001';
  end if;
  -- 6. Doublon de défunt chez CE partenaire (nom de famille insensible à la casse + date).
  if not coalesce(p_confirm_duplicate, false) then
    select count(*) into v_dup
      from public.dossiers d
     where d.partner_id = v_pid
       and d.status <> 'cancelled'
       and lower(d.deceased_last_name) = lower(v_deceased_last)
       and d.deceased_death_date = p_deceased_death_date;
    if v_dup > 0 then
      return jsonb_build_object('created', false, 'duplicate_warning', true, 'duplicate_count', v_dup);
    end if;
  end if;
  -- 7. Insertion : snapshots copiés du partenaire au moment de la création.
  begin
    insert into public.dossiers (partner_id, source, status,
                                 family_first_name, family_last_name, family_email, family_phone,
                                 deceased_first_name, deceased_last_name, deceased_death_date,
                                 price_ttc_cents, commission_ttc_cents, included_sends,
                                 invite_token_hash, invite_expires_at, invite_issued_at, created_by)
    values (v_pid, 'partner', 'invited',
            v_family_first, v_family_last, v_email, v_phone,
            v_deceased_first, v_deceased_last, p_deceased_death_date,
            v_partner.price_ttc_cents, v_partner.commission_ttc_cents, 10,
            p_token_hash, now() + interval '7 days', now(), auth.uid())
    returning * into v_d;
  exception when unique_violation then
    -- course sur l'index e-mail ou sur le hash
    raise exception 'email_unavailable' using errcode = 'P0001';
  end;
  -- 8.
  return jsonb_build_object(
    'created',           true,
    'duplicate_warning', false,
    'partner_name',      v_partner.name,
    'dossier', jsonb_build_object('id',                  v_d.id,
                                  'status',              v_d.status,
                                  'created_at',          v_d.created_at,
                                  'invite_expires_at',   v_d.invite_expires_at,
                                  'family_first_name',   v_d.family_first_name,
                                  'family_last_name',    v_d.family_last_name,
                                  'family_email',        v_d.family_email,
                                  'deceased_first_name', v_d.deceased_first_name,
                                  'deceased_last_name',  v_d.deceased_last_name,
                                  'deceased_death_date', v_d.deceased_death_date));
end
$fn$;
-- EXECUTE reste accordé à authenticated : le serveur appelle avec le TOKEN UTILISATEUR (auth.uid()
-- doit être celui du gérant). C'est le secret, et non le grant, qui ferme le chemin direct.
revoke all on function public.partner_create_dossier(text, text, text, text, text, text, text, date, text, boolean) from public, anon, authenticated;
grant execute on function public.partner_create_dossier(text, text, text, text, text, text, text, date, text, boolean) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §3.3.10 partner_rotate_invitation — nouveau lien, l'ancien meurt ; 1 / 10 min, 10 au total
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.partner_rotate_invitation(p_secret text, p_dossier_id uuid, p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_pid          uuid;
  v_partner_name text;
  v_d            public.dossiers%rowtype;
begin
  -- 0. Secret partagé, AVANT TOUT (revue 16/09, must-fix 1) : sans lui, une PF tuerait en direct le
  -- lien d'une famille (rotation silencieuse, aucun e-mail envoyé) et lui substituerait un jeton de
  -- son choix. Le contrôle précède la lecture du dossier : aucun oracle d'existence.
  if not exists (select 1 from public.webhook_config w where w.id = 1 and w.rpc_secret = p_secret) then
    raise exception 'invalid_secret' using errcode = 'P0001';
  end if;
  -- 1.
  select pu.partner_id, p.name into v_pid, v_partner_name
    from public.partner_users pu
    join public.partners p on p.id = pu.partner_id
   where pu.user_id = auth.uid();
  if v_pid is null then
    raise exception 'not_a_partner' using errcode = 'P0001';
  end if;
  -- 2.
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_token_hash' using errcode = 'P0001';
  end if;
  -- 3. Même réponse pour un dossier inexistant ou d'une autre PF.
  select * into v_d from public.dossiers d where d.id = p_dossier_id and d.partner_id = v_pid for update;
  if not found then
    raise exception 'dossier_not_found' using errcode = 'P0001';
  end if;
  -- 4. (une invitation expirée reste renvoyable)
  if v_d.status <> 'invited' then
    raise exception 'dossier_not_invitable' using errcode = 'P0001';
  end if;
  -- 5.
  if v_d.invite_issued_at > now() - interval '10 minutes' then
    raise exception 'rotation_too_soon' using errcode = 'P0001';
  end if;
  -- 6.
  if v_d.invite_rotation_count >= 10 then
    raise exception 'rotation_limit' using errcode = 'P0001';
  end if;
  -- 7.
  begin
    update public.dossiers
       set invite_token_hash     = p_token_hash,
           invite_expires_at     = now() + interval '7 days',
           invite_issued_at      = now(),
           invite_rotation_count = invite_rotation_count + 1,
           updated_at            = now()
     where id = v_d.id
    returning * into v_d;
  exception when unique_violation then
    raise exception 'invalid_token_hash' using errcode = 'P0001';
  end;

  return jsonb_build_object(
    'rotated',      true,
    'partner_name', v_partner_name,
    'dossier', jsonb_build_object('id',                  v_d.id,
                                  'status',              v_d.status,
                                  'created_at',          v_d.created_at,
                                  'invite_expires_at',   v_d.invite_expires_at,
                                  'family_first_name',   v_d.family_first_name,
                                  'family_last_name',    v_d.family_last_name,
                                  'family_email',        v_d.family_email,
                                  'deceased_first_name', v_d.deceased_first_name,
                                  'deceased_last_name',  v_d.deceased_last_name,
                                  'deceased_death_date', v_d.deceased_death_date));
end
$fn$;
revoke all on function public.partner_rotate_invitation(text, uuid, text) from public, anon, authenticated;
grant execute on function public.partner_rotate_invitation(text, uuid, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §3.3.11 partner_cancel_dossier — seulement 'invited' et créé il y a moins de 48 h
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.partner_cancel_dossier(p_dossier_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_pid uuid;
  v_d   public.dossiers%rowtype;
begin
  -- 1.
  select pu.partner_id into v_pid from public.partner_users pu where pu.user_id = auth.uid();
  if v_pid is null then
    raise exception 'not_a_partner' using errcode = 'P0001';
  end if;
  -- 2.
  select * into v_d from public.dossiers d where d.id = p_dossier_id and d.partner_id = v_pid for update;
  if not found then
    raise exception 'dossier_not_found' using errcode = 'P0001';
  end if;
  -- 3. Aucune action PF ne coupe une famille.
  if v_d.status in ('active','closed') then
    raise exception 'dossier_already_active' using errcode = 'P0001';
  end if;
  -- 4.
  if v_d.status = 'cancelled' then
    return jsonb_build_object('cancelled', false, 'already_cancelled', true,
                              'dossier', jsonb_build_object('id', v_d.id, 'status', v_d.status, 'cancelled_at', v_d.cancelled_at));
  end if;
  -- 5.
  if v_d.created_at <= now() - interval '48 hours' then
    raise exception 'cancel_window_elapsed' using errcode = 'P0001';
  end if;
  -- 6. Le hash meurt avec le dossier : le lien envoyé devient « invalid ».
  update public.dossiers
     set status            = 'cancelled',
         cancelled_at      = now(),
         cancelled_by      = auth.uid(),
         invite_token_hash = null,
         invite_expires_at = null,
         updated_at        = now()
   where id = v_d.id
  returning * into v_d;

  return jsonb_build_object('cancelled', true, 'already_cancelled', false,
                            'dossier', jsonb_build_object('id', v_d.id, 'status', v_d.status, 'cancelled_at', v_d.cancelled_at));
end
$fn$;
revoke all on function public.partner_cancel_dossier(uuid) from public, anon, authenticated;
grant execute on function public.partner_cancel_dossier(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §3.3.12 partner_list_dossiers — identité et statuts, aucune jointure vers le contenu
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.partner_list_dossiers()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_pid     uuid;
  v_partner jsonb;
  v_list    jsonb;
begin
  -- Contrat résilié (décision 16/09) : plus aucune lecture, donc plus aucune PII famille pour l'ex-PF.
  -- 'suspended' conserve la lecture (seules création et renvoi sont bloquées).
  select p.id, jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status, 'user_role', pu.role)
    into v_pid, v_partner
    from public.partner_users pu
    join public.partners p on p.id = pu.partner_id
   where pu.user_id = auth.uid()
     and p.status <> 'terminated';
  if v_pid is null then
    return null;
  end if;

  select coalesce(jsonb_agg(x.item order by x.created_at desc, x.id), '[]'::jsonb)
    into v_list
    from (select d.id,
                 d.created_at,
                 jsonb_build_object(
                   'id',                  d.id,
                   'status',              d.status,
                   'source',              d.source,
                   'family_first_name',   d.family_first_name,
                   'family_last_name',    d.family_last_name,
                   'family_email',        d.family_email,
                   'family_phone',        d.family_phone,
                   'deceased_first_name', d.deceased_first_name,
                   'deceased_last_name',  d.deceased_last_name,
                   'deceased_death_date', d.deceased_death_date,
                   'created_at',          d.created_at,
                   'activated_at',        d.activated_at,
                   'cancelled_at',        d.cancelled_at,
                   'invite_expires_at',   d.invite_expires_at,
                   'invite_expired',      d.status = 'invited' and d.invite_expires_at <= now(),
                   'can_resend',          d.status = 'invited',
                   'can_cancel',          d.status = 'invited' and d.created_at > now() - interval '48 hours',
                   'cancel_deadline',     d.created_at + interval '48 hours') as item
            from public.dossiers d
           where d.partner_id = v_pid
           order by d.created_at desc, d.id
           limit 500) as x;

  return jsonb_build_object('partner', v_partner, 'dossiers', v_list);
end
$fn$;
revoke all on function public.partner_list_dossiers() from public, anon, authenticated;
grant execute on function public.partner_list_dossiers() to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §3.3.13 partner_month_counters — compteurs du mois (Europe/Paris) + estimation gérant (A7)
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.partner_month_counters()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_start      timestamptz := date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
  v_pid        uuid;
  v_role       text;
  v_price      integer;
  v_commission integer;
  v_c          record;
  v_bill       record;
  v_billing    jsonb := null;
begin
  -- Contrat résilié : null (même règle que partner_list_dossiers, décision 16/09).
  select pu.partner_id, pu.role, p.price_ttc_cents, p.commission_ttc_cents
    into v_pid, v_role, v_price, v_commission
    from public.partner_users pu
    join public.partners p on p.id = pu.partner_id
   where pu.user_id = auth.uid()
     and p.status <> 'terminated';
  if v_pid is null then
    return null;
  end if;

  select count(*) filter (where d.created_at >= v_start)                                   as created_this_month,
         count(*)                                                                          as created_total,
         count(*) filter (where d.activated_at is not null)                                as activated_total,
         count(*) filter (where d.status = 'invited' and d.invite_expires_at > now())      as pending_activation,
         count(*) filter (where d.status = 'invited' and d.invite_expires_at <= now())     as expired_invitations,
         count(*) filter (where d.status = 'cancelled')                                    as cancelled_total,
         count(*) filter (where d.activated_at >= v_start)                                 as activated_this_month
    into v_c
    from public.dossiers d
   where d.partner_id = v_pid;

  -- Estimation : gérant uniquement ; dossiers source 'partner' activés ce mois, calculée sur les
  -- snapshots. Le serveur la remet à null si PARTNER_BILLING_PREVIEW n'est pas 'true'.
  if v_role = 'manager' then
    select count(*) as billable_count,
           coalesce(sum(d.price_ttc_cents - d.commission_ttc_cents), 0) as seren_due
      into v_bill
      from public.dossiers d
     where d.partner_id = v_pid
       and d.source = 'partner'
       and d.activated_at >= v_start
       and d.status in ('active','closed');
    v_billing := jsonb_build_object('billable_count',      v_bill.billable_count,
                                    'seren_due_ttc_cents', v_bill.seren_due,
                                    'unit_due_ttc_cents',  v_price - v_commission,
                                    'currency',            'EUR');
  end if;

  return jsonb_build_object('month',                to_char(now() at time zone 'Europe/Paris', 'YYYY-MM'),
                            'created_this_month',   v_c.created_this_month,
                            'created_total',        v_c.created_total,
                            'activated_total',      v_c.activated_total,
                            'pending_activation',   v_c.pending_activation,
                            'expired_invitations',  v_c.expired_invitations,
                            'cancelled_total',      v_c.cancelled_total,
                            'activated_this_month', v_c.activated_this_month,
                            'billing_preview',      v_billing);
end
$fn$;
revoke all on function public.partner_month_counters() from public, anon, authenticated;
grant execute on function public.partner_month_counters() to authenticated;
