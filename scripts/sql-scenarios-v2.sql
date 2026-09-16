-- ════════════════════════════════════════════════════════════════════════════════════════
-- scripts/sql-scenarios-v2.sql — Scénarios SQL du démonstrateur v2 (contrat §10.2)
-- ════════════════════════════════════════════════════════════════════════════════════════
-- LOCAL UNIQUEMENT. Lancement : run-sql-checks <worktree> scripts/sql-scenarios-v2.sql
-- (db reset --local + grants « comme l'hébergé » + ce fichier), ou psql-local < ce fichier.
-- Chaque scénario vit dans une transaction terminée par ROLLBACK ; l'identité est simulée par
-- request.jwt.claims + `set local role authenticated|anon` (auth.uid() et auth.jwt() lisent ces
-- claims). Sortie attendue : une ligne « NOTICE:  OK … » par assertion, puis
-- « NOTICE:  SCENARIOS V2 : OK ». Premier écart = ERROR avec le libellé du scénario, code 3.
-- Les fixtures (partenaires, comptes, enrôlements) sont committées en tête et supprimées en fin.
\set ON_ERROR_STOP on

-- ── 0. Garde et nettoyage d'un run interrompu ──────────────────────────────────────────────
do $$
begin
  if (select count(*) from auth.users where email not like '%@scenario.seren-test.fr') > 200 then
    raise exception 'REFUS : plus de 200 comptes hors fixtures — ce script ne tourne que sur une base locale jetable';
  end if;
end $$;

drop schema if exists scenario_v2 cascade;
delete from public.dossiers
 where family_email like '%@scenario.seren-test.fr'
    or user_id in (select id from auth.users where email like '%@scenario.seren-test.fr')
    or partner_id in ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000a003');
delete from public.account_enrollments where email like '%@scenario.seren-test.fr';
delete from auth.users where email like '%@scenario.seren-test.fr';
delete from public.partners
 where id in ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000a003');

-- ── 1. Helpers (schéma jetable, supprimé en fin de fichier) ───────────────────────────────
create schema scenario_v2;
grant usage on schema scenario_v2 to anon, authenticated;

create function scenario_v2.h(p text) returns text language sql immutable as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex')
$$;

create function scenario_v2.claims(p_uid uuid, p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    case when p_uid is null then '{}'
         else json_build_object('sub', p_uid, 'email', p_email, 'role', 'authenticated')::text end,
    true);
end $$;

create function scenario_v2.ok(p_label text, p_cond boolean, p_detail text default null) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception '[%] ÉCHEC%', p_label, coalesce(' — ' || p_detail, '');
  end if;
  raise notice 'OK %', p_label;
end $$;

-- p_expected = message exact (code §3.5), ou '#<SQLSTATE>' pour comparer l'état (ex. '#42501').
create function scenario_v2.expect_error(p_label text, p_sql text, p_expected text) returns void language plpgsql as $$
declare
  v_err   text;
  v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    v_err := sqlerrm;
    v_state := sqlstate;
  end;
  if v_err is null then
    raise exception '[%] attendu l''erreur « % », obtenu un succès', p_label, p_expected;
  end if;
  if p_expected like '#%' then
    if v_state <> substr(p_expected, 2) then
      raise exception '[%] attendu SQLSTATE %, obtenu % (%)', p_label, substr(p_expected, 2), v_state, v_err;
    end if;
  elsif v_err <> p_expected then
    raise exception '[%] attendu « % », obtenu « % » (SQLSTATE %)', p_label, p_expected, v_err, v_state;
  end if;
  raise notice 'OK % (%)', p_label, p_expected;
end $$;

grant execute on all functions in schema scenario_v2 to anon, authenticated;

-- ── 2. Fixtures committées ─────────────────────────────────────────────────────────────────
insert into public.partners (id, name, status, siret, billing_email, price_ttc_cents, commission_ttc_cents, contract_signed_at) values
  ('00000000-0000-4000-8000-00000000a001', 'PF Scénario X', 'active', '12345678900011', 'factu.x@scenario.seren-test.fr', 29000, 7000, current_date),
  ('00000000-0000-4000-8000-00000000a002', 'PF Scénario Y', 'active', '12345678900012', null, 29000, 7000, current_date),
  ('00000000-0000-4000-8000-00000000a003', 'PF Scénario Suspendue', 'suspended', null, null, 29000, 7000, null);

-- ORDRE IMPOSÉ (revue 16/09, must-fix 2) : l'enrôlement AVANT les comptes, comme dans le runbook
-- (partie 1 du seed, puis « Add user »). link_enrollments refuse désormais tout compte dont
-- created_at est ANTÉRIEUR à son enrôlement : des fixtures dans l'ordre inverse seraient rejetées.
insert into public.account_enrollments (email, role, partner_id) values
  ('pfx.manager@scenario.seren-test.fr',     'partner_manager', '00000000-0000-4000-8000-00000000a001'),
  ('pfy.manager@scenario.seren-test.fr',     'partner_manager', '00000000-0000-4000-8000-00000000a002'),
  ('pfs.manager@scenario.seren-test.fr',     'partner_manager', '00000000-0000-4000-8000-00000000a003'),
  ('pending.manager@scenario.seren-test.fr', 'partner_manager', '00000000-0000-4000-8000-00000000a001'),
  ('admin@scenario.seren-test.fr',           'seren_admin',     null);

-- Comptes « créés par Arnaud » : last_sign_in_at null, email_change vide (constat local du 16/09 sur
-- l'API admin de GoTrue, équivalent du bouton « Add user »).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated', u.email, '', now(),
       '{}'::jsonb, '{}'::jsonb, now(), now()
  from (values
    ('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr'),
    ('00000000-0000-4000-8000-00000000b002', 'pfx.advisor@scenario.seren-test.fr'),
    ('00000000-0000-4000-8000-00000000b003', 'pfy.manager@scenario.seren-test.fr'),
    ('00000000-0000-4000-8000-00000000b004', 'pfs.manager@scenario.seren-test.fr'),
    ('00000000-0000-4000-8000-00000000b005', 'admin@scenario.seren-test.fr'),
    ('00000000-0000-4000-8000-00000000b006', 'fam1@scenario.seren-test.fr'),
    ('00000000-0000-4000-8000-00000000b007', 'fam2@scenario.seren-test.fr'),
    ('00000000-0000-4000-8000-00000000b008', 'nobody@scenario.seren-test.fr'),
    ('00000000-0000-4000-8000-00000000b009', 'fam3@scenario.seren-test.fr')
  ) as u(id, email);

insert into public.partner_users (user_id, partner_id, role) values
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000a001', 'manager'),
  ('00000000-0000-4000-8000-00000000b002', '00000000-0000-4000-8000-00000000a001', 'advisor'),
  ('00000000-0000-4000-8000-00000000b003', '00000000-0000-4000-8000-00000000a002', 'manager'),
  ('00000000-0000-4000-8000-00000000b004', '00000000-0000-4000-8000-00000000a003', 'manager');

insert into public.seren_admins (user_id) values ('00000000-0000-4000-8000-00000000b005');

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S0 — hook_before_user_created (appel direct en rôle postgres) : acceptés ET refusés
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
insert into public.dossiers (partner_id, source, status, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, invite_token_hash, invite_expires_at, invite_issued_at) values
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'invited', 'Anne', 'Durand', 'fam3@scenario.seren-test.fr',
   'Louis', 'Durand', current_date - 5, 29000, 7000, scenario_v2.h('s0-ok'), now() + interval '7 days', now()),
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'invited', 'Eve', 'Morel', 'expired.s0@scenario.seren-test.fr',
   'Marc', 'Morel', current_date - 20, 29000, 7000, scenario_v2.h('s0-exp'), now() - interval '1 minute', now() - interval '8 days');
insert into public.dossiers (partner_id, source, status, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, cancelled_at) values
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'cancelled', 'Lou', 'Petit', 'cancel.s0@scenario.seren-test.fr',
   'René', 'Petit', current_date - 2, 29000, 7000, now());

do $$
declare
  v_refus constant jsonb := '{"error":{"http_code":403,"message":"signup_requires_invitation"}}';
begin
  perform scenario_v2.ok('S0a e-mail absent → refus', public.hook_before_user_created('{"user":{}}') = v_refus);
  perform scenario_v2.ok('S0b e-mail blanc → refus', public.hook_before_user_created('{"user":{"email":"  "}}') = v_refus);
  perform scenario_v2.ok('S0c e-mail aléatoire sans metadata → refus',
    public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'inconnu@scenario.seren-test.fr'))) = v_refus);
  perform scenario_v2.ok('S0d e-mail invité sans hash → refus',
    public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'fam3@scenario.seren-test.fr', 'user_metadata', '{}'::jsonb))) = v_refus);
  perform scenario_v2.ok('S0e e-mail invité + hash d''un autre dossier → refus',
    public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'fam3@scenario.seren-test.fr',
      'user_metadata', jsonb_build_object('invite_token_hash', scenario_v2.h('s0-exp'))))) = v_refus);
  perform scenario_v2.ok('S0f e-mail invité (casse et espaces) + bon hash → accepté',
    public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', '  FAM3@Scenario.Seren-Test.fr ',
      'user_metadata', jsonb_build_object('invite_token_hash', scenario_v2.h('s0-ok'))))) = '{}'::jsonb);
  perform scenario_v2.ok('S0g bon hash mais autre e-mail → refus',
    public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'fam2@scenario.seren-test.fr',
      'user_metadata', jsonb_build_object('invite_token_hash', scenario_v2.h('s0-ok'))))) = v_refus);
  perform scenario_v2.ok('S0h invitation expirée → refus',
    public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'expired.s0@scenario.seren-test.fr',
      'user_metadata', jsonb_build_object('invite_token_hash', scenario_v2.h('s0-exp'))))) = v_refus);
  perform scenario_v2.ok('S0i dossier annulé, ancien hash → refus',
    public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'cancel.s0@scenario.seren-test.fr',
      'user_metadata', jsonb_build_object('invite_token_hash', scenario_v2.h('s0-cancel'))))) = v_refus);
  perform scenario_v2.ok('S0j hash hors motif (majuscules) → refus',
    public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'fam3@scenario.seren-test.fr',
      'user_metadata', jsonb_build_object('invite_token_hash', upper(scenario_v2.h('s0-ok')))))) = v_refus);
  perform scenario_v2.ok('S0k enrôlé partner_manager sans compte, sans hash → accepté',
    public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'pending.manager@scenario.seren-test.fr'))) = '{}'::jsonb);
  perform scenario_v2.ok('S0l enrôlé seren_admin → accepté',
    public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'admin@scenario.seren-test.fr'))) = '{}'::jsonb);
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S4 — invitation_preview (rôle anon) : valide, expirée, inconnue, hors motif, dossier direct
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
insert into public.dossiers (partner_id, source, status, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, invite_token_hash, invite_expires_at, invite_issued_at) values
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'invited', 'Anne', 'Durand', 'fam3@scenario.seren-test.fr',
   'Louis', 'Durand', current_date - 5, 29000, 7000, scenario_v2.h('s4-ok'), now() + interval '7 days', now()),
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'invited', 'Eve', 'Morel', 'expired.s4@scenario.seren-test.fr',
   'Marc', 'Morel', current_date - 20, 29000, 7000, scenario_v2.h('s4-exp'), now() - interval '1 minute', now() - interval '8 days'),
  (null, 'direct', 'invited', null, null, 'direct.s4@scenario.seren-test.fr',
   null, null, null, 0, 0, scenario_v2.h('s4-direct'), now() + interval '7 days', now());
select scenario_v2.claims(null, null);
set local role anon;
do $$
declare r jsonb;
begin
  r := public.invitation_preview(scenario_v2.h('s4-ok'));
  perform scenario_v2.ok('S4a lien valide', (r->>'valid')::boolean and r->>'email' = 'fam3@scenario.seren-test.fr'
    and r->>'partner_name' = 'PF Scénario X' and r->>'family_first_name' = 'Anne' and r->>'deceased_first_name' = 'Louis', r::text);
  perform scenario_v2.ok('S4b clés exactes, ni nom de famille, ni date de décès, ni identifiant',
    (select array_agg(k order by k) from jsonb_object_keys(r) as k)
      = array['deceased_first_name', 'email', 'expires_at', 'family_first_name', 'partner_name', 'valid'], r::text);
  r := public.invitation_preview(scenario_v2.h('s4-exp'));
  perform scenario_v2.ok('S4c lien expiré', r = jsonb_build_object('valid', false, 'reason', 'expired', 'partner_name', 'PF Scénario X'), r::text);
  r := public.invitation_preview(scenario_v2.h('inconnu'));
  perform scenario_v2.ok('S4d hash inconnu', r = '{"valid":false,"reason":"invalid"}'::jsonb, r::text);
  r := public.invitation_preview('pas-un-hash');
  perform scenario_v2.ok('S4e hash hors motif', r = '{"valid":false,"reason":"invalid"}'::jsonb, r::text);
  r := public.invitation_preview(null);
  perform scenario_v2.ok('S4f hash null', r = '{"valid":false,"reason":"invalid"}'::jsonb, r::text);
  r := public.invitation_preview(scenario_v2.h('s4-direct'));
  perform scenario_v2.ok('S4g dossier direct : partner_name null', (r->>'valid')::boolean and r->'partner_name' = 'null'::jsonb, r::text);
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S5 — claim_dossier : ordre strict des refus, succès, idempotence, pont purchases
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
insert into public.dossiers (partner_id, source, status, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, included_sends, invite_token_hash, invite_expires_at, invite_issued_at) values
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'invited', 'Claire', 'Martin', 'fam1@scenario.seren-test.fr',
   'Jean', 'Martin', current_date - 3, 29000, 7000, 10, scenario_v2.h('s5-ok'), now() + interval '7 days', now()),
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'invited', 'Paul', 'Roy', 'fam2@scenario.seren-test.fr',
   'Luc', 'Roy', current_date - 30, 29000, 7000, 10, scenario_v2.h('s5-exp'), now() - interval '1 minute', now() - interval '8 days'),
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'invited', 'Anne', 'Durand', 'fam3@scenario.seren-test.fr',
   'Louis', 'Durand', current_date - 5, 29000, 7000, 10, scenario_v2.h('s5-fam3'), now() + interval '7 days', now()),
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'invited', 'Lou', 'Petit', 'cancel.s5@scenario.seren-test.fr',
   'René', 'Petit', current_date - 2, 29000, 7000, 10, scenario_v2.h('s5-cancel'), now() + interval '7 days', now());
-- famille 3 porte déjà un dossier clos (ancienne adresse) → account_already_linked
insert into public.dossiers (partner_id, source, status, user_id, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, activated_at, closed_at) values
  ('00000000-0000-4000-8000-00000000a002', 'partner', 'closed', '00000000-0000-4000-8000-00000000b009', 'Anne', 'Durand',
   'ancien.fam3@scenario.seren-test.fr', 'Paul', 'Durand', current_date - 400, 29000, 7000, now() - interval '300 days', now() - interval '1 day');
-- le dossier « annulé » : même transition que partner_cancel_dossier (hash effacé)
update public.dossiers set status = 'cancelled', cancelled_at = now(), invite_token_hash = null, invite_expires_at = null
 where family_email = 'cancel.s5@scenario.seren-test.fr';

select scenario_v2.claims(null, null);
set local role authenticated;
do $$ begin
  perform scenario_v2.expect_error('S5a sans identité', format('select public.claim_dossier(%L)', scenario_v2.h('s5-ok')), 'not_authenticated');
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.expect_error('S5b compte PF', format('select public.claim_dossier(%L)', scenario_v2.h('s5-ok')), 'account_role_forbidden');
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b005', 'admin@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.expect_error('S5c compte admin', format('select public.claim_dossier(%L)', scenario_v2.h('s5-ok')), 'account_role_forbidden');
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b007', 'fam2@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.expect_error('S5d hash hors motif', $q$select public.claim_dossier('xyz')$q$, 'invalid_token');
  perform scenario_v2.expect_error('S5e hash inconnu, aucun dossier actif', format('select public.claim_dossier(%L)', scenario_v2.h('inconnu')), 'invalid_token');
  perform scenario_v2.expect_error('S5f invitation expirée', format('select public.claim_dossier(%L)', scenario_v2.h('s5-exp')), 'invitation_expired');
  perform scenario_v2.expect_error('S5g lien d''une autre adresse', format('select public.claim_dossier(%L)', scenario_v2.h('s5-ok')), 'email_mismatch');
  perform scenario_v2.expect_error('S5h dossier annulé, ancien lien', format('select public.claim_dossier(%L)', scenario_v2.h('s5-cancel')), 'invalid_token');
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b009', 'fam3@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.expect_error('S5i compte déjà rattaché à un dossier', format('select public.claim_dossier(%L)', scenario_v2.h('s5-fam3')), 'account_already_linked');
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b006', 'FAM1@Scenario.Seren-Test.fr');
set local role authenticated;
do $$
declare r jsonb; r2 jsonb; r3 jsonb;
begin
  r := public.claim_dossier(scenario_v2.h('s5-ok'));
  perform scenario_v2.ok('S5j succès (e-mail du JWT normalisé)', (r->>'claimed')::boolean and not (r->>'already_active')::boolean
    and r->>'partner_name' = 'PF Scénario X' and (r->>'dossier_id') is not null, r::text);
  perform set_config('scenario.s5_dossier', r->>'dossier_id', true);
  r2 := public.claim_dossier(scenario_v2.h('s5-ok'));
  perform scenario_v2.ok('S5k rejeu → already_active, même dossier', not (r2->>'claimed')::boolean and (r2->>'already_active')::boolean
    and r2->>'dossier_id' = r->>'dossier_id', r2::text);
  r3 := public.claim_dossier(scenario_v2.h('inconnu'));
  perform scenario_v2.ok('S5l hash inconnu avec dossier actif → already_active (étape 5)', (r3->>'already_active')::boolean, r3::text);
end $$;

reset role;
do $$
declare v_id uuid := current_setting('scenario.s5_dossier')::uuid;
begin
  perform scenario_v2.ok('S5m dossier activé, hash et expiration effacés',
    (select status = 'active' and user_id = '00000000-0000-4000-8000-00000000b006' and invite_token_hash is null
            and invite_expires_at is null and activated_at is not null from public.dossiers where id = v_id));
  perform scenario_v2.ok('S5n pont : exactement 1 ligne purchases paid/forfait/10, montant null',
    (select count(*) = 1 and bool_and(user_id = '00000000-0000-4000-8000-00000000b006' and status = 'paid' and kind = 'forfait'
            and included_sends = 10 and amount_total is null and paid_at is not null)
       from public.purchases where stripe_session_id = 'partner_dossier:' || v_id::text));
  perform scenario_v2.ok('S5o aucun autre achat pour la famille',
    (select count(*) = 1 from public.purchases where user_id = '00000000-0000-4000-8000-00000000b006'));
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S6 — pont : send_balance = 10 après claim, 10 consume_send passent, le 11ᵉ lève quota_exhausted
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
insert into public.webhook_config (id, rpc_secret) values (1, 'scenario-local-secret')
  on conflict (id) do update set rpc_secret = excluded.rpc_secret;
insert into public.dossiers (partner_id, source, status, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, invite_token_hash, invite_expires_at, invite_issued_at) values
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'invited', 'Claire', 'Martin', 'fam1@scenario.seren-test.fr',
   'Jean', 'Martin', current_date - 3, 29000, 7000, scenario_v2.h('s6-ok'), now() + interval '7 days', now());
select scenario_v2.claims('00000000-0000-4000-8000-00000000b006', 'fam1@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform public.claim_dossier(scenario_v2.h('s6-ok'));
  perform public.claim_dossier(scenario_v2.h('s6-ok'));   -- double clic
end $$;
reset role;
do $$
declare
  v_uid  uuid := '00000000-0000-4000-8000-00000000b006';
  v_send uuid;
  r      jsonb;
  i      integer;
begin
  perform scenario_v2.ok('S6a double claim → une seule ligne pont', (select count(*) = 1 from public.purchases where user_id = v_uid));
  perform scenario_v2.ok('S6b send_balance = 10 après claim', public.send_balance(v_uid) = 10);
  for i in 1..11 loop
    insert into public.letter_sends (user_id, template_id, channel, status, dedup_key)
    values (v_uid, 'scenario', 'papier', 'prepared', 'scenario-s6-' || i)
    returning id into v_send;
    if i <= 10 then
      r := public.consume_send('scenario-local-secret', v_send, v_uid);
      perform scenario_v2.ok('S6c débit ' || i || '/10', (r->>'debited')::boolean and r->>'source' = 'included'
        and (r->>'balance_after')::int = 10 - i, r::text);
    else
      perform scenario_v2.expect_error('S6d 11ᵉ envoi refusé',
        format('select public.consume_send(%L, %L::uuid, %L::uuid)', 'scenario-local-secret', v_send, v_uid), 'quota_exhausted');
    end if;
  end loop;
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S7 — record_consents : refus, succès, rejeu, bascule de my_account().consent.required
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
insert into public.dossiers (partner_id, source, status, user_id, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, activated_at) values
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'active', '00000000-0000-4000-8000-00000000b006', 'Claire', 'Martin',
   'fam1@scenario.seren-test.fr', 'Jean', 'Martin', current_date - 3, 29000, 7000, now());

select scenario_v2.claims(null, null);
set local role authenticated;
do $$ begin
  perform scenario_v2.expect_error('S7a sans identité',
    $q$select public.record_consents('2026-09-beta-1', array['terms','privacy','sensitive_data'])$q$, 'not_authenticated');
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b007', 'fam2@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.expect_error('S7b sans dossier actif',
    $q$select public.record_consents(public.consent_version(), array['terms','privacy','sensitive_data'])$q$, 'dossier_not_active');
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b006', 'fam1@scenario.seren-test.fr');
set local role authenticated;
do $$
declare r jsonb;
begin
  perform scenario_v2.ok('S7c consentement requis avant', (public.my_account()->'consent'->>'required')::boolean);
  perform scenario_v2.expect_error('S7d mauvaise version',
    $q$select public.record_consents('2026-01-autre', array['terms','privacy','sensitive_data'])$q$, 'consent_version_mismatch');
  perform scenario_v2.expect_error('S7e kinds incomplets',
    $q$select public.record_consents(public.consent_version(), array['terms','privacy'])$q$, 'consent_incomplete');
  perform scenario_v2.expect_error('S7f kind inconnu en plus',
    $q$select public.record_consents(public.consent_version(), array['terms','privacy','sensitive_data','marketing'])$q$, 'consent_incomplete');
  perform scenario_v2.expect_error('S7g élément null',
    $q$select public.record_consents(public.consent_version(), array['terms','privacy','sensitive_data',null])$q$, 'consent_incomplete');
  perform scenario_v2.expect_error('S7h tableau null',
    $q$select public.record_consents(public.consent_version(), null)$q$, 'consent_incomplete');
  r := public.record_consents(public.consent_version(), array['sensitive_data', 'terms', 'privacy', 'terms']);
  perform scenario_v2.ok('S7i succès (ordre et doublons ignorés)', (r->>'recorded')::int = 3 and not (r->>'required')::boolean
    and r->>'version' = '2026-09-beta-1', r::text);
  r := public.record_consents(public.consent_version(), array['terms', 'privacy', 'sensitive_data']);
  perform scenario_v2.ok('S7j rejeu → recorded 0', (r->>'recorded')::int = 0, r::text);
  r := public.my_account();
  perform scenario_v2.ok('S7k consentement plus requis, accepted_at posé', not (r->'consent'->>'required')::boolean
    and r->'consent'->>'accepted_at' is not null and r->'consent'->>'version' = '2026-09-beta-1', r::text);
  perform scenario_v2.ok('S7l la famille lit ses 3 consentements', (select count(*) = 3 from public.consents));
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b007', 'fam2@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.ok('S7m une autre famille ne lit aucun consentement', (select count(*) = 0 from public.consents));
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S8 — my_account : rôles exclusifs (§2.3), projection sans snapshot ni e-mail ni hash
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
insert into public.dossiers (partner_id, source, status, user_id, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, activated_at) values
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'active', '00000000-0000-4000-8000-00000000b006', 'Claire', 'Martin',
   'fam1@scenario.seren-test.fr', 'Jean', 'Martin', current_date - 3, 29000, 7000, now());
insert into public.dossiers (partner_id, source, status, user_id, family_email, price_ttc_cents, commission_ttc_cents,
                             activated_at, closed_at) values
  (null, 'direct', 'closed', '00000000-0000-4000-8000-00000000b007', 'fam2@scenario.seren-test.fr', 0, 0,
   now() - interval '10 days', now() - interval '1 day');

select scenario_v2.claims('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr');
set local role authenticated;
do $$
declare r jsonb := public.my_account();
begin
  perform scenario_v2.ok('S8a gérant PF → role partner', r->>'role' = 'partner' and not (r->>'is_admin')::boolean
    and r->'partner' = jsonb_build_object('id', '00000000-0000-4000-8000-00000000a001', 'name', 'PF Scénario X', 'status', 'active', 'user_role', 'manager')
    and r->'dossier' = 'null'::jsonb and not (r->'consent'->>'required')::boolean, r::text);
  perform scenario_v2.ok('S8b clés de premier niveau exactes',
    (select array_agg(k order by k) from jsonb_object_keys(r) as k) = array['consent', 'dossier', 'is_admin', 'partner', 'role', 'user_id'], r::text);
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b002', 'pfx.advisor@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.ok('S8c conseiller → user_role advisor', public.my_account()->'partner'->>'user_role' = 'advisor');
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b006', 'fam1@scenario.seren-test.fr');
set local role authenticated;
do $$
declare r jsonb := public.my_account();
begin
  perform scenario_v2.ok('S8d famille active', r->>'role' = 'family' and r->'partner' = 'null'::jsonb
    and r->'dossier'->>'status' = 'active' and r->'dossier'->>'source' = 'partner'
    and r->'dossier'->>'partner_name' = 'PF Scénario X' and r->'dossier'->>'deceased_first_name' = 'Jean'
    and (r->'dossier'->>'included_sends')::int = 10 and r->'dossier'->>'activated_at' is not null
    and (r->'consent'->>'required')::boolean and r->'consent'->'accepted_at' = 'null'::jsonb, r::text);
  perform scenario_v2.ok('S8e clés du dossier exactes',
    (select array_agg(k order by k) from jsonb_object_keys(r->'dossier') as k)
      = array['activated_at', 'deceased_first_name', 'id', 'included_sends', 'partner_name', 'source', 'status'], r::text);
  perform scenario_v2.ok('S8f ni e-mail, ni hash, ni snapshot', r::text !~ '(family_email|invite_token_hash|price_ttc|commission_ttc|@scenario)', r::text);
  perform scenario_v2.ok('S8g has_active_dossier vrai', public.has_active_dossier());
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b007', 'fam2@scenario.seren-test.fr');
set local role authenticated;
do $$
declare r jsonb := public.my_account();
begin
  perform scenario_v2.ok('S8h dossier clos direct → family, closed, partner_name null', r->>'role' = 'family'
    and r->'dossier'->>'status' = 'closed' and r->'dossier'->'partner_name' = 'null'::jsonb, r::text);
  perform scenario_v2.ok('S8i has_active_dossier faux sur dossier clos', not public.has_active_dossier());
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b008', 'nobody@scenario.seren-test.fr');
set local role authenticated;
do $$
declare r jsonb := public.my_account();
begin
  perform scenario_v2.ok('S8j compte vide → none', r->>'role' = 'none' and not (r->>'is_admin')::boolean
    and r->'partner' = 'null'::jsonb and r->'dossier' = 'null'::jsonb and not (r->'consent'->>'required')::boolean, r::text);
  perform scenario_v2.ok('S8k has_active_dossier faux', not public.has_active_dossier());
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b005', 'admin@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.ok('S8l admin → none + is_admin', public.my_account()->>'role' = 'none' and (public.my_account()->>'is_admin')::boolean);
end $$;

reset role;
select scenario_v2.claims(null, null);
set local role authenticated;
do $$ begin
  perform scenario_v2.ok('S8m sans identité → null', public.my_account() is null);
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S12 — deny-all : aucune lecture ni écriture directe des tables v2 et PF (grants « hébergé » appliqués)
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
insert into public.dossiers (partner_id, source, status, user_id, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, activated_at) values
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'active', '00000000-0000-4000-8000-00000000b006', 'Claire', 'Martin',
   'fam1@scenario.seren-test.fr', 'Jean', 'Martin', current_date - 3, 29000, 7000, now());
insert into public.attributions (user_id, partner_id) values ('00000000-0000-4000-8000-00000000b007', '00000000-0000-4000-8000-00000000a001');

select scenario_v2.claims('00000000-0000-4000-8000-00000000b006', 'fam1@scenario.seren-test.fr');
set local role authenticated;
do $$
declare n integer;
begin
  perform scenario_v2.ok('S12a SELECT dossiers → 0', (select count(*) = 0 from public.dossiers));
  perform scenario_v2.ok('S12b SELECT account_enrollments → 0', (select count(*) = 0 from public.account_enrollments));
  perform scenario_v2.ok('S12c SELECT seren_admins → 0', (select count(*) = 0 from public.seren_admins));
  perform scenario_v2.ok('S12d SELECT partners → 0', (select count(*) = 0 from public.partners));
  perform scenario_v2.ok('S12e SELECT partner_users → 0', (select count(*) = 0 from public.partner_users));
  perform scenario_v2.ok('S12f SELECT attributions → 0', (select count(*) = 0 from public.attributions));
  perform scenario_v2.expect_error('S12g INSERT dossiers',
    format($q$insert into public.dossiers (source, status, family_email, price_ttc_cents, commission_ttc_cents, invite_token_hash, invite_expires_at)
              values ('direct', 'invited', 'forge@scenario.seren-test.fr', 0, 0, %L, now() + interval '7 days')$q$, scenario_v2.h('forge')), '#42501');
  perform scenario_v2.expect_error('S12h INSERT account_enrollments',
    $q$insert into public.account_enrollments (email, role) values ('forge@scenario.seren-test.fr', 'seren_admin')$q$, '#42501');
  perform scenario_v2.expect_error('S12i INSERT seren_admins',
    $q$insert into public.seren_admins (user_id) values ('00000000-0000-4000-8000-00000000b006')$q$, '#42501');
  perform scenario_v2.expect_error('S12j INSERT partners', $q$insert into public.partners (name) values ('PF forgée')$q$, '#42501');
  perform scenario_v2.expect_error('S12k INSERT partner_users',
    $q$insert into public.partner_users (user_id, partner_id) values ('00000000-0000-4000-8000-00000000b006', '00000000-0000-4000-8000-00000000a001')$q$, '#42501');
  perform scenario_v2.expect_error('S12l INSERT attributions',
    $q$insert into public.attributions (user_id, partner_id) values ('00000000-0000-4000-8000-00000000b006', '00000000-0000-4000-8000-00000000a001')$q$, '#42501');
  perform scenario_v2.expect_error('S12m INSERT consents (aucune policy d''écriture)',
    $q$insert into public.consents (user_id, kind, version) values ('00000000-0000-4000-8000-00000000b006', 'terms', '2026-09-beta-1')$q$, '#42501');
  update public.dossiers set included_sends = 99 where true;
  get diagnostics n = row_count;
  perform scenario_v2.ok('S12n UPDATE dossiers → 0 ligne', n = 0);
end $$;

reset role;
select scenario_v2.claims(null, null);
set local role anon;
do $$ begin
  perform scenario_v2.ok('S12o anon : dossiers et consents → 0', (select count(*) = 0 from public.dossiers) and (select count(*) = 0 from public.consents));
end $$;

reset role;
do $$ begin
  perform scenario_v2.ok('S12p le dossier est intact', (select included_sends = 10 from public.dossiers where user_id = '00000000-0000-4000-8000-00000000b006'));
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S13 — droits des fonctions core (§3.4)
-- ════════════════════════════════════════════════════════════════════════════════════════
do $$
declare v_fn text;
begin
  foreach v_fn in array array['public.consent_version()', 'public.hook_before_user_created(jsonb)', 'public.link_enrollments(jsonb)',
                              'public.invitation_preview(text)', 'public.claim_dossier(text)', 'public.my_account()',
                              'public.record_consents(text, text[])', 'public.has_active_dossier()'] loop
    perform scenario_v2.ok('S13a aucun EXECUTE PUBLIC : ' || v_fn,
      (select p.proacl is not null and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
         from pg_proc p where p.oid = v_fn::regprocedure));
    perform scenario_v2.ok('S13b search_path vide : ' || v_fn,
      (select coalesce(array_to_string(p.proconfig, ',') like '%search_path=""%', false) from pg_proc p where p.oid = v_fn::regprocedure));
    perform scenario_v2.ok('S13c security definer sauf consent_version : ' || v_fn,
      (select p.prosecdef = (v_fn <> 'public.consent_version()') from pg_proc p where p.oid = v_fn::regprocedure));
  end loop;
  perform scenario_v2.ok('S13d anon ne claim pas', not has_function_privilege('anon', 'public.claim_dossier(text)', 'execute'));
  perform scenario_v2.ok('S13e anon sans my_account', not has_function_privilege('anon', 'public.my_account()', 'execute'));
  perform scenario_v2.ok('S13f anon sans record_consents', not has_function_privilege('anon', 'public.record_consents(text, text[])', 'execute'));
  perform scenario_v2.ok('S13g anon sans has_active_dossier', not has_function_privilege('anon', 'public.has_active_dossier()', 'execute'));
  perform scenario_v2.ok('S13h invitation_preview : anon et authenticated',
    has_function_privilege('anon', 'public.invitation_preview(text)', 'execute')
    and has_function_privilege('authenticated', 'public.invitation_preview(text)', 'execute'));
  perform scenario_v2.ok('S13i hook : ni anon ni authenticated',
    not has_function_privilege('anon', 'public.hook_before_user_created(jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.hook_before_user_created(jsonb)', 'execute'));
  perform scenario_v2.ok('S13j hook : supabase_auth_admin', has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created(jsonb)', 'execute'));
  perform scenario_v2.ok('S13k hook : owner postgres',
    (select pg_get_userbyid(proowner) = 'postgres' from pg_proc where oid = 'public.hook_before_user_created(jsonb)'::regprocedure));
  perform scenario_v2.ok('S13l link_enrollments non exposée',
    not has_function_privilege('anon', 'public.link_enrollments(jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.link_enrollments(jsonb)', 'execute'));
  perform scenario_v2.ok('S13m usage du schéma public pour supabase_auth_admin', has_schema_privilege('supabase_auth_admin', 'public', 'usage'));
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S14 — link_enrollments : liaison, rejeu, conflit famille
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
delete from public.partner_users
 where user_id in ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000b003', '00000000-0000-4000-8000-00000000b004');
delete from public.seren_admins;
do $$
declare
  -- Appariement explicite e-mail ↔ UUID (revue 16/09) : exactement ce qu'Arnaud colle depuis « Add user ».
  v_pairs constant jsonb := '[
    {"email": "pfx.manager@scenario.seren-test.fr", "user_id": "00000000-0000-4000-8000-00000000b001"},
    {"email": "pfy.manager@scenario.seren-test.fr", "user_id": "00000000-0000-4000-8000-00000000b003"},
    {"email": "pfs.manager@scenario.seren-test.fr", "user_id": "00000000-0000-4000-8000-00000000b004"},
    {"email": "admin@scenario.seren-test.fr",       "user_id": "00000000-0000-4000-8000-00000000b005"}
  ]'::jsonb;
  r jsonb;
begin
  r := public.link_enrollments(v_pairs);
  perform scenario_v2.ok('S14a compteurs', r = '{"partner_users_linked":3,"seren_admins_linked":1,"pending":1,"untrusted":0}'::jsonb, r::text);
  perform scenario_v2.ok('S14b gérants recréés en manager sur la bonne PF',
    (select count(*) = 3 from public.partner_users
      where (user_id, partner_id, role) in (('00000000-0000-4000-8000-00000000b001'::uuid, '00000000-0000-4000-8000-00000000a001'::uuid, 'manager'),
                                           ('00000000-0000-4000-8000-00000000b003'::uuid, '00000000-0000-4000-8000-00000000a002'::uuid, 'manager'),
                                           ('00000000-0000-4000-8000-00000000b004'::uuid, '00000000-0000-4000-8000-00000000a003'::uuid, 'manager'))));
  perform scenario_v2.ok('S14c admin recréé', exists (select 1 from public.seren_admins where user_id = '00000000-0000-4000-8000-00000000b005'));
  perform scenario_v2.ok('S14d liaisons tracées, enrôlement sans compte en attente',
    (select count(*) filter (where linked_user_id is not null and linked_at is not null) = 4
        and count(*) filter (where email = 'pending.manager@scenario.seren-test.fr' and linked_user_id is null) = 1
       from public.account_enrollments where email like '%@scenario.seren-test.fr'));
  r := public.link_enrollments(v_pairs);
  perform scenario_v2.ok('S14e rejeu sans doublon (paires déjà liées : contrôles de confiance sautés)',
    r = '{"partner_users_linked":3,"seren_admins_linked":1,"pending":1,"untrusted":0}'::jsonb
    and (select count(*) = 4 from public.partner_users where user_id::text like '00000000-0000-4000-8000-00000000b%'), r::text);
  perform scenario_v2.ok('S14e2 appel sans paires : état des lieux, aucune liaison',
    public.link_enrollments() = '{"partner_users_linked":0,"seren_admins_linked":0,"pending":1,"untrusted":0}'::jsonb);
end $$;
insert into public.dossiers (partner_id, source, status, user_id, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, activated_at) values
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'active', '00000000-0000-4000-8000-00000000b006', 'Claire', 'Martin',
   'fam1@scenario.seren-test.fr', 'Jean', 'Martin', current_date - 3, 29000, 7000, now());
insert into public.account_enrollments (email, role) values ('fam1@scenario.seren-test.fr', 'seren_admin');
do $$ begin
  -- La garde famille précède le traitement des paires : elle se déclenche même sans paire.
  perform scenario_v2.expect_error('S14f compte enrôlé portant un dossier → refus', 'select public.link_enrollments()', 'enrollment_conflict_family');
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S14g-l — comptes NON FIABLES : aucun ne devient gérant PF ni admin Seren (revue 16/09, must-fix 2)
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
do $$
declare
  v_pfx constant text := '[{"email": "pfx.manager@scenario.seren-test.fr", "user_id": "00000000-0000-4000-8000-00000000b001"}]';
begin
  -- g : l'UUID collé ne correspond pas à l'adresse (copier-coller de la mauvaise ligne « Add user »)
  perform scenario_v2.expect_error('S14g UUID d''un autre compte → non lié',
    format('select public.link_enrollments(%L::jsonb)',
           '[{"email": "pfx.manager@scenario.seren-test.fr", "user_id": "00000000-0000-4000-8000-00000000b002"}]'),
    'enrollment_account_untrusted');
  -- h : adresse non enrôlée (faute de frappe, ou partie 1 non exécutée)
  perform scenario_v2.expect_error('S14h adresse non enrôlée → non liée',
    format('select public.link_enrollments(%L::jsonb)',
           '[{"email": "inconnu@scenario.seren-test.fr", "user_id": "00000000-0000-4000-8000-00000000b008"}]'),
    'enrollment_account_untrusted');
  -- i : compte ANTÉRIEUR à l'enrôlement (inscription publique glissée entre la partie 1 et « Add user »)
  update auth.users set created_at = now() - interval '1 day' where id = '00000000-0000-4000-8000-00000000b001';
  perform scenario_v2.expect_error('S14i compte créé avant l''enrôlement → non lié',
    format('select public.link_enrollments(%L::jsonb)', v_pfx), 'enrollment_account_untrusted');
  update auth.users set created_at = now() where id = '00000000-0000-4000-8000-00000000b001';
  -- j : compte DÉJÀ CONNECTÉ (un « Add user » neuf a last_sign_in_at null — constat local 16/09)
  update auth.users set last_sign_in_at = now() where id = '00000000-0000-4000-8000-00000000b001';
  perform scenario_v2.expect_error('S14j compte déjà connecté → non lié',
    format('select public.link_enrollments(%L::jsonb)', v_pfx), 'enrollment_account_untrusted');
  update auth.users set last_sign_in_at = null where id = '00000000-0000-4000-8000-00000000b001';
  -- k : changement d'adresse en attente sur le compte
  update auth.users set email_change = 'squat@scenario.seren-test.fr' where id = '00000000-0000-4000-8000-00000000b001';
  perform scenario_v2.expect_error('S14k changement d''e-mail en attente → non lié',
    format('select public.link_enrollments(%L::jsonb)', v_pfx), 'enrollment_account_untrusted');
  update auth.users set email_change = '' where id = '00000000-0000-4000-8000-00000000b001';
end $$;

delete from public.partner_users
 where user_id in ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000b003', '00000000-0000-4000-8000-00000000b004');
delete from public.seren_admins;
do $$
declare r jsonb := public.link_enrollments();
begin
  perform scenario_v2.ok('S14l untrusted compte les adresses enrôlées déjà portées par un compte',
    (r->>'untrusted')::int = 4 and (r->>'pending')::int = 1
    and (r->>'partner_users_linked')::int = 0 and (r->>'seren_admins_linked')::int = 0, r::text);
  perform scenario_v2.ok('S14m aucun rôle donné sans appariement',
    (select count(*) = 0 from public.seren_admins)
    and (select count(*) = 1 from public.partner_users where user_id::text like '00000000-0000-4000-8000-00000000b%'));
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S1 — partner_create_dossier : création, doublon de défunt signalé puis confirmé
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
-- Secret partagé (revue 16/09, must-fix 1) : partner_create_dossier et partner_rotate_invitation
-- l'exigent en 1er argument, comme consume_send. Même insertion qu'en S6.
insert into public.webhook_config (id, rpc_secret) values (1, 'scenario-local-secret')
  on conflict (id) do update set rpc_secret = excluded.rpc_secret;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr');
set local role authenticated;
do $$
declare r jsonb;
begin
  -- Sans secret valide, AUCUNE création : même un gérant légitime est refusé avant toute lecture.
  perform scenario_v2.expect_error('S1z secret faux → invalid_secret (avant toute validation)',
    format('select public.partner_create_dossier(%L, %L, %L, %L, %L, %L, %L, %L::date, %L)',
           'mauvais-secret', 'Claire', 'Martin', 'secret.s1@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, scenario_v2.h('s1-z')),
    'invalid_secret');
  perform scenario_v2.expect_error('S1z2 secret null → invalid_secret',
    format('select public.partner_create_dossier(null, %L, %L, %L, %L, %L, %L, %L::date, %L)',
           'Claire', 'Martin', 'secret2.s1@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, scenario_v2.h('s1-z2')),
    'invalid_secret');
  perform scenario_v2.ok('S1z3 aucune insertion par les appels sans secret',
    (select count(*) = 0 from public.dossiers where family_email like 'secret%.s1@scenario.seren-test.fr'));
  r := public.partner_create_dossier('scenario-local-secret', 'Claire', 'Martin', '  Claire.S1@Scenario.Seren-Test.fr ', '06 12 34 56 78',
                                     'Jean', 'Martin', current_date - 3, scenario_v2.h('s1-a'));
  perform scenario_v2.ok('S1a création', (r->>'created')::boolean and not (r->>'duplicate_warning')::boolean
    and r->>'partner_name' = 'PF Scénario X' and r->'dossier'->>'status' = 'invited'
    and r->'dossier'->>'family_email' = 'claire.s1@scenario.seren-test.fr'
    and r->'dossier'->>'deceased_death_date' = to_char(current_date - 3, 'YYYY-MM-DD'), r::text);
  perform scenario_v2.ok('S1b clés exactes du dossier',
    (select array_agg(k order by k) from jsonb_object_keys(r->'dossier') as k)
      = array['created_at', 'deceased_death_date', 'deceased_first_name', 'deceased_last_name', 'family_email',
              'family_first_name', 'family_last_name', 'id', 'invite_expires_at', 'status'], r::text);
  r := public.partner_create_dossier('scenario-local-secret', 'Paul', 'Martin', 'paul.s1@scenario.seren-test.fr', null,
                                     'Jean', 'MARTIN', current_date - 3, scenario_v2.h('s1-b'));
  perform scenario_v2.ok('S1c même défunt (casse différente) → avertissement, pas d''insertion',
    not (r->>'created')::boolean and (r->>'duplicate_warning')::boolean and (r->>'duplicate_count')::int = 1
    and (select array_agg(k order by k) from jsonb_object_keys(r) as k) = array['created', 'duplicate_count', 'duplicate_warning'], r::text);
  r := public.partner_create_dossier('scenario-local-secret', 'Paul', 'Martin', 'paul.s1@scenario.seren-test.fr', null,
                                     'Jean', 'MARTIN', current_date - 3, scenario_v2.h('s1-b'), true);
  perform scenario_v2.ok('S1d doublon confirmé → créé', (r->>'created')::boolean, r::text);
end $$;
reset role;
do $$ begin
  perform scenario_v2.ok('S1e exactement 2 dossiers en base',
    (select count(*) = 2 from public.dossiers where partner_id = '00000000-0000-4000-8000-00000000a001'));
  perform scenario_v2.ok('S1f snapshots, 10 envois, expiration à +7 j, créateur, source partner',
    (select bool_and(source = 'partner' and price_ttc_cents = 29000 and commission_ttc_cents = 7000 and included_sends = 10
                     and invite_expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 minute'
                     and invite_issued_at is not null and invite_rotation_count = 0
                     and created_by = '00000000-0000-4000-8000-00000000b001' and user_id is null)
       from public.dossiers where partner_id = '00000000-0000-4000-8000-00000000a001'));
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S2 — partner_create_dossier : validations, e-mail indisponible, plafond, rôles refusés
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
insert into public.webhook_config (id, rpc_secret) values (1, 'scenario-local-secret')
  on conflict (id) do update set rpc_secret = excluded.rpc_secret;
-- l'admin n'est connu QUE par seren_admins (teste la branche « compte interne » sans enrôlement)
delete from public.account_enrollments where email = 'admin@scenario.seren-test.fr';
insert into public.dossiers (partner_id, source, status, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, invite_token_hash, invite_expires_at, invite_issued_at) values
  ('00000000-0000-4000-8000-00000000a002', 'partner', 'invited', 'Pierre', 'Pris', 'pris.s2@scenario.seren-test.fr',
   'Défunt', 'Pris', current_date - 4, 29000, 7000, scenario_v2.h('s2-pris'), now() + interval '7 days', now());
-- 50 dossiers PF-Y dans les dernières 24 h → plafond atteint
insert into public.dossiers (partner_id, source, status, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, invite_token_hash, invite_expires_at, invite_issued_at, created_at)
select '00000000-0000-4000-8000-00000000a002', 'partner', 'invited', 'Lim', 'Ite', 'limit' || g || '.s2@scenario.seren-test.fr',
       'Def', 'Unt' || g, current_date - 1, 29000, 7000, scenario_v2.h('s2-limit-' || g), now() + interval '7 days', now(), now() - interval '1 hour'
  from generate_series(1, 50) as g;

select scenario_v2.claims('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr');
set local role authenticated;
do $$
declare
  -- Le secret est INLINÉ dans le gabarit : tous les appels format(v_sql, …) restent inchangés.
  v_sql constant text := 'select public.partner_create_dossier(''scenario-local-secret'', %L, %L, %L, %L, %L, %L, %L::date, %L)';
  v_ok_hash text := scenario_v2.h('s2-valide');
  r jsonb;
begin
  perform scenario_v2.expect_error('S2a prénom famille blanc',
    format(v_sql, '  ', 'Martin', 'ok.s2@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, v_ok_hash), 'invalid_family_name');
  perform scenario_v2.expect_error('S2b nom famille > 100',
    format(v_sql, 'Claire', repeat('x', 101), 'ok.s2@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, v_ok_hash), 'invalid_family_name');
  perform scenario_v2.expect_error('S2c e-mail invalide',
    format(v_sql, 'Claire', 'Martin', 'pas-un-email', null, 'Jean', 'Martin', current_date - 3, v_ok_hash), 'invalid_email');
  perform scenario_v2.expect_error('S2d e-mail > 254',
    format(v_sql, 'Claire', 'Martin', repeat('a', 250) || '@x.fr', null, 'Jean', 'Martin', current_date - 3, v_ok_hash), 'invalid_email');
  perform scenario_v2.expect_error('S2e téléphone invalide',
    format(v_sql, 'Claire', 'Martin', 'ok.s2@scenario.seren-test.fr', 'abc', 'Jean', 'Martin', current_date - 3, v_ok_hash), 'invalid_phone');
  perform scenario_v2.expect_error('S2f prénom défunt blanc',
    format(v_sql, 'Claire', 'Martin', 'ok.s2@scenario.seren-test.fr', null, ' ', 'Martin', current_date - 3, v_ok_hash), 'invalid_deceased_name');
  perform scenario_v2.expect_error('S2g date de décès future',
    format(v_sql, 'Claire', 'Martin', 'ok.s2@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date + 1, v_ok_hash), 'invalid_death_date');
  perform scenario_v2.expect_error('S2h date de décès > 2 ans',
    format(v_sql, 'Claire', 'Martin', 'ok.s2@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 800, v_ok_hash), 'invalid_death_date');
  perform scenario_v2.expect_error('S2i date de décès absente',
    format(v_sql, 'Claire', 'Martin', 'ok.s2@scenario.seren-test.fr', null, 'Jean', 'Martin', null, v_ok_hash), 'invalid_death_date');
  perform scenario_v2.expect_error('S2j hash hors motif',
    format(v_sql, 'Claire', 'Martin', 'ok.s2@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, 'xyz'), 'invalid_token_hash');
  perform scenario_v2.expect_error('S2k e-mail d''un dossier ouvert (autre PF, casse et espaces)',
    format(v_sql, 'Claire', 'Martin', '  PRIS.S2@Scenario.Seren-Test.fr ', null, 'Jean', 'Martin', current_date - 3, v_ok_hash), 'email_unavailable');
  perform scenario_v2.expect_error('S2l e-mail enrôlé sans compte',
    format(v_sql, 'Claire', 'Martin', 'pending.manager@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, v_ok_hash), 'email_unavailable');
  perform scenario_v2.expect_error('S2m e-mail d''un conseiller PF (compte interne non enrôlé)',
    format(v_sql, 'Claire', 'Martin', 'pfx.advisor@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, v_ok_hash), 'email_unavailable');
  perform scenario_v2.expect_error('S2n e-mail d''un admin Seren (seren_admins seul)',
    format(v_sql, 'Claire', 'Martin', 'admin@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, v_ok_hash), 'email_unavailable');
  r := public.partner_create_dossier('scenario-local-secret', 'Claire', 'Martin', 'tel.s2@scenario.seren-test.fr', '   ', 'Jean', 'Martin', current_date - 3, v_ok_hash);
  perform scenario_v2.ok('S2o téléphone blanc accepté', (r->>'created')::boolean, r::text);
  perform scenario_v2.expect_error('S2p hash déjà porté par un dossier (course) → email_unavailable',
    format(v_sql, 'Luc', 'Autre', 'autre.s2@scenario.seren-test.fr', null, 'Marc', 'Autre', current_date - 3, v_ok_hash), 'email_unavailable');
end $$;

reset role;
do $$ begin
  perform scenario_v2.ok('S2q téléphone blanc stocké null',
    (select family_phone is null from public.dossiers where family_email = 'tel.s2@scenario.seren-test.fr'));
end $$;

select scenario_v2.claims('00000000-0000-4000-8000-00000000b003', 'pfy.manager@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.expect_error('S2r plafond de 50 dossiers / 24 h',
    format('select public.partner_create_dossier(''scenario-local-secret'', %L, %L, %L, %L, %L, %L, %L::date, %L)',
           'Claire', 'Martin', 'plafond.s2@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, scenario_v2.h('s2-plafond')), 'partner_daily_limit');
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b006', 'fam1@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.expect_error('S2s compte famille',
    format('select public.partner_create_dossier(''scenario-local-secret'', %L, %L, %L, %L, %L, %L, %L::date, %L)',
           'Claire', 'Martin', 'x.s2@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, scenario_v2.h('s2-x')), 'not_a_partner');
end $$;

reset role;
select scenario_v2.claims(null, null);
set local role authenticated;
do $$ begin
  perform scenario_v2.expect_error('S2t sans identité',
    format('select public.partner_create_dossier(''scenario-local-secret'', %L, %L, %L, %L, %L, %L, %L::date, %L)',
           'Claire', 'Martin', 'x.s2@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, scenario_v2.h('s2-x')), 'not_a_partner');
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b004', 'pfs.manager@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.expect_error('S2u PF suspendue',
    format('select public.partner_create_dossier(''scenario-local-secret'', %L, %L, %L, %L, %L, %L, %L::date, %L)',
           'Claire', 'Martin', 'x.s2@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, scenario_v2.h('s2-x')), 'partner_inactive');
end $$;

-- PF résiliée : création refusée comme pour une PF suspendue (décision 16/09)
reset role;
update public.partners set status = 'terminated' where id = '00000000-0000-4000-8000-00000000a003';
select scenario_v2.claims('00000000-0000-4000-8000-00000000b004', 'pfs.manager@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.expect_error('S2v PF résiliée → création refusée',
    format('select public.partner_create_dossier(''scenario-local-secret'', %L, %L, %L, %L, %L, %L, %L::date, %L)',
           'Claire', 'Martin', 'x.s2@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, scenario_v2.h('s2-x')), 'partner_inactive');
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S3 — renvoi, annulation, isolation PF-X / PF-Y, liste sans contenu
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
insert into public.webhook_config (id, rpc_secret) values (1, 'scenario-local-secret')
  on conflict (id) do update set rpc_secret = excluded.rpc_secret;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr');
set local role authenticated;
do $$
declare r jsonb;
begin
  r := public.partner_create_dossier('scenario-local-secret', 'Claire', 'Martin', 'claire.s3@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, scenario_v2.h('s3-v1'));
  perform set_config('scenario.s3_id', r->'dossier'->>'id', true);
  -- Le contrôle du secret précède la lecture du dossier : pas d'oracle d'existence pour qui n'a pas le secret.
  perform scenario_v2.expect_error('S3z renvoi sans secret → invalid_secret (avant tout le reste)',
    format('select public.partner_rotate_invitation(%L, %L::uuid, %L)', 'mauvais-secret', r->'dossier'->>'id', scenario_v2.h('s3-z')), 'invalid_secret');
  perform scenario_v2.ok('S3z2 le lien d''origine est intact après un renvoi sans secret',
    (public.invitation_preview(scenario_v2.h('s3-v1'))->>'valid')::boolean);
  perform scenario_v2.expect_error('S3a hash hors motif (avant toute lecture)',
    format('select public.partner_rotate_invitation(''scenario-local-secret'', %L::uuid, %L)', r->'dossier'->>'id', 'xyz'), 'invalid_token_hash');
  perform scenario_v2.expect_error('S3b renvoi immédiat',
    format('select public.partner_rotate_invitation(''scenario-local-secret'', %L::uuid, %L)', r->'dossier'->>'id', scenario_v2.h('s3-v2')), 'rotation_too_soon');
end $$;

reset role;
update public.dossiers set invite_issued_at = now() - interval '11 minutes' where id = current_setting('scenario.s3_id')::uuid;

select scenario_v2.claims('00000000-0000-4000-8000-00000000b003', 'pfy.manager@scenario.seren-test.fr');
set local role authenticated;
do $$
declare
  v_id uuid := current_setting('scenario.s3_id')::uuid;
  r    jsonb;
begin
  perform scenario_v2.expect_error('S3c PF-Y renvoie un dossier de PF-X',
    format('select public.partner_rotate_invitation(''scenario-local-secret'', %L::uuid, %L)', v_id, scenario_v2.h('s3-y')), 'dossier_not_found');
  perform scenario_v2.expect_error('S3d PF-Y annule un dossier de PF-X',
    format('select public.partner_cancel_dossier(%L::uuid)', v_id), 'dossier_not_found');
  perform scenario_v2.expect_error('S3e dossier inexistant : même réponse',
    format('select public.partner_cancel_dossier(%L::uuid)', gen_random_uuid()), 'dossier_not_found');
  r := public.partner_list_dossiers();
  perform scenario_v2.ok('S3f PF-Y ne liste aucun dossier de PF-X',
    r->'partner'->>'id' = '00000000-0000-4000-8000-00000000a002' and jsonb_array_length(r->'dossiers') = 0, r::text);
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr');
set local role authenticated;
do $$
declare
  v_id uuid := current_setting('scenario.s3_id')::uuid;
  r    jsonb;
  v_d  jsonb;
begin
  r := public.partner_rotate_invitation('scenario-local-secret', v_id, scenario_v2.h('s3-v2'));
  perform scenario_v2.ok('S3g renvoi', (r->>'rotated')::boolean and r->>'partner_name' = 'PF Scénario X'
    and r->'dossier'->>'id' = v_id::text and r->'dossier'->>'status' = 'invited'
    and (select array_agg(k order by k) from jsonb_object_keys(r->'dossier') as k)
      = array['created_at', 'deceased_death_date', 'deceased_first_name', 'deceased_last_name', 'family_email',
              'family_first_name', 'family_last_name', 'id', 'invite_expires_at', 'status'], r::text);
  perform scenario_v2.ok('S3h l''ancien lien est mort', public.invitation_preview(scenario_v2.h('s3-v1'))->>'reason' = 'invalid');
  perform scenario_v2.ok('S3i le nouveau lien est valide', (public.invitation_preview(scenario_v2.h('s3-v2'))->>'valid')::boolean);
  r := public.partner_list_dossiers();
  v_d := r->'dossiers'->0;
  perform scenario_v2.ok('S3j liste PF-X : partenaire et 1 dossier',
    r->'partner' = jsonb_build_object('id', '00000000-0000-4000-8000-00000000a001', 'name', 'PF Scénario X', 'status', 'active', 'user_role', 'manager')
    and jsonb_array_length(r->'dossiers') = 1, r::text);
  perform scenario_v2.ok('S3k clés exactes d''un dossier listé',
    (select array_agg(k order by k) from jsonb_object_keys(v_d) as k)
      = array['activated_at', 'can_cancel', 'can_resend', 'cancel_deadline', 'cancelled_at', 'created_at', 'deceased_death_date',
              'deceased_first_name', 'deceased_last_name', 'family_email', 'family_first_name', 'family_last_name', 'family_phone',
              'id', 'invite_expired', 'invite_expires_at', 'source', 'status'], v_d::text);
  perform scenario_v2.ok('S3l drapeaux calculés', (v_d->>'can_resend')::boolean and (v_d->>'can_cancel')::boolean
    and not (v_d->>'invite_expired')::boolean
    and (v_d->>'cancel_deadline')::timestamptz = (v_d->>'created_at')::timestamptz + interval '48 hours', v_d::text);
  perform scenario_v2.ok('S3m aucune donnée de contenu ni secret',
    r::text !~ '(invite_token_hash|price_ttc|commission_ttc|user_id|answers|content|roadmap|letter|attachment|purchase|consent|balance)', r::text);
end $$;

reset role;
update public.dossiers set invite_issued_at = now() - interval '11 minutes', invite_rotation_count = 10 where id = current_setting('scenario.s3_id')::uuid;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.expect_error('S3n 11ᵉ renvoi',
    format('select public.partner_rotate_invitation(''scenario-local-secret'', %L::uuid, %L)', current_setting('scenario.s3_id'), scenario_v2.h('s3-v3')), 'rotation_limit');
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b002', 'pfx.advisor@scenario.seren-test.fr');
set local role authenticated;
do $$
declare
  v_id uuid := current_setting('scenario.s3_id')::uuid;
  r    jsonb;
begin
  r := public.partner_cancel_dossier(v_id);
  perform scenario_v2.ok('S3o le conseiller annule sous 48 h', (r->>'cancelled')::boolean and not (r->>'already_cancelled')::boolean
    and r->'dossier'->>'status' = 'cancelled' and r->'dossier'->>'cancelled_at' is not null
    and (select array_agg(k order by k) from jsonb_object_keys(r->'dossier') as k) = array['cancelled_at', 'id', 'status'], r::text);
  r := public.partner_cancel_dossier(v_id);
  perform scenario_v2.ok('S3p rejeu → already_cancelled', not (r->>'cancelled')::boolean and (r->>'already_cancelled')::boolean, r::text);
  perform scenario_v2.expect_error('S3q renvoi d''un dossier annulé',
    format('select public.partner_rotate_invitation(''scenario-local-secret'', %L::uuid, %L)', v_id, scenario_v2.h('s3-v4')), 'dossier_not_invitable');
  perform scenario_v2.ok('S3r le lien annulé est mort', public.invitation_preview(scenario_v2.h('s3-v2'))->>'reason' = 'invalid');
end $$;

reset role;
do $$ begin
  perform scenario_v2.ok('S3s annulation tracée, hash effacé',
    (select status = 'cancelled' and invite_token_hash is null and invite_expires_at is null
            and cancelled_by = '00000000-0000-4000-8000-00000000b002' from public.dossiers where id = current_setting('scenario.s3_id')::uuid));
end $$;
insert into public.dossiers (partner_id, source, status, user_id, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, created_at, activated_at) values
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'active', '00000000-0000-4000-8000-00000000b006', 'Claire', 'Martin',
   'fam1@scenario.seren-test.fr', 'Jean', 'Martin', current_date - 3, 29000, 7000, now() - interval '1 day', now());
insert into public.dossiers (partner_id, source, status, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, invite_token_hash, invite_expires_at, invite_issued_at, created_at) values
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'invited', 'Vieux', 'Lien', 'vieux.s3@scenario.seren-test.fr',
   'Marc', 'Lien', current_date - 10, 29000, 7000, scenario_v2.h('s3-old'), now() + interval '5 days', now() - interval '49 hours', now() - interval '49 hours');
select set_config('scenario.s3_active', (select id::text from public.dossiers where user_id = '00000000-0000-4000-8000-00000000b006'), true);
select set_config('scenario.s3_old', (select id::text from public.dossiers where family_email = 'vieux.s3@scenario.seren-test.fr'), true);

select scenario_v2.claims('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr');
set local role authenticated;
do $$
declare r jsonb;
begin
  perform scenario_v2.expect_error('S3t annuler un dossier activé (aucune PF ne coupe une famille)',
    format('select public.partner_cancel_dossier(%L::uuid)', current_setting('scenario.s3_active')), 'dossier_already_active');
  perform scenario_v2.expect_error('S3u renvoyer un dossier activé',
    format('select public.partner_rotate_invitation(''scenario-local-secret'', %L::uuid, %L)', current_setting('scenario.s3_active'), scenario_v2.h('s3-act')), 'dossier_not_invitable');
  perform scenario_v2.expect_error('S3v annuler après 48 h',
    format('select public.partner_cancel_dossier(%L::uuid)', current_setting('scenario.s3_old')), 'cancel_window_elapsed');
  r := public.partner_rotate_invitation('scenario-local-secret', current_setting('scenario.s3_old')::uuid, scenario_v2.h('s3-old2'));
  perform scenario_v2.ok('S3w une vieille invitation reste renvoyable', (r->>'rotated')::boolean, r::text);
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S9 — partner_month_counters : jeu daté de 6 dossiers (mois précédent, annulé, expiré, démo)
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
insert into public.webhook_config (id, rpc_secret) values (1, 'scenario-local-secret')
  on conflict (id) do update set rpc_secret = excluded.rpc_secret;
do $$
declare
  v_start timestamptz := date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
begin
  -- d1 : partner, activé ce mois → facturable
  insert into public.dossiers (partner_id, source, status, user_id, family_first_name, family_last_name, family_email,
                               deceased_first_name, deceased_last_name, deceased_death_date, price_ttc_cents, commission_ttc_cents, created_at, activated_at)
  values ('00000000-0000-4000-8000-00000000a001', 'partner', 'active', '00000000-0000-4000-8000-00000000b006', 'A', 'Un', 'd1.s9@scenario.seren-test.fr',
          'X', 'Un', current_date - 3, 29000, 7000, now(), now());
  -- d2 : partner, créé et activé le mois précédent
  insert into public.dossiers (partner_id, source, status, user_id, family_first_name, family_last_name, family_email,
                               deceased_first_name, deceased_last_name, deceased_death_date, price_ttc_cents, commission_ttc_cents, created_at, activated_at)
  values ('00000000-0000-4000-8000-00000000a001', 'partner', 'active', '00000000-0000-4000-8000-00000000b007', 'B', 'Deux', 'd2.s9@scenario.seren-test.fr',
          'X', 'Deux', current_date - 40, 29000, 7000, v_start - interval '5 days', v_start - interval '4 days');
  -- d3 : invité en attente, créé ce mois
  insert into public.dossiers (partner_id, source, status, family_first_name, family_last_name, family_email, deceased_first_name, deceased_last_name,
                               deceased_death_date, price_ttc_cents, commission_ttc_cents, invite_token_hash, invite_expires_at, invite_issued_at, created_at)
  values ('00000000-0000-4000-8000-00000000a001', 'partner', 'invited', 'C', 'Trois', 'd3.s9@scenario.seren-test.fr', 'X', 'Trois',
          current_date - 2, 29000, 7000, scenario_v2.h('s9-d3'), now() + interval '7 days', now(), now());
  -- d4 : invité expiré, créé le mois précédent
  insert into public.dossiers (partner_id, source, status, family_first_name, family_last_name, family_email, deceased_first_name, deceased_last_name,
                               deceased_death_date, price_ttc_cents, commission_ttc_cents, invite_token_hash, invite_expires_at, invite_issued_at, created_at)
  values ('00000000-0000-4000-8000-00000000a001', 'partner', 'invited', 'D', 'Quatre', 'd4.s9@scenario.seren-test.fr', 'X', 'Quatre',
          current_date - 45, 29000, 7000, scenario_v2.h('s9-d4'), now() - interval '1 hour', v_start - interval '10 days', v_start - interval '10 days');
  -- d5 : annulé ce mois
  insert into public.dossiers (partner_id, source, status, family_first_name, family_last_name, family_email, deceased_first_name, deceased_last_name,
                               deceased_death_date, price_ttc_cents, commission_ttc_cents, cancelled_at, created_at)
  values ('00000000-0000-4000-8000-00000000a001', 'partner', 'cancelled', 'E', 'Cinq', 'd5.s9@scenario.seren-test.fr', 'X', 'Cinq',
          current_date - 1, 29000, 7000, now(), now());
  -- d6 : démo, activé ce mois → jamais facturable
  insert into public.dossiers (partner_id, source, status, user_id, family_email, price_ttc_cents, commission_ttc_cents, created_at, activated_at)
  values ('00000000-0000-4000-8000-00000000a001', 'demo', 'active', '00000000-0000-4000-8000-00000000b009', 'd6.s9@scenario.seren-test.fr',
          29000, 7000, now(), now());
end $$;

select scenario_v2.claims('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr');
set local role authenticated;
do $$
declare r jsonb := public.partner_month_counters();
begin
  perform scenario_v2.ok('S9a mois courant Europe/Paris', r->>'month' = to_char(now() at time zone 'Europe/Paris', 'YYYY-MM'), r::text);
  perform scenario_v2.ok('S9b compteurs', (r->>'created_this_month')::int = 4 and (r->>'created_total')::int = 6
    and (r->>'activated_total')::int = 3 and (r->>'pending_activation')::int = 1 and (r->>'expired_invitations')::int = 1
    and (r->>'cancelled_total')::int = 1 and (r->>'activated_this_month')::int = 2, r::text);
  perform scenario_v2.ok('S9c estimation gérant (source partner, activé ce mois)',
    r->'billing_preview' = '{"billable_count":1,"seren_due_ttc_cents":22000,"unit_due_ttc_cents":22000,"currency":"EUR"}'::jsonb, r::text);
  perform scenario_v2.ok('S9d clés exactes',
    (select array_agg(k order by k) from jsonb_object_keys(r) as k)
      = array['activated_this_month', 'activated_total', 'billing_preview', 'cancelled_total', 'created_this_month',
              'created_total', 'expired_invitations', 'month', 'pending_activation'], r::text);
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b002', 'pfx.advisor@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.ok('S9e conseiller → billing_preview null', public.partner_month_counters()->'billing_preview' = 'null'::jsonb);
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b006', 'fam1@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.ok('S9f famille → compteurs null', public.partner_month_counters() is null);
  perform scenario_v2.ok('S9g famille → liste null', public.partner_list_dossiers() is null);
end $$;

-- PF résiliée (décision 16/09) : plus aucune lecture, donc plus aucune PII famille. 'suspended' garde
-- la lecture (prouvé par S2u/S2v : seule la création est refusée pour une PF non 'active').
reset role;
update public.partners set status = 'terminated' where id = '00000000-0000-4000-8000-00000000a001';
select scenario_v2.claims('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr');
set local role authenticated;
do $$
declare a jsonb;
begin
  perform scenario_v2.ok('S9h PF résiliée → compteurs null', public.partner_month_counters() is null);
  perform scenario_v2.ok('S9i PF résiliée → liste null', public.partner_list_dossiers() is null);
  a := public.my_account();
  perform scenario_v2.ok('S9j PF résiliée → my_account sans rôle partenaire',
    a->>'role' = 'none' and a->'partner' = 'null'::jsonb, a::text);
end $$;

reset role;
update public.partners set status = 'suspended' where id = '00000000-0000-4000-8000-00000000a001';
select scenario_v2.claims('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr');
set local role authenticated;
do $$
declare r jsonb := public.partner_list_dossiers();
begin
  perform scenario_v2.ok('S9k PF suspendue → lecture conservée',
    r is not null and r->'partner'->>'status' = 'suspended' and jsonb_array_length(r->'dossiers') = 6, r::text);
  perform scenario_v2.ok('S9l PF suspendue → compteurs conservés', public.partner_month_counters() is not null);
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S10 — admin_partner_overview (migration L4c) : SAUTÉ tant que la fonction n'existe pas
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
insert into public.dossiers (partner_id, source, status, user_id, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date, price_ttc_cents, commission_ttc_cents, created_at, activated_at) values
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'active', '00000000-0000-4000-8000-00000000b006', 'Claire', 'Martin',
   'fam1@scenario.seren-test.fr', 'Jean', 'Martin', current_date - 3, 29000, 7000, now(), now());
insert into public.dossiers (partner_id, source, status, family_first_name, family_last_name, family_email, deceased_first_name, deceased_last_name,
                             deceased_death_date, price_ttc_cents, commission_ttc_cents, invite_token_hash, invite_expires_at, invite_issued_at, created_at) values
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'invited', 'Paul', 'Roy', 'paul.s10@scenario.seren-test.fr', 'Luc', 'Roy',
   current_date - 2, 29000, 7000, scenario_v2.h('s10-inv'), now() + interval '7 days', now(), now());
insert into public.dossiers (partner_id, source, status, family_first_name, family_last_name, family_email, deceased_first_name, deceased_last_name,
                             deceased_death_date, price_ttc_cents, commission_ttc_cents, cancelled_at, created_at) values
  ('00000000-0000-4000-8000-00000000a002', 'partner', 'cancelled', 'Lou', 'Petit', 'lou.s10@scenario.seren-test.fr', 'René', 'Petit',
   current_date - 1, 29000, 7000, now(), now());

do $$ begin
  if to_regprocedure('public.admin_partner_overview()') is null then
    raise notice 'SKIP S10 admin_partner_overview absente (migration L4c non appliquée)';
  end if;
end $$;

select scenario_v2.claims('00000000-0000-4000-8000-00000000b005', 'admin@scenario.seren-test.fr');
set local role authenticated;
do $$
declare
  r   jsonb;
  v_x jsonb;
  v_y jsonb;
  v_s jsonb;
begin
  if to_regprocedure('public.admin_partner_overview()') is null then
    return;
  end if;
  r := public.admin_partner_overview();
  select e into v_x from jsonb_array_elements(r->'partners') as e where e->>'partner_id' = '00000000-0000-4000-8000-00000000a001';
  select e into v_y from jsonb_array_elements(r->'partners') as e where e->>'partner_id' = '00000000-0000-4000-8000-00000000a002';
  select e into v_s from jsonb_array_elements(r->'partners') as e where e->>'partner_id' = '00000000-0000-4000-8000-00000000a003';
  perform scenario_v2.ok('S10a admin → vue du mois', r->>'month' = to_char(now() at time zone 'Europe/Paris', 'YYYY-MM')
    and r->>'generated_at' is not null, r::text);
  perform scenario_v2.ok('S10b PF-X', v_x->>'name' = 'PF Scénario X' and v_x->>'status' = 'active'
    and (v_x->>'dossiers_total')::int = 2 and (v_x->>'dossiers_this_month')::int = 2 and (v_x->>'invited_pending')::int = 1
    and (v_x->>'activated')::int = 1 and (v_x->>'cancelled')::int = 0 and v_x->>'last_dossier_at' is not null, v_x::text);
  perform scenario_v2.ok('S10c PF-Y annulé, PF-S vide et suspendue', (v_y->>'cancelled')::int = 1 and (v_y->>'dossiers_total')::int = 1
    and (v_s->>'dossiers_total')::int = 0 and v_s->'last_dossier_at' = 'null'::jsonb and v_s->>'status' = 'suspended', r::text);
  perform scenario_v2.ok('S10d clés exactes par partenaire',
    (select array_agg(k order by k) from jsonb_object_keys(v_x) as k)
      = array['activated', 'cancelled', 'dossiers_this_month', 'dossiers_total', 'invited_pending', 'last_dossier_at', 'name', 'partner_id', 'status'], v_x::text);
  perform scenario_v2.ok('S10e aucune PII famille ni donnée de facturation', r::text !~ '(@|family|deceased|email|siret|billing)', r::text);
  perform scenario_v2.ok('S10f tri par raison sociale',
    (select array_agg(e->>'name' order by ord) from jsonb_array_elements(r->'partners') with ordinality as t(e, ord))
      = (select array_agg(e->>'name' order by e->>'name') from jsonb_array_elements(r->'partners') as e), r::text);
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  if to_regprocedure('public.admin_partner_overview()') is null then return; end if;
  perform scenario_v2.ok('S10g gérant PF → null', public.admin_partner_overview() is null);
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b006', 'fam1@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  if to_regprocedure('public.admin_partner_overview()') is null then return; end if;
  perform scenario_v2.ok('S10h famille → null', public.admin_partner_overview() is null);
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S11 — partner_dashboard() v0 intacte (rollback Render vers le deploy de U1 toujours sûr)
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
do $$ begin
  perform scenario_v2.ok('S11a corps identique à 20260913200000 (md5 de prosrc)',
    (select md5(prosrc) = '8277ca3955cc35a54f42223295052c28' from pg_proc where oid = 'public.partner_dashboard()'::regprocedure));
  perform scenario_v2.ok('S11b grant authenticated conservé', has_function_privilege('authenticated', 'public.partner_dashboard()', 'execute'));
end $$;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr');
set local role authenticated;
do $$
declare r json := public.partner_dashboard();
begin
  perform scenario_v2.ok('S11c exécutable par le gérant PF-X', r is not null and r->>'partner_name' = 'PF Scénario X'
    and r->>'attributed_count' = '0', r::text);
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S13p — droits des RPC PF, admin (si L4c) et F1 (si L1b)
-- ════════════════════════════════════════════════════════════════════════════════════════
do $$
declare v_fn text;
begin
  foreach v_fn in array array['public.partner_create_dossier(text, text, text, text, text, text, text, date, text, boolean)',
                              'public.partner_rotate_invitation(text, uuid, text)', 'public.partner_cancel_dossier(uuid)',
                              'public.partner_list_dossiers()', 'public.partner_month_counters()',
                              'public.admin_partner_overview()', 'public.get_transmission_by_code(text)'] loop
    if to_regprocedure(v_fn) is null then
      raise notice 'SKIP S13p % absente', v_fn;
      continue;
    end if;
    perform scenario_v2.ok('S13p aucun EXECUTE PUBLIC : ' || v_fn,
      (select p.proacl is not null and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
         from pg_proc p where p.oid = v_fn::regprocedure));
    perform scenario_v2.ok('S13p search_path vide et security definer : ' || v_fn,
      (select p.prosecdef and coalesce(array_to_string(p.proconfig, ',') like '%search_path=""%', false)
         from pg_proc p where p.oid = v_fn::regprocedure));
    perform scenario_v2.ok('S13p anon refusé, authenticated autorisé : ' || v_fn,
      not has_function_privilege('anon', v_fn, 'execute') and has_function_privilege('authenticated', v_fn, 'execute'));
  end loop;
end $$;

-- ── Nettoyage des fixtures (committé) ──────────────────────────────────────────────────────
delete from public.dossiers
 where family_email like '%@scenario.seren-test.fr'
    or partner_id in ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000a003');
delete from public.account_enrollments where email like '%@scenario.seren-test.fr';
delete from auth.users where email like '%@scenario.seren-test.fr';
delete from public.partners
 where id in ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000a003');
drop schema scenario_v2 cascade;
do $$ begin raise notice 'SCENARIOS V2 : OK'; end $$;
