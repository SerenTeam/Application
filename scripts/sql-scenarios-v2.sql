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

-- ═══ SCÉNARIOS PARTENAIRE ET ADMIN (Task 3 : S1, S2, S3, S9, S10, S11, S13p) — insérés ici ═══

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
